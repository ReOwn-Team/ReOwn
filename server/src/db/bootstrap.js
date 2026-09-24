import crypto from 'node:crypto';
import { pool } from './pool.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { config, setRuntimeSecrets, SECRET_NAMES } from '../config.js';

const BOOT_LOCK = 42_4243;
let current = {};

/** Bản demo: khoá bí mật sinh ngẫu nhiên một lần, lưu trong CSDL để mọi instance serverless dùng chung. */
async function loadSecrets(db) {
  await db.query('CREATE TABLE IF NOT EXISTS app_secrets (name text PRIMARY KEY, value text NOT NULL)');
  for (const name of SECRET_NAMES) {
    const value = current[name] || crypto.randomBytes(32).toString('hex');
    await db.query('INSERT INTO app_secrets (name, value) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING', [name, value]);
  }
  const rows = (await db.query('SELECT name, value FROM app_secrets WHERE name = ANY($1)', [SECRET_NAMES])).rows;
  current = Object.fromEntries(rows.map((r) => [r.name, r.value]));
  setRuntimeSecrets(current);
}

async function isEmpty(db) {
  const t = (await db.query("SELECT to_regclass('public.users') IS NOT NULL AS t")).rows[0].t;
  return !t || !(await db.query('SELECT EXISTS (SELECT 1 FROM users) AS e')).rows[0].e;
}

async function withBootLock(fn) {
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [BOOT_LOCK]);
    return await fn(lock);
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [BOOT_LOCK]).catch(() => {});
    lock.release();
  }
}

async function reseed(lock) {
  await seed({ force: true });
  await loadSecrets(lock);
}

/** Chạy một lần mỗi tiến trình trước request đầu tiên: migrate; bản demo thì nạp khoá và tạo dữ liệu mẫu nếu CSDL trống. */
export function bootstrap() {
  return withBootLock(async (lock) => {
    if (config.demoDeployment) {
      await loadSecrets(lock);
      if (await isEmpty(lock)) {
        console.log('[bootstrap] CSDL trống — tạo dữ liệu mẫu');
        await reseed(lock);
      }
    }
    await migrate();
  });
}

/** Bản demo công khai: ai có link cũng vào được mọi tài khoản mẫu, nên dữ liệu được làm mới mỗi đêm. */
export function resetDemo() {
  if (!config.demoDeployment) throw new Error('Chỉ làm mới dữ liệu ở bản demo');
  return withBootLock(async (lock) => {
    await reseed(lock);
    return { reset: true, at: new Date().toISOString() };
  });
}

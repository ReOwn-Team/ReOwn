import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { config } from '../config.js';
import { searchText } from '../../../shared/search.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function assertResetAllowed() {
  if (config.isProd && !config.demoDeployment) throw new Error('Từ chối xoá CSDL khi NODE_ENV=production');
  if (!config.devTools) throw new Error('Chỉ được xoá CSDL trên máy dev/test (đặt DEV_TOOLS=true)');
}

async function backfillSearchText() {
  const has = (await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='search_text'")).rows[0];
  if (!has) return;
  const rows = (await pool.query('SELECT id, title, description FROM listings WHERE search_text IS NULL LIMIT 5000')).rows;
  for (const r of rows) await pool.query('UPDATE listings SET search_text=$2 WHERE id=$1', [r.id, searchText(r.title, r.description)]);
}

const migrationFiles = () => fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

export async function pendingMigrations() {
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  return migrationFiles().filter((f) => !done.has(f));
}

export async function migrate({ reset = false } = {}) {
  if (reset) {
    assertResetAllowed();
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const f of await pendingMigrations()) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      if (!config.isTest) console.log('migrated', f);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  await backfillSearchText();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate({ reset: process.argv.includes('--reset') })
    .then(() => pool.end())
    .catch((e) => { console.error(e); process.exit(1); });
}

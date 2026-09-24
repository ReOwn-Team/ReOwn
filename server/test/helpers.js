import request from 'supertest';
import { createApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import { pool } from '../src/db/pool.js';

export const app = createApp();
export const api = () => request(app);
export { pool };

export async function resetDb() {
  return seed({ force: true });
}

export async function login(phone, name) {
  const r1 = await api().post('/api/auth/otp/request').send({ phone }).expect(200);
  const r2 = await api().post('/api/auth/otp/verify').send({ phone, code: r1.body.devCode, name }).expect(200);
  return { token: r2.body.accessToken, cookie: r2.headers['set-cookie'], user: r2.body.user };
}

export const auth = (t) => ({ Authorization: `Bearer ${t}` });

export async function listingByTitle(prefix) {
  return (await pool.query("SELECT * FROM listings WHERE title LIKE $1 AND status='active' LIMIT 1", [prefix + '%'])).rows[0];
}

let k = 0;
export const key = () => `test-key-${Date.now()}-${k++}`;

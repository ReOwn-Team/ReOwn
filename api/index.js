// Điểm vào serverless trên Vercel: toàn bộ /api/* được chuyển về đây (xem vercel.json).
// Bản triển khai này là BẢN DEMO (_demo-env.js): mã OTP hiện trên giao diện, công cụ demo bật, khoá bí mật tự sinh.
import './_demo-env.js';
import { createApp } from '../server/src/app.js';
import { bootstrap } from '../server/src/db/bootstrap.js';

const app = createApp();
let ready = null;

export default async function handler(req, res) {
  if (req.url?.startsWith('/api/health')) return app(req, res);
  ready ||= bootstrap().catch((e) => { ready = null; throw e; });
  try {
    await ready;
  } catch (e) {
    console.error('[bootstrap]', e);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: { code: 'starting', message: 'Máy chủ đang khởi động, thử lại sau ít giây' } }));
  }
  return app(req, res);
}

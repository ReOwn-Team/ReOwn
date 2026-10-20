// Điểm vào serverless trên Vercel: toàn bộ /api/* được chuyển về đây (xem vercel.json).
// Bản triển khai này là BẢN DEMO (_demo-env.js): mã OTP hiện trên giao diện, công cụ demo bật, khoá bí mật tự sinh.
import './_demo-env.js';
import { createApp } from '../apps/api/src/app.js';
import { bootstrap } from '../apps/api/src/db/bootstrap.js';
import { runJobs } from '../apps/api/src/services/jobs.js';

const app = createApp();
let ready = null;
// Gói Hobby chỉ cho cron chạy mỗi ngày một lần: chạy thêm tác vụ định kỳ (giải ngân, tự hoàn tất đơn, hạn trả hàng…)
// khi có người dùng, tối đa 10 phút một lần mỗi instance. runJobs tự bỏ qua nếu instance khác đang chạy.
const JOBS_EVERY_MS = 10 * 60_000;
let lastJobs = 0;

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
  if (Date.now() - lastJobs > JOBS_EVERY_MS && !req.url?.startsWith('/api/cron')) {
    lastJobs = Date.now();
    await runJobs().catch((e) => console.error('[jobs]', e));
  }
  return app(req, res);
}

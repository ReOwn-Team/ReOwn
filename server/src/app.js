import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { apiLimiter } from './lib/limits.js';
import { invalidateCatalog } from './services/catalogCache.js';
import { config } from './config.js';
import { AppError } from './lib/errors.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import listingRoutes, { recommendations, search } from './routes/listings.js';
import orderRoutes, { installments } from './routes/orders.js';
import adminRoutes from './routes/admin.js';
import devRoutes from './routes/dev.js';
import { uploads, images } from './routes/images.js';
import chatRoutes from './routes/chat.js';
import { runJobs } from './services/jobs.js';
import { resetDemo } from './db/bootstrap.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api/images', images);
  app.use('/api', apiLimiter);
  app.use((req, res, next) => {
    if (req.method !== 'GET' && !req.path.startsWith('/api/recommendations') && !req.path.startsWith('/api/auth')) {
      res.on('finish', () => { if (res.statusCode < 400) invalidateCatalog(); });
    }
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true, devTools: config.devTools, demo: config.demoDeployment }));
  // Vercel Cron gọi route này theo lịch trong vercel.json (serverless không chạy được setInterval)
  app.get('/api/cron/jobs', async (req, res, next) => {
    const secret = process.env.CRON_SECRET;
    const ok = secret ? req.get('authorization') === `Bearer ${secret}` : /vercel-cron/.test(req.get('user-agent') || '');
    if (!ok) return res.status(401).json({ error: { code: 'unauthorized', message: 'Không có quyền' } });
    try {
      const out = config.demoDeployment ? await resetDemo() : await runJobs();
      invalidateCatalog();
      res.json(out);
    } catch (e) { next(e); }
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/uploads', uploads);
  app.use('/api/conversations', chatRoutes);
  app.use('/api/listings', listingRoutes);
  app.use('/api/recommendations', recommendations);
  app.use('/api/search', search);
  app.use('/api/orders', orderRoutes);
  app.use('/api/installments', installments);
  app.use('/api/admin', adminRoutes);
  if (config.devTools) app.use('/api/dev', devRoutes);

  app.use((_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Không có API này' } }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'too_large', message: 'File quá lớn (tối đa 6 MB)' } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'bad_json', message: 'JSON không hợp lệ' } });
    }
    if (err.code === '23514' && err.constraint === 'wallet_balances_balance_check') {
      return res.status(422).json({ error: { code: 'insufficient_balance', message: 'Số dư ví không đủ' } });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: { code: 'conflict', message: 'Thao tác bị trùng hoặc tài nguyên đã được dùng' } });
    }
    console.error('[error]', req.method, req.path, err);
    res.status(500).json({ error: { code: 'internal', message: 'Lỗi hệ thống, vui lòng thử lại' } });
  });
  return app;
}

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config.js';

const base = { standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'too_many_requests', message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau' } } };
const n = (v) => (config.isTest ? 10_000 : v);
const byUser = (req) => (req.user?.id ? `u:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`);

// Theo IP: bản demo công khai (nhiều người chung một wifi) và máy dev (chạy e2e) cần trần cao hơn
const perIp = config.demoDeployment ? 1500 : config.devTools && !config.isProd ? 3000 : 300;
export const apiLimiter = rateLimit({ ...base, windowMs: 60_000, limit: n(perIp) });
export const recommendLimiter = rateLimit({ ...base, windowMs: 60_000, limit: n(30), keyGenerator: byUser });
export const listingWriteLimiter = rateLimit({ ...base, windowMs: 10 * 60_000, limit: n(10), keyGenerator: byUser });
export const orderLimiter = rateLimit({ ...base, windowMs: 10 * 60_000, limit: n(20), keyGenerator: byUser });
export const reviewLimiter = rateLimit({ ...base, windowMs: 10 * 60_000, limit: n(20), keyGenerator: byUser });
export const uploadLimiter = rateLimit({ ...base, windowMs: 10 * 60_000, limit: n(30), keyGenerator: byUser });
export const chatLimiter = rateLimit({ ...base, windowMs: 60_000, limit: n(30), keyGenerator: byUser });
export const verifyLimiter = rateLimit({ ...base, windowMs: 60 * 60_000, limit: n(5), keyGenerator: byUser });

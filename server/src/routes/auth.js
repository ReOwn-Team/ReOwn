import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { tx } from '../db/pool.js';
import { config } from '../config.js';
import { ah, unauthorized } from '../lib/errors.js';
import { parse, z, phone } from '../lib/validate.js';
import { maskPhone } from '../lib/crypto.js';
import * as auth from '../services/auth.js';

const r = Router();
const COOKIE = 'reown_rt';
const cookieOpts = {
  httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, path: '/api/auth',
  maxAge: config.refreshTtlDays * 86_400_000,
};

const csrf = (req, _res, next) => (req.get('X-ReOwn-Client') === 'web' ? next() : next(unauthorized('Thiếu header X-ReOwn-Client')));
const limiter = rateLimit({ windowMs: 10 * 60_000, limit: config.otpPerIp10m, standardHeaders: 'draft-7', legacyHeaders: false });

const publicUser = (u) => ({ id: u.id, name: u.name, role: u.role });

r.post('/otp/request', limiter, ah(async (req, res) => {
  const body = parse(z.object({ phone }), req.body);
  const code = await tx((db) => auth.requestOtp(db, body.phone));
  console.info('[otp] issued for', maskPhone(body.phone));
  res.json({ sent: true, ttlSec: config.otpTtlSec, ...(config.devTools ? { devCode: code } : {}) });
}));

r.post('/otp/verify', limiter, ah(async (req, res) => {
  const body = parse(z.object({ phone, code: z.string().regex(/^\d{6}$/) }), req.body);
  const out = await tx(async (db) => {
    const v = await auth.verifyOtp(db, { ...body, ip: req.ip });
    if (!v.ok) return v;
    const s = await auth.createSession(db, v.user.id, { userAgent: req.get('user-agent'), ip: req.ip });
    return { ...v, refresh: s.token, sid: s.familyId };
  });
  if (!out.ok) throw unauthorized('Mã không đúng');
  res.cookie(COOKIE, out.refresh, cookieOpts);
  res.json({ accessToken: auth.signAccess(out.user, out.sid), user: publicUser(out.user), created: out.created });
}));

r.post('/refresh', csrf, ah(async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (!token) throw unauthorized('Chưa đăng nhập');
  const out = await tx((db) => auth.rotateSession(db, token, { userAgent: req.get('user-agent'), ip: req.ip }));
  if (out.reuse) {
    res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined });
    throw unauthorized('Phiên đã bị thu hồi, hãy đăng nhập lại');
  }
  const { user, token: next, sid } = out;
  res.cookie(COOKIE, next, cookieOpts);
  res.json({ accessToken: auth.signAccess(user, sid), user: publicUser(user) });
}));

r.post('/logout', csrf, ah(async (req, res) => {
  await tx((db) => auth.revokeSession(db, req.cookies?.[COOKIE]));
  res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined });
  res.status(204).end();
}));

export default r;

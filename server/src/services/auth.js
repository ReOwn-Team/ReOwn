import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { hmac, otpCode, safeEqual, sha256, randomToken } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { unauthorized, tooMany, forbidden } from '../lib/errors.js';

const otpHash = (phone, code) => hmac(config.otpSecret, `${phone}:${code}`);

export async function requestOtp(db, phone) {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['otp:' + phone]);
  const recent = (await db.query(
    "SELECT COUNT(*)::int AS c FROM otp_codes WHERE phone=$1 AND created_at > now() - interval '10 minutes'", [phone])).rows[0].c;
  if (recent >= config.otpPerPhone10m) throw tooMany('Bạn yêu cầu mã quá nhiều lần, thử lại sau 10 phút');
  const code = otpCode();
  await db.query("INSERT INTO otp_codes (phone, code_hash, expires_at) VALUES ($1,$2, now() + make_interval(secs => $3))",
    [phone, otpHash(phone, code), config.otpTtlSec]);
  return code;
}

export async function verifyOtp(db, { phone, code, ip }) {
  const otp = (await db.query(
    `SELECT * FROM otp_codes WHERE phone=$1 AND consumed_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [phone])).rows[0];
  if (!otp) throw unauthorized('Mã đã hết hạn, hãy yêu cầu mã mới');
  if (otp.attempts >= config.otpMaxAttempts) throw tooMany('Nhập sai quá nhiều lần, hãy yêu cầu mã mới');
  if (!safeEqual(otp.code_hash, otpHash(phone, code))) {
    await db.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id=$1', [otp.id]);
    return { ok: false };
  }
  await db.query('UPDATE otp_codes SET consumed_at = now() WHERE id=$1', [otp.id]);

  let user = (await db.query('SELECT * FROM users WHERE phone=$1', [phone])).rows[0];
  let created = false;
  if (!user) {
    user = (await db.query('INSERT INTO users (phone, name) VALUES ($1,$2) RETURNING *', [phone, 'Người dùng mới'])).rows[0];
    created = true;
  }
  if (user.status === 'locked') throw forbidden('Tài khoản đang bị khoá');
  await db.query(
    `INSERT INTO verifications (user_id, type, status, verified_at) VALUES ($1,'phone','verified', now())
     ON CONFLICT (user_id, type) DO NOTHING`, [user.id]);
  await audit(db, { actorId: user.id, action: created ? 'user.signup' : 'user.login', entity: 'user', entityId: user.id, ip });
  return { ok: true, user, created };
}

export function signAccess(user, sid, { mfa = false } = {}) {
  return jwt.sign({ sub: user.id, sid, ...(mfa ? { mfa: true } : {}) }, config.jwtSecret, {
    algorithm: 'HS256', expiresIn: config.accessTtlSec, issuer: config.jwtIssuer, audience: config.jwtAudience,
  });
}

export function verifyAccess(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: config.jwtIssuer, audience: config.jwtAudience });
}

export async function createSession(db, userId, { userAgent, ip, familyId = crypto.randomUUID() } = {}) {
  const token = randomToken();
  await db.query(
    `INSERT INTO sessions (user_id, refresh_hash, family_id, user_agent, ip, expires_at)
     VALUES ($1,$2,$3,$4,$5, now() + make_interval(days => $6))`,
    [userId, sha256(token), familyId, userAgent?.slice(0, 200) || null, ip || null, config.refreshTtlDays]);
  return { token, familyId };
}

export async function rotateSession(db, token, meta) {
  const s = (await db.query('SELECT * FROM sessions WHERE refresh_hash=$1 FOR UPDATE', [sha256(token)])).rows[0];
  if (!s) throw unauthorized('Phiên không hợp lệ');
  if (s.revoked_at) {
    await db.query('UPDATE sessions SET revoked_at = now() WHERE family_id=$1 AND revoked_at IS NULL', [s.family_id]);
    await audit(db, { actorId: s.user_id, action: 'session.reuse_detected', entity: 'session', entityId: s.id, ip: meta.ip });
    return { reuse: true };
  }
  if (s.expires_at < new Date()) throw unauthorized('Phiên đã hết hạn');
  await db.query('UPDATE sessions SET revoked_at = now() WHERE id=$1', [s.id]);
  const user = (await db.query('SELECT * FROM users WHERE id=$1', [s.user_id])).rows[0];
  if (!user || user.status === 'locked') throw unauthorized();
  const next = await createSession(db, user.id, { ...meta, familyId: s.family_id });
  return { user, token: next.token, sid: s.family_id };
}

export async function revokeSession(db, token) {
  if (token) await db.query('UPDATE sessions SET revoked_at = now() WHERE refresh_hash=$1 AND revoked_at IS NULL', [sha256(token)]);
}

import { verifyAccess } from '../services/auth.js';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { unauthorized, forbidden } from '../lib/errors.js';

async function load(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return null;
  let claims;
  try { claims = verifyAccess(m[1]); } catch { throw unauthorized('Phiên đăng nhập đã hết hạn'); }
  const u = (await query(
    `SELECT u.id, u.role, u.status,
            EXISTS (SELECT 1 FROM sessions s WHERE s.family_id = $2 AND s.user_id = u.id
                     AND s.revoked_at IS NULL AND s.expires_at > now()) AS live
       FROM users u WHERE u.id = $1`, [claims.sub, claims.sid || null])).rows[0];
  if (!u || u.status !== 'active' || !u.live) throw unauthorized('Phiên đăng nhập đã kết thúc');
  return { id: u.id, role: u.role, status: u.status, sid: claims.sid, mfa: !!claims.mfa };
}

export const requireAuth = (req, _res, next) =>
  load(req).then((u) => { if (!u) throw unauthorized(); req.user = u; next(); }).catch(next);

export const optionalAuth = (req, _res, next) =>
  load(req).then((u) => { req.user = u; next(); }).catch(() => { req.user = null; next(); });

export const adminMfaRequired = () => (config.isProd && !config.demoDeployment) || !!config.adminTotpSecret;

export const requireAdminRole = (req, res, next) =>
  requireAuth(req, res, (err) => { if (err) return next(err); if (req.user.role !== 'admin') return next(forbidden()); next(); });

export const requireAdmin = (req, res, next) =>
  requireAdminRole(req, res, (err) => {
    if (err) return next(err);
    if (adminMfaRequired() && !req.user.mfa) return next(forbidden('Cần xác thực 2 lớp: gọi POST /api/admin/mfa với mã từ ứng dụng Authenticator'));
    next();
  });

import 'dotenv/config';

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';
const isTest = env === 'test';

// Bản demo công khai (vd trên Vercel): không có nhà cung cấp SMS nên mã OTP trả về giao diện,
// công cụ demo bật, khoá bí mật tự sinh và lưu trong CSDL (xem db/bootstrap.js). Không dùng cho sản phẩm thật.
const demoDeployment = process.env.DEMO_DEPLOYMENT === 'true';
const devTools = isTest || demoDeployment || process.env.DEV_TOOLS === 'true';
if (devTools && isProd && !demoDeployment) throw new Error('DEV_TOOLS=true không được dùng khi NODE_ENV=production');

const missing = (name) => { throw new Error(`Thiếu biến môi trường bắt buộc: ${name}`); };
const runtimeSecrets = {};
/** Khoá sinh lúc chạy (bản demo): gọi trước khi xử lý request đầu tiên. */
export const setRuntimeSecrets = (s) => Object.assign(runtimeSecrets, s);
export const SECRET_NAMES = ['JWT_SECRET', 'OTP_SECRET', 'PII_SECRET'];

function required(name, devDefault) {
  const v = process.env[name];
  if (v) {
    if (isProd && v.length < 32) throw new Error(`${name} quá ngắn cho production (cần ≥ 32 ký tự ngẫu nhiên)`);
    return v;
  }
  if (demoDeployment) return null;
  if (devTools && devDefault) return devDefault;
  throw new Error(`Thiếu biến môi trường bắt buộc: ${name} (máy dev: đặt DEV_TOOLS=true trong server/.env)`);
}
const secret = (name, fixed) => () => {
  const v = fixed ?? runtimeSecrets[name];
  if (!v) throw new Error(`Khoá ${name} chưa được nạp`);
  return v;
};
const jwtSecret = secret('JWT_SECRET', required('JWT_SECRET', 'dev-only-jwt-secret-change-me'));
const otpSecret = secret('OTP_SECRET', required('OTP_SECRET', 'dev-only-otp-secret'));
const piiSecret = secret('PII_SECRET', required('PII_SECRET', 'dev-only-pii-secret'));

function trustProxy(v) {
  if (v == null || v === '' || v === 'false') return false;
  if (v === 'true') return true;
  return /^\d+$/.test(v) ? Number(v) : v;
}

const sameSite = (process.env.COOKIE_SAMESITE || 'strict').toLowerCase();
if (!['strict', 'lax', 'none'].includes(sameSite)) throw new Error('COOKIE_SAMESITE phải là strict | lax | none');

export const config = {
  env,
  isProd,
  isTest,
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL || (devTools && !demoDeployment ? 'postgresql://reown:reown@localhost:5432/reown' : missing('DATABASE_URL')),
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(','),
  get jwtSecret() { return jwtSecret(); },
  get otpSecret() { return otpSecret(); },
  get piiSecret() { return piiSecret(); },
  accessTtlSec: 15 * 60,
  refreshTtlDays: 30,
  otpTtlSec: 5 * 60,
  otpMaxAttempts: 5,
  devTools,
  demoDeployment,
  onVercel: !!process.env.VERCEL,
  trustProxy: trustProxy(process.env.TRUST_PROXY ?? (process.env.VERCEL ? '1' : undefined)),
  cookieSameSite: sameSite,
  cookieSecure: isProd || sameSite === 'none',
  adminTotpSecret: process.env.ADMIN_TOTP_SECRET || (isTest ? 'JBSWY3DPEHPK3PXP' : ''),
  jwtIssuer: 'reown-api',
  jwtAudience: 'reown-web',
  jobsIntervalSec: Number(process.env.JOBS_INTERVAL_SEC || 300),
  platformFeeRate: 0.04,
  shipSlaDays: 3,
  autoCompleteDays: 7,
  disputeWindowDays: 3,
};

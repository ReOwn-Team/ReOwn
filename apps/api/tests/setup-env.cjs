// Unit/HTTP/contract tests must never connect to the developer's Redis.
process.env.REDIS_URL = "";
process.env.REDIS_KEY_PREFIX = "reown-test:";

process.env.OTP_SECRET = "isolated-jest-otp-secret-do-not-use-in-production";

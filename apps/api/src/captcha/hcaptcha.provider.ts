import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
const testSitekey = "10000000-ffff-ffff-ffff-000000000001";
const testSecret = "0x0000000000000000000000000000000000000000";
@Injectable()
export class HcaptchaProvider {
  async verify(token: unknown): Promise<void> {
    if (typeof token !== "string" || !token || token.length > 8192)
      throw new ForbiddenException({
        statusCode: 403,
        error: "HCAPTCHA_INVALID",
        message: "Captcha verification is required",
      });
    const secret = process.env.HCAPTCHA_SECRET;
    const sitekey = process.env.HCAPTCHA_SITEKEY;
    if (
      !secret ||
      !sitekey ||
      (process.env.NODE_ENV === "production" &&
        (secret === testSecret || sitekey === testSitekey))
    )
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: "HCAPTCHA_UNAVAILABLE",
        message: "Captcha is not configured for this environment",
      });
    let endpoint = "https://api.hcaptcha.com/siteverify";
    if (process.env.NODE_ENV === "test" && process.env.HCAPTCHA_TEST_ENDPOINT) {
      const url = new URL(process.env.HCAPTCHA_TEST_ENDPOINT);
      if (
        url.protocol !== "http:" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
        throw new ServiceUnavailableException("Invalid captcha test endpoint");
      endpoint = url.href;
    }
    let body: { success?: unknown; hostname?: unknown };
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token, sitekey }),
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (!response.ok) throw new Error();
      body = (await response.json()) as typeof body;
      if (!body || typeof body !== "object") throw new Error();
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: "HCAPTCHA_UNAVAILABLE",
        message: "Captcha verification is temporarily unavailable",
      });
    }
    const testing = sitekey === testSitekey && secret === testSecret;
    let expectedHost = "";
    try {
      expectedHost = new URL(process.env.CLIENT_ORIGIN ?? "").hostname;
    } catch {}
    if (
      body.success !== true ||
      (!testing && (!expectedHost || body.hostname !== expectedHost))
    )
      throw new ForbiddenException({
        statusCode: 403,
        error: "HCAPTCHA_INVALID",
        message: "Captcha verification failed",
      });
  }
}

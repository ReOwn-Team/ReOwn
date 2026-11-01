import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { HcaptchaProvider } from "./hcaptcha.provider";
@Injectable()
export class HcaptchaGuard implements CanActivate {
  constructor(private readonly captcha: HcaptchaProvider) {}
  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, unknown> }>();
    await this.captcha.verify(request.headers["x-hcaptcha-response"]);
    return true;
  }
}

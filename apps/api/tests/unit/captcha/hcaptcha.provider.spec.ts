import { HcaptchaProvider } from "../../../src/captcha/hcaptcha.provider";
import { ForbiddenException, ServiceUnavailableException } from "@nestjs/common";

describe("hCaptcha verification", () => {
    const provider = new HcaptchaProvider();
    const original = { ...process.env };
    afterEach(() => { jest.restoreAllMocks(); process.env = { ...original }; });
    beforeEach(() => {
        process.env.HCAPTCHA_SECRET = "private-secret";
        process.env.HCAPTCHA_SITEKEY = "public-sitekey";
        process.env.CLIENT_ORIGIN = "https://reown.tech";
    });
    it("rejects missing tokens before contacting the verifier", async () => {
        const fetcher = jest.spyOn(globalThis, "fetch");
        await expect(provider.verify(undefined)).rejects.toBeInstanceOf(ForbiddenException);
        expect(fetcher).not.toHaveBeenCalled();
    });
    it("posts the token and matching sitekey to hCaptcha", async () => {
        const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, hostname: "reown.tech" })));
        await provider.verify("response-token");
        const [url, options] = fetcher.mock.calls[0];
        expect(url).toBe("https://api.hcaptcha.com/siteverify");
        expect(options?.method).toBe("POST");
        expect((options?.body as URLSearchParams).get("response")).toBe("response-token");
        expect((options?.body as URLSearchParams).get("sitekey")).toBe("public-sitekey");
    });
    it.each([{ success: false }, { success: true, hostname: "other.example" }, { success: "true", hostname: "reown.tech" }])("rejects invalid verification %j", async (body) => {
        jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body)));
        await expect(provider.verify("invalid-token")).rejects.toBeInstanceOf(ForbiddenException);
    });
    it("fails closed during a verifier outage", async () => {
        jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
        await expect(provider.verify("token")).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
    it("disallows the always-pass keys in production", async () => {
        process.env.NODE_ENV = "production";
        process.env.HCAPTCHA_SITEKEY = "10000000-ffff-ffff-ffff-000000000001";
        await expect(provider.verify("token")).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
});

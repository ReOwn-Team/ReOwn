import { OtpMailProvider } from "../../../src/otp/otp-mail.provider";

describe("OTP email delivery", () => {
    const original = { ...process.env };
    afterEach(() => {
        process.env = { ...original };
        jest.restoreAllMocks();
    });
    it("sends the rendered HTML, text and inline logo together to Resend", async () => {
        process.env.RESEND_API_KEY = "test-resend-key";
        process.env.RESEND_FROM = "ReOwn <otp@example.com>";
        delete process.env.RESEND_TEST_ENDPOINT;
        const transport = jest
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(
                new Response(JSON.stringify({ id: "test-message-id" })),
            );
        await new OtpMailProvider().send(
            "recipient@example.com",
            "012345",
            "login",
            "delivery-id",
        );
        const [url, options] = transport.mock.calls[0];
        expect(url).toBe("https://api.resend.com/emails");
        const payload = JSON.parse(options?.body as string);
        expect(payload.html).toContain('src="cid:reown-logo"');
        expect(payload.attachments[0]).toMatchObject({
            content_id: "reown-logo",
            content_type: "image/png",
            filename: "reown-logo.png",
        });
        expect(payload.attachments[0].content.length).toBeGreaterThan(0);
        expect(payload.text).toContain("012345");
        expect(payload.html).toContain("012345");
        expect(payload.to).toEqual(["recipient@example.com"]);
        expect(options?.headers).toMatchObject({
            "Idempotency-Key": "reown-otp/delivery-id",
        });
    });
});

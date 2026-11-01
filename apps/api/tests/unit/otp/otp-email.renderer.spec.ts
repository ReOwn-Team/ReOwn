import { otpEmail } from "../../../src/otp/otp-email.renderer";

describe("OTP email assets", () => {
    it.each(["register", "login"] as const)(
        "renders %s HTML and text with the same code and no unresolved placeholders",
        (purpose) => {
            const email = otpEmail("012345", purpose);
            expect(email.subject).toContain("012345");
            for (const body of [email.html, email.text]) {
                expect(body).toContain("012345");
                expect(body).toContain("5 phút");
                expect(body).not.toMatch(/{{[^{}]+}}/);
            }
            expect(email.html).toContain(
                purpose === "register"
                    ? "Xác nhận email của bạn"
                    : "Xác nhận đăng nhập",
            );
            expect(email.text).toContain(
                purpose === "register"
                    ? "hoàn tất đăng ký"
                    : "đăng nhập vào tài khoản",
            );
        },
    );
    it.each(["12345", "1234567", "<img>", "123\n45"])(
        "rejects invalid code %j before rendering",
        (code) => {
            expect(() => otpEmail(code, "login")).toThrow(
                "Invalid OTP email code",
            );
        },
    );
});

describe("OTP inline branding", () => {
    it("includes a PNG attachment matching the HTML content ID", () => {
        const message = otpEmail("012345", "register");
        expect(message.html).toContain('src="cid:reown-logo"');
        expect(message.html).toContain('alt="ReOwn');
        expect(message.attachments).toHaveLength(1);
        const logo = message.attachments[0];
        expect(logo.content_id).toBe("reown-logo");
        expect(logo.content_type).toBe("image/png");
        const bytes = Buffer.from(logo.content, "base64");
        expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        expect(bytes.length).toBeLessThan(50000);
    });
});

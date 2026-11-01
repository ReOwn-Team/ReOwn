import { otpEmail } from "./otp-email.renderer";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
@Injectable()
export class OtpMailProvider {
    assertConfigured() {
        if (
            !process.env.RESEND_API_KEY ||
            !process.env.RESEND_FROM ||
            /[\r\n]/.test(process.env.RESEND_FROM)
        )
            throw new ServiceUnavailableException(
                "OTP email delivery is not configured",
            );
    }
    async send(
        email: string,
        code: string,
        purpose: "register" | "login",
        deliveryId: string,
    ) {
        this.assertConfigured();
        let endpoint = "https://api.resend.com/emails";
        if (
            process.env.NODE_ENV === "test" &&
            process.env.RESEND_TEST_ENDPOINT
        ) {
            const url = new URL(process.env.RESEND_TEST_ENDPOINT);
            if (
                url.protocol !== "http:" ||
                !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
            )
                throw new ServiceUnavailableException(
                    "Invalid email test endpoint",
                );
            endpoint = url.href;
        }
        try {
            const message = otpEmail(code, purpose);
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                    "Content-Type": "application/json",
                    "Idempotency-Key": `reown-otp/${deliveryId}`,
                },
                body: JSON.stringify({
                    from: process.env.RESEND_FROM,
                    to: [email],
                    ...message,
                }),
                signal: AbortSignal.timeout(8000),
                redirect: "error",
            });
            const body: unknown = await response.json();
            if (
                !response.ok ||
                !body ||
                typeof body !== "object" ||
                !("id" in body) ||
                typeof body.id !== "string"
            )
                throw new Error();
        } catch {
            throw new ServiceUnavailableException(
                "Cannot send OTP email. Please try again later.",
            );
        }
    }
}

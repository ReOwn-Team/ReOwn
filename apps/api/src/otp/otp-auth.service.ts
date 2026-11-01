import {
    Injectable,
    ServiceUnavailableException,
    UnauthorizedException,
} from "@nestjs/common";
import {
    createCipheriv,
    createDecipheriv,
    createHash,
    createHmac,
    randomBytes,
    randomInt,
} from "node:crypto";
import { OtpStore, type OtpRecord } from "./otp.store";
import { OtpMailProvider } from "./otp-mail.provider";
import { UsersService } from "../services/users.service";
import type { LoginUserDto, RegisterUserDto } from "../dtos/user.dto";
import type { OtpChallenge, OtpVerifyDto } from "../dtos/otp.dto";
type Pending =
    | {
          purpose: "register";
          email: string;
          displayName: string;
          phone: string;
          passwordHash: string;
      }
    | { purpose: "login"; email: string; userId: string; fingerprint: string };
@Injectable()
export class OtpAuthService {
    constructor(
        private readonly store: OtpStore,
        private readonly mail: OtpMailProvider,
        private readonly users: UsersService,
    ) {}
    private secret(context: string) {
        const secret = process.env.OTP_SECRET ?? process.env.JWT_SECRET;
        if (!secret || secret.length < 32)
            throw new ServiceUnavailableException(
                "OTP secret is not configured",
            );
        return createHmac("sha256", secret)
            .update(`reown-otp:${context}`)
            .digest();
    }
    private digest(id: string, code: string) {
        return createHmac("sha256", this.secret("codes"))
            .update(`${id}:${code}`)
            .digest("hex");
    }
    private seal(value: Pending, id: string) {
        const iv = randomBytes(12),
            cipher = createCipheriv("aes-256-gcm", this.secret("payload"), iv);
        cipher.setAAD(Buffer.from(id));
        const bytes = Buffer.concat([
            cipher.update(JSON.stringify(value), "utf8"),
            cipher.final(),
        ]);
        return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString(
            "base64url",
        );
    }
    private open(sealed: string, id: string): Pending {
        const bytes = Buffer.from(sealed, "base64url"),
            decipher = createDecipheriv(
                "aes-256-gcm",
                this.secret("payload"),
                bytes.subarray(0, 12),
            );
        decipher.setAAD(Buffer.from(id));
        decipher.setAuthTag(bytes.subarray(12, 28));
        return JSON.parse(
            Buffer.concat([
                decipher.update(bytes.subarray(28)),
                decipher.final(),
            ]).toString("utf8"),
        );
    }
    private challenge(id: string, record: OtpRecord): OtpChallenge {
        return {
            requiresOtp: true,
            challengeId: id,
            emailHint: record.emailHint,
            expiresIn: Math.max(
                0,
                Math.floor((record.expiresAt - Date.now()) / 1000),
            ),
            resendAfter: 60,
        };
    }
    private async deliver(
        payload: Pending,
        id = randomBytes(32).toString("base64url"),
        previous?: OtpRecord,
    ) {
        this.mail.assertConfigured();
        let code = String(randomInt(1000000)).padStart(6, "0");
        while(previous && this.digest(id,code)===previous.digest) code=String(randomInt(1000000)).padStart(6,"0");
        const [local, domain] = payload.email.split("@");
        const record: OtpRecord = {
            version: randomBytes(16).toString("hex"),
            digest: this.digest(id, code),
            sealed: this.seal(payload, id),
            recipientKey: createHmac("sha256", this.secret("recipient"))
                .update(payload.email)
                .digest("hex"),
            purpose: payload.purpose,
            emailHint: `${local.slice(0, 1)}***@${domain}`,
            expiresAt: Date.now() + 300000,
            ready: false,
            attempts: previous?.attempts ?? 0,
        };
        await this.store.reserve(id, record, previous?.version);
        try {
            await this.mail.send(
                payload.email,
                code,
                payload.purpose,
                record.version,
            );
            await this.store.activate(id, record.version);
        } catch (error) {
            await this.store.discard(id, record.version);
            throw error;
        }
        return this.challenge(id, record);
    }
    async register(dto: RegisterUserDto) {
        this.mail.assertConfigured();
        const value = await this.users.prepareRegistration(dto);
        return this.deliver({ purpose: "register", ...value });
    }
    async login(dto: LoginUserDto) {
        this.mail.assertConfigured();
        const { user, passwordHash } = await this.users.verifyCredentials(dto);
        return this.deliver({
            purpose: "login",
            email: user.email,
            userId: user.id,
            fingerprint: createHash("sha256")
                .update(passwordHash)
                .digest("hex"),
        });
    }
    async resend(id: string) {
        const previous = await this.store.read(id);
        if (!previous || !previous.ready || previous.expiresAt <= Date.now())
            throw new UnauthorizedException(
                "OTP challenge is invalid or expired",
            );
        return this.deliver(this.open(previous.sealed, id), id, previous);
    }
    async verify(dto: OtpVerifyDto) {
        const record = await this.store.consume(
            dto.challengeId,
            this.digest(dto.challengeId, dto.code),
        );
        const payload = this.open(record.sealed, dto.challengeId);
        if (payload.purpose === "register")
            return this.users.completeRegistration(payload);
        return this.users.completeOtpLogin(
            payload.userId,
            payload.email,
            payload.fingerprint,
        );
    }
}

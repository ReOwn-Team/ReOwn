import {
    HttpException,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
export type OtpRecord = {
    version: string;
    digest: string;
    sealed: string;
    recipientKey: string;
    purpose: "register" | "login";
    emailHint: string;
    expiresAt: number;
    ready: boolean;
    attempts: number;
};
const reserve = `
local raw=redis.call('GET',KEYS[1])
if ARGV[3]~='' then
 if not raw then return -1 end
 local old=cjson.decode(raw)
 if old.version~=ARGV[3] or old.attempts>=5 then return -1 end
end
local cooldown=redis.call('TTL',KEYS[2])
if cooldown>0 then return cooldown end
local total=tonumber(redis.call('GET',KEYS[3]) or '0')
if total>=5 then return math.max(redis.call('TTL',KEYS[3]),1) end
local count=redis.call('INCR',KEYS[3])
if count==1 then redis.call('EXPIRE',KEYS[3],3600) end
redis.call('SET',KEYS[2],'1','EX',60)
redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[2])
return 0`;
@Injectable()
export class OtpStore {
    constructor(private readonly redis: RedisService) {}
    private key(id: string) {
        return `${this.redis.prefix}otp:challenge:${id}`;
    }
    async read(id: string): Promise<OtpRecord | null> {
        const value = await this.redis.atomic(
            "return redis.call('GET',KEYS[1])",
            [this.key(id)],
            [],
        );
        return typeof value === "string"
            ? (JSON.parse(value) as OtpRecord)
            : null;
    }
    async reserve(id: string, record: OtpRecord, oldVersion = "") {
        const prefix = `${this.redis.prefix}otp:`;
        const result = Number(
            await this.redis.atomic(
                reserve,
                [
                    this.key(id),
                    `${prefix}cooldown:${record.recipientKey}`,
                    `${prefix}limit:${record.recipientKey}`,
                ],
                [JSON.stringify(record), "300", oldVersion],
            ),
        );
        if (result === -1)
            throw new UnauthorizedException(
                "OTP challenge is invalid or expired",
            );
        if (result > 0)
            throw new HttpException(
                {
                    message: "Wait before requesting another code",
                    retryAfter: result,
                },
                429,
            );
    }
    async activate(id: string, version: string) {
        const result = await this.redis.atomic(
            `local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local value=cjson.decode(raw); if value.version~=ARGV[1] then return 0 end; value.ready=true; redis.call('SET',KEYS[1],cjson.encode(value),'KEEPTTL'); return 1`,
            [this.key(id)],
            [version],
        );
        if (result !== 1)
            throw new UnauthorizedException(
                "OTP challenge is invalid or expired",
            );
    }
    async discard(id: string, version: string) {
        await this.redis.atomic(
            `local raw=redis.call('GET',KEYS[1]); if raw and cjson.decode(raw).version==ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0`,
            [this.key(id)],
            [version],
        );
    }
    async consume(id: string, digest: string): Promise<OtpRecord> {
        const result = await this.redis.atomic(
            `local raw=redis.call('GET',KEYS[1]); if not raw then return false end; local value=cjson.decode(raw); if not value.ready then return false end; value.attempts=value.attempts+1; if value.digest~=ARGV[1] then if value.attempts>=5 then redis.call('DEL',KEYS[1]); else redis.call('SET',KEYS[1],cjson.encode(value),'KEEPTTL'); end; return false end; redis.call('DEL',KEYS[1]); return raw`,
            [this.key(id)],
            [digest],
        );
        if (typeof result !== "string")
            throw new UnauthorizedException(
                "OTP is invalid, expired or already used",
            );
        return JSON.parse(result) as OtpRecord;
    }
}

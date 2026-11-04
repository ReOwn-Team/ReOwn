import { createECDH } from "node:crypto";
import { z } from "zod";

const hosts = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
export function isAllowedEndpoint(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && hosts.has(url.hostname) && !url.port && !url.username && !url.password && !url.hash && value === url.href;
    } catch { return false; }
}
const endpoint = z.string().max(2048).refine(isAllowedEndpoint, "Invalid push endpoint");
function validKey(value: string, length: number): boolean {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
    const bytes = Buffer.from(value, "base64url");
    return bytes.length === length && bytes.toString("base64url") === value;
}
const publicKey = z.string().refine((value) => {
    if (!validKey(value, 65)) return false;
    try { const ecdh = createECDH("prime256v1"); ecdh.generateKeys(); ecdh.computeSecret(Buffer.from(value, "base64url")); return true; } catch { return false; }
}, "Invalid public key");
export const pushSubscriptionSchema = z.object({
    endpoint,
    keys: z.object({ p256dh: publicKey, auth: z.string().refine((value) => validKey(value, 16), "Invalid auth key") }).strict(),
}).strict();
export const pushUnsubscribeSchema = z.object({ endpoint }).strict();
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

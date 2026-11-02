const { existsSync } = require("node:fs");
const path = require("node:path");
for (const file of [
    "main.js",
    "generated/prisma/client.js",
    "kyc/analysis/analysis.worker.js",
    "otp/templates/otp.html",
    "otp/templates/otp.txt",
    "inspection/workers/heic.cjs",
    "inspection/templates/v1.txt",
    "inspection/templates/v2.txt",
    "otp/templates/assets/reown-logo.png",
]) {
    if (!existsSync(path.join(__dirname, "../dist", file))) {
        throw new Error(`Incomplete API build: missing dist/${file}`);
    }
}
if (
    typeof require("../dist/generated/prisma/client").PrismaClient !==
    "function"
) {
    throw new Error("Generated Prisma client cannot be loaded from dist");
}
console.log("API entry point and generated Prisma client verified");

const { otpEmail } = require("../dist/otp/otp-email.renderer");
for (const purpose of ["register", "login"]) {
    const message = otpEmail("012345", purpose);
    if (
        !message.html.includes(`cid:${message.attachments[0].content_id}`) ||
        !message.attachments[0].content
    ) {
        throw new Error("OTP logo attachment is missing or not referenced");
    }
    for (const format of ["html", "text"]) {
        if (
            !message[format].includes("012345") ||
            /{{[^{}]+}}/.test(message[format])
        ) {
            throw new Error(`Incomplete ${purpose} OTP email ${format}`);
        }
    }
}
console.log("Packaged OTP email templates rendered successfully");

import { readFileSync } from "node:fs";
import { join } from "node:path";

type TemplateValues = Record<
    "title" | "description" | "action" | "code",
    string
>;
let cachedTemplates: { html: string; text: string; logo: string } | undefined;

function loadTemplates() {
    // Resolve alongside the compiled module, independently of the process cwd.
    // In development Nest copies edited assets without restarting the process.
    if (process.env.NODE_ENV === "production" && cachedTemplates)
        return cachedTemplates;
    const templates = {
        html: readFileSync(join(__dirname, "templates", "otp.html"), "utf8"),
        text: readFileSync(join(__dirname, "templates", "otp.txt"), "utf8"),
        logo: readFileSync(
            join(__dirname, "templates", "assets", "reown-logo.png"),
        ).toString("base64"),
    };
    if (process.env.NODE_ENV === "production") cachedTemplates = templates;
    return templates;
}

function escapeHtml(value: string) {
    const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    };
    return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function interpolate(template: string, values: TemplateValues, html: boolean) {
    return template.replace(
        /{{\s*([^{}]+?)\s*}}/g,
        (_placeholder, key: string) => {
            if (!Object.prototype.hasOwnProperty.call(values, key)) {
                throw new Error(`Unknown OTP email placeholder: ${key}`);
            }
            const value = values[key as keyof TemplateValues];
            return html ? escapeHtml(value) : value;
        },
    );
}

export function otpEmail(code: string, purpose: "register" | "login") {
    if (!/^\d{6}$/.test(code)) throw new Error("Invalid OTP email code");
    const registering = purpose === "register";
    const title = registering ? "Xác nhận email của bạn" : "Xác nhận đăng nhập";
    const action = registering ? "xác nhận đăng ký" : "đăng nhập";
    const description = registering
        ? "Nhập mã sau trên ReOwn để hoàn tất đăng ký tài khoản."
        : "Dùng mã sau để đăng nhập vào tài khoản ReOwn của bạn.";
    const values = { title, description, action, code };
    const templates = loadTemplates();
    return {
        subject: `${code} là mã ${action} ReOwn`,
        text: interpolate(templates.text, values, false),
        html: interpolate(templates.html, values, true),
        attachments: [
            {
                filename: "reown-logo.png",
                content: templates.logo,
                content_type: "image/png",
                content_id: "reown-logo",
            },
        ],
    };
}

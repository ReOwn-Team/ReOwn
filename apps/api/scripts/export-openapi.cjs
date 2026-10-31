"use strict";

require("reflect-metadata");
const fs = require("node:fs");
const path = require("node:path");
const { Test } = require("@nestjs/testing");
const { AppModule } = require("../dist/app.module");
const { PrismaService } = require("../dist/prisma/prisma.service");
const { AccessTokenProvider } = require("../dist/providers/access-token.provider");
const { AuthCookieProvider } = require("../dist/providers/auth-cookie.provider");
const { configureHttp } = require("../dist/config/http.config");
const { createOpenApiDocument } = require("../dist/openapi/document");

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    }
    return value;
}

async function main() {
    // Use the real module graph, but never instantiate secret- or database-dependent providers.
    const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService).useValue({})
        .overrideProvider(AccessTokenProvider).useValue({})
        .overrideProvider(AuthCookieProvider).useValue({ clientOrigin: "http://localhost:5173" })
        .compile();
    const app = module.createNestApplication({ logger: false });
    try {
        configureHttp(app);
        const document = createOpenApiDocument(app);
        const content = JSON.stringify(canonical(document), null, 2) + "\n";
        const target = path.resolve(__dirname, "../openapi.json");
        if (process.argv.includes("--check")) {
            if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== content) {
                throw new Error("openapi.json is stale. Run npm run openapi:generate and commit both contract artifacts.");
            }
            console.log("OpenAPI contract is up to date");
        } else {
            fs.writeFileSync(target, content);
            console.log("Generated apps/api/openapi.json without starting a server or connecting to PostgreSQL");
        }
    } finally {
        await app.close();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});

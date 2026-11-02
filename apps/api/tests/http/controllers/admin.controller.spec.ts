import "reflect-metadata";
import {
    INestApplication,
    UnauthorizedException,
    VersioningType,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AddressInfo } from "node:net";
import { AdminController } from "../../../src/controllers/admin.controller";
import { AccessTokenGuard } from "../../../src/guards/access-token.guard";
import { AdminGuard } from "../../../src/inspection/admin.guard";
import { AccessTokenProvider } from "../../../src/providers/access-token.provider";
import { AdminService } from "../../../src/services/admin.service";
import { SessionsService } from "../../../src/services/sessions.service";
import { UsersService } from "../../../src/services/users.service";

describe("AdminController (HTTP)", () => {
    let app: INestApplication;
    let base: string;
    const service = {
        users: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
        user: jest.fn(),
        statistics: jest.fn(),
    };
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [AdminController],
            providers: [
                AccessTokenGuard,
                AdminGuard,
                { provide: AdminService, useValue: service },
                {
                    provide: AccessTokenProvider,
                    useValue: {
                        verify: (token: string) => {
                            if (token === "bad")
                                throw new UnauthorizedException();
                            return { userId: token, familyId: "family" };
                        },
                    },
                },
                {
                    provide: SessionsService,
                    useValue: { assertActive: async () => {} },
                },
                {
                    provide: UsersService,
                    useValue: {
                        findActiveProfile: async (id: string) => ({
                            id,
                            role: id,
                        }),
                    },
                },
            ],
        }).compile();
        app = module.createNestApplication();
        app.enableVersioning({
            type: VersioningType.URI,
            prefix: "api/v",
            defaultVersion: "1",
        });
        await app.listen(0, "127.0.0.1");
        base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1/admin`;
    });
    afterAll(async () => {
        await app.close();
    });

    it("rejects missing and invalid tokens and non-admin users", async () => {
        expect((await fetch(`${base}/users`)).status).toBe(401);
        expect(
            (
                await fetch(`${base}/users`, {
                    headers: { Authorization: "Bearer bad" },
                })
            ).status,
        ).toBe(401);
        expect(
            (
                await fetch(`${base}/users`, {
                    headers: { Authorization: "Bearer user" },
                })
            ).status,
        ).toBe(403);
        expect(service.users).not.toHaveBeenCalled();
    });
    it("validates bounds and UUIDs and applies defaults for admins", async () => {
        const headers = { Authorization: "Bearer admin" };
        for (const query of [
            "?limit=0",
            "?limit=101",
            "?limit=1.5",
            "?cursor=invalid",
            "?search=%20%20",
            `?search=${"a".repeat(101)}`,
        ]) {
            expect(
                (await fetch(`${base}/users${query}`, { headers })).status,
            ).toBe(400);
        }
        expect(
            (await fetch(`${base}/users/not-a-uuid`, { headers })).status,
        ).toBe(400);
        const response = await fetch(`${base}/users`, { headers });
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({ items: [], nextCursor: null });
        expect(service.users).toHaveBeenCalledWith(
            "admin",
            25,
            undefined,
            undefined,
        );
        expect(
            (await fetch(`${base}/users?search=%20Alice%20`, { headers }))
                .status,
        ).toBe(200);
        expect(service.users).toHaveBeenLastCalledWith(
            "admin",
            25,
            undefined,
            "Alice",
        );
    });
});

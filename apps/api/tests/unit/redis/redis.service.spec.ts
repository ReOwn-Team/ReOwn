import {
    RedisService,
    createRedisConnection,
    type RedisConnection,
} from "../../../src/redis/redis.service";

describe("RedisService", () => {
    const sendCommand = jest.fn();
    const destroy = jest.fn();
    const client = {
        isReady: true,
        isOpen: true,
        withCommandOptions: jest.fn(() => ({ sendCommand })),
        destroy,
    };
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.REDIS_URL = "";
        process.env.REDIS_KEY_PREFIX = "test-app";
        client.isReady = true;
        client.isOpen = true;
    });
    afterAll(() => {
        delete process.env.REDIS_URL;
        delete process.env.REDIS_KEY_PREFIX;
    });
    const service = () =>
        new RedisService(client as unknown as RedisConnection);
    it("supports an explicitly unconfigured local instance", async () => {
        expect(await createRedisConnection()).toBeNull();
        const redis = new RedisService(null);
        expect(redis.enabled).toBe(false);
        expect(await redis.ping()).toBe(false);
        expect(await redis.getJson("missing")).toBeNull();
        await redis.setJson("unused", { ok: true }, 60);
        expect(redis.createRateLimitStore("credentials")).toBeUndefined();
        await redis.onModuleDestroy();
        expect(sendCommand).not.toHaveBeenCalled();
    });
    it.each(["http://localhost:6379", "invalid-url"])(
        "rejects invalid Redis URLs without leaking them: %s",
        async (url) => {
            process.env.REDIS_URL = url;
            await expect(createRedisConnection()).rejects.toThrow(
                "REDIS_URL must be a valid",
            );
        },
    );
    it("round-trips JSON with namespaced keys and an explicit TTL", async () => {
        const redis = service();
        await redis.setJson("catalog:one", { price: 100 }, 60);
        expect(sendCommand).toHaveBeenLastCalledWith([
            "SET",
            "test-app:cache:catalog:one",
            '{"price":100}',
            "EX",
            "60",
        ]);
        sendCommand.mockResolvedValueOnce('{"price":100}');
        expect(await redis.getJson("catalog:one")).toEqual({ price: 100 });
        sendCommand.mockResolvedValueOnce(null);
        expect(await redis.getJson("missing")).toBeNull();
        await redis.deleteCache("catalog:one");
        expect(sendCommand).toHaveBeenLastCalledWith([
            "DEL",
            "test-app:cache:catalog:one",
        ]);
        expect(client.withCommandOptions).toHaveBeenCalledWith({
            timeout: 2000,
        });
    });
    it.each([0, -1, 1.5, Infinity, NaN])(
        "rejects cache TTL %s",
        async (ttl) => {
            await expect(service().setJson("key", {}, ttl)).rejects.toThrow(
                "TTL",
            );
            expect(sendCommand).not.toHaveBeenCalled();
        },
    );
    it("does not bypass a configured but unavailable Redis", async () => {
        client.isReady = false;
        await expect(service().getJson("key")).rejects.toMatchObject({
            status: 503,
        });
        expect(sendCommand).not.toHaveBeenCalled();
    });
    it("sanitizes driver command errors", async () => {
        sendCommand.mockRejectedValueOnce(
            new Error("redis://private:secret@host"),
        );
        await expect(service().getJson("key")).rejects.toThrow(
            /^Redis is unavailable$/,
        );
    });
    it("separates cache and authentication rate limit namespaces", () => {
        expect(service().createRateLimitStore("credentials")?.prefix).toBe(
            "test-app:rate-limit:credentials:",
        );
        expect(service().createRateLimitStore("sessions")?.prefix).toBe(
            "test-app:rate-limit:sessions:",
        );
    });
    it("releases the connection on shutdown", async () => {
        await service().onModuleDestroy();
        expect(destroy).toHaveBeenCalledTimes(1);
    });
});

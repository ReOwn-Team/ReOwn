import { Module } from "@nestjs/common";
import {
    RedisService,
    createRedisConnection,
    REDIS_CONNECTION,
} from "./redis.service";

@Module({
    providers: [
        { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
        RedisService,
    ],
    exports: [RedisService],
})
export class RedisModule {}

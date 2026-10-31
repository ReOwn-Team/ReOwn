import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureHttp } from "./config/http.config";
import { setupOpenApi } from "./openapi/document";

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);

    app.enableShutdownHooks();

    configureHttp(app);

    setupOpenApi(app);

    const port = Number(process.env.PORT ?? 3000);
    await app.listen(port);
}

void bootstrap();

import { inspectionJsonSchemaForImages } from "./inspection-json-schema";
import { Injectable } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    inspectionReportSchema,
    INSPECTION_PROMPT_VERSION,
    InspectionFailure,
    type InspectionSnapshot,
    type ProductInspectionProvider,
} from "./inspection-report";
@Injectable()
export class OpenRouterInspectionProvider implements ProductInspectionProvider {
    private checked?: {
        model: string;
        expires: number;
        structured: boolean;
        jsonSchema: boolean;
    };
    async inspect(
        snapshot: InspectionSnapshot,
        images: Array<{ id: string; bytes: Buffer }>,
        promptVersion = INSPECTION_PROMPT_VERSION,
    ) {
        if (!["v1", "v2"].includes(promptVersion))
            throw new InspectionFailure("AI_INVALID_PROMPT_VERSION");
        const model = process.env.OPENROUTER_VISION_MODEL?.trim();
        const key = process.env.OPENROUTER_API_KEY?.trim();
        if (!model?.endsWith(":free") || !key)
            throw new InspectionFailure("AI_NOT_CONFIGURED");
        const dataCollection =
            process.env.OPENROUTER_DATA_COLLECTION?.trim() || "deny";
        if (!["allow", "deny"].includes(dataCollection))
            throw new InspectionFailure("AI_INVALID_DATA_POLICY");
        const timeoutMs = Number(
            process.env.OPENROUTER_REQUEST_TIMEOUT_MS ?? "90000",
        );
        if (
            !Number.isInteger(timeoutMs) ||
            timeoutMs < 1000 ||
            timeoutMs > 120000
        )
            throw new InspectionFailure("AI_INVALID_TIMEOUT");
        let stage = "catalog";
        let base = "https://openrouter.ai/api/v1";
        if (
            process.env.NODE_ENV === "test" &&
            process.env.OPENROUTER_TEST_ENDPOINT
        ) {
            const url = new URL(process.env.OPENROUTER_TEST_ENDPOINT);
            if (
                url.protocol !== "http:" ||
                !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
            )
                throw new InspectionFailure("AI_INVALID_ENDPOINT");
            base = url.href.replace(/\/$/, "");
        }
        try {
            if (
                !this.checked ||
                this.checked.model !== model ||
                this.checked.expires < Date.now()
            ) {
                const result = await fetch(`${base}/models`, {
                    signal: AbortSignal.timeout(10000),
                    redirect: "error",
                });
                if (!result.ok)
                    throw new InspectionFailure("AI_CATALOG_UNAVAILABLE", true);
                const catalog = (await result.json()) as {
                    data?: Array<{
                        id: string;
                        architecture?: { input_modalities?: string[] };
                        pricing?: Record<string, string>;
                        supported_parameters?: string[];
                    }>;
                };
                const candidate = catalog.data?.find(
                    (item) => item.id === model,
                );
                if (
                    !candidate?.architecture?.input_modalities?.includes(
                        "image",
                    ) ||
                    !candidate.pricing ||
                    Object.values(candidate.pricing).some(
                        (price) =>
                            !Number.isFinite(Number(price)) ||
                            Number(price) !== 0,
                    )
                )
                    throw new InspectionFailure("AI_MODEL_NOT_FREE_VISION");
                this.checked = {
                    model,
                    expires: Date.now() + 300000,
                    jsonSchema:
                        !!candidate.supported_parameters?.includes(
                            "structured_outputs",
                        ),
                    structured:
                        !!candidate.supported_parameters?.includes(
                            "response_format",
                        ),
                };
            }
            const content: unknown[] = [
                {
                    type: "text",
                    text: JSON.stringify({
                        title: snapshot.title,
                        category: snapshot.category,
                        description: snapshot.description,
                        condition: snapshot.condition,
                        knownDefects: snapshot.knownDefects,
                    }),
                },
            ];
            for (const image of images)
                content.push(
                    { type: "text", text: `imageId=${image.id}` },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/webp;base64,${image.bytes.toString("base64")}`,
                        },
                    },
                );
            stage = "template";
            const prompt = readFileSync(
                join(__dirname, `templates/${promptVersion}.txt`),
                "utf8",
            );
            stage = "completion";
            const response = await fetch(`${base}/chat/completions`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${key}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model,
                    stream: false,
                    temperature: 0,
                    max_tokens: 4000,
                    provider: {
                        data_collection: dataCollection,
                        allow_fallbacks: false,
                        ...(this.checked.jsonSchema
                            ? { require_parameters: true }
                            : {}),
                    },
                    ...(this.checked.jsonSchema
                        ? {
                              response_format: {
                                  type: "json_schema",
                                  json_schema: {
                                      name: "product_observations",
                                      strict: true,
                                      schema: inspectionJsonSchemaForImages(
                                          images.map((image) => image.id),
                                      ),
                                  },
                              },
                          }
                        : this.checked.structured
                          ? { response_format: { type: "json_object" } }
                          : {}),
                    messages: [
                        {
                            role: "system",
                            content: `${prompt}\nDanh sách imageIds hợp lệ (sao chép nguyên văn, không tự tạo hoặc đổi ký tự): ${JSON.stringify(images.map((image) => image.id))}. Mọi imageIds trong báo cáo phải thuộc danh sách này. Không dùng chữ "uuid" trong ví dụ làm ID ảnh.`,
                        },
                        { role: "user", content },
                    ],
                }),
                signal: AbortSignal.timeout(timeoutMs),
                redirect: "error",
            });
            const data = (await response.json().catch((error: unknown) => {
                if (
                    error instanceof SyntaxError ||
                    (error as { name?: string } | null)?.name === "SyntaxError"
                )
                    return null;
                throw error;
            })) as {
                error?: { code?: unknown; message?: unknown };
                model?: string;
                choices?: Array<{
                    finish_reason?: string;
                    message?: { content?: string };
                }>;
            } | null;
            // Some providers return an error envelope after HTTP 200 headers.
            // Classify it without persisting raw provider text or request data.
            if (!response.ok || data?.error) {
                const embeddedStatus = data?.error?.code;
                const status = !response.ok
                    ? response.status
                    : typeof embeddedStatus === "number" &&
                        Number.isInteger(embeddedStatus) &&
                        embeddedStatus >= 400 &&
                        embeddedStatus <= 599
                      ? embeddedStatus
                      : 502;
                const message =
                    typeof data?.error?.message === "string"
                        ? data.error.message
                        : "";
                const code =
                    status === 404 && /data policy/i.test(message)
                        ? "AI_DATA_POLICY_BLOCKED"
                        : ((
                              {
                                  400: "AI_INVALID_REQUEST",
                                  401: "AI_AUTH_FAILED",
                                  402: "AI_CREDITS_REQUIRED",
                                  403: "AI_ACCESS_DENIED",
                                  404: "AI_NO_ENDPOINTS",
                                  408: "AI_PROVIDER_TIMEOUT",
                                  422: "AI_INVALID_REQUEST",
                                  429: "AI_RATE_LIMITED",
                              } as Record<number, string>
                          )[status] ?? "AI_PROVIDER_ERROR");
                const retryHeader = response.headers.get("retry-after");
                const seconds =
                    retryHeader && !/^\d+$/.test(retryHeader)
                        ? Math.ceil(
                              (Date.parse(retryHeader) - Date.now()) / 1000,
                          )
                        : Number(retryHeader);
                throw new InspectionFailure(
                    code,
                    status === 408 || status === 429 || status >= 500,
                    Number.isFinite(seconds) && seconds > 0
                        ? Math.min(seconds, 86400)
                        : undefined,
                    status,
                );
            }
            const text = data?.choices?.[0]?.message?.content;
            if (
                !text ||
                data?.choices?.[0]?.finish_reason === "length" ||
                data?.model?.replace(/:free$/, "") !==
                    model.replace(/:free$/, "")
            )
                throw new InspectionFailure("AI_INVALID_RESPONSE", true);
            let report;
            try {
                report = inspectionReportSchema.parse(JSON.parse(text));
            } catch {
                throw new InspectionFailure("AI_INVALID_REPORT", true);
            }
            const ids = new Set(images.map((image) => image.id));
            for (const item of [
                ...report.productObservations,
                ...report.visibleDefects,
                ...report.imageQuality,
                ...report.inconsistencies,
            ])
                if (item.imageIds.some((id) => !ids.has(id)))
                    throw new InspectionFailure("AI_UNKNOWN_IMAGE", true);
            return { report, model };
        } catch (error) {
            if (error instanceof InspectionFailure) throw error;
            if (stage === "template")
                throw new InspectionFailure(
                    "AI_TEMPLATE_UNAVAILABLE",
                    false,
                    undefined,
                    undefined,
                    stage,
                );
            if (
                error instanceof SyntaxError ||
                (error as { name?: string } | null)?.name === "SyntaxError"
            )
                throw new InspectionFailure(
                    "AI_INVALID_RESPONSE",
                    true,
                    undefined,
                    undefined,
                    stage,
                );
            const issue = error as {
                name?: string;
                code?: string;
                cause?: { code?: string };
            } | null;
            const code = issue?.cause?.code ?? issue?.code;
            const failureCode =
                issue?.name === "TimeoutError" || issue?.name === "AbortError"
                    ? "AI_REQUEST_TIMEOUT"
                    : code === "EAI_AGAIN" || code === "ENOTFOUND"
                      ? "AI_DNS_ERROR"
                      : code === "UND_ERR_CONNECT_TIMEOUT" ||
                          code === "ETIMEDOUT"
                        ? "AI_CONNECT_TIMEOUT"
                        : ["ECONNRESET", "EPIPE", "UND_ERR_SOCKET"].includes(
                                code ?? "",
                            )
                          ? "AI_CONNECTION_RESET"
                          : ["ENETUNREACH", "EHOSTUNREACH"].includes(code ?? "")
                            ? "AI_NETWORK_UNREACHABLE"
                            : "AI_TRANSPORT_ERROR";
            throw new InspectionFailure(
                failureCode,
                true,
                undefined,
                undefined,
                stage,
            );
        }
    }
}

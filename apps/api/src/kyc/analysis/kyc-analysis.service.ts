import {
    Injectable,
    Logger,
    ServiceUnavailableException,
} from "@nestjs/common";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import type { AnalysisInput, AnalysisResult } from "./kyc-analyzer";
import { faceModelsAvailable } from "./face-engine";
import { ocrModelsAvailable } from "./card-reader";

export const KYC_ANALYZER = Symbol("KYC_ANALYZER");
export interface KycAnalyzer {
    ready(): boolean;
    analyse(input: AnalysisInput): Promise<AnalysisResult>;
}

/** Spawns the CPU/RAM-heavy analysis in a bounded, one-at-a-time worker. */
@Injectable()
export class KycAnalysisService implements KycAnalyzer {
    private readonly logger = new Logger(KycAnalysisService.name);
    private active = 0;
    private waiters: Array<() => void> = [];
    private readonly concurrency = Math.max(
        1,
        Number(process.env.KYC_ANALYSIS_CONCURRENCY) || 1,
    );
    private readonly maxQueue = 4;

    ready() {
        return faceModelsAvailable() && ocrModelsAvailable();
    }

    private async acquire() {
        if (this.active < this.concurrency) {
            this.active++;
            return;
        }
        if (this.waiters.length >= this.maxQueue)
            throw new ServiceUnavailableException(
                "KYC is busy; please retry shortly",
            );
        await new Promise<void>((resolve) => this.waiters.push(resolve));
    }

    private release() {
        const next = this.waiters.shift();
        if (next) next();
        else this.active--;
    }

    async analyse(input: AnalysisInput): Promise<AnalysisResult> {
        if (!this.ready())
            throw new ServiceUnavailableException(
                "KYC models are not installed on this server",
            );
        await this.acquire();
        try {
            return await this.run(input);
        } finally {
            this.release();
        }
    }

    private run(input: AnalysisInput) {
        return new Promise<AnalysisResult>((resolve, reject) => {
            const worker = new Worker(join(__dirname, "analysis.worker.js"), {
                workerData: {
                    front: new Uint8Array(input.front),
                    selfie: new Uint8Array(input.selfie),
                },
                resourceLimits: { maxOldGenerationSizeMb: 1024 },
            });
            let settled = false;
            const finish = (error: Error | null, result?: AnalysisResult) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                void worker.terminate();
                if (error) {
                    this.logger.warn(`KYC analysis failed: ${error.message}`);
                    reject(
                        new ServiceUnavailableException(
                            "KYC analysis is temporarily unavailable",
                        ),
                    );
                } else resolve(result!);
            };
            const timer = setTimeout(
                () => finish(new Error("timeout")),
                90_000,
            );
            worker.once(
                "message",
                (message: { result?: AnalysisResult; failed?: boolean }) =>
                    message.result
                        ? finish(null, message.result)
                        : finish(new Error("worker failure")),
            );
            // Only the error class is logged, never its message.
            worker.once("error", (error) => finish(new Error(error.name)));
            worker.once("exit", () => finish(new Error("worker exited")));
        });
    }
}

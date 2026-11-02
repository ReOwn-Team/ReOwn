import { parentPort, workerData } from "node:worker_threads";
import { analyseSubmission } from "./kyc-analyzer";

/**
 * Runs one analysis in an isolated, short-lived thread so model memory and
 * image bytes are released as soon as the request finishes.
 */
void (async () => {
    try {
        const input = workerData as { front: Uint8Array; selfie: Uint8Array };
        parentPort!.postMessage({
            result: await analyseSubmission({
                front: Buffer.from(input.front),
                selfie: Buffer.from(input.selfie),
            }),
        });
    } catch {
        // Never forward error text: it could embed image-derived content.
        parentPort!.postMessage({ failed: true });
    }
})();

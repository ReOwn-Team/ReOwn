import { describe, expect, it, jest } from "@jest/globals";
import sharp from "sharp";
import { analyseSubmission } from "../../../src/kyc/analysis/kyc-analyzer";
import type { FaceEngine } from "../../../src/kyc/analysis/face-engine";

describe("automatic screening", () => {
    it("requests separate photos when both image files are identical", async () => {
        const image = await sharp({
            create: { width: 64, height: 64, channels: 3, background: "white" },
        })
            .png()
            .toBuffer();
        const detect = jest.fn();
        const close = jest
            .fn<() => Promise<void>>()
            .mockResolvedValue(undefined);
        const result = await analyseSubmission(
            { front: image, selfie: Buffer.from(image) },
            undefined,
            { detect, close } as unknown as FaceEngine,
        );
        expect(result).toEqual({ ok: false, issues: ["DUPLICATE_PHOTOS"] });
        expect(detect).not.toHaveBeenCalled();
        expect(close).toHaveBeenCalled();
    });

    it("does not report matching invalid files as a valid image pair", async () => {
        const bytes = Buffer.from("not an image");
        const engine = {
            close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        };
        const result = await analyseSubmission(
            { front: bytes, selfie: bytes },
            undefined,
            engine as unknown as FaceEngine,
        );
        expect(result).toEqual({
            ok: false,
            issues: ["FRONT_UNREADABLE", "SELFIE_UNREADABLE"],
        });
    });
});

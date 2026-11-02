import { describe, expect, it } from "@jest/globals";
import { resolve } from "node:path";
import {
    cosine,
    modelDirectory,
    similarity,
} from "../../../src/kyc/analysis/face-engine";
import { pose } from "../../../src/kyc/analysis/kyc-analyzer";

describe("model directory", () => {
    it("defaults to the API models directory and respects an override", () => {
        const previous = process.env.KYC_MODEL_DIR;
        try {
            delete process.env.KYC_MODEL_DIR;
            expect(modelDirectory()).toBe(
                resolve(__dirname, "../../../models/kyc"),
            );
            process.env.KYC_MODEL_DIR = resolve(__dirname, "custom-models");
            expect(modelDirectory()).toBe(resolve(__dirname, "custom-models"));
        } finally {
            if (previous === undefined) delete process.env.KYC_MODEL_DIR;
            else process.env.KYC_MODEL_DIR = previous;
        }
    });
});

describe("face geometry", () => {
    const template = [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ] as const;

    it("recovers an exact similarity transform", () => {
        const scale = 2.5;
        const angle = (20 * Math.PI) / 180;
        const moved = template.map(
            ([x, y]) =>
                [
                    scale * (Math.cos(angle) * x - Math.sin(angle) * y) + 40,
                    scale * (Math.sin(angle) * x + Math.cos(angle) * y) - 15,
                ] as const,
        );
        const { a, b, tx, ty } = similarity(moved, template);
        // Mapping the moved points back must land on the template.
        moved.forEach(([x, y], index) => {
            expect(a * x - b * y + tx).toBeCloseTo(template[index][0], 3);
            expect(b * x + a * y + ty).toBeCloseTo(template[index][1], 3);
        });
    });

    it("rejects degenerate landmarks", () => {
        expect(() =>
            similarity(
                [
                    [1, 1],
                    [1, 1],
                    [1, 1],
                    [1, 1],
                    [1, 1],
                ],
                template,
            ),
        ).toThrow();
    });

    it("computes cosine similarity", () => {
        expect(
            cosine(Float32Array.of(1, 0), Float32Array.of(1, 0)),
        ).toBeCloseTo(1);
        expect(
            cosine(Float32Array.of(1, 0), Float32Array.of(0, 1)),
        ).toBeCloseTo(0);
        expect(cosine(Float32Array.of(0, 0), Float32Array.of(0, 1))).toBe(0);
    });

    it("measures roll and yaw from landmarks", () => {
        const frontal = {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            score: 1,
            landmarks: [
                [30, 40],
                [70, 40],
                [50, 60],
                [35, 80],
                [65, 80],
            ],
        } as const;
        expect(pose(frontal as never)).toEqual({ rollDegrees: 0, yaw: 0 });
        const turned = {
            ...frontal,
            landmarks: [
                [30, 40],
                [70, 40],
                [66, 60],
                [35, 80],
                [65, 80],
            ],
        };
        expect(pose(turned as never).yaw).toBeGreaterThan(0.3);
        const tilted = {
            ...frontal,
            landmarks: [
                [30, 30],
                [70, 50],
                [50, 60],
                [35, 80],
                [65, 80],
            ],
        };
        expect(pose(tilted as never).rollDegrees).toBeGreaterThan(20);
    });
});

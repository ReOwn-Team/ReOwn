import { existsSync } from "node:fs";
import { resolve } from "node:path";
import sharp, { type Sharp } from "sharp";
import type { Face, RgbImage } from "./face-engine";
import { modelDirectory } from "./face-engine";
import {
    mergeParsedCards,
    parseCardText,
    type MergedCard,
    type ParsedCard,
} from "./card-parser";

export function ocrModelsAvailable() {
    return existsSync(resolve(modelDirectory(), "vie.traineddata"));
}

function raw(image: RgbImage) {
    return sharp(image.data, {
        raw: { width: image.width, height: image.height, channels: 3 },
    });
}

/** Look for a Code 128 barcode in the strip below the card photo. */
export async function readBarcode(image: RgbImage, face: Face) {
    const { readBarcodes } = await import("zxing-wasm/reader");
    const left = Math.max(0, Math.round(face.x - 1.5 * face.width));
    const top = Math.max(0, Math.round(face.y + 1.3 * face.height));
    const width = Math.min(image.width - left, Math.round(8.5 * face.width));
    const height = Math.min(image.height - top, Math.round(2 * face.height));
    if (width < 40 || height < 20) return null;
    for (const target of [1600, 2400]) {
        const { data, info } = await raw(image)
            .extract({ left, top, width, height })
            .resize({ width: target })
            .greyscale()
            .normalise()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const results = await readBarcodes(
            {
                data: new Uint8ClampedArray(data),
                width: info.width,
                height: info.height,
            },
            {
                tryHarder: true,
                tryRotate: true,
                formats: ["Code128"],
                maxNumberOfSymbols: 3,
            },
        );
        const hit = results.find(
            (result) => result.isValid && /^\d{10}$/.test(result.text),
        );
        if (hit) return hit.text;
    }
    return null;
}

export type CardReading = {
    card: MergedCard;
    barcode: string | null;
};

/** OCR the card several ways and vote; nothing leaves this process. */
export async function readCard(
    image: RgbImage,
    face: Face,
): Promise<CardReading> {
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker("vie", 1, {
        langPath: modelDirectory(),
        gzip: false,
        cacheMethod: "none",
    });
    try {
        const parsed: ParsedCard[] = [];
        const pass = async (
            pipeline: Sharp,
            mode: (typeof PSM)[keyof typeof PSM],
            digitsOnly = false,
        ) => {
            await worker.setParameters({
                tessedit_pageseg_mode: mode,
                tessedit_char_whitelist: digitsOnly ? "0123456789" : "",
                user_defined_dpi: "300",
            });
            const png = await pipeline.png().toBuffer();
            const { data } = await worker.recognize(png);
            parsed.push(parseCardText(data.text));
        };
        // Digit accuracy is very sensitive to scale, so the card is read at
        // several sizes relative to the printed photo and the readings voted.
        const scaled = (faceTarget: number) =>
            raw(image)
                .resize({
                    width: Math.min(
                        3000,
                        Math.max(
                            800,
                            Math.round(
                                (image.width * faceTarget) / face.width,
                            ),
                        ),
                    ),
                })
                .greyscale();
        await pass(scaled(110).normalise(), PSM.SPARSE_TEXT);
        await pass(scaled(150).normalise().sharpen(), PSM.AUTO);
        await pass(scaled(150).normalise(), PSM.SPARSE_TEXT);
        await pass(scaled(200).normalise(), PSM.SPARSE_TEXT);
        // Student number printed under the photo on the blue layout.
        const left = Math.max(0, Math.round(face.x - 1.2 * face.width));
        const top = Math.max(0, Math.round(face.y + 1.5 * face.height));
        const width = Math.min(
            image.width - left,
            Math.round(3.8 * face.width),
        );
        const height = Math.min(
            image.height - top,
            Math.round(1.4 * face.height),
        );
        if (width > 40 && height > 20)
            await pass(
                raw(image)
                    .extract({ left, top, width, height })
                    .resize({ height: 140 })
                    .greyscale()
                    .normalise(),
                PSM.SPARSE_TEXT,
                true,
            );
        return {
            card: mergeParsedCards(parsed),
            barcode: await readBarcode(image, face).catch(() => null),
        };
    } finally {
        await worker.terminate();
    }
}

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import type { InferenceSession as Session } from "onnxruntime-node";

/**
 * Local face detection (YuNet, MIT) and recognition (SFace, Apache-2.0) via
 * ONNX Runtime. Image bytes never leave this process.
 */
export type Landmark = readonly [number, number];
export type Face = {
    x: number;
    y: number;
    width: number;
    height: number;
    score: number;
    /** Right eye, left eye, nose tip, right mouth, left mouth (image space). */
    landmarks: Landmark[];
};
export type RgbImage = { data: Buffer; width: number; height: number };

// 112x112 template used by the SFace reference implementation.
const TEMPLATE: Landmark[] = [
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
];
const STRIDES = [8, 16, 32] as const;

export function modelDirectory() {
    return resolve(
        process.env.KYC_MODEL_DIR ?? resolve(__dirname, "../../models/kyc"),
    );
}
export function faceModelsAvailable() {
    return ["yunet.onnx", "sface.onnx"].every((name) =>
        existsSync(resolve(modelDirectory(), name)),
    );
}

export async function decodeRgb(
    bytes: Buffer,
    maxSide?: number,
): Promise<RgbImage> {
    let pipeline = sharp(bytes, { limitInputPixels: 40_000_000 })
        .rotate()
        .removeAlpha();
    if (maxSide)
        pipeline = pipeline.resize({
            width: maxSide,
            height: maxSide,
            fit: "inside",
            withoutEnlargement: true,
        });
    const { data, info } = await pipeline
        .toColourspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
}

function iou(a: Face, b: Face) {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = a.width * a.height + b.width * b.height - inter;
    return union > 0 ? inter / union : 0;
}
function nms(faces: Face[], threshold: number) {
    const sorted = [...faces].sort((a, b) => b.score - a.score);
    const kept: Face[] = [];
    for (const face of sorted)
        if (kept.every((other) => iou(face, other) < threshold))
            kept.push(face);
    return kept;
}

/** Least-squares similarity transform (scale, rotation, translation). */
export function similarity(src: readonly Landmark[], dst: readonly Landmark[]) {
    const n = src.length;
    const mean = (points: readonly Landmark[], axis: 0 | 1) =>
        points.reduce((sum, point) => sum + point[axis], 0) / n;
    const msx = mean(src, 0);
    const msy = mean(src, 1);
    const mdx = mean(dst, 0);
    const mdy = mean(dst, 1);
    let den = 0;
    let a = 0;
    let b = 0;
    for (let i = 0; i < n; i++) {
        const xs = src[i][0] - msx;
        const ys = src[i][1] - msy;
        const xd = dst[i][0] - mdx;
        const yd = dst[i][1] - mdy;
        den += xs * xs + ys * ys;
        a += xs * xd + ys * yd;
        b += xs * yd - ys * xd;
    }
    if (den < 1e-9) throw new Error("Degenerate landmarks");
    a /= den;
    b /= den;
    return {
        a,
        b,
        tx: mdx - (a * msx - b * msy),
        ty: mdy - (b * msx + a * msy),
    };
}

/** Warp the face to the 112x112 recognition template, returned as CHW RGB. */
export function alignFace(image: RgbImage, face: Face): Float32Array {
    const { a, b, tx, ty } = similarity(face.landmarks, TEMPLATE);
    const norm = a * a + b * b;
    const size = 112;
    const out = new Float32Array(3 * size * size);
    const { data, width, height } = image;
    const sample = (x: number, y: number, channel: number) => {
        const cx = Math.min(width - 1, Math.max(0, x));
        const cy = Math.min(height - 1, Math.max(0, y));
        const x0 = Math.floor(cx);
        const y0 = Math.floor(cy);
        const x1 = Math.min(width - 1, x0 + 1);
        const y1 = Math.min(height - 1, y0 + 1);
        const fx = cx - x0;
        const fy = cy - y0;
        const at = (px: number, py: number) =>
            data[(py * width + px) * 3 + channel];
        return (
            at(x0, y0) * (1 - fx) * (1 - fy) +
            at(x1, y0) * fx * (1 - fy) +
            at(x0, y1) * (1 - fx) * fy +
            at(x1, y1) * fx * fy
        );
    };
    for (let v = 0; v < size; v++)
        for (let u = 0; u < size; u++) {
            const du = u - tx;
            const dv = v - ty;
            const sx = (a * du + b * dv) / norm;
            const sy = (a * dv - b * du) / norm;
            for (let channel = 0; channel < 3; channel++)
                out[channel * size * size + v * size + u] = sample(
                    sx,
                    sy,
                    channel,
                );
        }
    return out;
}

export function cosine(a: Float32Array, b: Float32Array) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Variance of the Laplacian over a 128px grayscale crop: low means blurry. */
export async function sharpness(image: RgbImage, face?: Face) {
    let pipeline = sharp(image.data, {
        raw: { width: image.width, height: image.height, channels: 3 },
    });
    if (face) {
        const pad = 0.15;
        const left = Math.max(0, Math.floor(face.x - face.width * pad));
        const top = Math.max(0, Math.floor(face.y - face.height * pad));
        pipeline = pipeline.extract({
            left,
            top,
            width: Math.max(
                1,
                Math.min(
                    image.width - left,
                    Math.ceil(face.width * (1 + 2 * pad)),
                ),
            ),
            height: Math.max(
                1,
                Math.min(
                    image.height - top,
                    Math.ceil(face.height * (1 + 2 * pad)),
                ),
            ),
        });
    }
    const { data } = await pipeline
        .resize(128, 128, { fit: "fill" })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
    let sum = 0;
    let squares = 0;
    let count = 0;
    for (let y = 1; y < 127; y++)
        for (let x = 1; x < 127; x++) {
            const i = y * 128 + x;
            const value =
                4 * data[i] -
                data[i - 1] -
                data[i + 1] -
                data[i - 128] -
                data[i + 128];
            sum += value;
            squares += value * value;
            count++;
        }
    const mean = sum / count;
    return squares / count - mean * mean;
}

export class FaceEngine {
    private detector?: Promise<Session>;
    private recogniser?: Promise<Session>;
    private async ort() {
        return import("onnxruntime-node");
    }
    private async load(file: string) {
        const ort = await this.ort();
        return ort.InferenceSession.create(resolve(modelDirectory(), file), {
            logSeverityLevel: 4,
            intraOpNumThreads: 2,
            interOpNumThreads: 1,
            graphOptimizationLevel: "all",
        });
    }
    private yunet() {
        return (this.detector ??= this.load("yunet.onnx"));
    }
    private sface() {
        return (this.recogniser ??= this.load("sface.onnx"));
    }

    /**
     * YuNet is exported with a fixed 640x640 input, so larger photos are
     * searched as an image pyramid of overlapping 640px tiles. The first
     * working size that finds a face wins.
     */
    async detect(image: RgbImage, sizes = [640, 1280, 1920]): Promise<Face[]> {
        const longest = Math.max(image.width, image.height);
        for (const size of sizes) {
            const scale = Math.min(1, size / longest);
            const faces = await this.detectScaled(image, scale);
            if (faces.length) return faces;
            if (scale === 1) break;
        }
        return [];
    }

    private async detectScaled(image: RgbImage, scale: number) {
        const sw = Math.max(1, Math.round(image.width * scale));
        const sh = Math.max(1, Math.round(image.height * scale));
        const scaled =
            scale === 1
                ? image.data
                : await sharp(image.data, {
                      raw: {
                          width: image.width,
                          height: image.height,
                          channels: 3,
                      },
                  })
                      .resize(sw, sh, { fit: "fill" })
                      .raw()
                      .toBuffer();
        const step = 480;
        const starts = (length: number) => {
            const values = [0];
            for (let at = step; at + 160 < length; at += step) values.push(at);
            return values;
        };
        const faces: Face[] = [];
        for (const top of starts(sh))
            for (const left of starts(sw))
                for (const face of await this.detectTile(
                    scaled,
                    sw,
                    sh,
                    left,
                    top,
                ))
                    faces.push({
                        x: (face.x + left) / scale,
                        y: (face.y + top) / scale,
                        width: face.width / scale,
                        height: face.height / scale,
                        score: face.score,
                        landmarks: face.landmarks.map(
                            ([x, y]): Landmark => [
                                (x + left) / scale,
                                (y + top) / scale,
                            ],
                        ),
                    });
        return nms(faces, 0.3);
    }

    private async detectTile(
        pixels: Buffer,
        width: number,
        height: number,
        left: number,
        top: number,
    ): Promise<Face[]> {
        const ort = await this.ort();
        const session = await this.yunet();
        const size = 640;
        const plane = size * size;
        const input = new Float32Array(3 * plane);
        const rows = Math.min(size, height - top);
        const cols = Math.min(size, width - left);
        for (let y = 0; y < rows; y++)
            for (let x = 0; x < cols; x++) {
                const from = ((top + y) * width + left + x) * 3;
                const to = y * size + x;
                input[to] = pixels[from + 2];
                input[plane + to] = pixels[from + 1];
                input[2 * plane + to] = pixels[from];
            }
        const result = await session.run({
            [session.inputNames[0]]: new ort.Tensor("float32", input, [
                1,
                3,
                size,
                size,
            ]),
        });
        const faces: Face[] = [];
        for (const stride of STRIDES) {
            const cls = result[`cls_${stride}`].data as Float32Array;
            const obj = result[`obj_${stride}`].data as Float32Array;
            const bbox = result[`bbox_${stride}`].data as Float32Array;
            const kps = result[`kps_${stride}`].data as Float32Array;
            const grid = size / stride;
            for (let r = 0; r < grid; r++)
                for (let c = 0; c < grid; c++) {
                    const index = r * grid + c;
                    const score = Math.sqrt(
                        Math.min(1, Math.max(0, cls[index])) *
                            Math.min(1, Math.max(0, obj[index])),
                    );
                    if (score < 0.6) continue;
                    const cx = (c + bbox[index * 4]) * stride;
                    const cy = (r + bbox[index * 4 + 1]) * stride;
                    const w = Math.exp(bbox[index * 4 + 2]) * stride;
                    const h = Math.exp(bbox[index * 4 + 3]) * stride;
                    faces.push({
                        x: cx - w / 2,
                        y: cy - h / 2,
                        width: w,
                        height: h,
                        score,
                        landmarks: Array.from(
                            { length: 5 },
                            (_, n): Landmark => [
                                (kps[index * 10 + n * 2] + c) * stride,
                                (kps[index * 10 + n * 2 + 1] + r) * stride,
                            ],
                        ),
                    });
                }
        }
        return nms(faces, 0.3);
    }

    /** L2-normalised 128-d SFace embedding. */
    async embed(image: RgbImage, face: Face): Promise<Float32Array> {
        const ort = await this.ort();
        const session = await this.sface();
        const result = await session.run({
            [session.inputNames[0]]: new ort.Tensor(
                "float32",
                alignFace(image, face),
                [1, 3, 112, 112],
            ),
        });
        const raw = Float32Array.from(
            result[session.outputNames[0]].data as Float32Array,
        );
        let norm = 0;
        for (const value of raw) norm += value * value;
        norm = Math.sqrt(norm) || 1;
        return raw.map((value) => value / norm);
    }

    async close() {
        const sessions = await Promise.all([this.detector, this.recogniser]);
        this.detector = undefined;
        this.recogniser = undefined;
        await Promise.all(sessions.map((session) => session?.release()));
    }
}

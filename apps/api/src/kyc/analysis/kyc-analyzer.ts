import sharp from "sharp";
import {
    FaceEngine,
    cosine,
    decodeRgb,
    sharpness,
    type Face,
    type RgbImage,
} from "./face-engine";
import { readCard } from "./card-reader";

/** Reasons the user must retake a photo. Nothing is stored when any occur. */
export type KycIssue =
    | "FRONT_UNREADABLE"
    | "FRONT_NO_FACE"
    | "FRONT_FACE_TOO_SMALL"
    | "FRONT_BLURRY"
    | "FRONT_NOT_SUPPORTED"
    | "FRONT_ID_UNREADABLE"
    | "SELFIE_UNREADABLE"
    | "SELFIE_NO_FACE"
    | "SELFIE_MULTIPLE_FACES"
    | "SELFIE_FACE_TOO_SMALL"
    | "SELFIE_BLURRY"
    | "SELFIE_NOT_FRONTAL"
    | "SELFIE_BAD_LIGHT"
    | "FACE_MISMATCH"
    | "DUPLICATE_PHOTOS";

export type AnalysisInput = { front: Buffer; selfie: Buffer };

export type AnalysisSuccess = {
    ok: true;
    card: {
        layout: "blue" | "white" | null;
        fullName: string | null;
        dateOfBirth: string | null;
        major: string | null;
        cohort: { start: number; end: number } | null;
        studentId: string;
        /** How much we trust the student id reading. */
        studentIdSource: "barcode" | "ocr_agreed" | "ocr_single";
        /** The OCR reading when it disagreed with the barcode. */
        studentIdOcrConflict: boolean;
    };
    faceScore: number;
    faceBand: "match" | "low";
    images: { front: Buffer; selfie: Buffer };
};
export type AnalysisFailure = { ok: false; issues: KycIssue[] };
export type AnalysisResult = AnalysisSuccess | AnalysisFailure;

export type Thresholds = {
    /** Cosine similarity at or above which the faces are considered a match. */
    faceMatch: number;
    /** Below this the attempt is refused and the user asked to retake. */
    faceReject: number;
    /** Variance-of-Laplacian floors measured on the face crop. */
    cardSharpness: number;
    selfieSharpness: number;
};

export function thresholdsFromEnv(env = process.env): Thresholds {
    const read = (value: string | undefined, fallback: number, max = 1) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > -1 && parsed < max
            ? parsed
            : fallback;
    };
    const faceMatch = read(env.KYC_FACE_MATCH, 0.363);
    return {
        faceMatch,
        faceReject: Math.min(read(env.KYC_FACE_REJECT, 0.25), faceMatch),
        cardSharpness: read(env.KYC_MIN_CARD_SHARPNESS, 20, 10000),
        selfieSharpness: read(env.KYC_MIN_SELFIE_SHARPNESS, 12, 10000),
    };
}

/** Re-encode to a bounded, metadata-free WebP so EXIF/GPS never gets stored. */
async function normalise(bytes: Buffer): Promise<Buffer> {
    return sharp(bytes, { limitInputPixels: 40_000_000, animated: false })
        .rotate()
        .resize({
            width: 1800,
            height: 1800,
            fit: "inside",
            withoutEnlargement: true,
        })
        .webp({ quality: 88 })
        .toBuffer();
}

async function supported(bytes: Buffer) {
    try {
        const meta = await sharp(bytes, {
            limitInputPixels: 40_000_000,
            animated: false,
        }).metadata();
        return (
            ["jpeg", "png", "webp"].includes(meta.format ?? "") &&
            (meta.pages ?? 1) === 1
        );
    } catch {
        return false;
    }
}

function faceSize(face: Face, image: RgbImage) {
    return face.width / Math.min(image.width, image.height);
}

async function meanLuma(image: RgbImage, face: Face) {
    const left = Math.max(0, Math.floor(face.x));
    const top = Math.max(0, Math.floor(face.y));
    const { data } = await sharp(image.data, {
        raw: { width: image.width, height: image.height, channels: 3 },
    })
        .extract({
            left,
            top,
            width: Math.max(
                1,
                Math.min(image.width - left, Math.ceil(face.width)),
            ),
            height: Math.max(
                1,
                Math.min(image.height - top, Math.ceil(face.height)),
            ),
        })
        .resize(32, 32, { fit: "fill" })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return data.reduce((sum, value) => sum + value, 0) / data.length;
}

/** Roll and a yaw proxy from the five YuNet landmarks. */
export function pose(face: Face) {
    const [rightEye, leftEye, nose] = face.landmarks;
    const dx = leftEye[0] - rightEye[0];
    const dy = leftEye[1] - rightEye[1];
    const eyeDistance = Math.hypot(dx, dy) || 1;
    const midX = (leftEye[0] + rightEye[0]) / 2;
    return {
        rollDegrees: Math.abs((Math.atan2(dy, dx) * 180) / Math.PI),
        yaw: Math.abs(nose[0] - midX) / eyeDistance,
    };
}

function pickCardFace(faces: Face[]) {
    return [...faces].sort(
        (a, b) => b.score * b.width * b.height - a.score * a.width * a.height,
    )[0];
}

export async function analyseSubmission(
    input: AnalysisInput,
    thresholds: Thresholds = thresholdsFromEnv(),
    engine = new FaceEngine(),
): Promise<AnalysisResult> {
    const issues: KycIssue[] = [];
    try {
        const [frontOk, selfieOk] = await Promise.all([
            supported(input.front),
            supported(input.selfie),
        ]);
        if (!frontOk) issues.push("FRONT_UNREADABLE");
        if (!selfieOk) issues.push("SELFIE_UNREADABLE");
        if (issues.length) return { ok: false, issues };
        // A card-front photo cannot also be the required separate selfie.
        if (input.front.equals(input.selfie))
            return { ok: false, issues: ["DUPLICATE_PHOTOS"] };

        const [front, selfie] = await Promise.all([
            decodeRgb(input.front, 2400),
            decodeRgb(input.selfie, 1600),
        ]);

        // --- selfie ---------------------------------------------------
        const selfieFaces = (await engine.detect(selfie)).sort(
            (a, b) => b.width * b.height - a.width * a.height,
        );
        let selfieFace: Face | undefined;
        if (!selfieFaces.length) issues.push("SELFIE_NO_FACE");
        else {
            selfieFace = selfieFaces[0];
            const others = selfieFaces
                .slice(1)
                .filter(
                    (other) =>
                        other.score >= 0.8 &&
                        other.width * other.height >=
                            0.25 * selfieFace!.width * selfieFace!.height,
                );
            if (others.length) issues.push("SELFIE_MULTIPLE_FACES");
            else if (
                faceSize(selfieFace, selfie) < 0.18 ||
                selfieFace.width < 100
            )
                issues.push("SELFIE_FACE_TOO_SMALL");
            else {
                const { rollDegrees, yaw } = pose(selfieFace);
                if (rollDegrees > 25 || yaw > 0.4)
                    issues.push("SELFIE_NOT_FRONTAL");
                const luma = await meanLuma(selfie, selfieFace);
                if (luma < 45 || luma > 235) issues.push("SELFIE_BAD_LIGHT");
                if (
                    (await sharpness(selfie, selfieFace)) <
                    thresholds.selfieSharpness
                )
                    issues.push("SELFIE_BLURRY");
            }
        }

        // --- card -----------------------------------------------------
        const cardFaces = await engine.detect(front);
        const cardFace = cardFaces.length ? pickCardFace(cardFaces) : undefined;
        if (!cardFace) issues.push("FRONT_NO_FACE");
        else if (cardFace.width < 45) issues.push("FRONT_FACE_TOO_SMALL");
        else if ((await sharpness(front, cardFace)) < thresholds.cardSharpness)
            issues.push("FRONT_BLURRY");

        if (!selfieFace || !cardFace || issues.length)
            return { ok: false, issues };

        const reading = await readCard(front, cardFace);
        if (!reading.card.isHuitCard || !reading.card.layout)
            return { ok: false, issues: ["FRONT_NOT_SUPPORTED"] };

        const ocrId = reading.card.studentId;
        const confirmedOcr = ocrId && ocrId.votes >= 2 ? ocrId.value : null;
        const studentId =
            reading.barcode ?? confirmedOcr ?? ocrId?.value ?? null;
        if (!studentId) return { ok: false, issues: ["FRONT_ID_UNREADABLE"] };

        const [cardEmbedding, selfieEmbedding] = [
            await engine.embed(front, cardFace),
            await engine.embed(selfie, selfieFace),
        ];
        const faceScore = cosine(cardEmbedding, selfieEmbedding);
        if (faceScore < thresholds.faceReject)
            return { ok: false, issues: ["FACE_MISMATCH"] };

        const [frontImage, selfieImage] = await Promise.all([
            normalise(input.front),
            normalise(input.selfie),
        ]);
        return {
            ok: true,
            card: {
                layout: reading.card.layout,
                fullName: reading.card.fullName,
                dateOfBirth: reading.card.dateOfBirth,
                major: reading.card.major,
                cohort: reading.card.cohort,
                studentId,
                studentIdSource: reading.barcode
                    ? "barcode"
                    : confirmedOcr
                      ? "ocr_agreed"
                      : "ocr_single",
                studentIdOcrConflict: Boolean(
                    reading.barcode && ocrId && ocrId.value !== reading.barcode,
                ),
            },
            faceScore: Math.round(faceScore * 1000) / 1000,
            faceBand: faceScore >= thresholds.faceMatch ? "match" : "low",
            images: { front: frontImage, selfie: selfieImage },
        };
    } finally {
        await engine.close().catch(() => {});
    }
}

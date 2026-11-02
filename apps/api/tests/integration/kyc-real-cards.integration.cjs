/*
 * Runs the full local KYC pipeline on real card photos from a directory that
 * contains type1.jpg and type2.jpg. Those images hold personal data and are
 * gitignored, so this is opt-in:
 *
 *   KYC_REAL_CARD_DIR=../../raw-data npm run test:kyc-real
 *
 * Only structure is asserted; no real value is printed.
 * (Not a Jest spec: onnxruntime rejects Jest's cross-realm Float32Array.)
 */
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const sharp = require("sharp");
const {
    FaceEngine,
    decodeRgb,
    faceModelsAvailable,
} = require("../../dist/kyc/analysis/face-engine");
const { ocrModelsAvailable } = require("../../dist/kyc/analysis/card-reader");
const { analyseSubmission } = require("../../dist/kyc/analysis/kyc-analyzer");

const directory =
    process.env.KYC_REAL_CARD_DIR && resolve(process.env.KYC_REAL_CARD_DIR);
const files = ["type1.jpg", "type2.jpg"];
if (
    !directory ||
    !files.every((file) => existsSync(resolve(directory, file)))
) {
    console.log(
        "skip: set KYC_REAL_CARD_DIR to a folder with type1.jpg and type2.jpg",
    );
    process.exit(0);
}
if (!faceModelsAvailable() || !ocrModelsAvailable()) {
    console.error("KYC models missing; run npm run kyc:models");
    process.exit(1);
}
const read = (file) => readFileSync(resolve(directory, file));

// Stand-in for a selfie: the card photo enlarged with some margin.
async function portrait(bytes) {
    const engine = new FaceEngine();
    try {
        const image = await decodeRgb(bytes);
        const [face] = await engine.detect(image);
        const margin = 1.1;
        const left = Math.max(0, Math.round(face.x - face.width * margin));
        const top = Math.max(0, Math.round(face.y - face.height * margin));
        return await sharp(bytes)
            .rotate()
            .extract({
                left,
                top,
                width: Math.min(
                    image.width - left,
                    Math.round(face.width * (1 + 2 * margin)),
                ),
                height: Math.min(
                    image.height - top,
                    Math.round(face.height * (1 + 2 * margin)),
                ),
            })
            .resize({ width: 800 })
            .jpeg()
            .toBuffer();
    } finally {
        await engine.close();
    }
}

(async () => {
    for (const file of files) {
        const front = read(file);
        const result = await analyseSubmission({
            front,
            selfie: await portrait(front),
        });
        assert.equal(
            result.ok,
            true,
            `${file}: ${JSON.stringify(result.issues)}`,
        );
        assert.match(result.card.studentId, /^\d{10}$/);
        assert.match(result.card.layout, /^(blue|white)$/);
        assert.ok(result.card.fullName, "name was read");
        assert.equal(result.faceBand, "match");
        const meta = await sharp(result.images.front).metadata();
        assert.equal(meta.format, "webp");
        assert.equal(meta.exif, undefined, "metadata stripped");
        console.log(
            `ok   ${file}  layout=${result.card.layout} idSource=${result.card.studentIdSource} face=${result.faceScore}`,
        );
    }
    const mismatch = await analyseSubmission({
        front: read("type1.jpg"),
        selfie: await portrait(read("type2.jpg")),
    });
    assert.deepEqual(mismatch, { ok: false, issues: ["FACE_MISMATCH"] });
    console.log("ok   different person is refused");
    const blank = await sharp({
        create: { width: 1200, height: 800, channels: 3, background: "#888" },
    })
        .jpeg()
        .toBuffer();
    const notCard = await analyseSubmission({
        front: blank,
        selfie: await portrait(read("type1.jpg")),
    });
    assert.equal(notCard.ok, false);
    console.log("ok   non-card photo is refused");
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});

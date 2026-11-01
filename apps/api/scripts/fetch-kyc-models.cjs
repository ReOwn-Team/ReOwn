#!/usr/bin/env node
/*
 * Downloads the local KYC models and verifies pinned SHA-256 digests.
 * All inference runs on the API host; no image is ever sent to a third party.
 *
 *   YuNet   face detector      MIT         opencv/opencv_zoo
 *   SFace   face recognition   Apache-2.0  opencv/opencv_zoo
 *   vie     Tesseract (fast)   Apache-2.0  tesseract-ocr/tessdata_fast
 */
const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const directory = resolve(process.env.KYC_MODEL_DIR ?? resolve(__dirname, "../models/kyc"));
const models = [
    {
        file: "yunet.onnx",
        sha256: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
        url: "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    },
    {
        file: "sface.onnx",
        sha256: "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
        url: "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
    },
    {
        file: "vie.traineddata",
        sha256: "79df64caf7bcfb2a27df5042ecb6121e196eada34da774956995747636d5bfa1",
        url: "https://github.com/tesseract-ocr/tessdata_fast/raw/main/vie.traineddata",
    },
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

(async () => {
    mkdirSync(directory, { recursive: true });
    let failed = false;
    for (const model of models) {
        const target = resolve(directory, model.file);
        if (existsSync(target) && digest(readFileSync(target)) === model.sha256) {
            console.log(`ok       ${model.file}`);
            continue;
        }
        try {
            const response = await fetch(model.url, { redirect: "follow", signal: AbortSignal.timeout(120000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const bytes = Buffer.from(await response.arrayBuffer());
            if (digest(bytes) !== model.sha256) throw new Error("SHA-256 mismatch");
            writeFileSync(`${target}.part`, bytes);
            renameSync(`${target}.part`, target);
            console.log(`download ${model.file}`);
        } catch (error) {
            failed = true;
            console.error(`FAILED   ${model.file}: ${error.message}`);
        }
    }
    process.exit(failed ? 1 : 0);
})();

import * as exifr from "exifr";
import { BadRequestException } from "@nestjs/common";
export function photoError(
    imageIndex: number,
    code: string,
    fields: string[] = [],
) {
    return new BadRequestException({
        statusCode: 400,
        error: "PRODUCT_PHOTO_INVALID",
        imageIndex,
        code,
        fields,
    });
}
export async function photoMetadata(bytes: Buffer, imageIndex: number) {
    let tags: Record<string, unknown>;
    try {
        tags =
            (await exifr.parse(bytes, {
                translateValues: false,
                reviveValues: false,
                tiff: true,
                gps: true,
                exif: true,
                pick: [
                    "DateTimeOriginal",
                    "OffsetTimeOriginal",
                    "GPSLatitude",
                    "GPSLongitude",
                    "GPSLatitudeRef",
                    "GPSLongitudeRef",
                    "Make",
                    "Model",
                ],
            })) ?? {};
    } catch {
        throw photoError(imageIndex, "METADATA_UNREADABLE");
    }
    const raw = tags.DateTimeOriginal;
    const capturedAtLocal =
        typeof raw === "string" ? raw.replaceAll("\0", "").trim() : "";
    const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(
        capturedAtLocal,
    );
    let validDate = false;
    if (match) {
        const [, y, m, d, h, min, sec] = match.map(Number);
        const date = new Date(Date.UTC(y, m - 1, d, h, min, sec));
        validDate =
            date.getUTCFullYear() === y &&
            date.getUTCMonth() === m - 1 &&
            date.getUTCDate() === d &&
            h <= 23 &&
            min <= 59 &&
            sec <= 59;
    }
    let gps: { latitude?: number; longitude?: number } = {};
    try {
        gps = (await exifr.gps(bytes)) ?? {};
    } catch {}
    const validRefs =
        ["N", "S"].includes(String(tags.GPSLatitudeRef)) &&
        ["E", "W"].includes(String(tags.GPSLongitudeRef));
    const validGps =
        validRefs &&
        Number.isFinite(gps.latitude) &&
        Number.isFinite(gps.longitude) &&
        Math.abs(gps.latitude!) <= 90 &&
        Math.abs(gps.longitude!) <= 180;
    const fields = [
        ...(!validDate ? ["DateTimeOriginal"] : []),
        ...(!validGps ? ["GPSLatitude", "GPSLongitude"] : []),
    ];
    if (fields.length)
        throw photoError(imageIndex, "METADATA_REQUIRED", fields);
    const offset =
        typeof tags.OffsetTimeOriginal === "string" &&
        /^[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00)$/.test(tags.OffsetTimeOriginal)
            ? tags.OffsetTimeOriginal
            : null;
    return {
        capturedAtLocal,
        utcOffset: offset,
        latitude: gps.latitude!,
        longitude: gps.longitude!,
        make: typeof tags.Make === "string" ? tags.Make.slice(0, 100) : null,
        model: typeof tags.Model === "string" ? tags.Model.slice(0, 100) : null,
    };
}

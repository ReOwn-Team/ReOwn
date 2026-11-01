/**
 * Downscales and re-encodes a photo in the browser before upload: phone
 * photos are often larger than the 6 MB server limit, and re-encoding through
 * a canvas drops EXIF/GPS before the image leaves the device.
 */
export async function prepareImage(
  file: Blob,
  maxSide = 2400,
  quality = 0.9,
): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Không đọc được ảnh. Hãy chọn ảnh JPG hoặc PNG.");
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("encode");
    return blob;
  } catch {
    throw new Error("Không xử lý được ảnh. Hãy thử ảnh khác.");
  } finally {
    bitmap.close();
  }
}

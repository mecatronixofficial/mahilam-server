import { BadRequestException } from "@nestjs/common";
import sharp from "sharp";

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function decodeLogo(file: Express.Multer.File) {
  if (!LOGO_TYPES.includes(file.mimetype) || !file.buffer.length || file.buffer.length > MAX_LOGO_BYTES) throw new BadRequestException("Choose a PNG, JPEG or WebP logo up to 2 MB");
  try {
    const image = sharp(file.buffer, { failOn: "warning", limitInputPixels: 16_000_000 });
    const meta = await image.metadata();
    if (`image/${meta.format}` !== file.mimetype || !meta.width || !meta.height || meta.width < 32 || meta.height < 16 || meta.width > 4096 || meta.height > 4096 || (meta.pages ?? 1) > 1) throw new Error("Invalid image type or dimensions");
    // Full decode and lossless re-encode reject corrupted pixels, strip metadata, preserve alpha.
    const { data, info } = await image.rotate().webp({ lossless: true }).toBuffer({ resolveWithObject: true });
    if (data.length > MAX_LOGO_BYTES) throw new Error("Processed image exceeds 2 MB");
    return { buffer: data, width: info.width, height: info.height, contentType: "image/webp" };
  } catch { throw new BadRequestException("Invalid or corrupted logo. Use a static PNG, JPEG or WebP, 32–4096 pixels wide and 16–4096 pixels high, maximum 16 megapixels."); }
}

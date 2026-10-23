import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** File signatures, so a renamed or mislabelled file can't be stored as an image. */
const SIGNATURES: { type: string; ext: string; matches: (b: Buffer) => boolean }[] = [
  { type: "image/jpeg", ext: "jpg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", ext: "png", matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/gif", ext: "gif", matches: (b) => b.subarray(0, 4).toString("ascii") === "GIF8" },
  { type: "image/webp", ext: "webp", matches: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
];

@Injectable()
export class StorageService {
  private client?: S3Client;

  private configured() {
    return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_PUBLIC_URL);
  }

  status() {
    return { configured: this.configured(), maxImageSizeMb: MAX_IMAGE_BYTES / 1024 / 1024 };
  }

  async uploadImage(file: Express.Multer.File) {
    if (!this.configured()) throw new ServiceUnavailableException("Cloudflare R2 is not configured");
    const signature = SIGNATURES.find((s) => s.matches(file.buffer));
    if (!signature) throw new BadRequestException("The file is not a valid JPEG, PNG, WebP or GIF image");

    const key = `images/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${signature.ext}`;
    await this.s3().send(
      new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key, Body: file.buffer, ContentType: signature.type, CacheControl: "public, max-age=31536000, immutable" }),
    );
    const base = process.env.R2_PUBLIC_URL!.replace(/\/$/, "");
    return { key, url: `${base}/${key}`, size: file.size, contentType: signature.type };
  }

  async uploadLogo(buffer: Buffer) {
    if (!this.configured()) throw new ServiceUnavailableException("Cloudflare R2 is not configured");
    const key = `branding/logos/${randomUUID()}.webp`;
    await this.s3().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key, Body: buffer, ContentType: "image/webp", CacheControl: "public, max-age=31536000, immutable" }));
    return { key, url: `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}` };
  }

  async verifyLogo(url: string) {
    const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/webp")) throw new ServiceUnavailableException("The uploaded logo is not publicly accessible. The previous logo has been retained.");
  }

  async deleteLogo(key: string) {
    // Never delete default assets or shared CMS images.
    if (!/^branding\/logos\/[0-9a-f-]{36}\.webp$/.test(key)) return;
    await this.s3().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }));
  }
  /** One client per process: it keeps its HTTPS connections alive between uploads. */
  private s3() {
    this.client ??= new S3Client({
      region: "auto",
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    });
    return this.client;
  }
}

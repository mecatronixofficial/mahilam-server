import { BadRequestException } from "@nestjs/common";
export function privateDocument(file: Express.Multer.File) {
  const bytes = file.buffer;
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new BadRequestException("Choose a private document up to 5 MB");
  const pdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.subarray(0,4).toString("ascii") === "RIFF" && bytes.subarray(8,12).toString("ascii") === "WEBP";
  if (!pdf && !png && !jpeg && !webp) throw new BadRequestException("Only valid PDF, PNG, JPEG or WebP documents are accepted");
  const contentType = pdf ? "application/pdf" : png ? "image/png" : jpeg ? "image/jpeg" : "image/webp";
  const filename = file.originalname.replace(/[^a-zA-Z0-9_. -]/g, "_").slice(0, 120) || "document";
  return { bytes, contentType, filename };
}

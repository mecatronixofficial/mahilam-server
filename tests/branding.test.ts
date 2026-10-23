import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { decodeLogo, MAX_LOGO_BYTES } from "../src/branding/logo-image.js";
import { BrandingService, BRANDING_KEY } from "../src/branding/branding.service.js";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../src/common/guards/roles.guard.js";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { BrandingAdminController, BrandingPublicController } from "../src/branding/branding.controller.js";
import { authCookieNames } from "../src/auth/auth.constants.js";

const file = (buffer: Buffer, mimetype = "image/png") => ({ buffer, mimetype, size: buffer.length, originalname: "../../logo.png" }) as Express.Multer.File;
const source = () => sharp({ create: { width: 160, height: 80, channels: 4, background: { r: 20, g: 50, b: 90, alpha: 0.5 } } });

for (const format of ["png", "jpeg", "webp"] as const) {
  test(`decodes ${format}, preserves dimensions and strips metadata`, async () => {
    const logo = await decodeLogo(file(await source()[format]().toBuffer(), `image/${format}`));
    const meta = await sharp(logo.buffer).metadata();
    assert.equal(meta.format, "webp"); assert.equal(logo.width, 160); assert.equal(logo.height, 80);
    if (format !== "jpeg") assert.equal(meta.hasAlpha, true);
  });
}
test("rejects MIME mismatch, SVG, oversized, corrupted and tiny images", async () => {
  const png = await source().png().toBuffer();
  for (const invalid of [file(png, "image/jpeg"), file(Buffer.from('<svg/>'), "image/svg+xml"), file(Buffer.alloc(MAX_LOGO_BYTES + 1)), file(png.subarray(0, 32)), file(await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).png().toBuffer())]) {
    await assert.rejects(() => decodeLogo(invalid));
  }
});

function setup() {
  let row: any = null;
  let failDatabase = false;
  let failStorage = false;
  let failVerify = false;
  let failCleanup = false;
  let sequence = 0;
  const deleted: string[] = [];
  const settings = {
    findUnique: async () => row,
    upsert: async ({ create }: any) => { if (failDatabase) throw new Error("database unavailable"); row = { value: create.value, updatedAt: new Date() }; },
    deleteMany: async () => { if (failDatabase) throw new Error("database unavailable"); row = null; },
  };
  const prisma = { siteSetting: settings, $transaction: async (callback: any) => callback({ siteSetting: settings, $executeRaw: async () => 0 }) };
  const storage = {
    uploadLogo: async () => { if (failStorage) throw new Error("storage unavailable"); const key = `branding/logos/${++sequence}.webp`; return { key, url: `https://cdn.example.com/${key}` }; },
    verifyLogo: async () => { if (failVerify) throw new Error("URL unavailable"); },
    deleteLogo: async (key: string) => { if (failCleanup) throw new Error("cleanup unavailable"); deleted.push(key); },
  };
  return { service: new BrandingService(prisma as any, storage as any), deleted, row: () => row, fail: (kind: string) => { failDatabase = kind === "database"; failStorage = kind === "storage"; failVerify = kind === "verify"; failCleanup = kind === "cleanup"; } };
}
test("public fallback, upload, replacement and idempotent restore", async () => {
  const s = setup();
  assert.equal((await s.service.publicSettings()).logoUrl, null);
  const image = file(await source().png().toBuffer());
  await s.service.replace(image);
  const first = s.row().value.key;
  assert.equal(s.row().value.originalFilename.includes("/"), false);
  await s.service.replace(image);
  assert.deepEqual(s.deleted, [first]);
  await s.service.restore(); await s.service.restore();
  assert.equal((await s.service.publicSettings()).logoUrl, null);
  assert.equal(s.deleted.length, 2);
  assert.equal(BRANDING_KEY, "branding.logo");
});
for (const failure of ["database", "storage", "verify"]) {
  test(`${failure} failure retains previous active logo`, async () => {
    const s = setup(); const image = file(await source().png().toBuffer());
    await s.service.replace(image); const active = s.row().value;
    s.fail(failure); await assert.rejects(() => s.service.replace(image));
    assert.deepEqual(s.row().value, active);
    assert.equal(s.deleted.includes(active.key), false);
    if (failure !== "storage") assert.equal(s.deleted.length, 1);
  });
}
test("cleanup failure does not undo successful replacement", async () => {
  const s = setup(); const image = file(await source().png().toBuffer());
  await s.service.replace(image); const old = s.row().value.key;
  s.fail("cleanup"); await s.service.replace(image);
  assert.notEqual(s.row().value.key, old);
});
test("failed restore retains active logo", async () => {
  const s = setup(); await s.service.replace(file(await source().png().toBuffer()));
  const active = s.row().value; s.fail("database"); await assert.rejects(() => s.service.restore());
  assert.deepEqual(s.row().value, active); assert.equal(s.deleted.length, 0);
});

test("actual authentication and role guards protect both admin actions", async () => {
  let currentRole = "STAFF";
  const jwt = new JwtService(); const auth = new JwtAuthGuard(jwt, { user: { findFirst: async () => ({ id: "user", email: "test@example.com", name: "Test", role: currentRole }) } } as any); const roles = new RolesGuard(new Reflector());
  const original = process.env.JWT_ACCESS_SECRET; process.env.JWT_ACCESS_SECRET = "branding-test-secret";
  try {
    for (const action of ["upload", "restore"] as const) {
      const request: any = { cookies: {} };
      const context: any = { switchToHttp: () => ({ getRequest: () => request }), getClass: () => BrandingAdminController, getHandler: () => BrandingAdminController.prototype[action] };
      await assert.rejects(() => auth.canActivate(context));
      request.cookies[authCookieNames().access] = "invalid"; await assert.rejects(() => auth.canActivate(context));
      for (const role of ["ADMIN", "SUPER_ADMIN", "TEACHER"]) {
        request.cookies[authCookieNames().access] = jwt.sign({ sub: "test-user", type: "access", role }, { secret: process.env.JWT_ACCESS_SECRET });
        currentRole = role;
        assert.equal(await auth.canActivate(context), true); assert.equal(roles.canActivate(context), role !== "TEACHER");
      }
    }
  } finally { if (original === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = original; }
});
test("public controller wraps branding response", async () => {
  const controller = new BrandingPublicController(setup().service);
  const response = await controller.get(); assert.equal(response.success, true); assert.equal(response.data.logoUrl, null);
});

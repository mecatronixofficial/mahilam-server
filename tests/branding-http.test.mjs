import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import sharp from 'sharp';
import { BrandingAdminController, BrandingPublicController } from '../dist/branding/branding.controller.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { BrandingService } from '../dist/branding/branding.service.js';
import { decodeLogo } from '../dist/branding/logo-image.js';
import { authCookieNames } from '../dist/auth/auth.constants.js';

test('HTTP branding routes: public read, authorization, multipart validation, replace and restore', async () => {
  let active = { logoUrl: null, width: 694, height: 347 };
  let writes = 0;
  const secret = 'branding-http-test-secret';
  const oldSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = secret;
  const service = {
    publicSettings: async () => active,
    replace: async file => { const decoded = await decodeLogo(file); active = { logoUrl: `https://cdn.example.com/${++writes}.webp`, width: decoded.width, height: decoded.height }; return active; },
    restore: async () => { active = { logoUrl: null, width: 694, height: 347 }; return active; },
  };
  class TestModule {}
  Module({ controllers: [BrandingPublicController, BrandingAdminController], providers: [JwtService, { provide: PrismaService, useValue: { user: { findFirst: async ({ where }) => ({ id: where.id, email: "test@example.com", name: "Test", role: where.id }) } } }, { provide: BrandingService, useValue: service }] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.use(cookieParser()); await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const jwt = new JwtService();
  const cookie = role => `${authCookieNames().access}=${jwt.sign({ sub: role, type: 'access', role }, { secret })}`;
  const upload = async (bytes, type, role = 'ADMIN') => {
    const body = new FormData(); body.append('file', new Blob([bytes], { type }), 'logo');
    return fetch(`${base}/api/v1/admin/branding/logo`, { method: 'POST', body, headers: role ? { Cookie: cookie(role) } : {} });
  };
  try {
    const get = await fetch(`${base}/api/v1/branding`); assert.equal(get.status, 200); assert.equal(get.headers.get('cache-control'), 'no-store'); assert.equal((await get.json()).data.logoUrl, null);
    const png = await sharp({ create: { width: 160, height: 80, channels: 4, background: '#00ff0080' } }).png().toBuffer();
    assert.equal((await upload(png, 'image/png', null)).status, 401);
    assert.equal((await upload(png, 'image/png', 'TEACHER')).status, 403);
    assert.equal((await fetch(`${base}/api/v1/admin/branding/logo`, { method: 'DELETE' })).status, 401);
    assert.equal(writes, 0);
    for (const format of ['png', 'jpeg', 'webp']) {
      const bytes = await sharp(png).toFormat(format).toBuffer(); const response = await upload(bytes, `image/${format}`);
      assert.equal(response.status, 201); assert.equal((await response.json()).data.width, 160);
    }
    assert.equal((await upload(png, 'image/jpeg')).status, 400);
    assert.equal((await upload(Buffer.from('<svg/>'), 'image/svg+xml')).status, 400);
    assert.equal((await upload(Buffer.from('broken'), 'image/png')).status, 400);
    assert.equal((await upload(Buffer.alloc(2 * 1024 * 1024 + 1), 'image/png')).status, 413);
    assert.equal(writes, 3);
    const current = await fetch(`${base}/api/v1/branding`); assert.equal((await current.json()).data.logoUrl, 'https://cdn.example.com/3.webp');
    const reset = await fetch(`${base}/api/v1/admin/branding/logo`, { method: 'DELETE', headers: { Cookie: cookie('ADMIN') } });
    assert.equal(reset.status, 200); assert.equal((await reset.json()).data.logoUrl, null);
  } finally { await app.close(); if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = oldSecret; }
});

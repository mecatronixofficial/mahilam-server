import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationPipe, Module } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import { AdmissionsService } from '../dist/admissions/admissions.service.js';
import { AdmissionsController } from '../dist/admissions/admissions.controller.js';
import { EnquiriesService } from '../dist/enquiries/enquiries.service.js';
import { EnquiriesController } from '../dist/enquiries/enquiries.controller.js';
import { CreateEnquiryDto, EnquiryQueryDto } from '../dist/enquiries/dto/create-enquiry.dto.js';
import { ReportsController } from '../dist/reports/reports.controller.js';
import { ReportsService } from '../dist/reports/reports.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { JwtAuthGuard } from '../dist/common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../dist/common/guards/roles.guard.js';
import { authCookieNames } from '../dist/auth/auth.constants.js';
import { schoolDay, schoolDayStart, schoolDayEnd, schoolMonthStart, schoolRange } from '../dist/common/utils/school-time.js';

const enquiryId = '11111111-1111-4111-8111-111111111111';
const admissionId = '22222222-2222-4222-8222-222222222222';
const actor = { id: 'admin', role: 'ADMIN', name: 'Administrator', email: 'admin@example.test', sub: 'admin' };


import { createCrmFixture, yearId, classId } from "./helpers/crm-fixture.mjs";
function fixture() { return createCrmFixture({ enquiryId, admissionId, actor, AdmissionsService, EnquiriesService }); }
const application = { studentName: 'Child Example', className: 'Pre-KG', enquiryId, academicYearId: yearId, classLevelId: classId, childDob: '2022-01-01', parentName: 'Parent', phone: '+919876543210', address: 'School test address', emergencyContact: '+919876543210', consent: true };
async function approve(f) {
  await f.admissions.create(application);
  await f.admissions.submit(admissionId, actor);
  await f.admissions.review(admissionId, { decision: 'APPROVED' }, actor);
}

test('application creation updates the linked enquiry atomically and rejects a duplicate active application', async () => {
  const f = fixture();
  await f.admissions.create(application);
  assert.equal(f.state().enquiry.status, 'APPLICATION_STARTED');
  assert.ok(f.events[0].startsWith('lock:SELECT "id" FROM "Enquiry"'));
  await assert.rejects(() => f.admissions.create(application), /active application/);
  assert.equal(f.state().admissions.length, 1);
  const broken = fixture(); broken.failStage();
  await assert.rejects(() => broken.admissions.create(application), /stage write failed/);
  assert.equal(broken.state().admissions.length, 0);
});

test('generic lead, follow-up and application writes cannot confirm admissions', async () => {
  const f = fixture();
  await assert.rejects(() => f.admissions.create({ ...application, status: 'CONFIRMED' }), /administrator confirmation/);
  await assert.rejects(() => f.admissions.update(admissionId, { status: 'CONFIRMED' }), /administrator confirmation/);
  await assert.rejects(() => f.enquiries.createInternal({ status: 'ADMISSION_CONFIRMED' }), /approval action/);
  await assert.rejects(() => f.enquiries.update(enquiryId, { status: 'ADMISSION_CONFIRMED' }), /approval action/);
  await assert.rejects(() => f.enquiries.addFollowUp(enquiryId, { status: 'ADMISSION_CONFIRMED' }, 'Staff'), /approval action/);
  assert.equal(f.state().students.length, 0);
});

test('confirmation locks before checking, creates family details and commits a linked audit', async () => {
  const f = fixture(); await approve(f); f.events.length = 0;
  const result = await f.admissions.confirm(admissionId, {}, actor);
  assert.ok(f.events[0].startsWith('lock:SELECT "id" FROM "Admission"'));
  assert.equal(f.events[1], 'read:admission');
  assert.equal(result.student.phone, '+919876543210');
  assert.equal(result.student.dob.toISOString(), '2022-01-01T00:00:00.000Z');
  assert.equal(result.student.guardians.create.guardian.create.name, 'Parent');
  assert.equal(f.state().enquiry.status, 'ENROLLED');
  assert.equal(f.state().audit.find(row => row.action === 'ADMISSION_ENROLLED').userId, actor.id);
  assert.equal(f.state().audit.find(row => row.action === 'ADMISSION_ENROLLED').newValue.studentId, result.student.id);
  const repeat = await f.admissions.confirm(admissionId, {}, actor); assert.equal(repeat.alreadyEnrolled, true); assert.equal(repeat.student.id, result.student.id);
  assert.equal(f.state().students.length, 1);
});

test('concurrent confirmation requests produce only one student under serialized transactions (double)', async () => {
  const f = fixture(); await approve(f);
  const results = await Promise.allSettled([f.admissions.confirm(admissionId, {}, actor), f.admissions.confirm(admissionId, {}, actor)]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 2); assert.equal(results[0].value.student.id, results[1].value.student.id);
  assert.equal(f.state().students.length, 1);
});

test('failed approval audit rolls back student, application and enquiry changes (transaction double)', async () => {
  const f = fixture(); await approve(f); f.failAudit();
  await assert.rejects(() => f.admissions.confirm(admissionId, {}, actor), /audit failed/);
  assert.equal(f.state().students.length, 0);
  assert.equal(f.state().enquiry.status, 'APPROVED');
  assert.equal(f.state().admissions[0].admissionNumber, null);
});


test('class mismatch, rejected applications, relinking and enrolled edits are rejected; archived enquiries retain history', async () => {
  const f = fixture(); await approve(f);
  await assert.rejects(() => f.admissions.confirm(admissionId, { sectionId: 'section' }, actor), /Section does not belong/);
  const draft = fixture(); await draft.admissions.create(application);
  await assert.rejects(() => draft.admissions.update(admissionId, { enquiryId: null }), /cannot be changed/);
  const rejected = fixture(); await approve(rejected);
  await rejected.admissions.review(admissionId, { decision: 'REJECTED', reason: 'School review decision' }, actor);
  await assert.rejects(() => rejected.admissions.confirm(admissionId, {}, actor), /must be approved/);
  await f.admissions.confirm(admissionId, {}, actor);
  await assert.rejects(() => f.admissions.update(admissionId, { notes: 'edit' }), /draft application/);
  await assert.rejects(() => f.admissions.remove(admissionId), /must be retained/);
  await f.enquiries.remove(enquiryId, actor);
  assert.ok(f.state().enquiry.archivedAt);
  assert.equal(f.state().admissions.length, 1);
  await f.enquiries.archive(enquiryId, false, actor);
  await assert.rejects(() => f.enquiries.update(enquiryId, { status: 'NEW' }, actor), /Cannot move/);
});

test('assignees must be active and follow-up author comes from the authenticated actor', async () => {
  const f = fixture();
  await assert.rejects(() => f.enquiries.update(enquiryId, { assignedStaffId: 'inactive' }), /unavailable/);
  await f.enquiries.addFollowUp(enquiryId, { contactMethod: 'PHONE', notes: 'Called parent', staffName: 'Forged name' }, 'Actual staff');
  assert.equal(f.state().followUps[0].staffName, 'Actual staff');
  assert.equal(f.state().enquiry.status, 'CONTACTED');
});

test('public capture forces website source and list pagination returns totals beyond the current page', async () => {
  const f = fixture();
  const result = await f.enquiries.create({ parentName: 'Parent', studentName: 'Child', phone: '9876543210', interestedClass: 'Pre-KG', source: 'WALK_IN' });
  assert.equal(result.id, enquiryId);
  assert.equal(f.events.find(event => event.publicSource)?.publicSource, "WEBSITE");
  const data = await f.enquiries.list({ page: 2, limit: 25, followUpDue: 'true', search: 'Child', source: 'WEBSITE' });
  assert.equal(data.meta.total, 51); assert.equal(data.meta.pages, 3);
  const query = f.events.find(value => typeof value === 'object' && value.where);
  assert.equal(query.skip, 25); assert.equal(query.take, 25);
  for (const status of ['ADMISSION_CONFIRMED', 'ENROLLED', 'LOST', 'REJECTED']) assert.ok(query.where.status.notIn.includes(status));
  assert.equal(query.where.source, 'WEBSITE');
  assert.equal(query.where.nextFollowUpDate.lte.toISOString().slice(11), '18:29:59.999Z');
});

test('school day and report boundaries use India midnight while explicit timestamps remain exact', () => {
  assert.equal(schoolDay(new Date('2026-10-16T18:30:00Z')), '2026-10-17');
  assert.equal(schoolDayStart('2026-10-17').toISOString(), '2026-10-16T18:30:00.000Z');
  assert.equal(schoolDayEnd('2026-10-17').toISOString(), '2026-10-17T18:29:59.999Z');
  assert.equal(schoolMonthStart(new Date('2026-09-30T18:30:00Z')).toISOString(), '2026-09-30T18:30:00.000Z');
  assert.equal(schoolRange('2026-10-17T10:00:00Z', true).toISOString(), '2026-10-17T10:00:00.000Z');
});

test('DTO validation trims public names and rejects blank names, fake phones, unknown fields and invalid filters', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const input = { parentName: ' Parent ', studentName: ' Child ', phone: '+44 20 7946 0958', interestedClass: 'Pre-KG', email: ' parent@example.test ' };
  const metadata = { type: 'body', metatype: CreateEnquiryDto };
  const valid = await pipe.transform(input, metadata);
  assert.equal(valid.parentName, 'Parent'); assert.equal(valid.email, 'parent@example.test');
  for (const data of [{ ...input, parentName: '  ' }, { ...input, phone: '--------' }, { ...input, isAdmin: true }]) await assert.rejects(() => pipe.transform(data, metadata));
  await assert.rejects(() => pipe.transform({ followUpDue: 'yes' }, { type: 'query', metatype: EnquiryQueryDto }));
});

test('auth guard reloads current account roles, rejects disabled accounts and preserves database outage errors', async () => {
  const jwt = new JwtService();
  const original = process.env.JWT_ACCESS_SECRET; process.env.JWT_ACCESS_SECRET = 'crm-contract-test-secret';
  const req = { cookies: {} };
  let account = { ...actor, role: 'STAFF' };
  let offline = false;
  const guard = new JwtAuthGuard(jwt, { user: { findFirst: async () => { if (offline) throw new Error('database unavailable'); return account; } } });
  const ctx = { switchToHttp: () => ({ getRequest: () => req }), getClass: () => AdmissionsController, getHandler: () => AdmissionsController.prototype.confirm };
  try {
    await assert.rejects(() => guard.canActivate(ctx), /Authentication required/);
    req.cookies[authCookieNames().access] = jwt.sign({ sub: actor.id, type: 'access', role: 'ADMIN' }, { secret: process.env.JWT_ACCESS_SECRET });
    assert.equal(await guard.canActivate(ctx), true); assert.equal(req.user.role, 'STAFF');
    assert.equal(new RolesGuard(new Reflector()).canActivate(ctx), false);
    account = null; await assert.rejects(() => guard.canActivate(ctx), /no longer active/);
    offline = true; await assert.rejects(() => guard.canActivate(ctx), /database unavailable/);
  } finally { if (original === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = original; }
});

test('real HTTP guards protect approval and exports and reject status bypass/invalid payloads', async () => {
  const f = fixture(); const original = process.env.JWT_ACCESS_SECRET; process.env.JWT_ACCESS_SECRET = 'crm-http-test-secret';
  class TestModule {}
  Module({ controllers: [AdmissionsController, EnquiriesController, ReportsController], providers: [JwtService,
    { provide: PrismaService, useValue: { user: { findFirst: async ({ where }) => where.id === 'disabled' ? null : { ...actor, id: where.id, role: where.id === 'admin' ? 'ADMIN' : 'STAFF' } } } },
    { provide: ReportsService, useValue: { enquiriesCsv: async () => "Enquiry No\r\nTEST\r\n" } },
    { provide: AdmissionsService, useValue: f.admissions }, { provide: EnquiriesService, useValue: f.enquiries },
  ] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1'); const base = `${await app.getUrl()}/api/v1`;
  const jwt = new JwtService();
  const request = (route, body, subject) => fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(subject ? { Cookie: `${authCookieNames().access}=${jwt.sign({ sub: subject, type: 'access', role: 'ADMIN' }, { secret: process.env.JWT_ACCESS_SECRET })}` } : {}) }, body: JSON.stringify(body) });
  try {
    await approve(f);
    assert.equal((await request(`/admissions/${admissionId}/confirm`, {})).status, 401);
    assert.equal((await request(`/admissions/${admissionId}/confirm`, {}, 'staff')).status, 403);
    assert.equal((await request(`/admissions/${admissionId}/confirm`, {}, 'disabled')).status, 401);
    assert.equal((await request('/admissions', { ...application, status: 'CONFIRMED' }, 'admin')).status, 400);
    assert.equal((await request('/enquiries/public', { parentName: '  ', studentName: 'Child', phone: '----', interestedClass: 'Pre-KG' })).status, 400);
    assert.equal((await request(`/admissions/${admissionId}/confirm`, {}, 'admin')).status, 201);
    assert.equal((await request(`/admissions/${admissionId}/confirm`, {}, 'admin')).status, 201);
    assert.equal(f.state().students.length, 1);
    for (const [subject, expected] of [[null, 401], ['staff', 403], ['admin', 200]]) {
      const headers = subject ? { Cookie: `${authCookieNames().access}=${jwt.sign({ sub: subject, type: 'access', role: 'ADMIN' }, { secret: process.env.JWT_ACCESS_SECRET })}` } : {};
      const exported = await fetch(`${base}/reports/export/enquiries.csv`, { headers });
      assert.equal(exported.status, expected);
      if (expected === 200) assert.ok(exported.headers.get('content-type').includes('text/csv'));
    }
    const list = await fetch(`${base}/enquiries`); assert.equal(list.status, 401);
  } finally {
    await app.close();
    if (original === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = original;
  }
});

test('reports use school date filters, parameterized monthly SQL and reject inverted ranges', async () => {
  let filter;
  let sql;
  const report = new ReportsService({
    enquiry: { groupBy: async ({ where }) => { filter = where; return []; }, count: async () => 0 },
    $queryRaw: async (strings, ...values) => { sql = { strings, values }; return []; },
  });
  await report.enquiries({ from: '2026-10-01', to: '2026-10-17' });
  assert.equal(filter.createdAt.gte.toISOString(), '2026-09-30T18:30:00.000Z');
  assert.equal(filter.createdAt.lte.toISOString(), '2026-10-17T18:29:59.999Z');
  assert.ok(sql.strings.join('?').includes("INTERVAL '5 hours 30 minutes'"));
  assert.ok(sql.values.some(value => value instanceof Date && value.toISOString() === '2026-09-30T18:30:00.000Z'));
  await assert.rejects(() => report.enquiries({ from: '2026-10-20', to: '2026-10-17' }), /From date/);
});

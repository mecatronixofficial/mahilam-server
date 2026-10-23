import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ValidationPipe, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import cookieParser from "cookie-parser";
import { CrmService } from "../dist/crm/crm.service.js";
import { CrmController } from "../dist/crm/crm.controller.js";
import { AdmissionsService } from "../dist/admissions/admissions.service.js";
import { EnquiriesService } from "../dist/enquiries/enquiries.service.js";
import { PrismaService } from "../dist/prisma/prisma.service.js";
import { authCookieNames } from "../dist/auth/auth.constants.js";
import { assertStageTransition, canonicalStage, normalizedPhone, assertWorkTransition } from "../dist/common/utils/crm-workflow.js";
import { canAccessEndpoint, assertEnquiryAccess } from "../dist/common/utils/crm-policy.js";
import { sanitizeAudit } from "../dist/common/interceptors/audit.interceptor.js";
import { toSafeCsv } from "../dist/common/utils/csv.js";
import { FollowUpTaskDto, AttendanceBatchDto, VisitDto } from "../dist/crm/crm.dto.js";
import { createCrmFixture, yearId, classId } from "./helpers/crm-fixture.mjs";
const enquiryId = "11111111-1111-4111-8111-111111111111";
const admissionId = "22222222-2222-4222-8222-222222222222";
const actor = { id: "admin", sub: "admin", name: "Admin", email: "admin@example.test", role: "ADMIN" };
const staff = { ...actor, id: "staff", sub: "staff", role: "COUNSELLOR" };
const application = { studentName: "Test Child", className: "Pre-KG", enquiryId, academicYearId: yearId, classLevelId: classId, childDob: "2022-01-01", parentName: "Test Parent", phone: "9876543210", address: "Test address", emergencyContact: "9876543210", consent: true };
function fixture() {
  const f = createCrmFixture({ enquiryId, admissionId, actor, AdmissionsService, EnquiriesService });
  Object.assign(f.state(), { workFollowUps: [], workTasks: [], visits: [], slots: [] });
  const table = key => ({
    findUnique: async ({ where }) => structuredClone(f.state()[key].find(row => row.id === where.id || where.startAt && row.startAt.valueOf() === where.startAt.valueOf()) ?? null),
    findFirst: async ({ where }) => structuredClone(f.state()[key].filter(row => (!where.enquiryId || row.enquiryId === where.enquiryId) && (!where.status || row.status === where.status)).sort((a,b) => a.dueAt - b.dueAt)[0] ?? null),
    create: async ({ data }) => { const row = { id: key + "-" + f.state()[key].length, ...Object.fromEntries(Object.entries(data).filter(([,v]) => v !== undefined)) }; f.state()[key].push(row); return structuredClone(row); },
    update: async ({ where, data }) => { const row = f.state()[key].find(row => row.id === where.id); Object.assign(row, Object.fromEntries(Object.entries(data).filter(([,v]) => v !== undefined))); return structuredClone(row); },
    findMany: async () => structuredClone(f.state()[key]),
    count: async ({ where = {} } = {}) => f.state()[key].filter(row => (!where.status || row.status === where.status) && (!where.slotId || row.slotId === where.slotId) && (!where.assignedStaffId || row.assignedStaffId === where.assignedStaffId) && (!where.id?.not || row.id !== where.id.not) && (!where.startAt?.lt || row.startAt < where.startAt.lt) && (!where.endAt?.gt || row.endAt > where.endAt.gt)).length,
  });
  f.db.followUpTask = table("workFollowUps"); f.db.crmTask = table("workTasks"); f.db.schoolVisit = table("visits"); f.db.visitSlot = table("slots");
  f.db.applicationDocument.findFirst = async ({ where }) => f.state().documents.find(row => row.id === where.id && row.admissionId === where.admissionId) ?? null;
  f.db.applicationDocument.count = async ({ where }) => f.state().documents.filter(row => row.admissionId === where.admissionId).length;
  f.db.applicationDocument.create = async ({ data, select }) => { const row = { id: "document-new", ...data }; f.state().documents.push(row); return Object.fromEntries(Object.keys(select).map(key => [key, row[key]])); };
  f.crm = new CrmService(f.db, f.admissions);
  return f;
}
async function approve(f) { await f.admissions.create(application, actor); await f.admissions.submit(admissionId, actor); await f.admissions.review(admissionId, { decision: "APPROVED" }, actor); }

test("canonical stages preserve legacy records and valid forward transitions", () => {
  assert.equal(canonicalStage("NEW"), "NEW_ENQUIRY"); assert.equal(canonicalStage("VISITED"), "VISIT_COMPLETED"); assert.equal(canonicalStage("ADMISSION_CONFIRMED"), "ENROLLED");
  for (const [from, to] of [["NEW","CONTACTED"],["CONTACTED","QUALIFIED"],["QUALIFIED","VISIT_SCHEDULED"],["VISIT_SCHEDULED","VISIT_COMPLETED"],["VISIT_COMPLETED","APPLICATION_STARTED"],["APPLICATION_STARTED","DOCUMENTS_PENDING"]]) assert.doesNotThrow(() => assertStageTransition(from,to));
  assert.doesNotThrow(() => assertStageTransition("APPLICATION_SUBMITTED","APPROVED",{ managed:true,manager:true }));
});
test("invalid transitions, approval bypass and lost enquiries without reasons are rejected", () => {
  assert.throws(() => assertStageTransition("NEW","QUALIFIED"), /Cannot move/);
  assert.throws(() => assertStageTransition("CONTACTED","LOST"), /reason/);
  assert.doesNotThrow(() => assertStageTransition("CONTACTED","LOST",{reason:"Family relocated"}));
  for (const to of ["APPLICATION_SUBMITTED","APPROVED","ENROLLED","REJECTED"]) assert.throws(() => assertStageTransition("CONTACTED",to), /application/);
  assert.throws(() => assertStageTransition("APPLICATION_SUBMITTED","APPROVED",{managed:true}), /manager/);
  assert.throws(() => assertStageTransition("ENROLLED","CONTACTED"), /Cannot move/);
  assert.throws(() => assertWorkTransition("COMPLETED","PENDING"), /cannot be reopened/);
});
test("roles restrict modules, financial reports and assigned enquiries", () => {
  assert.equal(canAccessEndpoint("CMS_EDITOR","POST","/api/v1/cms/blogs"),true);
  assert.equal(canAccessEndpoint("COUNSELLOR","POST","/api/v1/fees/payments"),false);
  assert.equal(canAccessEndpoint("ACCOUNTANT","GET","/api/v1/reports/enquiries"),false);
  assert.equal(canAccessEndpoint("ACCOUNTANT","GET","/api/v1/fees/payments"),true);
  assert.equal(canAccessEndpoint("TEACHER","POST","/api/v1/crm/attendance"),true);
  assert.equal(canAccessEndpoint("TEACHER","GET","/api/v1/crm/applications/x/documents/y"),false);
  assert.throws(() => assertEnquiryAccess({assignedStaffId:"other"},staff),/not found/);
  assert.doesNotThrow(() => assertEnquiryAccess({assignedStaffId:"staff"},staff));
});
test("normalization catches formatted Indian phone duplicates without altering international numbers", () => {
  assert.equal(normalizedPhone("+91 98765 43210"),normalizedPhone("98765-43210"));
  assert.equal(normalizedPhone("+44 20 7946 0958"),"442079460958");
});
test("incomplete drafts are retained but submission requires consent and required documents", async () => {
  const f = fixture(); await f.admissions.create({...application, consent:false},actor);
  await assert.rejects(() => f.admissions.submit(admissionId,actor),/consent/);
  assert.equal(f.state().admissions[0].status,"DRAFT");
  await f.admissions.update(admissionId,{consent:true},actor);
  f.state().documents = [];
  await assert.rejects(() => f.admissions.submit(admissionId,actor),/Required documents missing/);
  assert.equal(f.state().admissions[0].status,"DRAFT");
});
test("counsellors cannot review or enroll and generic application writes cannot approve", async () => {
  const f = fixture(); await f.admissions.create(application,actor);
  await assert.rejects(() => f.admissions.review(admissionId,{decision:"APPROVED"},staff),/manager/);
  await assert.rejects(() => f.admissions.confirm(admissionId,{},staff),/manager/);
  await assert.rejects(() => f.admissions.update(admissionId,{status:"APPROVED"},actor),/review/);
  await assert.rejects(() => f.admissions.confirm(admissionId,{},actor),/must be approved/);
  assert.equal(f.state().students.length,0);
});
test("capacity is enforced, overrides require an administrator and reason", async () => {
  const f = fixture(); await approve(f); f.state().class.capacity = 1; f.state().students.push({id:"existing",classLevelId:classId,status:"ACTIVE"});
  await assert.rejects(() => f.admissions.confirm(admissionId,{},actor),/capacity is full/);
  await assert.rejects(() => f.admissions.confirm(admissionId,{capacityOverride:true},actor),/reason/);
  await assert.rejects(() => f.admissions.confirm(admissionId,{capacityOverride:true,overrideReason:"Approved exception"},{...actor,role:"ADMISSION_MANAGER"}),/administrator/);
  assert.equal(f.state().students.length,1);
  await f.admissions.confirm(admissionId,{capacityOverride:true,overrideReason:"Approved exception"},actor);
  assert.equal(f.state().students.length,2);
});
test("scheduled follow-up rescheduling, completion and cancellation retain history and update next due date", async () => {
  const f = fixture();
  const row = await f.crm.saveFollowUp(null,{enquiryId,assignedStaffId:"staff",dueAt:"2026-10-24T04:00:00Z",method:"CALL",priority:"HIGH"},actor);
  await f.crm.saveFollowUp(row.id,{dueAt:"2026-10-25T04:00:00Z"},actor);
  assert.equal(f.state().enquiry.nextFollowUpDate.toISOString(),"2026-10-25T04:00:00.000Z");
  await assert.rejects(() => f.crm.saveFollowUp(row.id,{status:"COMPLETED"},actor),/outcome/);
  await f.crm.saveFollowUp(row.id,{status:"COMPLETED",outcome:"Parent contacted"},actor);
  assert.equal(f.state().workFollowUps.length,1); assert.equal(f.state().workFollowUps[0].status,"COMPLETED"); assert.equal(f.state().enquiry.nextFollowUpDate,null);
  await assert.rejects(() => f.crm.saveFollowUp(row.id,{status:"PENDING"},actor),/cannot be reopened/);
  const next = await f.crm.saveFollowUp(null,{enquiryId,assignedStaffId:"staff",dueAt:"2026-10-26T04:00:00Z",method:"WHATSAPP"},actor);
  await f.crm.saveFollowUp(next.id,{status:"CANCELLED"},actor); assert.equal(f.state().workFollowUps.length,2);
});
test("visits prevent staff conflicts, persist completion and update the enquiry stage", async () => {
  const f = fixture(); f.state().enquiry.status = "CONTACTED";
  const dto = {enquiryId,assignedStaffId:"staff",startAt:"2026-10-26T04:00:00Z",endAt:"2026-10-26T04:30:00Z"};
  const row = await f.crm.saveVisit(null,dto,actor);
  await assert.rejects(() => f.crm.saveVisit(null,dto,actor),/already has a visit/);
  await f.crm.saveVisit(row.id,{status:"COMPLETED",feedback:"Family toured the school"},actor);
  assert.equal(f.state().visits.length,1); assert.equal(f.state().enquiry.status,"VISIT_COMPLETED");
  assert.ok(f.state().activities.some(row => row.summary.includes("completed")));
});
test("tasks persist completion and prevent unauthorized reassignment", async () => {
  const f = fixture();
  const row = await f.crm.saveTask(null,{title:"Contact the parent",assignedStaffId:"staff",dueAt:"2026-10-24T04:00:00Z",enquiryId},actor);
  await assert.rejects(() => f.crm.saveTask(row.id,{assignedStaffId:"other"},staff),/Only managers/);
  await f.crm.saveTask(row.id,{status:"COMPLETED"},staff);
  assert.equal(f.state().workTasks.length,1); assert.equal(f.state().workTasks[0].status,"COMPLETED");
  await assert.rejects(() => f.crm.saveTask(row.id,{status:"PENDING"},staff),/retained/);
});
test("private uploads validate actual signatures and return metadata without bytes or public URLs", async () => {
  const f = fixture(); await f.admissions.create(application,actor);
  await assert.rejects(() => f.crm.uploadDocument(admissionId,"OTHER",{buffer:Buffer.from("<svg></svg>"),originalname:"image.pdf"},actor),/valid PDF/);
  const row = await f.crm.uploadDocument(admissionId,"OTHER",{buffer:Buffer.from("%PDF-1.7 test"),originalname:'private"\\name.pdf'},actor);
  assert.equal(row.content,undefined); assert.equal(row.url,undefined);
  assert.equal(f.state().documents.at(-1).contentType,"application/pdf");
});
test("DTOs reject unknown fields, invalid scheduling methods and malformed attendance batches", async () => {
  const pipe = new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
  for (const payload of [{enquiryId,assignedStaffId:classId,dueAt:"2026-10-24T04:00:00Z",method:"FAX"},{enquiryId,assignedStaffId:classId,dueAt:"bad",method:"CALL"},{enquiryId,assignedStaffId:classId,dueAt:"2026-10-24T04:00:00Z",method:"CALL",isAdmin:true}]) await assert.rejects(() => pipe.transform(payload,{type:"body",metatype:FollowUpTaskDto}));
  await assert.rejects(() => pipe.transform({day:"2026-10-22",entries:[{studentId:enquiryId,status:"UNKNOWN"}]},{type:"body",metatype:AttendanceBatchDto}));
  await assert.rejects(() => pipe.transform({enquiryId,assignedStaffId:classId,startAt:"bad",endAt:"bad"},{type:"body",metatype:VisitDto}));
});
test("audit redaction is recursive and CSV neutralizes spreadsheet formulas", () => {
  const clean = sanitizeAudit({status:"APPROVED", nested:[{password:"secret",phone:"9876543210",notes:"private",role:"STAFF"}]});
  assert.equal(clean.nested[0].password,"[redacted]"); assert.equal(clean.nested[0].phone,"[redacted]"); assert.equal(clean.status,"APPROVED");
  const csv = toSafeCsv([{name:"=HYPERLINK(test)",note:"+SUM(1)",safe:"School"}]);
  assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes("'+SUM")); assert.ok(!JSON.stringify(clean).includes("9876543210"));
});
test("HTTP access matrix protects private documents, settings and attendance for all school roles", async () => {
  const f = fixture(); await f.admissions.create(application,actor);
  const documentId = "55555555-5555-4555-8555-555555555555";
  f.state().documents.push({id:documentId,admissionId,type:"OTHER",filename:"private.pdf",contentType:"application/pdf",content:Buffer.from("%PDF-test")});
  const original = process.env.JWT_ACCESS_SECRET; process.env.JWT_ACCESS_SECRET = "crm-role-http-test";
  const roles = {admin:"ADMIN",manager:"ADMISSION_MANAGER",staff:"COUNSELLOR",other:"COUNSELLOR",teacher:"TEACHER",accountant:"ACCOUNTANT",editor:"CMS_EDITOR"};
  class TestModule {}
  Module({controllers:[CrmController],providers:[JwtService,{provide:PrismaService,useValue:{user:{findFirst:async ({where}) => roles[where.id] ? {...actor,id:where.id,role:roles[where.id]} : null}}},{provide:CrmService,useValue:f.crm},{provide:EnquiriesService,useValue:f.enquiries}]})(TestModule);
  const app = await NestFactory.create(TestModule,{logger:false}); app.setGlobalPrefix("api/v1"); app.use(cookieParser()); app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));
  await app.listen(0,"127.0.0.1"); const base = await app.getUrl(); const jwt = new JwtService();
  const headers = subject => subject ? {Cookie:authCookieNames().access+"="+jwt.sign({sub:subject,type:"access",role:"ADMIN"},{secret:process.env.JWT_ACCESS_SECRET})} : {};
  try {
    for (const [subject,status] of [[null,401],["admin",200],["manager",200],["staff",200],["other",404],["accountant",403],["teacher",403],["editor",403]]) {
      const response = await fetch(base+"/api/v1/crm/applications/"+admissionId+"/documents/"+documentId,{headers:headers(subject)});
      assert.equal(response.status,status,String(subject));
      if(status===200) { assert.equal(response.headers.get("cache-control"),"private, no-store"); assert.ok((await response.text()).startsWith("%PDF")); }
    }
    for (const subject of ["staff","teacher","accountant","editor"]) assert.equal((await fetch(base+"/api/v1/crm/settings",{headers:headers(subject)})).status,403,subject);
    assert.equal((await fetch(base+"/api/v1/crm/attendance",{method:"POST",headers:{...headers("teacher"),"Content-Type":"application/json"},body:JSON.stringify({day:"bad",entries:[]})})).status,400);
    assert.equal((await fetch(base+"/api/v1/crm/attendance",{method:"POST",headers:{...headers("staff"),"Content-Type":"application/json"},body:"{}"})).status,403);
  } finally { await app.close(); if(original===undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET=original; }
});

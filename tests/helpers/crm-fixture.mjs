// Transaction doubles verify service contracts; they do not prove PostgreSQL locking.
export const yearId = "33333333-3333-4333-8333-333333333333";
export const classId = "44444444-4444-4444-8444-444444444444";
export function createCrmFixture({ enquiryId, admissionId, actor, AdmissionsService, EnquiriesService }) {
  let state = {
    admissions: [], students: [], audit: [], followUps: [], activities: [],
    documents: [{ id: "birth", admissionId, type: "BIRTH_CERTIFICATE" }, { id: "photo", admissionId, type: "CHILD_PHOTO" }],
    class: { id: classId, name: "Pre-KG", active: true, academicYearId: yearId, academicYear: { id: yearId, active: true }, capacity: null },
    enquiry: { id: enquiryId, status: "NEW", parentName: "Parent", studentName: "Child Example", phone: "+919876543210", email: "parent@example.test", whatsapp: null, studentDob: new Date("2022-01-01T00:00:00Z"), assignedStaffId: "staff", academicYearId: yearId, archivedAt: null },
  };
  const events = [];
  let failEnquiryUpdate = false, failAudit = false, serial = Promise.resolve();
  const clean = data => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  const db = {
    $executeRaw: async () => 1,
    $queryRaw: async (parts) => { events.push("lock:" + (Array.isArray(parts) ? parts.join("?") : parts.sql)); return []; },
    academicYear: { findFirst: async ({ where }) => where.id && where.id !== yearId ? null : { id: yearId, current: true, active: true } },
    crmSetting: { findUnique: async () => null },
    enquiry: {
      findUnique: async () => { events.push("read:enquiry"); return structuredClone(state.enquiry); },
      findFirst: async ({ where }) => state.enquiry.normalizedPhone === where.normalizedPhone && state.enquiry.studentName.toLowerCase() === where.studentName.equals.toLowerCase() ? structuredClone(state.enquiry) : null,
      create: async ({ data }) => { events.push({ publicSource: data.source }); state.enquiry = { ...state.enquiry, ...clean(data), id: enquiryId }; return structuredClone(state.enquiry); },
      update: async ({ data }) => { if (failEnquiryUpdate) throw new Error("stage write failed"); Object.assign(state.enquiry, clean(data)); return structuredClone(state.enquiry); },
      findMany: async query => { events.push(query); return [structuredClone(state.enquiry)]; },
      count: async () => 51,
    },
    admission: {
      findUnique: async ({ where }) => { events.push("read:admission"); const row = state.admissions.find(row => row.id === where.id); return row ? structuredClone({ ...row, enquiry: state.enquiry }) : null; },
      findFirst: async ({ where }) => state.admissions.find(row => row.enquiryId === where.enquiryId && row.id !== where.id?.not && !row.archivedAt && !where.status.notIn.includes(row.status)) ?? null,
      count: async () => state.admissions.length,
      create: async ({ data }) => { const row = { id: admissionId, status: "APPLICATION", admissionNumber: null, archivedAt: null, ...clean(data) }; state.admissions.push(row); return structuredClone(row); },
      update: async ({ where, data }) => { const row = state.admissions.find(row => row.id === where.id); Object.assign(row, clean(data)); return structuredClone(row); },
    },
    student: {
      create: async ({ data }) => { const row = { id: "student-" + state.students.length, ...clean(data), status: "ACTIVE" }; state.students.push(row); return structuredClone(row); },
      findUnique: async ({ where }) => structuredClone(state.students.find(row => row.admissionNumber === where.admissionNumber || where.id && row.id === where.id) ?? null),
      count: async ({ where }) => state.students.filter(row => (!where?.classLevelId || row.classLevelId === where.classLevelId) && (!where?.id?.not || row.id !== where.id.not)).length,
    },
    classLevel: { findFirst: async ({ where }) => where.id && where.id !== classId ? null : structuredClone(state.class), findUnique: async () => structuredClone(state.class) },
    section: { findFirst: async () => ({ id: "section", classLevelId: "other-class", active: true }), findUnique: async () => ({ id: "section", classLevelId: "other-class", active: true, capacity: null }) },
    applicationDocument: { findMany: async ({ where }) => structuredClone(state.documents.filter(row => row.admissionId === where.admissionId)) },
    auditLog: { create: async ({ data }) => { if (failAudit) throw new Error("audit failed"); const row = { id: "audit-" + state.audit.length, ...data }; state.audit.push(row); return row; }, findMany: async () => structuredClone(state.audit) },
    enquiryActivity: { create: async ({ data }) => { const row = { id: "activity-" + state.activities.length, ...data }; state.activities.push(row); return row; } },
    enquiryFollowUp: { create: async ({ data }) => { const row = { id: "contact-" + state.followUps.length, ...data }; state.followUps.push(row); return row; } },
    user: { findFirst: async ({ where }) => where.id === "inactive" ? null : actor },
    $transaction: callback => {
      const run = serial.then(async () => { const before = structuredClone(state); try { return await callback(db); } catch (error) { state = before; throw error; } });
      serial = run.catch(() => {}); return run;
    },
  };
  let sequence = 0;
  const sequences = { next: async prefix => prefix + "-" + ++sequence };
  return { db, admissions: new AdmissionsService(db, sequences), enquiries: new EnquiriesService(db, sequences, { sendNewEnquiry: async () => {} }), events, state: () => state, failStage: () => { failEnquiryUpdate = true; }, failAudit: () => { failAudit = true; } };
}

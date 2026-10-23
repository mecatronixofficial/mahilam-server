BEGIN;
-- Apply schema and compatibility checks atomically on PostgreSQL 12+.
-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'ADMISSION_MANAGER';
ALTER TYPE "Role" ADD VALUE 'COUNSELLOR';
ALTER TYPE "Role" ADD VALUE 'ACCOUNTANT';
ALTER TYPE "Role" ADD VALUE 'TEACHER';
ALTER TYPE "Role" ADD VALUE 'CMS_EDITOR';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EnquiryStatus" ADD VALUE 'NEW_ENQUIRY';
ALTER TYPE "EnquiryStatus" ADD VALUE 'QUALIFIED';
ALTER TYPE "EnquiryStatus" ADD VALUE 'VISIT_COMPLETED';
ALTER TYPE "EnquiryStatus" ADD VALUE 'DOCUMENTS_PENDING';
ALTER TYPE "EnquiryStatus" ADD VALUE 'APPLICATION_SUBMITTED';
ALTER TYPE "EnquiryStatus" ADD VALUE 'APPROVED';
ALTER TYPE "EnquiryStatus" ADD VALUE 'ENROLLED';
ALTER TYPE "EnquiryStatus" ADD VALUE 'WAITLISTED';
ALTER TYPE "EnquiryStatus" ADD VALUE 'REJECTED';
ALTER TYPE "EnquiryStatus" ADD VALUE 'LOST';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdmissionStatus" ADD VALUE 'DRAFT';
ALTER TYPE "AdmissionStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "AdmissionStatus" ADD VALUE 'APPROVED';
ALTER TYPE "AdmissionStatus" ADD VALUE 'WAITLISTED';
ALTER TYPE "AdmissionStatus" ADD VALUE 'ENROLLED';

-- AlterTable
ALTER TABLE "ClassLevel" ADD COLUMN     "capacity" INTEGER;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "academicYearId" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Guardian" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "communicationPreferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "consentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Enquiry" ADD COLUMN     "academicYearId" TEXT,
ADD COLUMN     "alternatePhone" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "lostReason" TEXT,
ADD COLUMN     "normalizedPhone" TEXT,
ADD COLUMN     "preferredVisitAt" TIMESTAMP(3),
ADD COLUMN     "previousSchool" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'ADMISSION';

-- AlterTable
ALTER TABLE "EnquiryFollowUp" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Admission" ADD COLUMN     "academicYearId" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "alternatePhone" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "childDob" TIMESTAMP(3),
ADD COLUMN     "classLevelId" TEXT,
ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "decisionReason" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "emergencyContact" TEXT,
ADD COLUMN     "parentName" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "previousSchool" TEXT,
ADD COLUMN     "requiredDocuments" TEXT[] DEFAULT ARRAY['BIRTH_CERTIFICATE', 'CHILD_PHOTO']::TEXT[],
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "studentId" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StudentFee" ADD COLUMN     "feeStructureId" TEXT;

-- CreateTable
CREATE TABLE "EnquiryActivity" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnquiryActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpTask" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "assignedStaffId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT,
    "outcome" TEXT,
    "status" "WorkStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitSlot" (
    "id" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VisitSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolVisit" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "assignedStaffId" TEXT NOT NULL,
    "slotId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'SCHEDULED',
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "WorkStatus" NOT NULL DEFAULT 'PENDING',
    "assignedStaffId" TEXT NOT NULL,
    "enquiryId" TEXT,
    "admissionId" TEXT,
    "studentId" TEXT,
    "visitId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationDocument" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "notes" TEXT,
    "markedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "outcome" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "EnquiryAttachment" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnquiryAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnquiryActivity_enquiryId_createdAt_idx" ON "EnquiryActivity"("enquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "FollowUpTask_assignedStaffId_status_dueAt_idx" ON "FollowUpTask"("assignedStaffId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "FollowUpTask_enquiryId_status_dueAt_idx" ON "FollowUpTask"("enquiryId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "VisitSlot_startAt_key" ON "VisitSlot"("startAt");

-- CreateIndex
CREATE INDEX "SchoolVisit_assignedStaffId_startAt_idx" ON "SchoolVisit"("assignedStaffId", "startAt");

-- CreateIndex
CREATE INDEX "SchoolVisit_enquiryId_status_idx" ON "SchoolVisit"("enquiryId", "status");

-- CreateIndex
CREATE INDEX "SchoolVisit_slotId_status_idx" ON "SchoolVisit"("slotId", "status");

-- CreateIndex
CREATE INDEX "CrmTask_assignedStaffId_status_dueAt_idx" ON "CrmTask"("assignedStaffId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ApplicationDocument_admissionId_type_idx" ON "ApplicationDocument"("admissionId", "type");

-- CreateIndex
CREATE INDEX "AttendanceRecord_day_status_idx" ON "AttendanceRecord"("day", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_studentId_day_key" ON "AttendanceRecord"("studentId", "day");

-- CreateIndex
CREATE INDEX "CommunicationLog_enquiryId_createdAt_idx" ON "CommunicationLog"("enquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "EnquiryAttachment_enquiryId_createdAt_idx" ON "EnquiryAttachment"("enquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "Enquiry_assignedStaffId_archivedAt_createdAt_idx" ON "Enquiry"("assignedStaffId", "archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Enquiry_academicYearId_status_idx" ON "Enquiry"("academicYearId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_studentId_key" ON "Admission"("studentId");

-- CreateIndex
CREATE INDEX "Admission_academicYearId_status_idx" ON "Admission"("academicYearId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFee_studentId_feeStructureId_key" ON "StudentFee"("studentId", "feeStructureId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFee" ADD CONSTRAINT "StudentFee_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryActivity" ADD CONSTRAINT "EnquiryActivity_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolVisit" ADD CONSTRAINT "SchoolVisit_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolVisit" ADD CONSTRAINT "SchoolVisit_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolVisit" ADD CONSTRAINT "SchoolVisit_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "VisitSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "SchoolVisit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryAttachment" ADD CONSTRAINT "EnquiryAttachment_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Compatibility backfills derive values only from existing explicit links.
UPDATE "Enquiry" SET "normalizedPhone" =
  CASE WHEN length(regexp_replace("phone", '[^0-9]', '', 'g')) = 12
         AND left(regexp_replace("phone", '[^0-9]', '', 'g'), 2) = '91'
       THEN right(regexp_replace("phone", '[^0-9]', '', 'g'), 10)
       ELSE regexp_replace("phone", '[^0-9]', '', 'g') END;
UPDATE "Student" s SET "academicYearId" = c."academicYearId"
  FROM "ClassLevel" c WHERE s."classLevelId" = c."id" AND s."academicYearId" IS NULL;
UPDATE "Admission" a SET "studentId" = s."id"
  FROM "Student" s WHERE a."admissionNumber" = s."admissionNumber" AND a."studentId" IS NULL;

-- Abort for manual reconciliation rather than deleting/merging historical rows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AcademicYear" WHERE "current" = true GROUP BY "current" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'CRM migration: multiple current academic years require manual reconciliation';
  END IF;
  IF EXISTS (SELECT 1 FROM "Admission" WHERE "enquiryId" IS NOT NULL AND "archivedAt" IS NULL AND "status" NOT IN ('REJECTED', 'CANCELLED') GROUP BY "enquiryId" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'CRM migration: duplicate active applications require manual reconciliation';
  END IF;
  IF EXISTS (SELECT 1 FROM "StudentGuardian" WHERE "primary" = true GROUP BY "studentId" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'CRM migration: multiple primary guardians require manual reconciliation';
  END IF;
END $$;
CREATE UNIQUE INDEX "AcademicYear_one_current_key" ON "AcademicYear" ("current") WHERE "current" = true;
CREATE UNIQUE INDEX "Admission_one_active_enquiry_key" ON "Admission" ("enquiryId")
  WHERE "enquiryId" IS NOT NULL AND "archivedAt" IS NULL AND "status" NOT IN ('REJECTED', 'CANCELLED');
CREATE UNIQUE INDEX "StudentGuardian_one_primary_key" ON "StudentGuardian" ("studentId") WHERE "primary" = true;
ALTER TABLE "ClassLevel" ADD CONSTRAINT "ClassLevel_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "VisitSlot" ADD CONSTRAINT "VisitSlot_valid_interval" CHECK ("endAt" > "startAt" AND "capacity" > 0);
ALTER TABLE "SchoolVisit" ADD CONSTRAINT "SchoolVisit_valid_interval" CHECK ("endAt" > "startAt");
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_size_valid" CHECK ("size" > 0 AND "size" <= 5242880 AND octet_length("content") = "size");

ALTER TABLE "EnquiryAttachment" ADD CONSTRAINT "EnquiryAttachment_size_valid" CHECK ("size" > 0 AND "size" <= 5242880 AND octet_length("content") = "size");

COMMIT;

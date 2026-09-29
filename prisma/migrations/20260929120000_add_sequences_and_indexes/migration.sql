-- CreateTable
CREATE TABLE "Sequence" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("key")
);

-- Seed counters from existing numbers (format LM-<PREFIX>-<YEAR>-<N>) so new numbers never collide.
INSERT INTO "Sequence" ("key", "value", "updatedAt")
SELECT split_part(n, '-', 2) || '-' || split_part(n, '-', 3), MAX(CAST(split_part(n, '-', 4) AS INTEGER)), CURRENT_TIMESTAMP
FROM (
    SELECT "enquiryNumber" AS n FROM "Enquiry"
    UNION ALL SELECT "admissionNumber" FROM "Student"
    UNION ALL SELECT "applicationNumber" FROM "Admission"
    UNION ALL SELECT "receiptNumber" FROM "Payment"
) numbers
WHERE n ~ '^LM-[A-Z]+-[0-9]{4}-[0-9]{1,9}$'
GROUP BY 1;

-- CreateIndex
CREATE INDEX "RefreshSession_tokenHash_idx" ON "RefreshSession"("tokenHash");
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");
CREATE INDEX "Section_classLevelId_idx" ON "Section"("classLevelId");
CREATE INDEX "Student_sectionId_idx" ON "Student"("sectionId");
CREATE INDEX "Student_status_idx" ON "Student"("status");
CREATE INDEX "Student_createdAt_idx" ON "Student"("createdAt");
CREATE INDEX "StudentGuardian_guardianId_idx" ON "StudentGuardian"("guardianId");
CREATE INDEX "Enquiry_createdAt_idx" ON "Enquiry"("createdAt");
CREATE INDEX "Enquiry_nextFollowUpDate_idx" ON "Enquiry"("nextFollowUpDate");
CREATE INDEX "EnquiryFollowUp_enquiryId_createdAt_idx" ON "EnquiryFollowUp"("enquiryId", "createdAt");
CREATE INDEX "Admission_status_idx" ON "Admission"("status");
CREATE INDEX "Admission_createdAt_idx" ON "Admission"("createdAt");
CREATE INDEX "Admission_enquiryId_idx" ON "Admission"("enquiryId");
CREATE INDEX "FeeStructure_feeTypeId_idx" ON "FeeStructure"("feeTypeId");
CREATE INDEX "FeeStructure_className_academicYear_idx" ON "FeeStructure"("className", "academicYear");
CREATE INDEX "StudentFee_studentId_idx" ON "StudentFee"("studentId");
CREATE INDEX "StudentFee_status_dueDate_idx" ON "StudentFee"("status", "dueDate");
CREATE INDEX "Payment_studentFeeId_idx" ON "Payment"("studentFeeId");
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");
CREATE INDEX "Announcement_active_priority_idx" ON "Announcement"("active", "priority");
CREATE INDEX "Banner_active_displayOrder_idx" ON "Banner"("active", "displayOrder");
CREATE INDEX "GalleryItem_albumId_displayOrder_idx" ON "GalleryItem"("albumId", "displayOrder");
CREATE INDEX "BlogPost_status_publishedAt_idx" ON "BlogPost"("status", "publishedAt");
CREATE INDEX "Testimonial_active_featured_displayOrder_idx" ON "Testimonial"("active", "featured", "displayOrder");
CREATE INDEX "SchoolEvent_active_startDate_idx" ON "SchoolEvent"("active", "startDate");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

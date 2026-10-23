import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { Auth } from "../common/decorators/auth.decorator.js";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator.js";
import { EnquiriesService } from "../enquiries/enquiries.service.js";
import { EnquiryQueryDto } from "../enquiries/dto/create-enquiry.dto.js";
import { CrmService } from "./crm.service.js";
import { AdmissionSettingsDto, AttendanceBatchDto, CommunicationDto, CrmQueryDto, DocumentTypeDto, FollowUpTaskDto, GuardianDto, GuardianLinkDto, NoteDto, SlotDto, TaskDto, TemplateDto, UpdateFollowUpTaskDto, UpdateGuardianRecordDto, UpdateTaskDto, UpdateTemplateDto, UpdateVisitDto, VisitDto } from "./crm.dto.js";
import { toSafeCsv } from "../common/utils/csv.js";
const managerRoles = ["ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER"] as const;
const schoolRoles = ["ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER", "ACCOUNTANT"] as const;
@ApiTags("crm")
@Controller("crm")
@Auth()
export class CrmController {
  constructor(private s: CrmService, private enquiries: EnquiriesService) {}
  @Get("dashboard") async dashboard(@Query() q: CrmQueryDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.dashboard(q, u) }; }
  @Get("pipeline") pipeline(@Query() q: EnquiryQueryDto, @CurrentUser() u: AuthUser) { return this.enquiries.list(q, u); }
  @Get("enquiries/:id/activities") activities(@Param("id", ParseUUIDPipe) id: string, @Query() q: CrmQueryDto, @CurrentUser() u: AuthUser) { return this.s.activities(id, q, u); }
  @Post("enquiries/:id/notes") async note(@Param("id", ParseUUIDPipe) id: string, @Body() dto: NoteDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.note(id, dto.notes, u) }; }
  @Get("follow-ups") followUps(@Query() q: CrmQueryDto, @CurrentUser() u: AuthUser) { return this.s.listFollowUps(q, u); }
  @Post("follow-ups") async createFollowUp(@Body() dto: FollowUpTaskDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.saveFollowUp(null, dto, u) }; }
  @Patch("follow-ups/:id") async updateFollowUp(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateFollowUpTaskDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.saveFollowUp(id, dto, u) }; }
  @Get("visits") visits(@Query() q: CrmQueryDto, @CurrentUser() u: AuthUser) { return this.s.listVisits(q, u); }
  @Post("visits") async createVisit(@Body() dto: VisitDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.saveVisit(null, dto, u) }; }
  @Patch("visits/:id") async updateVisit(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateVisitDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.saveVisit(id, dto, u) }; }
  @Get("visit-slots") @Auth("ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER", "STAFF", "COUNSELLOR")
  async slots(@Query() q: CrmQueryDto) { return { success: true, data: await this.s.slots(q) }; }
  @Post("visit-slots") @Auth(...managerRoles)
  async slot(@Body() dto: SlotDto) { return { success: true, data: await this.s.saveSlot(dto) }; }
  @Get("tasks") tasks(@Query() q: CrmQueryDto, @CurrentUser() u: AuthUser) { return this.s.listTasks(q, u); }
  @Post("tasks") async createTask(@Body() dto: TaskDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.saveTask(null, dto, u) }; }
  @Patch("tasks/:id") async updateTask(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.saveTask(id, dto, u) }; }
  @Get("guardians") @Auth(...schoolRoles)
  guardians(@Query() q: CrmQueryDto) { return this.s.listGuardians(q); }
  @Get("guardians/:id") @Auth(...schoolRoles)
  async guardian(@Param("id", ParseUUIDPipe) id: string) { return { success: true, data: await this.s.guardian(id) }; }
  @Post("guardians") @Auth(...managerRoles)
  async createGuardian(@Body() dto: GuardianDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.saveGuardian(null, dto, u) }; }
  @Patch("guardians/:id") @Auth(...managerRoles)
  async updateGuardian(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateGuardianRecordDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.saveGuardian(id, dto, u) }; }
  @Post("guardians/:id/students") @Auth(...managerRoles)
  async linkGuardian(@Param("id", ParseUUIDPipe) id: string, @Body() dto: GuardianLinkDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.linkGuardian(id, dto, u) }; }
  @Delete("guardians/:id/students") @Auth(...managerRoles)
  async unlinkGuardian(@Param("id", ParseUUIDPipe) id: string, @Body() dto: GuardianLinkDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.linkGuardian(id, dto, u, true) }; }
  @Delete("guardians/:id") @Auth(...managerRoles)
  async archiveGuardian(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.archiveGuardian(id, u) }; }
  @Get("attendance") @Auth("ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER", "TEACHER")
  attendance(@Query() q: CrmQueryDto) { return this.s.attendance(q); }
  @Post("attendance") @Auth("ADMIN", "SUPER_ADMIN", "TEACHER")
  async markAttendance(@Body() dto: AttendanceBatchDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.markAttendance(dto, u) }; }
  @Get("templates") @Auth("ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER", "COUNSELLOR", "STAFF")
  async templates() { return { success: true, data: await this.s.templates() }; }
  @Post("templates") @Auth(...managerRoles)
  async createTemplate(@Body() dto: TemplateDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.saveTemplate(null, dto, u) }; }
  @Patch("templates/:id") @Auth(...managerRoles)
  async updateTemplate(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.saveTemplate(id, dto, u) }; }
  @Get("communications") communications(@Query() q: CrmQueryDto, @CurrentUser() u: AuthUser) { return this.s.communications(q, u); }
  @Post("communications") async communication(@Body() dto: CommunicationDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.communication(dto, u) }; }
  @Get("defaults") @Auth("ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER", "COUNSELLOR", "STAFF")
  async defaults() { const settings = await this.s.settings(); const days = settings && typeof settings === "object" && !Array.isArray(settings) ? settings.followUpDefaultDays : undefined; return { success: true, data: { followUpDefaultDays: typeof days === "number" ? days : 2 } }; }
  @Get("settings") @Auth(...managerRoles)
  async settings() { return { success: true, data: await this.s.settings() }; }
  @Patch("settings") @Auth("ADMIN", "SUPER_ADMIN")
  async saveSettings(@Body() dto: AdmissionSettingsDto, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.saveSettings(dto, u) }; }
  @Get("enquiries/:id/attachments")
  async attachments(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.attachments(id, u) }; }
  @Post("enquiries/:id/attachments") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async uploadAttachment(@Param("id", ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() u: AuthUser) {
    if (!file) throw new BadRequestException("Choose a private PDF, PNG, JPEG or WebP document");
    return { success: true, data: await this.s.uploadAttachment(id, file, u) };
  }
  @Get("enquiries/:id/attachments/:attachmentId")
  async attachment(@Param("id", ParseUUIDPipe) id: string, @Param("attachmentId", ParseUUIDPipe) attachmentId: string, @CurrentUser() u: AuthUser, @Res() res: Response) {
    const doc = await this.s.attachment(id, attachmentId, u);
    res.set({ "Content-Type": doc.contentType, "Content-Disposition": `attachment; filename="${doc.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }).end(Buffer.from(doc.content));
  }
  @Delete("enquiries/:id/attachments/:attachmentId")
  async archiveAttachment(@Param("id", ParseUUIDPipe) id: string, @Param("attachmentId", ParseUUIDPipe) attachmentId: string, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.archiveAttachment(id, attachmentId, u) }; }
  @Post("applications/:id/documents") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 } }))
  async upload(@Param("id", ParseUUIDPipe) id: string, @Body() dto: DocumentTypeDto, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() u: AuthUser) {
    if (!file) throw new BadRequestException("Choose a PDF, PNG, JPEG or WebP document up to 5 MB");
    return { success: true, data: await this.s.uploadDocument(id, dto.type, file, u) };
  }
  @Get("applications/:id/documents/:documentId")
  async document(@Param("id", ParseUUIDPipe) id: string, @Param("documentId", ParseUUIDPipe) documentId: string, @CurrentUser() u: AuthUser, @Res() res: Response) {
    const doc = await this.s.document(id, documentId, u);
    res.set({ "Content-Type": doc.contentType, "Content-Disposition": `attachment; filename="${doc.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    res.end(Buffer.from(doc.content));
  }
  @Delete("applications/:id/documents/:documentId")
  async removeDocument(@Param("id", ParseUUIDPipe) id: string, @Param("documentId", ParseUUIDPipe) documentId: string, @CurrentUser() u: AuthUser) { return { success: true, data: await this.s.removeDocument(id, documentId, u) }; }
  @Get("reports/:kind/export")
  @Auth("ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER", "ACCOUNTANT", "TEACHER")
  async export(@Param("kind") kind: string, @Query() q: CrmQueryDto, @CurrentUser() u: AuthUser, @Res() res: Response) {
    if (u.role === "TEACHER" && kind !== "attendance") throw new BadRequestException("Teachers may export attendance only");
    const rows: Record<string, unknown>[] = [];
    for (let page = 1; ; page++) {
      const result = await this.s.report(kind, { ...q, page, limit: 200 }, u) as unknown as { data: Record<string, unknown>[]; meta?: { pages: number } };
      rows.push(...result.data);
      if (!result.meta || page >= result.meta.pages) break;
      if (rows.length >= 100_000) throw new BadRequestException("Narrow the export filters to fewer than 100,000 records");
    }
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="little-mahilam-${kind}.csv"`, "Cache-Control": "private, no-store" }).send(toSafeCsv(rows));
  }
  @Get("reports/:kind") async report(@Param("kind") kind: string, @Query() q: CrmQueryDto, @CurrentUser() u: AuthUser) { return this.s.report(kind, q, u); }
}

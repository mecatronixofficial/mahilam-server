import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AdminOnly, Auth } from "../common/decorators/auth.decorator.js";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator.js";
import { AdmissionsService } from "./admissions.service.js";
import { AdmissionQueryDto, ConfirmAdmissionDto, CreateAdmissionDto, ReviewAdmissionDto, UpdateAdmissionDto } from "./dto/create-admission.dto.js";
@ApiTags("admissions")
@Controller("admissions")
@Auth()
export class AdmissionsController {
  constructor(private s: AdmissionsService) {}
  @Get() list(@Query() query: AdmissionQueryDto, @CurrentUser() actor: AuthUser) { return this.s.list(query, actor); }
  @Post() async create(@Body() dto: CreateAdmissionDto, @CurrentUser() actor: AuthUser) { return { success: true, data: await this.s.create(dto, actor) }; }
  @Get(":id") async detail(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) { return { success: true, data: await this.s.detail(id, actor) }; }
  @Patch(":id") async update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAdmissionDto, @CurrentUser() actor: AuthUser) { return { success: true, data: await this.s.update(id, dto, actor) }; }
  @Post(":id/submit") async submit(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) { return { success: true, data: await this.s.submit(id, actor) }; }
  @Post(":id/review") @Auth("ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER")
  async review(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewAdmissionDto, @CurrentUser() actor: AuthUser) { return { success: true, data: await this.s.review(id, dto, actor) }; }
  @Post(":id/confirm") @Auth("ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER")
  async confirm(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ConfirmAdmissionDto, @CurrentUser() actor: AuthUser) { return { success: true, message: "Student enrollment saved", data: await this.s.confirm(id, dto, actor) }; }
  @Post(":id/enroll") @Auth("ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER")
  async enroll(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ConfirmAdmissionDto, @CurrentUser() actor: AuthUser) { return { success: true, data: await this.s.confirm(id, dto, actor) }; }
  @Delete(":id") @AdminOnly()
  async remove(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) { await this.s.remove(id, actor); return { success: true }; }
}

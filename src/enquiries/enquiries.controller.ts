import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AdminOnly, Auth } from "../common/decorators/auth.decorator.js";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator.js";
import { EnquiriesService } from "./enquiries.service.js";
import { AssignmentDto, BulkAssignmentDto, CreateEnquiryDto, CreateFollowUpDto, CreateInternalEnquiryDto, EnquiryQueryDto, UpdateEnquiryDto } from "./dto/create-enquiry.dto.js";
@ApiTags("enquiries")
@Controller("enquiries")
export class EnquiriesController {
  constructor(private s: EnquiriesService) {}
  @Post("public") @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async createPublic(@Body() dto: CreateEnquiryDto) { return { success: true, message: "Enquiry submitted successfully", data: await this.s.create(dto) }; }
  @Get() @Auth()
  list(@Query() query: EnquiryQueryDto, @CurrentUser() user: AuthUser) { return this.s.list(query, user); }
  @Post() @Auth()
  async createInternal(@Body() dto: CreateInternalEnquiryDto, @CurrentUser() user: AuthUser) { return { success: true, data: await this.s.createInternal(dto, user) }; }
  @Patch("bulk-assignment") @Auth("ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER")
  async bulk(@Body() dto: BulkAssignmentDto, @CurrentUser() user: AuthUser) { return { success: true, data: await this.s.bulkAssign(dto.ids, dto.assignedStaffId, user) }; }
  @Get(":id") @Auth()
  async detail(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return { success: true, data: await this.s.detail(id, user) }; }
  @Patch(":id") @Auth()
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateEnquiryDto, @CurrentUser() user: AuthUser) { return { success: true, data: await this.s.update(id, dto, user) }; }
  @Patch(":id/stage") @Auth()
  async stage(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateEnquiryDto, @CurrentUser() user: AuthUser) { return { success: true, data: await this.s.update(id, dto, user) }; }
  @Patch(":id/assignment") @Auth("ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER")
  async assignment(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AssignmentDto, @CurrentUser() user: AuthUser) { return { success: true, data: await this.s.bulkAssign([id], dto.assignedStaffId, user) }; }
  @Post(":id/restore") @Auth("ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER")
  async restore(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return { success: true, data: await this.s.archive(id, false, user) }; }
  @Delete(":id") @AdminOnly()
  async remove(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { await this.s.remove(id, user); return { success: true }; }
  @Post(":id/follow-ups") @Auth()
  async addFollowUp(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CreateFollowUpDto, @CurrentUser() user: AuthUser) { return { success: true, data: await this.s.addFollowUp(id, dto, user.name, user) }; }
  @Delete(":id/follow-ups/:followUpId") @AdminOnly()
  async removeFollowUp(@Param("id", ParseUUIDPipe) id: string, @Param("followUpId", ParseUUIDPipe) followUpId: string, @CurrentUser() user: AuthUser) { await this.s.removeFollowUp(id, followUpId, user); return { success: true }; }
}

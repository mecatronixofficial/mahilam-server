import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AdminOnly, Auth } from "../common/decorators/auth.decorator.js";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator.js";
import { EnquiriesService } from "./enquiries.service.js";
import { CreateEnquiryDto, CreateFollowUpDto, CreateInternalEnquiryDto, EnquiryQueryDto, UpdateEnquiryDto } from "./dto/create-enquiry.dto.js";

@ApiTags("enquiries")
@Controller("enquiries")
export class EnquiriesController {
  constructor(private s: EnquiriesService) {}

  @Post("public")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async createPublic(@Body() dto: CreateEnquiryDto) {
    return { success: true, message: "Enquiry submitted successfully", data: await this.s.create(dto) };
  }

  @Get()
  @Auth()
  list(@Query() query: EnquiryQueryDto) {
    return this.s.list(query);
  }

  @Post()
  @Auth()
  async createInternal(@Body() dto: CreateInternalEnquiryDto) {
    return { success: true, data: await this.s.createInternal(dto) };
  }

  @Get(":id")
  @Auth()
  async detail(@Param("id", ParseUUIDPipe) id: string) {
    return { success: true, data: await this.s.detail(id) };
  }

  @Patch(":id")
  @Auth()
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateEnquiryDto) {
    return { success: true, data: await this.s.update(id, dto) };
  }

  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.s.remove(id);
    return { success: true };
  }

  @Post(":id/follow-ups")
  @Auth()
  async addFollowUp(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CreateFollowUpDto, @CurrentUser() user: AuthUser) {
    return { success: true, message: "Follow-up recorded", data: await this.s.addFollowUp(id, dto, user.name) };
  }

  @Delete(":id/follow-ups/:followUpId")
  @AdminOnly()
  async removeFollowUp(@Param("id", ParseUUIDPipe) id: string, @Param("followUpId", ParseUUIDPipe) followUpId: string) {
    await this.s.removeFollowUp(id, followUpId);
    return { success: true };
  }
}

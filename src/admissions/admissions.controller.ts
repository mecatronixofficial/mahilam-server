import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AdminOnly, Auth } from "../common/decorators/auth.decorator";
import { AdmissionsService } from "./admissions.service";
import { AdmissionQueryDto, ConfirmAdmissionDto, CreateAdmissionDto, UpdateAdmissionDto } from "./dto/create-admission.dto";

@ApiTags("admissions")
@Controller("admissions")
@Auth()
export class AdmissionsController {
  constructor(private s: AdmissionsService) {}

  @Get()
  list(@Query() query: AdmissionQueryDto) {
    return this.s.list(query);
  }

  @Post()
  async create(@Body() dto: CreateAdmissionDto) {
    return { success: true, data: await this.s.create(dto) };
  }

  @Get(":id")
  async detail(@Param("id", ParseUUIDPipe) id: string) {
    return { success: true, data: await this.s.detail(id) };
  }

  @Patch(":id")
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAdmissionDto) {
    return { success: true, data: await this.s.update(id, dto) };
  }

  @Post(":id/confirm")
  async confirm(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ConfirmAdmissionDto) {
    return { success: true, message: "Admission confirmed and student record created", data: await this.s.confirm(id, dto) };
  }

  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.s.remove(id);
    return { success: true };
  }
}

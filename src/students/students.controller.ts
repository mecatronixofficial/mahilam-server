import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AdminOnly, Auth } from "../common/decorators/auth.decorator";
import { StudentsService } from "./students.service";
import { CreateGuardianDto, CreateStudentDto, StudentQueryDto, UpdateGuardianDto, UpdateStudentDto } from "./dto/create-student.dto";

@ApiTags("students")
@Controller("students")
@Auth()
export class StudentsController {
  constructor(private s: StudentsService) {}

  @Get()
  list(@Query() query: StudentQueryDto) {
    return this.s.list(query);
  }

  @Post()
  async create(@Body() dto: CreateStudentDto) {
    return { success: true, message: "Student created", data: await this.s.create(dto) };
  }

  @Get(":id")
  async detail(@Param("id", ParseUUIDPipe) id: string) {
    return { success: true, data: await this.s.detail(id) };
  }

  @Patch(":id")
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateStudentDto) {
    return { success: true, data: await this.s.update(id, dto) };
  }

  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.s.remove(id);
    return { success: true };
  }

  @Post(":id/guardians")
  async addGuardian(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CreateGuardianDto) {
    return { success: true, message: "Guardian added", data: await this.s.addGuardian(id, dto) };
  }

  @Patch(":id/guardians/:guardianId")
  async updateGuardian(@Param("id", ParseUUIDPipe) id: string, @Param("guardianId", ParseUUIDPipe) guardianId: string, @Body() dto: UpdateGuardianDto) {
    return { success: true, data: await this.s.updateGuardian(id, guardianId, dto) };
  }

  @Delete(":id/guardians/:guardianId")
  async removeGuardian(@Param("id", ParseUUIDPipe) id: string, @Param("guardianId", ParseUUIDPipe) guardianId: string) {
    await this.s.removeGuardian(id, guardianId);
    return { success: true };
  }
}

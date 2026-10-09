import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AdminOnly, Auth } from "../common/decorators/auth.decorator.js";
import { AcademicsService } from "./academics.service.js";
import {
  CreateAcademicYearDto,
  CreateClassLevelDto,
  CreateSectionDto,
  UpdateAcademicYearDto,
  UpdateClassLevelDto,
  UpdateSectionDto,
} from "./dto/academics.dto.js";

@ApiTags("academics")
@Controller("academics")
@Auth()
export class AcademicsController {
  constructor(private s: AcademicsService) {}

  @Get("years")
  async years() {
    return { success: true, data: await this.s.years() };
  }

  @Post("years")
  @AdminOnly()
  async createYear(@Body() dto: CreateAcademicYearDto) {
    return { success: true, data: await this.s.createYear(dto) };
  }

  @Patch("years/:id")
  @AdminOnly()
  async updateYear(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAcademicYearDto) {
    return { success: true, data: await this.s.updateYear(id, dto) };
  }

  @Delete("years/:id")
  @AdminOnly()
  async removeYear(@Param("id", ParseUUIDPipe) id: string) {
    await this.s.removeYear(id);
    return { success: true };
  }

  @Get("classes")
  async classes() {
    return { success: true, data: await this.s.classes() };
  }

  @Post("classes")
  @AdminOnly()
  async createClass(@Body() dto: CreateClassLevelDto) {
    return { success: true, data: await this.s.createClass(dto) };
  }

  @Patch("classes/:id")
  @AdminOnly()
  async updateClass(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateClassLevelDto) {
    return { success: true, data: await this.s.updateClass(id, dto) };
  }

  @Delete("classes/:id")
  @AdminOnly()
  async removeClass(@Param("id", ParseUUIDPipe) id: string) {
    await this.s.removeClass(id);
    return { success: true };
  }

  @Post("sections")
  @AdminOnly()
  async createSection(@Body() dto: CreateSectionDto) {
    return { success: true, data: await this.s.createSection(dto) };
  }

  @Patch("sections/:id")
  @AdminOnly()
  async updateSection(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSectionDto) {
    return { success: true, data: await this.s.updateSection(id, dto) };
  }

  @Delete("sections/:id")
  @AdminOnly()
  async removeSection(@Param("id", ParseUUIDPipe) id: string) {
    await this.s.removeSection(id);
    return { success: true };
  }
}

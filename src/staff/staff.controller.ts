import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AdminOnly, Auth } from "../common/decorators/auth.decorator.js";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator.js";
import { StaffService } from "./staff.service.js";
import { CreateStaffDto, UpdateStaffDto } from "./dto/create-staff.dto.js";

@ApiTags("staff")
@Controller("staff")
export class StaffController {
  constructor(private s: StaffService) {}

  @Get()
  @Auth()
  async list() {
    return { success: true, data: await this.s.list() };
  }

  @Post()
  @AdminOnly()
  async create(@Body() dto: CreateStaffDto, @CurrentUser() actor: AuthUser) {
    return { success: true, data: await this.s.create(dto, actor) };
  }

  @Patch(":id")
  @AdminOnly()
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto, @CurrentUser() actor: AuthUser) {
    return { success: true, data: await this.s.update(id, dto, actor) };
  }

  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    await this.s.remove(id, actor);
    return { success: true };
  }
}

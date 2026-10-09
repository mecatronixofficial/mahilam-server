import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AdminOnly, Auth } from "../common/decorators/auth.decorator.js";
import { FeesService } from "./fees.service.js";
import {
  CreateFeeStructureDto,
  CreateFeeTypeDto,
  CreatePaymentDto,
  CreateStudentFeeDto,
  FeeQueryDto,
  PaymentQueryDto,
  UpdateFeeStructureDto,
  UpdateFeeTypeDto,
  UpdateStudentFeeDto,
  VoidPaymentDto,
} from "./dto/create-fee.dto.js";

// Static routes (payments, types, structures) are declared before ":id" so they are matched first.
@ApiTags("fees")
@Controller("fees")
@Auth()
export class FeesController {
  constructor(private s: FeesService) {}

  @Get()
  list(@Query() query: FeeQueryDto) {
    return this.s.list(query);
  }

  @Post()
  async create(@Body() dto: CreateStudentFeeDto) {
    return { success: true, data: await this.s.create(dto) };
  }

  @Get("payments")
  payments(@Query() query: PaymentQueryDto) {
    return this.s.listPayments(query);
  }

  @Post("payments")
  async pay(@Body() dto: CreatePaymentDto) {
    return { success: true, message: "Payment recorded", data: await this.s.pay(dto) };
  }

  @Post("payments/:id/void")
  @AdminOnly()
  async voidPayment(@Param("id", ParseUUIDPipe) id: string, @Body() dto: VoidPaymentDto) {
    return { success: true, message: "Payment voided", data: await this.s.voidPayment(id, dto.reason) };
  }

  @Get("types")
  async feeTypes() {
    return { success: true, data: await this.s.feeTypes() };
  }

  @Post("types")
  @AdminOnly()
  async createFeeType(@Body() dto: CreateFeeTypeDto) {
    return { success: true, data: await this.s.createFeeType(dto) };
  }

  @Patch("types/:id")
  @AdminOnly()
  async updateFeeType(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateFeeTypeDto) {
    return { success: true, data: await this.s.updateFeeType(id, dto) };
  }

  @Delete("types/:id")
  @AdminOnly()
  async removeFeeType(@Param("id", ParseUUIDPipe) id: string) {
    await this.s.removeFeeType(id);
    return { success: true };
  }

  @Get("structures")
  async feeStructures(@Query("academicYear") academicYear?: string) {
    return { success: true, data: await this.s.feeStructures(academicYear || undefined) };
  }

  @Post("structures")
  @AdminOnly()
  async createFeeStructure(@Body() dto: CreateFeeStructureDto) {
    return { success: true, data: await this.s.createFeeStructure(dto) };
  }

  @Patch("structures/:id")
  @AdminOnly()
  async updateFeeStructure(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateFeeStructureDto) {
    return { success: true, data: await this.s.updateFeeStructure(id, dto) };
  }

  @Delete("structures/:id")
  @AdminOnly()
  async removeFeeStructure(@Param("id", ParseUUIDPipe) id: string) {
    await this.s.removeFeeStructure(id);
    return { success: true };
  }

  @Post("structures/:id/assign")
  @AdminOnly()
  async assignStructure(@Param("id", ParseUUIDPipe) id: string) {
    const result = await this.s.assignStructure(id);
    return { success: true, message: `Assigned "${result.label}" to ${result.created} student(s)`, data: result };
  }

  @Get(":id")
  async detail(@Param("id", ParseUUIDPipe) id: string) {
    return { success: true, data: await this.s.detail(id) };
  }

  @Patch(":id")
  @AdminOnly()
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateStudentFeeDto) {
    return { success: true, data: await this.s.update(id, dto) };
  }

  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.s.remove(id);
    return { success: true };
  }
}

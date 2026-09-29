import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { Role } from "../generated/prisma/enums";
import { BCRYPT_ROUNDS } from "../auth/auth.service";
import type { AuthUser } from "../common/decorators/current-user.decorator";
import { CreateStaffDto, UpdateStaffDto } from "./dto/create-staff.dto";

const staffSelect = { id: true, name: true, email: true, role: true, active: true, createdAt: true };

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({ where: { role: { in: [Role.STAFF, Role.ADMIN] } }, select: staffSelect, orderBy: { createdAt: "desc" } });
  }

  async create(dto: CreateStaffDto, actor: AuthUser) {
    const role = dto.role ?? Role.STAFF;
    if (role === Role.ADMIN && actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException("Only a super admin can create admins");
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    return this.prisma.user.create({ data: { name: dto.name.trim(), email: dto.email, passwordHash, role }, select: staffSelect });
  }

  async update(id: string, dto: UpdateStaffDto, actor: AuthUser) {
    const target = await this.assertManageable(id, actor);
    if (id === actor.id && (dto.active === false || (dto.role && dto.role !== target.role))) throw new BadRequestException("You can't deactivate your own account or change your own role");
    if (dto.role === Role.ADMIN && target.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException("Only a super admin can promote staff to admin");

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS) : undefined;
    const signOut = Boolean(passwordHash) || dto.active === false || (dto.role !== undefined && dto.role !== target.role);
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { name: dto.name?.trim(), email: dto.email, role: dto.role, active: dto.active, passwordHash }, select: staffSelect }),
      // Existing sessions end when access is reduced or the password changes.
      ...(signOut && id !== actor.id ? [this.prisma.refreshSession.deleteMany({ where: { userId: id } })] : []),
    ]);
    return user;
  }

  async remove(id: string, actor: AuthUser) {
    if (id === actor.id) throw new BadRequestException("You can't delete your own account");
    await this.assertManageable(id, actor);
    await this.prisma.user.delete({ where: { id } });
  }

  /** Super admins can't be managed here, and admins can only be managed by a super admin. */
  private async assertManageable(id: string, actor: AuthUser) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, role: true } });
    if (target.role === Role.SUPER_ADMIN) throw new ForbiddenException("Super admin accounts can't be changed here");
    if (target.role === Role.ADMIN && actor.role !== Role.SUPER_ADMIN && target.id !== actor.id) throw new ForbiddenException("Only a super admin can manage other admins");
    return target;
  }
}

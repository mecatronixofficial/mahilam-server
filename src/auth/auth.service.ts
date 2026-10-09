import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { createHash, randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import type { User } from "../generated/prisma/client.js";

export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const BCRYPT_ROUNDS = 12;

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type PublicUser = Pick<User, "id" | "email" | "name" | "role">;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async validate(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.active || !valid) throw new UnauthorizedException("Invalid email or password");
    return user;
  }

  async issue(user: PublicUser) {
    const identity = { sub: user.id, email: user.email, name: user.name, role: user.role };
    const [access, refresh] = await Promise.all([
      this.jwt.signAsync({ ...identity, type: "access" }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: ACCESS_TTL_MS / 1000, jwtid: randomUUID() }),
      this.jwt.signAsync({ ...identity, type: "refresh" }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: REFRESH_TTL_MS / 1000, jwtid: randomUUID() }),
    ]);
    await this.prisma.refreshSession.create({ data: { userId: user.id, tokenHash: hashToken(refresh), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) } });
    return { access, refresh, user: this.toPublic(user) };
  }

  async refresh(token?: string) {
    if (!token) throw new UnauthorizedException("Refresh token required");
    try {
      const payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_REFRESH_SECRET });
      if (payload.type !== "refresh" || !payload.sub) throw new Error();
      // Deleting first makes rotation single-use even when two refreshes race.
      const { count } = await this.prisma.refreshSession.deleteMany({ where: { userId: payload.sub, tokenHash: hashToken(token), expiresAt: { gt: new Date() } } });
      if (!count) throw new Error();
      const user = await this.prisma.user.findFirst({ where: { id: payload.sub, active: true } });
      if (!user) throw new Error();
      return this.issue(user);
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }

  async logout(refresh?: string) {
    if (refresh) await this.prisma.refreshSession.deleteMany({ where: { tokenHash: hashToken(refresh) } });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, active: true }, select: { id: true, email: true, name: true, role: true, createdAt: true } });
    if (!user) throw new UnauthorizedException("Account is no longer active");
    return { ...user, sub: user.id };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (currentPassword === newPassword) throw new BadRequestException("New password must be different from the current password");
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new BadRequestException("Current password is incorrect");
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    // Signs out every other device; the caller receives a fresh session.
    await this.prisma.$transaction([this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }), this.prisma.refreshSession.deleteMany({ where: { userId } })]);
    return this.issue(user);
  }

  private toPublic(user: PublicUser): PublicUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}

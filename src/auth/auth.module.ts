import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
@Global()
@Module({imports:[JwtModule.register({})],controllers:[AuthController],providers:[AuthService],exports:[JwtModule,AuthService]}) export class AuthModule {}

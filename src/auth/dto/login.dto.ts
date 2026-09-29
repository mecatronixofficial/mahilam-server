import { IsEmail, IsString, Matches, MaxLength, MinLength } from "class-validator";

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
export const PASSWORD_MESSAGE = "password must be 8-128 characters and include at least one letter and one number";

export class LoginDto {
  @IsEmail() @MaxLength(160) email!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(8) @MaxLength(128) currentPassword!: string;
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) newPassword!: string;
}

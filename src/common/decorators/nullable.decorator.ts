import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsOptional } from "class-validator";

/**
 * For nullable columns: a blank string becomes `null`, and `null`/`undefined` skip validation.
 * Forms send "" for untouched inputs, which plain `@IsOptional()` would reject (e.g. `@IsEmail()`).
 */
export const Nullable = () =>
  applyDecorators(
    Transform(({ value }) => (typeof value === "string" && value.trim() === "" ? null : value)),
    IsOptional(),
  );

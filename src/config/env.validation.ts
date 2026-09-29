const PRODUCTION_REQUIRED = ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "FRONTEND_URL"];

/** Fails fast on startup when configuration is missing or unsafe. Used by ConfigModule. */
export function validateEnv(config: Record<string, unknown>) {
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (config.NODE_ENV !== "production") return config;

  const missing = PRODUCTION_REQUIRED.filter((key) => !config[key]);
  if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(", ")}`);

  const access = String(config.JWT_ACCESS_SECRET);
  const refresh = String(config.JWT_REFRESH_SECRET);
  if (access.length < 32 || refresh.length < 32) throw new Error("JWT secrets must each contain at least 32 characters");
  if (access === refresh) throw new Error("JWT access and refresh secrets must be different");
  return config;
}

// JWT signing secrets. In production the server refuses to start without them: a missing
// secret would otherwise fall back to a value anyone can read in the source code and use to
// forge logins. Local development keeps a fallback so a fresh checkout still runs.
const read = (name: "JWT_SECRET" | "JWT_REFRESH_SECRET", devFallback: string) => {
  const value = process.env[name];
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be set (at least 16 characters) in production`);
  }
  if (!value) console.warn(`[Security] ${name} is not set; using a development-only fallback.`);
  return value || devFallback;
};

export const JWT_SECRET = () => read("JWT_SECRET", "fallback_jwt_secret_key");
export const JWT_REFRESH_SECRET = () => read("JWT_REFRESH_SECRET", "fallback_refresh_secret_key");

// Called once at startup so a misconfigured production server fails immediately.
export const assertSecrets = () => {
  JWT_SECRET();
  JWT_REFRESH_SECRET();
};

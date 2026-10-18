import type { Role } from "../generated/prisma/enums";

// Errors carrying a statusCode are turned into { success: false, message } with that
// status by the catch-all handler in app.ts.
export const httpError = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });

// Service-layer guard for SUPER_ADMIN-only modules. Routes already enforce this through
// authorizeRoles; repeating it here means a service function can't be reused from a
// less-restricted route by accident and silently leak data.
export const assertSuperAdmin = (actor: { role: Role } | undefined) => {
  if (!actor || actor.role !== "SUPER_ADMIN") {
    throw httpError(403, "Forbidden: You do not have permissions to access this resource");
  }
};

import jwt from "jsonwebtoken";
import { JWT_REFRESH_SECRET, JWT_SECRET } from "../../config/secrets";

// One place that signs tokens. "tv" is the account's tokenVersion: when a password is reset the
// version goes up, and refresh tokens with the old number are refused (see refreshToken), so
// other devices are signed out within one access-token lifetime (15 minutes).
export type TokenUser = { id: number; email: string; role: string; tokenVersion: number };

export const issueTokens = (user: TokenUser) => {
  const claims = { id: user.id, email: user.email, role: user.role, tv: user.tokenVersion };
  return {
    accessToken: jwt.sign(claims, JWT_SECRET(), { expiresIn: "15m" }),
    refreshToken: jwt.sign(claims, JWT_REFRESH_SECRET(), { expiresIn: "7d" }),
  };
};

// Tokens issued before this feature have no "tv"; they count as version 0.
export const tokenVersionOf = (decoded: any) => (Number.isInteger(decoded?.tv) ? decoded.tv : 0);

// Spread into a user update wherever a password is set, to sign out other devices.
export const signOutEverywhere = { tokenVersion: { increment: 1 } } as const;

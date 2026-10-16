import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "../generated/prisma/enums";

// Extend Express Request type to include user information
export interface CustomRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: Role;
  };
}

export const authenticateToken = (
  req: CustomRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ success: false, message: "Authorization token missing" });
    return;
  }

  const SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_key";

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      res.status(403).json({ success: false, message: "Invalid or expired token" });
      return;
    }
    
    req.user = decoded as CustomRequest["user"];
    next();
  });
};

// Role authorization middleware factory
export const authorizeRoles = (allowedRoles: string[]) => {
  return (req: CustomRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized access" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permissions to access this resource"
      });
      return;
    }

    next();
  };
};

import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "../../generated/prisma/enums";
import { hashPassword, comparePassword } from "../../utils/password";
import { createUser, findUserByEmail } from "./service";
import { prisma } from "../../config/prisma";
import { getStudentByAdmissionNo } from "../students/service";

import { JWT_REFRESH_SECRET, JWT_SECRET } from "../../config/secrets";

// Public self-registration is a placeholder for local dev/testing only.
// M1 replaces this with admin-driven account creation (staff/parent/student
// records are created by Admin, not signed up publicly) — see prep/IMPLEMENTATION_PLAN.md.
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, role, name } = req.body;

    if (!email || !password || !role || !name) {
      res.status(400).json({ success: false, message: "Missing required fields" });
      return;
    }

    if (!Object.values(Role).includes(role)) {
      res.status(400).json({ success: false, message: "Invalid role" });
      return;
    }

    // Parents don't get logins — families use the student's login.
    if (role === Role.PARENT) {
      res.status(400).json({ success: false, message: "Parent accounts are not supported; families sign in with the student's login" });
      return;
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      res.status(409).json({ success: false, message: "User already exists" });
      return;
    }

    const passwordHash = await hashPassword(password);

    await createUser({ email, passwordHash, role, name });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// "email" doubles as a generic identifier — a student may log in with either their
// email or their admission number (most young students won't have a real email).
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email: identifier, password, loginMode } = req.body;

    if (!identifier || !password) {
      res.status(400).json({ success: false, message: "Email/admission number and password are required" });
      return;
    }

    let user = await findUserByEmail(identifier);
    if (!user) {
      const student = await getStudentByAdmissionNo(identifier);
      user = student?.user ?? null;
    }

    if (!user || !user.isActive) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    if (user.role === Role.PARENT) {
      res.status(403).json({ success: false, message: "Parents don't have a login. Please sign in with the student's admission number." });
      return;
    }

    // Role-based portal segregation check
    if (loginMode === "family" && user.role !== Role.STUDENT) {
      res.status(403).json({ success: false, message: "Staff & Admin accounts must sign in from the Staff & Admin Sign In tab." });
      return;
    }

    if (loginMode === "staff" && user.role === Role.STUDENT) {
      res.status(403).json({ success: false, message: "Student accounts must sign in from the Student Sign In tab." });
      return;
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET(),
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_REFRESH_SECRET(),
      { expiresIn: "7d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      res.status(401).json({ success: false, message: "Refresh token is missing" });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_REFRESH_SECRET());
    } catch {
      res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
      return;
    }

    // Read the account again: a deactivated login stops here, and a changed role (e.g. a
    // teacher made Principal) takes effect without signing out.
    const user = await prisma.user.findUnique({ where: { id: Number(decoded.id) }, select: { id: true, email: true, role: true, name: true, isActive: true } });
    if (!user || !user.isActive) {
      res.status(401).json({ success: false, message: "This account is no longer active" });
      return;
    }

    const claims = { id: user.id, email: user.email, role: user.role };
    res.status(200).json({
      success: true,
      accessToken: jwt.sign(claims, JWT_SECRET(), { expiresIn: "15m" }),
      refreshToken: jwt.sign(claims, JWT_REFRESH_SECRET(), { expiresIn: "7d" }),
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

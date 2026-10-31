import { httpError } from "../../utils/httpError";

// HR details on a staff record (personal, employment, ID and bank). Pure validation so it
// can be unit tested: only fields present in the body are returned; "" or null clears one.

export interface StaffDetails {
  employeeCode?: string | null;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
  dob?: Date | null;
  bloodGroup?: string | null;
  fatherOrSpouseName?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  joiningDate?: Date | null;
  leavingDate?: Date | null;
  experienceYears?: number | null;
  address?: string | null;
  aadhaarNumber?: string | null;
  panNumber?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankIfsc?: string | null;
}

// Shown only to the Super Admin (and editable only by them).
export const SENSITIVE_STAFF_FIELDS = ["aadhaarNumber", "panNumber", "bankName", "bankAccountNo", "bankIfsc"] as const;

const PHONE_RE = /^[+]?[\d\s-]{7,15}$/;
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const text = (v: unknown, field: string, max: number) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") throw httpError(400, `${field} must be text`);
  const t = v.trim();
  if (t.length > max) throw httpError(400, `${field} must be at most ${max} characters`);
  return t || null;
};

// Date-only fields arrive as YYYY-MM-DD and are stored as India midnight, like student DOBs.
const day = (v: unknown, field: string) => {
  const t = text(v, field, 10);
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw httpError(400, `${field} must be a date`);
  const d = new Date(`${t}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) throw httpError(400, `${field} must be a date`);
  return d;
};

export const parseStaffDetails = (body: Record<string, unknown>): StaffDetails => {
  const out: StaffDetails = {};
  const has = (k: string) => body[k] !== undefined;

  if (has("employeeCode")) out.employeeCode = text(body.employeeCode, "Employee code", 20)?.toUpperCase() ?? null;
  if (has("gender")) {
    const g = text(body.gender, "Gender", 10);
    if (g && !["MALE", "FEMALE", "OTHER"].includes(g)) throw httpError(400, "Choose a valid gender");
    out.gender = g as StaffDetails["gender"];
  }
  if (has("dob")) out.dob = day(body.dob, "Date of birth");
  if (has("bloodGroup")) {
    const b = text(body.bloodGroup, "Blood group", 3)?.toUpperCase() ?? null;
    if (b && !BLOOD_GROUPS.includes(b)) throw httpError(400, "Choose a valid blood group");
    out.bloodGroup = b;
  }
  if (has("fatherOrSpouseName")) out.fatherOrSpouseName = text(body.fatherOrSpouseName, "Father's / spouse's name", 80);
  if (has("emergencyContactName")) out.emergencyContactName = text(body.emergencyContactName, "Emergency contact name", 80);
  if (has("emergencyContactPhone")) {
    const p = text(body.emergencyContactPhone, "Emergency contact number", 20);
    if (p && !PHONE_RE.test(p)) throw httpError(400, "Enter a valid emergency contact number");
    out.emergencyContactPhone = p;
  }
  if (has("joiningDate")) out.joiningDate = day(body.joiningDate, "Joining date");
  if (has("leavingDate")) out.leavingDate = day(body.leavingDate, "Leaving date");
  if (has("experienceYears")) {
    const v = body.experienceYears;
    if (v === null || v === "") out.experienceYears = null;
    else {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 60) throw httpError(400, "Experience must be whole years (0–60)");
      out.experienceYears = n;
    }
  }
  if (has("address")) out.address = text(body.address, "Address", 300);

  if (has("aadhaarNumber")) {
    const a = text(body.aadhaarNumber, "Aadhaar number", 14)?.replace(/\s/g, "") ?? null;
    if (a && !/^\d{12}$/.test(a)) throw httpError(400, "Aadhaar number must be 12 digits");
    out.aadhaarNumber = a;
  }
  if (has("panNumber")) {
    const p = text(body.panNumber, "PAN", 10)?.toUpperCase() ?? null;
    if (p && !/^[A-Z]{5}\d{4}[A-Z]$/.test(p)) throw httpError(400, "PAN must look like ABCDE1234F");
    out.panNumber = p;
  }
  if (has("bankName")) out.bankName = text(body.bankName, "Bank name", 80);
  if (has("bankAccountNo")) {
    const n = text(body.bankAccountNo, "Account number", 20)?.replace(/\s/g, "") ?? null;
    if (n && !/^\d{9,18}$/.test(n)) throw httpError(400, "Account number must be 9–18 digits");
    out.bankAccountNo = n;
  }
  if (has("bankIfsc")) {
    const i = text(body.bankIfsc, "IFSC", 11)?.toUpperCase() ?? null;
    if (i && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(i)) throw httpError(400, "IFSC must look like SBIN0001234");
    out.bankIfsc = i;
  }

  if (out.joiningDate && out.leavingDate && out.leavingDate < out.joiningDate) throw httpError(400, "Leaving date can't be before the joining date");
  return out;
};

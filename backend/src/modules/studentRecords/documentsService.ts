import { Readable } from "stream";
import { prisma } from "../../config/prisma";
import { cloudinary } from "../../config/cloudinary";
import { httpError } from "../../utils/httpError";
import { createAuditLog } from "../fees/ledgerService";
import { MAX_DOCUMENT_BYTES } from "../../middleware/upload";

// Student documents (birth certificate, Aadhaar, previous TC …), uploaded by the office.
//  - Files are stored "authenticated" in Cloudinary: no public link exists. The ERP fetches
//    a file with a 5-minute signed link and passes it to the browser, so only logins with
//    documents.view ever see one, and every view is written to the audit log.
//  - Families see which documents are on file and which are missing, never the files.
//  - Removing a document deletes the file from storage; the row stays as a log.

export const DOCUMENT_TYPES = {
  BIRTH_CERTIFICATE: "Birth certificate",
  AADHAAR: "Aadhaar card",
  TRANSFER_CERTIFICATE: "Transfer certificate (previous school)",
  MARKSHEET: "Previous marksheet / report card",
  CASTE_CERTIFICATE: "Caste certificate",
  INCOME_CERTIFICATE: "Income / EWS certificate",
  DOMICILE: "Domicile / residence certificate",
  ADDRESS_PROOF: "Address proof",
  PARENT_ID: "Parent's ID proof",
  MEDICAL_CERTIFICATE: "Medical / fitness certificate",
  DISABILITY_CERTIFICATE: "Disability (UDID) certificate",
  OTHER: "Other",
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;

const FOLDER = "school_erp/student_documents";
// Photos of documents are shrunk like every other photo (≤1600 px); PDFs are kept as-is.
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const SHRINK = [{ width: 1600, height: 1600, crop: "limit", quality: "auto:good" }];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const assertType = (v: unknown): DocumentType => {
  if (typeof v !== "string" || !(v in DOCUMENT_TYPES)) throw httpError(400, "Choose what kind of document this is");
  return v as DocumentType;
};

const cleanTitle = (v: unknown) => {
  const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  return t ? t.slice(0, 120) : null;
};

// The documents the school expects for this student, from what's on the record.
const expectedTypes = (s: { previousSchool: string | null; category: string | null; health: { disability: string | null } | null }) => {
  const want: DocumentType[] = ["BIRTH_CERTIFICATE", "AADHAAR"];
  if (s.previousSchool?.trim()) want.push("TRANSFER_CERTIFICATE");
  if (s.category && ["SC", "ST", "OBC"].includes(s.category)) want.push("CASTE_CERTIFICATE");
  if (s.category === "EWS") want.push("INCOME_CERTIFICATE");
  if (s.health?.disability?.trim()) want.push("DISABILITY_CERTIFICATE");
  return want;
};

const loadStudent = async (studentId: number) => {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, previousSchool: true, category: true, health: { select: { disability: true } } },
  });
  if (!student) throw httpError(404, "Student not found");
  return student;
};

type DocRow = Awaited<ReturnType<typeof prisma.studentDocument.findMany>>[number] & { uploadedBy?: { name: string } | null };

const checklistFor = (student: Awaited<ReturnType<typeof loadStudent>>, docs: DocRow[]) =>
  expectedTypes(student as any).map((docType) => {
    const onFile = docs.filter((d) => d.docType === docType);
    return {
      docType,
      label: DOCUMENT_TYPES[docType],
      status: onFile.some((d) => d.verifiedAt) ? "VERIFIED" : onFile.length ? "ON_FILE" : "MISSING",
    } as const;
  });

const view = (d: DocRow) => ({
  id: d.id,
  docType: d.docType,
  label: DOCUMENT_TYPES[d.docType as DocumentType] ?? d.docType,
  title: d.title,
  isPdf: d.mimeType === "application/pdf",
  bytes: d.bytes,
  uploadedBy: d.uploadedBy?.name ?? null,
  verifiedAt: d.verifiedAt,
  createdAt: d.createdAt,
});

// Office view: documents on file, the checklist, and the types to choose from.
export const listStudentDocuments = async (studentId: number) => {
  const student = await loadStudent(studentId);
  const docs = await prisma.studentDocument.findMany({
    where: { studentId, removedAt: null },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });
  return {
    documents: docs.map(view),
    checklist: checklistFor(student, docs),
    types: Object.entries(DOCUMENT_TYPES).map(([value, label]) => ({ value, label })),
  };
};

// Families: the list only (no files, no uploader names).
export const familyDocumentSummary = async (studentId: number) => {
  const student = await loadStudent(studentId);
  const docs = await prisma.studentDocument.findMany({ where: { studentId, removedAt: null }, orderBy: { createdAt: "desc" } });
  return {
    documents: docs.map((d) => ({ id: d.id, label: DOCUMENT_TYPES[d.docType as DocumentType] ?? d.docType, title: d.title, verified: !!d.verifiedAt, createdAt: d.createdAt })),
    checklist: checklistFor(student, docs),
  };
};

const uploadPrivate = (buffer: Buffer, photo: boolean, publicId: string) =>
  new Promise<{ public_id: string; bytes: number; format?: string; resource_type: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: FOLDER,
        public_id: publicId,
        type: "authenticated",
        resource_type: photo ? "image" : "raw",
        ...(photo ? { transformation: SHRINK } : {}),
      },
      (err, res) => (err || !res ? reject(err ?? new Error("Upload failed")) : resolve(res as any))
    );
    Readable.from(buffer).pipe(stream);
  });

export const uploadStudentDocument = async (
  actorId: number,
  studentId: number,
  file: { buffer: Buffer; mimetype: string; size: number } | undefined,
  body: { docType?: unknown; title?: unknown }
) => {
  await loadStudent(studentId);
  const docType = assertType(body.docType);
  const title = cleanTitle(body.title);
  if (docType === "OTHER" && !title) throw httpError(400, "Say what this document is");
  if (!file) throw httpError(400, "Choose a file to upload");

  const photoExt = PHOTO_TYPES[file.mimetype];
  const isPdf = file.mimetype === "application/pdf";
  if (!photoExt && !isPdf) throw httpError(400, "Upload a photo (JPG, PNG, WebP) or a PDF");
  if (isPdf && file.size > MAX_DOCUMENT_BYTES) throw httpError(400, `This PDF is ${(file.size / 1048576).toFixed(1)} MB. PDFs can be at most ${MAX_DOCUMENT_BYTES / 1048576} MB — scan at a lower quality.`);
  if (photoExt && file.size > MAX_PHOTO_BYTES) throw httpError(400, "This photo is over 10 MB");

  // Raw files keep their extension in the id; images get theirs from Cloudinary.
  const base = `s${studentId}_${docType.toLowerCase()}_${Date.now()}`;
  let stored;
  try {
    stored = await uploadPrivate(file.buffer, !!photoExt, isPdf ? `${base}.pdf` : base);
  } catch (e: any) {
    console.error("[Documents] upload failed", e?.message);
    throw httpError(502, "Couldn't save the file to storage. Try again in a minute.");
  }

  const doc = await prisma.studentDocument.create({
    data: {
      studentId,
      docType,
      title,
      publicId: stored.public_id,
      resourceType: stored.resource_type,
      format: photoExt ? stored.format ?? photoExt : "pdf",
      mimeType: photoExt ? `image/${stored.format === "jpg" ? "jpeg" : stored.format ?? photoExt}` : "application/pdf",
      bytes: stored.bytes ?? file.size,
      uploadedByUserId: actorId,
    },
    include: { uploadedBy: { select: { name: true } } },
  });
  await createAuditLog({ action: "UPLOAD", entityType: "StudentDocument", entityId: doc.id, userId: actorId, newValues: { studentId, docType, title } });
  return view(doc);
};

const findDoc = async (id: number) => {
  const doc = await prisma.studentDocument.findUnique({ where: { id } });
  if (!doc || doc.removedAt) throw httpError(404, "This document isn't on file any more");
  return doc;
};

// The file itself, fetched from storage with a short-lived signed link.
export const fetchStudentDocument = async (actorId: number, id: number) => {
  const doc = await findDoc(id);
  const url = cloudinary.utils.private_download_url(doc.publicId, doc.resourceType === "raw" ? "" : doc.format ?? "", {
    resource_type: doc.resourceType,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 300,
  });
  const res = await fetch(url);
  if (!res.ok) throw httpError(502, "Couldn't fetch the file from storage");
  await createAuditLog({ action: "VIEW", entityType: "StudentDocument", entityId: doc.id, userId: actorId, newValues: { studentId: doc.studentId, docType: doc.docType } });
  const ext = doc.mimeType === "application/pdf" ? "pdf" : doc.format ?? "jpg";
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mimeType: doc.mimeType ?? "application/octet-stream",
    fileName: `${doc.docType.toLowerCase()}_${doc.studentId}.${ext}`,
  };
};

export const setDocumentVerified = async (actorId: number, id: number, verified: unknown) => {
  const doc = await findDoc(id);
  const on = verified !== false;
  const updated = await prisma.studentDocument.update({
    where: { id },
    data: on ? { verifiedAt: doc.verifiedAt ?? new Date(), verifiedByUserId: doc.verifiedByUserId ?? actorId } : { verifiedAt: null, verifiedByUserId: null },
    include: { uploadedBy: { select: { name: true } } },
  });
  await createAuditLog({ action: on ? "VERIFY" : "UNVERIFY", entityType: "StudentDocument", entityId: id, userId: actorId, newValues: { studentId: doc.studentId, docType: doc.docType } });
  return view(updated);
};

export const removeStudentDocument = async (actorId: number, id: number, reason: unknown) => {
  const doc = await findDoc(id);
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length < 3) throw httpError(400, "Say why this document is being removed");
  try {
    await cloudinary.uploader.destroy(doc.publicId, { resource_type: doc.resourceType, type: "authenticated", invalidate: true });
  } catch (e: any) {
    console.error("[Documents] delete failed", doc.publicId, e?.message);
    throw httpError(502, "Couldn't delete the file from storage. Try again in a minute.");
  }
  await prisma.studentDocument.update({ where: { id }, data: { removedAt: new Date(), removedByUserId: actorId, removeReason: why.slice(0, 300) } });
  await createAuditLog({ action: "REMOVE", entityType: "StudentDocument", entityId: id, userId: actorId, newValues: { studentId: doc.studentId, docType: doc.docType, reason: why } });
  return { id };
};


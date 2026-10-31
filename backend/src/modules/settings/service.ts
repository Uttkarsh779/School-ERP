import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";

// Printed-document settings: the principal's signature, the school seal, and on which
// documents they are printed. Everything else on the Settings page (school name, address,
// logo, principal's name) lives in the website settings row and is saved through the CMS API.

// Only images uploaded through the ERP (our Cloudinary account).
const IMAGE_RE = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//;
const FLAGS = ["signIdCards", "signReportCards", "signCertificates", "signTc"] as const;

export const getDocumentSettings = async () =>
  (await prisma.documentSetting.findUnique({ where: { id: 1 } })) ?? prisma.documentSetting.create({ data: { id: 1 } });

export const parseDocumentSettings = (body: Record<string, unknown>) => {
  const out: Record<string, string | boolean | null> = {};
  for (const key of ["principalSignatureUrl", "schoolSealUrl"] as const) {
    const v = body[key];
    if (v === undefined) continue;
    if (v === null || v === "") out[key] = null;
    else if (typeof v !== "string" || !IMAGE_RE.test(v)) throw httpError(400, "Upload the image through the Settings page");
    else out[key] = v;
  }
  for (const key of FLAGS) {
    const v = body[key];
    if (v === undefined) continue;
    if (typeof v !== "boolean") throw httpError(400, `${key} must be true or false`);
    out[key] = v;
  }
  return out;
};

export const updateDocumentSettings = async (body: Record<string, unknown>) => {
  const data = parseDocumentSettings(body ?? {});
  await getDocumentSettings();
  return prisma.documentSetting.update({ where: { id: 1 }, data });
};

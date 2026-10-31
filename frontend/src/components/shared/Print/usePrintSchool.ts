import { useGetPublicWebsiteDataQuery } from "../../../store/api/cms.api";
import { useGetDocumentSettingsQuery } from "../../../store/api/settings.api";
import type { PrintSchool } from "./printDocument";

export type PrintedDocument = "idCard" | "reportCard" | "certificate" | "tc";

// School details for a printout: letterhead from the website settings, plus the principal's
// signature (and, on certificates, the seal) when Settings says to print them on that
// document. Otherwise the signature line stays blank for a hand signature.
export const usePrintSchool = () => {
  const { data: site } = useGetPublicWebsiteDataQuery();
  const { data: docs } = useGetDocumentSettingsQuery();

  return (doc: PrintedDocument): PrintSchool | undefined => {
    const school = site?.settings;
    if (!school) return undefined;
    const on = docs
      ? { idCard: docs.signIdCards, reportCard: docs.signReportCards, certificate: docs.signCertificates, tc: docs.signTc }[doc]
      : false;
    return {
      ...school,
      signatureUrl: on ? docs?.principalSignatureUrl : null,
      sealUrl: on && doc === "certificate" ? docs?.schoolSealUrl : null,
    };
  };
};

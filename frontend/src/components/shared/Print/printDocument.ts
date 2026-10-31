// Shared pieces for printed documents (report cards, certificates, lists): HTML escaping,
// the school letterhead from Website settings, and printing from a hidden iframe with its
// own styles so nothing from the app screen ends up on paper. "Save as PDF" in the print
// dialog gives a PDF.

export interface PrintSchool {
  schoolName?: string | null;
  tagline?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  boardName?: string | null;
  affiliationNo?: string | null;
  principalName?: string | null;
  // Set by usePrintSchool only on documents where Settings allows a printed signature/seal.
  signatureUrl?: string | null;
  sealUrl?: string | null;
}

export const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const httpUrl = (u?: string | null) => (u && /^https?:\/\//.test(u) ? u : null);

// Letterhead: logo, school name, address, contact and affiliation, centred. Styles are in
// LETTERHEAD_CSS; the accent colour comes from the --ink custom property of the page.
export const letterheadHtml = (school: PrintSchool) => {
  const affiliation = [school.boardName && `Affiliated to ${school.boardName}`, school.affiliationNo && `Affiliation No. ${school.affiliationNo}`].filter(Boolean).join(" · ");
  const contact = [school.phone && `Ph: ${school.phone}`, school.email].filter(Boolean).join(" · ");
  const logo = httpUrl(school.logoUrl);
  return `<header class="lh">
    ${logo ? `<img class="lh-logo" src="${esc(logo)}" alt="">` : '<span class="lh-logo"></span>'}
    <div class="lh-text">
      <h1>${esc(school.schoolName || "School")}</h1>
      ${school.tagline ? `<div class="lh-tag">${esc(school.tagline)}</div>` : ""}
      ${school.address ? `<div>${esc(school.address)}</div>` : ""}
      ${contact ? `<div>${esc(contact)}</div>` : ""}
      ${affiliation ? `<div class="lh-aff">${esc(affiliation)}</div>` : ""}
    </div>
    <span class="lh-logo"></span>
  </header>`;
};

export const LETTERHEAD_CSS = `
  .lh { display: flex; align-items: center; gap: 12px; padding-bottom: 8px; border-bottom: 2.5px double var(--ink); }
  .lh-logo { width: 64px; height: 64px; object-fit: contain; flex: none; }
  .lh-text { flex: 1; text-align: center; font-size: 8.8pt; color: #4a5361; line-height: 1.35; }
  .lh-text h1 { margin: 0 0 1px; font: 700 18pt Georgia, "Times New Roman", serif; letter-spacing: .04em; text-transform: uppercase; color: var(--ink); }
  .lh-tag { font-style: italic; }
  .lh-aff { font-weight: 600; color: #1b2430; }
`;

// The principal's signature, drawn into the space above the signature line (a negative top
// margin, so the layout is the same with or without it). multiply makes the white paper of a
// photographed signature disappear.
export const signatureHtml = (school: PrintSchool, heightMm = 12) => {
  const url = httpUrl(school.signatureUrl);
  return url
    ? `<img src="${esc(url)}" alt="" style="display:block;height:${heightMm}mm;max-width:100%;object-fit:contain;margin:-${heightMm + 1}mm auto 1mm;mix-blend-mode:multiply">`
    : "";
};

export const sealHtml = (school: PrintSchool, sizeMm = 26) => {
  const url = httpUrl(school.sealUrl);
  return url ? `<img src="${esc(url)}" alt="" style="width:${sizeMm}mm;height:${sizeMm}mm;object-fit:contain;mix-blend-mode:multiply">` : "";
};

// Prints a complete HTML document; waits for its images (logo, photos) first.
export const printHtml = (html: string) => {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) return frame.remove();
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 1000);
  };
  const imgs = [...doc.images].filter((i) => !i.complete);
  let pending = imgs.length;
  if (!pending) return void setTimeout(go, 100);
  const done = () => --pending <= 0 && setTimeout(go, 100);
  imgs.forEach((i) => {
    i.addEventListener("load", done);
    i.addEventListener("error", done);
  });
};

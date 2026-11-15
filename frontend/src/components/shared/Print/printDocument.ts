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

// ---------------------------------------------------------------------------------------------
// Printing. Every printed document (receipts, report cards, certificates, ID/admit cards,
// registers) goes through printHtml.
//   Desktop: prints straight away from a hidden iframe.
//   Phones/tablets: hidden-iframe printing is unreliable there (Android Chrome and iOS Safari
//   often print the app page instead, or nothing), and a document shrunk to phone width reads
//   badly. So they get a full-screen preview of the real A4 page, scaled to fit like a PDF
//   viewer, with a "Print / Save as PDF" button that opens the document in its own tab and
//   prints it from there.
// ---------------------------------------------------------------------------------------------

const A4_WIDTH_PX = 794; // 210mm at 96 dpi

// Touch-first or narrow screens get the preview.
const usePreview = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 900);

// Screen-only styling that makes the document look like a sheet of A4 paper (print output is
// untouched: everything is inside @media screen). Documents are sized for the printable area
// with body margin 0, so the sheet adds roughly the @page margins as padding.
const sheetCss = (embedded: boolean) => `
@media screen {
  html { background: ${embedded ? "#fff" : "#525659"} !important; }
  body { box-sizing: border-box !important; width: 210mm !important; min-height: 297mm; margin: ${embedded ? "0" : "16px auto"} !important;
    padding: 10mm 7mm !important; background: #fff !important; ${embedded ? "" : "box-shadow: 0 2px 12px rgba(0,0,0,.35);"} }
  .zz-print-bar { position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; justify-content: center; padding: 10px; margin: -10mm -7mm 8mm;
    background: #323639; }
  .zz-print-bar button { font: 600 15px system-ui, sans-serif; padding: 10px 18px; border-radius: 8px; border: 0; background: #fff; color: #1b2430; }
  .zz-print-bar button.primary { background: #2563eb; color: #fff; }
}
@media print { .zz-print-bar { display: none !important; } }`;

// Adds a <base> (so app stylesheets and relative images resolve in a blank tab or srcdoc
// frame), the sheet styling, and optionally a print bar + automatic print for the new tab.
const prepareDocument = (html: string, mode: "embedded" | "tab") => {
  // <base> and viewport first in <head>; the sheet styles last, so they win over the
  // document's own screen styles.
  const top = `<base href="${location.origin}/"><meta name="viewport" content="width=${A4_WIDTH_PX + 40}">`;
  const sheet = `<style>${sheetCss(mode === "embedded")}</style>`;
  let out = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${top}`) : `<head>${top}</head>${html}`;
  out = out.replace(/<\/head>/i, `${sheet}</head>`);
  if (mode === "tab") {
    const bar = `<div class="zz-print-bar"><button class="primary" onclick="window.print()">Print / Save as PDF</button><button onclick="window.close()">Close</button></div>`;
    const auto = `<script>(function(){var go=function(){setTimeout(function(){window.print()},300)};var imgs=[].slice.call(document.images).filter(function(i){return !i.complete});var n=imgs.length;if(document.readyState==="complete"&&!n)return go();var done=function(){if(--n<=0)go()};if(!n){window.addEventListener("load",go);return}imgs.forEach(function(i){i.addEventListener("load",done);i.addEventListener("error",done)})})();</script>`;
    out = /<body[^>]*>/i.test(out) ? out.replace(/<body([^>]*)>/i, `<body$1>${bar}`) : bar + out;
    out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${auto}</body>`) : out + auto;
  }
  return out;
};

// Runs `cb` once the frame's stylesheets and images have loaded (or failed).
const whenLoaded = (win: Window, doc: Document, cb: () => void) => {
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    setTimeout(cb, 150);
  };
  const imgs = [...doc.images].filter((i) => !i.complete);
  let pending = imgs.length + 1; // +1 for the window load event (stylesheets)
  const done = () => --pending <= 0 && fire();
  imgs.forEach((i) => {
    i.addEventListener("load", done);
    i.addEventListener("error", done);
  });
  if (doc.readyState === "complete") done();
  else win.addEventListener("load", done);
  setTimeout(fire, 8000); // never hang on a slow image
};

const printInHiddenFrame = (html: string) => {
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
  whenLoaded(win, doc, () => {
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 1000);
  });
};

// Opens the document in its own tab, which prints itself (with a Print button in case the
// browser ignores the automatic print). Must run inside a click, or the tab is blocked.
const printInNewTab = (html: string): boolean => {
  const tab = window.open("", "_blank");
  if (!tab) return false;
  tab.document.open();
  tab.document.write(prepareDocument(html, "tab"));
  tab.document.close();
  return true;
};

const titleOf = (html: string) => {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  const el = document.createElement("textarea");
  el.innerHTML = m?.[1] ?? "Document";
  return el.value.trim() || "Document";
};

let openPreview: (() => void) | null = null;

// Full-screen preview: the A4 page scaled to the screen width, like a PDF viewer.
const showPreview = (html: string) => {
  openPreview?.();
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", titleOf(html));
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;background:#525659;font-family:system-ui,-apple-system,'Segoe UI',sans-serif";

  const bar = document.createElement("div");
  bar.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:8px 10px;padding-top:max(8px,env(safe-area-inset-top));background:#323639;color:#fff;flex:none";
  const btn = (label: string, primary: boolean) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = `font:600 14px inherit;padding:9px 14px;border-radius:8px;border:0;cursor:pointer;white-space:nowrap;${
      primary ? "background:#2563eb;color:#fff" : "background:rgba(255,255,255,.14);color:#fff"
    }`;
    return b;
  };
  const close = btn("✕ Close", false);
  const title = document.createElement("div");
  title.textContent = titleOf(html);
  title.style.cssText = "flex:1;min-width:0;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  const print = btn("Print / Save as PDF", true);
  bar.append(close, title, print);

  const scroller = document.createElement("div");
  scroller.style.cssText = "flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:12px 8px 24px";
  const holder = document.createElement("div"); // takes the scaled size, so scrolling is right
  holder.style.cssText = "margin:0 auto;position:relative;overflow:hidden;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.4)";
  const frame = document.createElement("iframe");
  frame.title = titleOf(html);
  frame.style.cssText = `position:absolute;top:0;left:0;width:${A4_WIDTH_PX}px;border:0;transform-origin:0 0;background:#fff`;
  frame.srcdoc = prepareDocument(html, "embedded");
  holder.appendChild(frame);
  scroller.appendChild(holder);
  overlay.append(bar, scroller);

  const layout = () => {
    const avail = scroller.clientWidth - 16;
    const scale = Math.min(1, avail / A4_WIDTH_PX);
    const h = frame.contentDocument?.documentElement.scrollHeight ?? 1123;
    frame.style.height = `${h}px`;
    frame.style.transform = `scale(${scale})`;
    holder.style.width = `${A4_WIDTH_PX * scale}px`;
    holder.style.height = `${h * scale}px`;
  };
  frame.addEventListener("load", () => {
    layout();
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (doc && win) whenLoaded(win, doc, layout); // re-measure once images are in
  });
  const onResize = () => layout();
  window.addEventListener("resize", onResize);

  // The phone's back button closes the preview instead of leaving the page.
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  history.pushState({ zzPrintPreview: true }, "");
  const onPop = () => teardown(false);
  window.addEventListener("popstate", onPop);
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && teardown(true);
  window.addEventListener("keydown", onKey);

  function teardown(fromButton: boolean) {
    window.removeEventListener("popstate", onPop);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onKey);
    document.body.style.overflow = prevOverflow;
    overlay.remove();
    openPreview = null;
    if (fromButton && history.state?.zzPrintPreview) history.back();
  }
  openPreview = () => teardown(true);

  close.addEventListener("click", () => teardown(true));
  print.addEventListener("click", () => {
    // Fall back to printing the preview frame if the browser blocks the new tab.
    if (!printInNewTab(html)) {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    }
  });

  document.body.appendChild(overlay);
  close.focus();
};

// Prints a complete HTML document ("Save as PDF" in the print dialog gives a PDF).
export const printHtml = (html: string) => (usePreview() ? showPreview(html) : printInHiddenFrame(html));

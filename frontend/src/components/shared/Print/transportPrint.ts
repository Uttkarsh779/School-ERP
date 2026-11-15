// Printable transport list (A4 portrait): one route per page with its vehicle and driver,
// students grouped by stop (village) with class, father and contact number, for the driver,
// conductor and transport in-charge. "Save as PDF" in the print dialog gives a PDF.

import type { TransportRider } from "../../../store/api/exports.api";
import { esc, LETTERHEAD_CSS, letterheadHtml, printHtml, type PrintSchool } from "./printDocument";

export const printTransportList = (rows: TransportRider[], opts: { school?: PrintSchool | null }) => {
  const school = opts.school ?? {};
  const routes = new Map<string, TransportRider[]>();
  for (const r of rows) {
    const k = r.route ?? "No route set";
    routes.set(k, [...(routes.get(k) ?? []), r]);
  }

  const pages = [...routes.entries()]
    .map(([route, list]) => {
      const first = list[0];
      const stops = new Map<string, TransportRider[]>();
      for (const r of list) stops.set(r.stop, [...(stops.get(r.stop) ?? []), r]);
      let sno = 0;
      const body = [...stops.entries()]
        .map(
          ([stop, kids]) => `<tbody class="group">
          <tr class="stopRow"><td colspan="6">${esc(stop)} <span>· ${kids.length} student${kids.length === 1 ? "" : "s"}</span></td></tr>
          ${kids
            .map(
              (k) => `<tr>
              <td class="c">${++sno}</td>
              <td><b>${esc(k.name)}</b><div class="sub">${esc(k.admissionNo)}</div></td>
              <td>${esc(k.className ?? "—")}${k.rollNo ? `<div class="sub">Roll ${esc(k.rollNo)}</div>` : ""}</td>
              <td>${esc(k.fatherName ?? "—")}</td>
              <td class="nw">${esc(k.contact ?? "—")}</td>
              <td></td>
            </tr>`
            )
            .join("")}
        </tbody>`
        )
        .join("");
      return `<section class="sheet">
        ${letterheadHtml(school)}
        <div class="title">
          <div><h2>Transport List — ${esc(route)}</h2>
            <div class="sub2">${first.vehicle ? `Vehicle ${esc(first.vehicle)}` : "No vehicle on this route"}${first.driver ? ` · Driver ${esc(first.driver)}` : ""}</div></div>
          <div class="meta">${list.length} student${list.length === 1 ? "" : "s"} · ${stops.size} stop${stops.size === 1 ? "" : "s"}<br>As on ${esc(new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))}</div>
        </div>
        <table>
          <thead><tr><th class="c" style="width:6%">S.No</th><th style="width:28%">Student</th><th style="width:14%">Class</th><th style="width:22%">Father</th><th style="width:15%">Contact</th><th style="width:15%">Remarks</th></tr></thead>
          ${body}
        </table>
        <div class="foot"><span class="sign"><span></span>Transport In-charge</span><span class="sign"><span></span>Principal</span></div>
      </section>`;
    })
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Transport List</title>
<style>
  @page { size: A4 portrait; margin: 10mm 8mm 12mm; }
  * { box-sizing: border-box; }
  :root { --ink: #23395b; }
  body { margin: 0; font: 8.8pt/1.3 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${LETTERHEAD_CSS}
  .sheet { page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .title { display: flex; justify-content: space-between; align-items: flex-end; margin: 10px 0 8px; gap: 12px; }
  .title h2 { margin: 0; font-size: 13.5pt; color: var(--ink); }
  .sub2 { color: #4a5361; font-size: 9pt; margin-top: 2px; }
  .meta { text-align: right; color: #5d6675; font-size: 8.5pt; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: var(--ink); color: #fff; font-size: 7.6pt; text-transform: uppercase; letter-spacing: .04em; text-align: left; padding: 4px 5px; border: 1px solid var(--ink); }
  td { padding: 3.5px 5px; border: 1px solid #c9ced6; vertical-align: top; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  .c { text-align: center; } .nw { white-space: nowrap; }
  .sub { font-size: 7.4pt; color: #5d6675; }
  .stopRow td { background: #e9edf3; font-weight: 700; color: var(--ink); border-top: 2px solid #9aa3af; }
  .stopRow span { font-weight: 400; color: #5d6675; }
  .foot { display: flex; justify-content: space-between; margin-top: 34px; font-size: 8.5pt; page-break-inside: avoid; }
  .sign { display: inline-block; text-align: center; min-width: 160px; }
  .sign span { display: block; border-top: 1px solid #1b2430; margin-bottom: 3px; }
</style></head><body>${pages}</body></html>`;
  printHtml(html);
};

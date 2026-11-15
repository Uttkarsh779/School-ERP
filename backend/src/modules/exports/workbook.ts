import ExcelJS from "exceljs";
import type { Response } from "express";

// One way to build every Excel download: a bold header row that stays put when scrolling,
// filters on every column, sensible widths, and dates as real Excel dates.

export type Column = {
  header: string;
  key: string;
  width?: number;
  // Not stored in the ERP: the column is left empty and its header is greyed, for the office
  // to fill in before uploading to a government portal.
  notInErp?: boolean;
  type?: "date" | "money" | "number" | "text";
};

export type Sheet = { name: string; columns: Column[]; rows: Array<Record<string, unknown>>; note?: string };

const HEADER_FILL = "FF23395B";
const MISSING_FILL = "FF9AA3AF";

const toCell = (v: unknown, type?: Column["type"]) => {
  if (v === null || v === undefined || v === "") return null;
  if (type === "date") {
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d;
  }
  if (type === "money" || type === "number") return typeof v === "number" ? v : Number(v);
  return typeof v === "boolean" ? (v ? "Yes" : "No") : (v as any);
};

export const buildWorkbook = (sheets: Sheet[]) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "School ERP";
  wb.created = new Date();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31), { views: [{ state: "frozen", ySplit: sheet.note ? 2 : 1 }] });
    let headerRow = 1;
    if (sheet.note) {
      ws.addRow([sheet.note]);
      ws.mergeCells(1, 1, 1, Math.max(1, sheet.columns.length));
      const c = ws.getCell(1, 1);
      c.font = { italic: true, color: { argb: "FF5D6675" } };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(1).height = 32;
      headerRow = 2;
    }
    const header = ws.addRow(sheet.columns.map((c) => c.header));
    header.eachCell((cell, i) => {
      const col = sheet.columns[i - 1];
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col.notInErp ? MISSING_FILL : HEADER_FILL } };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (col.notInErp) cell.note = "Not stored in the ERP: fill this in before uploading.";
    });
    header.height = 30;
    sheet.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width ?? Math.min(40, Math.max(10, c.header.length + 2));
      if (c.type === "date") col.numFmt = "dd-mm-yyyy";
      if (c.type === "money") col.numFmt = "#,##0.00";
    });
    for (const r of sheet.rows) ws.addRow(sheet.columns.map((c) => (c.notInErp ? null : toCell(r[c.key], c.type))));
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: sheet.columns.length } };
  }
  return wb;
};

const safeName = (s: string) => s.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_");

export const sendWorkbook = async (res: Response, filename: string, sheets: Sheet[]) => {
  const wb = buildWorkbook(sheets);
  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName(filename)}.xlsx"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(Buffer.from(buffer as ArrayBuffer));
};

export const istDate = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

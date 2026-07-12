// CSV + Anki TSV parsing, HTML strip. Pure module — imports only util.js.

import { stripHtml } from "./util.js";

// ---- CSV parsing (hand-rolled char state machine) ----

export function parseCSV(text) {
  const rows = parseCSVRows(text);
  return rowsToCards(rows);
}

function parseCSVRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = text == null ? "" : String(text);
  const len = src.length;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < len) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      endField();
      i++;
      continue;
    }
    if (ch === "\r") {
      if (src[i + 1] === "\n") {
        endRow();
        i += 2;
        continue;
      }
      endRow();
      i++;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // flush trailing field/row if there's any pending content
  if (field.length > 0 || row.length > 0) {
    endRow();
  }

  // drop blank lines (rows that are a single empty field)
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

function rowsToCards(rows) {
  if (rows.length === 0) return [];

  let dataRows = rows;
  const first = rows[0];
  if (
    first.length === 2 &&
    first[0].trim().toLowerCase() === "question" &&
    first[1].trim().toLowerCase() === "answer"
  ) {
    dataRows = rows.slice(1);
  }

  const cards = [];
  for (const r of dataRows) {
    if (r.length < 2) continue;
    const q = stripHtml(r[0]);
    const a = stripHtml(r.slice(1).join(","));
    if (!q || !a) continue;
    cards.push({ q, a });
  }
  return cards;
}

// ---- Anki TSV parsing ----

export function parseAnki(text) {
  const src = text == null ? "" : String(text);
  const lines = src.split(/\r\n|\r|\n/);

  let delimiter = "\t";
  const cards = [];

  for (const rawLine of lines) {
    const line = rawLine;
    if (line.trim() === "") continue;

    if (line.startsWith("#")) {
      const m = /^#separator:(.+)$/i.exec(line.trim());
      if (m) {
        const sep = m[1].trim().toLowerCase();
        if (sep === "tab") delimiter = "\t";
        else if (sep === "comma") delimiter = ",";
        else if (sep === ";" || sep === "semicolon") delimiter = ";";
      }
      // ignore other directives (#html, #deck, #notetype, etc.)
      continue;
    }

    const cols = line.split(delimiter);
    if (cols.length < 2) continue;
    const q = stripHtml(cols[0]);
    const a = stripHtml(cols[1]);
    if (!q || !a) continue;
    cards.push({ q, a });
  }

  return cards;
}

// ---- Format sniffing + dispatch ----

export function parseDeck(text, filename) {
  const src = text == null ? "" : String(text);
  const name = stripExtension(filename || "deck");

  const lines = src.split(/\r\n|\r|\n/);
  const hasAnkiDirective = lines.some((l) => /^#(separator|html)/i.test(l.trim()));

  let cards;
  if (hasAnkiDirective) {
    cards = parseAnki(src);
  } else {
    const commaCount = (src.match(/,/g) || []).length;
    const tabCount = (src.match(/\t/g) || []).length;
    if (commaCount > tabCount) {
      cards = parseCSV(src);
    } else {
      cards = parseAnki(src); // TSV fallback (tab-delimited, no directives)
    }
  }

  return { name, cards };
}

function stripExtension(filename) {
  const base = String(filename).replace(/^.*[\\/]/, "");
  const idx = base.lastIndexOf(".");
  return idx > 0 ? base.slice(0, idx) : base;
}

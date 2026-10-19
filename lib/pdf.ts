// Générateur PDF minimal (PDF 1.4, polices de base Helvetica) — aucune dépendance externe,
// fonctionne hors connexion et sur Node 18.

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 28;

const ASCII: number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const LATIN1: Record<number, number> = {
  160: 278, 171: 556, 176: 400, 178: 400, 180: 333, 183: 500, 184: 278, 187: 556,
  191: 611, 192: 667, 193: 667, 194: 667, 195: 667, 196: 667, 197: 667, 199: 667,
  200: 667, 201: 667, 202: 667, 203: 667, 204: 278, 205: 278, 206: 333, 207: 333,
  209: 556, 210: 778, 211: 778, 212: 778, 213: 778, 214: 778, 217: 778, 218: 778,
  219: 778, 220: 778, 221: 722, 223: 611, 224: 556, 225: 556, 226: 556, 227: 556,
  228: 556, 229: 556, 231: 500, 232: 556, 233: 556, 234: 556, 235: 556, 236: 278,
  237: 278, 238: 278, 239: 278, 241: 556, 242: 556, 243: 556, 244: 556, 245: 556,
  246: 556, 249: 556, 250: 556, 251: 556, 252: 556, 255: 500,
};

function glyphWidth(cp: number, size: number): number {
  let w: number;
  if (cp >= 32 && cp <= 126) w = ASCII[cp - 32];
  else w = LATIN1[cp] ?? 556;
  return (w * size) / 1000;
}

function textWidth(s: string, size: number): number {
  let total = 0;
  for (const ch of s) total += glyphWidth(ch.codePointAt(0) ?? 65, size);
  return total;
}

function toLatin1(s: string): string {
  return Array.from(s)
    .map((ch) => {
      const cp = ch.codePointAt(0)!;
      if (cp >= 32 && cp <= 126) return ch;
      if (cp >= 160 && cp <= 255) return String.fromCharCode(cp);
      return "-";
    })
    .join("");
}

function pdfString(s: string): string {
  return "(" + toLatin1(s).replace(/([\()])/g, "\$1") + ")";
}

export type CellLine = { t: string; size?: number; bold?: boolean; gray?: boolean };
export type PdfCell = CellLine[];
export type PdfTable = { headers: string[]; rows: PdfCell[][]; widths: number[] };

export type PdfDoc = {
  title: string;
  subtitle: string;
  meta: string[];
  table: PdfTable;
  footer: string;
};

class Painter {
  private ops: string[] = [];

  fill(x: number, y: number, w: number, h: number, gray: number) {
    this.ops.push(`${gray.toFixed(3)} ${gray.toFixed(3)} ${gray.toFixed(3)} rg`, `${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re f`);
  }

  stroke(x1: number, y1: number, x2: number, y2: number, gray = 0.62, width = 0.7) {
    this.ops.push(`${gray.toFixed(3)} G`, `${fmt(width)} w`, `${fmt(x1)} ${fmt(y1)} m ${fmt(x2)} ${fmt(y2)} l S`);
  }

  text(x: number, y: number, s: string, size: number, bold = false, gray = 0.12) {
    if (!s) return;
    const font = bold ? "/F2" : "/F1";
    this.ops.push("BT", `${font} ${fmt(size)} Tf`, `${gray.toFixed(3)} ${gray.toFixed(3)} ${gray.toFixed(3)} rg`, `1 0 0 1 ${fmt(x)} ${fmt(y)} Tm`, `${pdfString(s)} Tj`, "ET");
  }

  toString() {
    return this.ops.join("\n");
  }
}

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function fit(text: string, max: number, size: number): string {
  if (textWidth(text, size) <= max) return text;
  let out = text;
  while (out.length > 1 && textWidth(out + "...", size) > max) out = out.slice(0, -1);
  return out.trimEnd() + "...";
}

export function buildPdf(doc: PdfDoc): Buffer {
  const p = new Painter();
  const usable = PAGE_W - MARGIN * 2;

  p.text(MARGIN, PAGE_H - MARGIN - 14, doc.title, 17, true, 0.1);
  p.text(MARGIN, PAGE_H - MARGIN - 31, doc.subtitle, 10.5, false, 0.35);

  let metaY = PAGE_H - MARGIN - 47;
  for (const line of doc.meta) {
    p.text(MARGIN, metaY, line, 9, false, 0.42);
    metaY -= 12;
  }

  const top = metaY - 8;
  const bottom = MARGIN + 18;
  const { headers, rows, widths } = doc.table;

  const scale = usable / widths.reduce((a, b) => a + b, 0);
  const colW = widths.map((w) => w * scale);

  const headH = 20;
  const bodyH = Math.min(215, (top - bottom - headH) / Math.max(rows.length, 1));

  let x = MARGIN;
  p.fill(MARGIN, top - headH, usable, headH, 0.9);
  headers.forEach((h, i) => {
    p.text(x + 6, top - headH + 6.5, fit(h, colW[i] - 10, 9.5), 9.5, true, 0.18);
    x += colW[i];
  });

  let y = top - headH;
  rows.forEach((row, r) => {
    const rowTop = y - bodyH;
    let cx = MARGIN;
    p.fill(MARGIN, rowTop, usable, bodyH, r % 2 ? 0.985 : 1);
    row.forEach((cell, i) => {
      const lines: PdfCell = cell && cell.length ? cell : [{ t: "-", gray: true }];
      const sizes = lines.map((l) => l.size ?? 9.5);
      const totalH = sizes.reduce((a, s) => a + s * 1.32, 0);
      let ty = rowTop + bodyH / 2 + totalH / 2 - sizes[0];
      lines.forEach((l, k) => {
        const size = sizes[k];
        p.text(cx + 6, ty, fit(l.t, colW[i] - 10, size), size, !!l.bold, l.gray ? 0.55 : 0.15);
        ty -= size * 1.32;
      });
      cx += colW[i];
    });
    y = rowTop;
  });

  const tableBottom = y;
  for (let i = 0; i <= headers.length; i++) {
    const vx = MARGIN + colW.slice(0, i).reduce((a, b) => a + b, 0);
    p.stroke(vx, top, vx, tableBottom, 0.68, i === 0 || i === headers.length ? 1 : 0.6);
  }
  for (let r = 0; r <= rows.length; r++) {
    const hy = top - headH - r * bodyH;
    p.stroke(MARGIN, hy, MARGIN + usable, hy, 0.68, r === 0 ? 1 : 0.6);
  }
  p.stroke(MARGIN, tableBottom, MARGIN + usable, tableBottom, 0.68, 1);

  p.text(MARGIN, bottom - 6, doc.footer, 8, false, 0.5);

  const stream = Buffer.from(p.toString(), "latin1");
  return assemble(stream);
}

function assemble(stream: Buffer): Buffer {
  const objs = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    ``,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
  ];

  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let pos = 0;

  const push = (b: Buffer) => {
    chunks.push(b);
    pos += b.length;
  };

  push(Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1"));

  objs.forEach((body, i) => {
    offsets.push(pos);
    const head = Buffer.from(`${i + 1} 0 obj\n`, "latin1");
    push(head);
    if (i === 3) {
      push(Buffer.from("<< /Length " + stream.length + " >>\nstream\n", "latin1"));
      push(stream);
      push(Buffer.from("\nendstream\n", "latin1"));
    } else {
      push(Buffer.from(body + "\n", "latin1"));
    }
    push(Buffer.from("endobj\n", "latin1"));
  });

  const xrefPos = pos;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  push(Buffer.from(xref, "latin1"));
  push(
    Buffer.from(
      `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`,
      "latin1"
    )
  );

  return Buffer.concat(chunks);
}

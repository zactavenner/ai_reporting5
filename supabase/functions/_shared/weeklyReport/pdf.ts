/**
 * Server-side PDF renderer for the Weekly Client Report (Deno, pdf-lib).
 * Draws the same client-safe ReportDoc the browser preview shows: one PDF page per spec page.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'npm:pdf-lib@1.17.1';
import type { Block, ReportDoc } from './layout.ts';

const W = 612, H = 792, M = 48;
const INK = rgb(0.07, 0.09, 0.08), MUTED = rgb(0.42, 0.45, 0.43), LINE = rgb(0.87, 0.88, 0.87);
const ACCENT = rgb(0.04, 0.17, 0.15), WARN = rgb(0.7, 0.15, 0.12), TRACK = rgb(0.93, 0.94, 0.93);

/** Standard fonts are WinAnsi-only — map or drop anything else so rendering never throws. */
export function winAnsi(s: string) {
  return s.replace(/[→]/g, '->').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2026]/g, '');
}

function wrap(text: string, font: PDFFont, size: number, max: number) {
  const words = winAnsi(text).split(/\s+/); const lines: string[] = []; let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) > max && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
function fit(text: string, font: PDFFont, size: number, max: number) {
  let t = winAnsi(text);
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > max) t = t.slice(0, -2) + '…';
  return t;
}

async function fetchImage(doc: PDFDocument, url: string | null, timeoutMs: number): Promise<PDFImage | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 3_000_000) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8) return await doc.embedJpg(buf);
    if (buf[0] === 0x89 && buf[1] === 0x50) return await doc.embedPng(buf);
    return null;
  } catch { return null; }
}

export interface RenderOptions { fetchImages?: boolean; imageTimeoutMs?: number }

export async function renderReportPdf(spec: ReportDoc, opts: RenderOptions = {}): Promise<{ bytes: Uint8Array; pages: number }> {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(spec.title)); doc.setProducer('Reporting 5.0'); doc.setCreator('Reporting 5.0');
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const blocks of spec.pages) {
    const page = doc.addPage([W, H]);
    let y = H - M;
    for (const b of blocks) y = await drawBlock(doc, page, b, y, reg, bold, opts);
  }
  const bytes = await doc.save();
  return { bytes, pages: doc.getPageCount() };
}

async function drawBlock(doc: PDFDocument, p: PDFPage, b: Block, y: number, reg: PDFFont, bold: PDFFont, opts: RenderOptions): Promise<number> {
  const inner = W - 2 * M;
  switch (b.kind) {
    case 'header': {
      p.drawText(winAnsi(b.eyebrow), { x: M, y: y - 9, size: 8, font: bold, color: MUTED });
      p.drawText(fit(b.title, bold, 22, inner * 0.6), { x: M, y: y - 34, size: 22, font: bold, color: ACCENT });
      b.right.forEach((t, i) => { const s = winAnsi(t); p.drawText(s, { x: W - M - reg.widthOfTextAtSize(s, 8), y: y - 18 - i * 11, size: 8, font: reg, color: MUTED }); });
      p.drawLine({ start: { x: M, y: y - 46 }, end: { x: W - M, y: y - 46 }, thickness: 1, color: LINE });
      return y - 66;
    }
    case 'heading':
      p.drawText(winAnsi(b.text), { x: M, y: y - 14, size: 13, font: bold, color: INK });
      return y - 28;
    case 'table': {
      const size = b.small ? 8 : 10, rowH = b.small ? 15 : 20;
      const n = b.head.length; const first = inner * (n > 3 ? 0.36 : 0.6); const rest = (inner - first) / Math.max(1, n - 1);
      const xs = b.head.map((_, i) => (i === 0 ? M : M + first + rest * (i - 1)));
      const cell = (t: string, i: number, yy: number, f: PDFFont, c = INK, sz = size) => {
        const w = i === 0 ? first : rest; const s = fit(t, f, sz, w - 6);
        const right = (b.align?.[i] ?? 'left') === 'right';
        p.drawText(s, { x: right ? xs[i] + w - f.widthOfTextAtSize(s, sz) : xs[i], y: yy, size: sz, font: f, color: c });
      };
      b.head.forEach((h, i) => cell(h, i, y - size, bold, MUTED, size - 1));
      y -= rowH - 4;
      for (const r of b.rows) {
        p.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
        r.forEach((t, i) => cell(t, i, y - size - 4, i === 1 ? bold : reg, t.startsWith('Unavailable') ? MUTED : INK));
        y -= rowH;
      }
      return y - 12;
    }
    case 'stats': {
      const gap = 8, w = (inner - gap * (b.items.length - 1)) / b.items.length;
      b.items.forEach((s, i) => {
        const x = M + i * (w + gap);
        p.drawRectangle({ x, y: y - 52, width: w, height: 52, borderColor: LINE, borderWidth: 1 });
        const v = winAnsi(s.value), sz = v.length > 8 ? 12 : 18;
        p.drawText(v, { x: x + (w - bold.widthOfTextAtSize(v, sz)) / 2, y: y - 28, size: sz, font: bold, color: INK });
        const l = fit(s.label, reg, 8, w - 8);
        p.drawText(l, { x: x + (w - reg.widthOfTextAtSize(l, 8)) / 2, y: y - 44, size: 8, font: reg, color: MUTED });
      });
      return y - 70;
    }
    case 'progress': {
      p.drawText(winAnsi(b.label), { x: M, y: y - 10, size: 9, font: reg, color: INK });
      const r = winAnsi(b.right); p.drawText(r, { x: W - M - reg.widthOfTextAtSize(r, 9), y: y - 10, size: 9, font: reg, color: INK });
      p.drawRectangle({ x: M, y: y - 26, width: inner, height: 7, color: TRACK });
      p.drawRectangle({ x: M, y: y - 26, width: inner * Math.max(0, Math.min(1, b.ratio)), height: 7, color: ACCENT });
      return y - 42;
    }
    case 'creatives': {
      const cols = 3, gap = 12, w = (inner - gap * (cols - 1)) / cols, imgH = w;
      for (let i = 0; i < b.items.length; i++) {
        const c = b.items[i]; const col = i % cols, row = Math.floor(i / cols);
        const x = M + col * (w + gap), top = y - row * (imgH + 58);
        const img = opts.fetchImages === false ? null : await fetchImage(doc, c.image, opts.imageTimeoutMs ?? 5000);
        if (img) {
          const s = Math.max(w / img.width, imgH / img.height);
          const dw = Math.min(w, img.width * s), dh = Math.min(imgH, img.height * s);
          p.drawRectangle({ x, y: top - imgH, width: w, height: imgH, color: TRACK });
          p.drawImage(img, { x: x + (w - dw) / 2, y: top - imgH + (imgH - dh) / 2, width: dw, height: dh });
        } else {
          p.drawRectangle({ x, y: top - imgH, width: w, height: imgH, color: TRACK });
          p.drawText('Image unavailable', { x: x + 8, y: top - imgH / 2, size: 8, font: reg, color: MUTED });
        }
        p.drawText(fit(c.name, bold, 9, w), { x, y: top - imgH - 14, size: 9, font: bold, color: INK });
        c.lines.forEach((l, j) => p.drawText(fit(l, reg, 8, w), { x, y: top - imgH - 27 - j * 11, size: 8, font: reg, color: MUTED }));
      }
      const rows = Math.ceil(b.items.length / cols);
      return y - rows * (imgH + 58) - 4;
    }
    case 'note': {
      const lines = wrap(b.text, reg, 7.5, inner);
      lines.forEach((l, i) => p.drawText(l, { x: M, y: y - 9 - i * 10, size: 7.5, font: reg, color: b.tone === 'warn' ? WARN : MUTED }));
      return y - lines.length * 10 - 12;
    }
  }
}

export function toBase64(bytes: Uint8Array) {
  let s = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

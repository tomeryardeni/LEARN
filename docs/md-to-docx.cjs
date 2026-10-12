// Converts docs/SpecQuest-spec.md into an RTL Hebrew Word document.
// Supports the subset the spec uses: # headings, paragraphs, **bold**, `code`,
// pipe tables, "- " bullets and --- rules.  Usage: npm run docs
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType,
  WidthType, ShadingType, BorderStyle, LevelFormat, Footer, PageNumber, TableOfContents,
} = require('docx');

const SRC = path.join(__dirname, 'SpecQuest-spec.md');
const OUT = path.join(__dirname, 'SpecQuest-spec.docx');
const FONT = 'Arial';
const ACCENT = '4F46E5';
const PAGE_W = 11906; // A4
const MARGIN = 1134;
const TABLE_W = PAGE_W - 2 * MARGIN;

/** Inline markdown (**bold**, `code`) -> TextRuns, all RTL. */
function runs(text, opts = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  const push = (t, extra) => t && out.push(new TextRun({ text: t, rightToLeft: true, font: FONT, ...opts, ...extra }));
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) push(tok.slice(2, -2), { bold: true });
    else push(tok.slice(1, -1), { font: 'Consolas', rightToLeft: false });
    last = m.index + tok.length;
  }
  push(text.slice(last));
  return out;
}

const para = (text, opts = {}) =>
  new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 120 }, ...opts, children: runs(text, opts.run) });

function table(rows) {
  const cols = rows[0].length;
  // Width per column proportional to the longest cell, clamped.
  const lens = Array.from({ length: cols }, (_, c) => Math.max(...rows.map((r) => (r[c] || '').length)));
  const weights = lens.map((l) => Math.min(Math.max(l, 10), 70));
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.floor((w / sum) * TABLE_W));
  widths[0] += TABLE_W - widths.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'C9CEDB' };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new Table({
    width: { size: TABLE_W, type: WidthType.DXA },
    columnWidths: widths,
    visuallyRightToLeft: true,
    rows: rows.map(
      (r, i) =>
        new TableRow({
          tableHeader: i === 0,
          children: r.map(
            (cell, c) =>
              new TableCell({
                width: { size: widths[c], type: WidthType.DXA },
                borders,
                shading: i === 0 ? { fill: 'E8E7FD', type: ShadingType.CLEAR, color: 'auto' } : undefined,
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, children: runs(cell, { size: 19, bold: i === 0 || undefined }) })],
              })
          ),
        })
    ),
  });
}

function parse(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let title = true;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((s) => s.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      out.push(table(rows));
      out.push(new Paragraph({ children: [], spacing: { after: 80 } }));
      continue;
    }
    if (line === '---') {
      out.push(new Paragraph({ bidirectional: true, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DDE2EE', space: 1 } }, spacing: { after: 200 } }));
      continue;
    }
    const hm = line.match(/^(#{1,3})\s+(.*)$/);
    if (hm) {
      const lvl = hm[1].length;
      if (lvl === 1 && title) {
        title = false;
        out.push(para(hm[2], { heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }));
        continue;
      }
      const heading = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][lvl];
      if (hm[2].startsWith('1. ')) {
        // TOC before the first numbered chapter
        out.push(para('תוכן עניינים', { run: { size: 32, bold: true, color: ACCENT }, spacing: { before: 360, after: 160 } }));
        out.push(new TableOfContents('תוכן עניינים', { hyperlink: true, headingStyleRange: '1-2' }));
        out.push(para('(לעדכון תוכן העניינים ב-Word: לחיצה ימנית ← עדכון שדה)', { run: { size: 18, color: '888888' } }));
      }
      out.push(para(hm[2], { heading }));
      continue;
    }
    if (/^- /.test(line)) {
      out.push(para(line.slice(2), { numbering: { reference: 'bullets', level: 0 } }));
      continue;
    }
    out.push(para(line));
  }
  return out;
}

const doc = new Document({
  creator: 'SpecQuest',
  title: 'SpecQuest - אפיון',
  styles: {
    default: { document: { run: { font: FONT, size: 21, rightToLeft: true }, paragraph: { bidirectional: true } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 48, bold: true, color: ACCENT, font: FONT }, paragraph: { spacing: { after: 240 } } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, bold: true, color: ACCENT, font: FONT }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, color: '1B2033', font: FONT }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, color: '1B2033', font: FONT }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.RIGHT, style: { paragraph: { indent: { right: 720, hanging: 360 } } } }] }],
  },
  features: { updateFields: true },
  sections: [
    {
      properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['SpecQuest · עמוד ', PageNumber.CURRENT], size: 16, color: '888888', font: FONT })] })],
        }),
      },
      children: parse(fs.readFileSync(SRC, 'utf8')),
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log('Wrote ' + OUT);
});

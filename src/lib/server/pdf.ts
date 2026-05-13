function escapePdf(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function stripMarkdown(markdown: string): string[] {
  return markdown
    .replace(/\|\s*-[-| :]+\|/g, "")
    .replace(/[#*_`>]/g, "")
    .split(/\n+/)
    .map((line) => line.replace(/\|/g, "  ").trim())
    .filter(Boolean);
}

function wrapLine(line: string, width = 92): string[] {
  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export function buildSimplePdf(markdown: string, title = "Deal IQ Export"): Buffer {
  const lines = stripMarkdown(markdown).flatMap((line) => wrapLine(line));
  const pageLines = 42;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += pageLines) pages.push(lines.slice(i, i + pageLines));
  if (pages.length === 0) pages.push(["No content"]);

  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontObj = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageRefs: number[] = [];
  const pageBodies: string[] = [];

  pages.forEach((page, pageIndex) => {
    const textOps = [
      "BT",
      `/F1 16 Tf 54 760 Td (${escapePdf(pageIndex === 0 ? title : `${title} (cont.)`)}) Tj`,
      "/F1 9 Tf 0 -22 Td (Deal IQ AI - CONFIDENTIAL) Tj",
      "/F1 10 Tf 0 -24 Td",
      ...page.map((line, idx) => `${idx === 0 ? "" : "0 -15 Td "}(${escapePdf(line)}) Tj`),
      "ET",
    ].join("\n");
    const contentObj = add(`<< /Length ${Buffer.byteLength(textOps)} >>\nstream\n${textOps}\nendstream`);
    pageBodies.push(`<< /Type /Page /Parent __PAGES__ /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentObj} 0 R >>`);
    pageRefs.push(0);
  });

  const pagesObjIndex = objects.length + pageBodies.length + 1;
  pageBodies.forEach((body, idx) => {
    const ref = add(body.replace("__PAGES__", `${pagesObjIndex} 0 R`));
    pageRefs[idx] = ref;
  });
  const pagesObj = add(`<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`);
  const catalogObj = add(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, idx) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObj} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

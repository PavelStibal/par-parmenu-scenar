// Usage: node tools/epub.mjs
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SOURCE = resolve(ROOT, "data/screenplay.json");
const OUT_DIR = resolve(ROOT, "dist");
const OUTPUT = resolve(OUT_DIR, "par-parmenu.epub");

const data = JSON.parse(await readFile(SOURCE, "utf8"));
const characters = new Map((data.characters ?? []).map((c) => [c.id, c.name]));

const esc = (text) => String(text)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const xhtml = (title, body) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="cs" lang="cs">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>
`;

const STYLE = `body { font-family: serif; line-height: 1.45; margin: 0 5%; }
h1, h2 { font-weight: bold; text-align: center; }
h1 { font-size: 2em; margin: 30% 0 0.3em; }
h2 { font-size: 1.4em; margin: 1.5em 0 1.2em; page-break-before: always; }
.subtitle { text-align: center; font-style: italic; margin: 0 0 2em; }
.byline { text-align: center; font-size: 0.85em; letter-spacing: 0.15em; text-transform: uppercase; }
.ornament { text-align: center; font-size: 1.4em; margin: 1em 0; }
.line { margin: 0 0 0.9em; page-break-inside: avoid; }
.who { display: block; font-size: 0.75em; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; page-break-after: avoid; }
.who.unknown { font-weight: normal; opacity: 0.6; }
.text { margin: 0; text-indent: 0; }
.note { margin: 0 0 0.9em; text-align: center; font-style: italic; }
.legal { font-size: 0.8em; margin-top: 3em; }
`;

function renderChapter(chapter) {
  const parts = [`<section epub:type="chapter">`, `<h2>${esc(chapter.title)}</h2>`];
  for (const block of chapter.blocks) {
    if (block.type === "note") {
      parts.push(`<p class="note">(${esc(block.text)})</p>`);
      continue;
    }
    const name = characters.get(block.who);
    const who = name
      ? `<span class="who">${esc(name)}</span>`
      : `<span class="who unknown">???</span>`;
    parts.push(`<div class="line">${who}<p class="text">${esc(block.text)}</p></div>`);
  }
  parts.push("</section>");
  return parts.join("\n");
}

const titlePage = xhtml(data.title, `<section epub:type="titlepage">
<h1>${esc(data.title)}</h1>
<p class="subtitle">${esc(data.subtitle ?? "")}</p>
<p class="ornament">❦</p>
<p class="byline">Banda Trotlů · 2004</p>
<p class="legal">Neoficiální nekomerční fanouškovský projekt. Texty © Banda Trotlů (2004).
The Lord of the Rings © příslušní držitelé práv. Všechna práva vyhrazena autorům.</p>
</section>`);

const chapterFiles = data.chapters.map((chapter, i) => ({
  id: `chapter-${i + 1}`,
  href: `chapter-${i + 1}.xhtml`,
  title: chapter.title || `Kapitola ${i + 1}`,
  content: xhtml(chapter.title, renderChapter({ ...chapter, title: chapter.title || `Kapitola ${i + 1}` })),
}));

// Stable identifier so re-built books replace the old copy on a reader.
const hash = createHash("sha1").update(`par-parmenu:${data.title}`).digest("hex");
const uuid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const nav = xhtml("Obsah", `<nav epub:type="toc" id="toc">
<h2>Obsah</h2>
<ol>
${chapterFiles.map((c) => `  <li><a href="${c.href}">${esc(c.title)}</a></li>`).join("\n")}
</ol>
</nav>`);

const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="cs">
<head><meta name="dtb:uid" content="urn:uuid:${uuid}"/></head>
<docTitle><text>${esc(data.title)}</text></docTitle>
<navMap>
${chapterFiles.map((c, i) => `  <navPoint id="nav-${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(c.title)}</text></navLabel><content src="${c.href}"/></navPoint>`).join("\n")}
</navMap>
</ncx>
`;

const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="cs">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="book-id">urn:uuid:${uuid}</dc:identifier>
  <dc:title>${esc(data.title)} – ${esc(data.subtitle ?? "")}</dc:title>
  <dc:creator>Banda Trotlů</dc:creator>
  <dc:language>cs</dc:language>
  <dc:rights>Všechna práva vyhrazena autorům. Neoficiální nekomerční fanouškovský projekt.</dc:rights>
  <meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  <item id="style" href="style.css" media-type="text/css"/>
  <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
${chapterFiles.map((c) => `  <item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`).join("\n")}
</manifest>
<spine toc="ncx">
  <itemref idref="title"/>
  <itemref idref="nav"/>
${chapterFiles.map((c) => `  <itemref idref="${c.id}"/>`).join("\n")}
</spine>
</package>
`;

const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

// Minimal ZIP writer, so the EPUB can be built without dependencies.
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function zip(files) {
  const { time, day } = dosDateTime(new Date());
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, "utf8");
    const body = file.store ? raw : deflateRawSync(raw, { level: 9 });
    const method = file.store ? 0 : 8;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);         // version needed
    local.writeUInt16LE(0x0800, 6);     // flags: UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);         // extra length
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);       // version made by
    central.writeUInt16LE(20, 6);       // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);  // local header offset (other fields stay 0)
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// EPUB requires "mimetype" as the first entry, uncompressed.
const files = [
  { name: "mimetype", data: "application/epub+zip", store: true },
  { name: "META-INF/container.xml", data: container },
  { name: "OEBPS/content.opf", data: opf },
  { name: "OEBPS/nav.xhtml", data: nav },
  { name: "OEBPS/toc.ncx", data: ncx },
  { name: "OEBPS/style.css", data: STYLE },
  { name: "OEBPS/title.xhtml", data: titlePage },
  ...chapterFiles.map((c) => ({ name: `OEBPS/${c.href}`, data: c.content })),
];

await mkdir(OUT_DIR, { recursive: true });
const epub = zip(files);
await writeFile(OUTPUT, epub);
console.log(`Hotovo: ${chapterFiles.length} kapitol, ${(epub.length / 1024).toFixed(0)} kB → ${OUTPUT}`);

// Usage: node tools/build.mjs
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SOURCE = resolve(ROOT, "data/screenplay.md");
const CHARACTERS = resolve(ROOT, "data/characters.json");
const OUTPUT = resolve(ROOT, "data/screenplay.json");

const fold = (text) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
const slug = (text) => fold(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const md = (await readFile(SOURCE, "utf8")).replace(/\r\n/g, "\n");
const characters = JSON.parse(await readFile(CHARACTERS, "utf8"));

const byName = new Map();
for (const c of characters) {
  for (const key of [c.id, c.name, ...(c.aliases ?? [])]) byName.set(fold(key), c.id);
}
// First names only as a fallback, so "Choboti" never resolves to "Choboti zvenčí".
for (const c of characters) {
  const first = fold(c.name.split(" ")[0]);
  if (!byName.has(first)) byName.set(first, c.id);
}

const unknownNames = new Map();
let unknownSpeakers = 0;

function resolveSpeaker(name) {
  const key = fold(name);
  if (!key || /^\?+$/.test(key)) {
    unknownSpeakers++;
    return null;
  }
  let id = byName.get(key);
  if (!id) {
    id = slug(name) || `postava-${byName.size}`;
    characters.push({ id, name: name.trim(), autoAdded: true });
    byName.set(key, id);
  }
  if (characters.find((c) => c.id === id).autoAdded) {
    unknownNames.set(name.trim(), (unknownNames.get(name.trim()) ?? 0) + 1);
  }
  return id;
}

let title = "Pár Pařmenů";
const fps = Number(/<!--\s*fps:\s*([\d.]+)\s*-->/.exec(md)?.[1] ?? 25);
const chapters = [];
let chapter = null;

const ensureChapter = () => {
  if (!chapter) {
    chapter = { title: "", blocks: [] };
    chapters.push(chapter);
  }
  return chapter;
};

for (const paragraph of md.split(/\n\s*\n/)) {
  const time = /<!--\s*(\d+)\s*-\s*(\d+)\s*-->/.exec(paragraph);
  const lines = paragraph
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) continue;

  const timing = time ? { start: Number(time[1]), end: Number(time[2]) } : {};

  if (lines[0].startsWith("## ")) {
    chapter = { title: lines.shift().slice(3).trim(), blocks: [] };
    chapters.push(chapter);
    if (!lines.length) continue;
  } else if (lines[0].startsWith("# ")) {
    title = lines.shift().slice(2).trim();
    if (!lines.length) continue;
  }

  const speaker = /^\*\*(.+?)\*\*$/.exec(lines[0]);
  if (speaker) {
    const text = lines.slice(1).join(" ");
    if (text) ensureChapter().blocks.push({ type: "line", who: resolveSpeaker(speaker[1]), text, ...timing });
    continue;
  }

  const text = lines.join(" ");
  if (text.startsWith("(") && text.endsWith(")")) {
    ensureChapter().blocks.push({ type: "note", text: text.slice(1, -1).trim(), ...timing });
  } else {
    unknownSpeakers++;
    ensureChapter().blocks.push({ type: "line", who: null, text, ...timing });
  }
}

const usedIds = new Set(chapters.flatMap((c) => c.blocks.map((b) => b.who)).filter(Boolean));
const output = {
  title,
  subtitle: "Čistý scénář",
  fps,
  characters: characters
    .filter((c) => usedIds.has(c.id) || c.original)
    .map(({ id, name, original }) => ({ id, name, ...(original ? { original } : {}) })),
  chapters,
};
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");

const blocks = chapters.flatMap((c) => c.blocks);
console.log(`Hotovo: ${chapters.length} kapitol, ${blocks.filter((b) => b.type === "line").length} replik, `
  + `${blocks.filter((b) => b.type === "note").length} poznámek → ${OUTPUT}`);
console.log(`Replik bez určené postavy (???): ${unknownSpeakers}`);
if (unknownNames.size) {
  console.log("Jména, která nejsou v data/characters.json (přidána automaticky, zkontrolujte překlepy):");
  for (const [name, count] of unknownNames) console.log(`  ${name} (${count}×)`);
}

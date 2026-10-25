// Usage: node tools/subs-to-md.mjs [input.txt] [--force]
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_INPUT = resolve(ROOT, "data/raw/titulky_parparmenu.txt");
const OUTPUT = resolve(ROOT, "data/screenplay.md");

const CHAPTER_GAP_SECONDS = 60;
const MERGE_GAP_SECONDS = 2;
const UNKNOWN = "???";

const args = process.argv.slice(2);
const force = args.includes("--force");
const input = resolve(args.find((a) => !a.startsWith("--")) ?? DEFAULT_INPUT);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseCues(raw) {
  let fps = 25;
  const cues = [];
  for (const line of raw.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = /^\{(\d+)\}\{(\d+)\}(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, start, end, text] = m;
    // MicroDVD stores the frame rate as a fake first cue: {1}{1}25.000
    if (start === "1" && end === "1" && /^\d+(\.\d+)?$/.test(text.trim())) {
      fps = Number(text);
      continue;
    }
    cues.push({ start: Number(start), end: Number(end), text });
  }
  return { fps, cues };
}

const clean = (text) => text.replace(/\s+/g, " ").trim();
const isBracketNote = (text) => /^\[.*\]$/.test(text);
const isTitleCard = (text) => {
  const letters = text.replace(/[^\p{L}]/gu, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
};
const endsSentence = (text) => /[.!?…"“”)\]]$/.test(text) && !text.endsWith("...");

function splitReplicas(text) {
  const replicas = [];
  for (const rawPart of text.split("|")) {
    const part = clean(rawPart);
    if (!part) continue;
    // A single leading dash marks a new speaker; "--" is just stylised speech.
    const dash = /^-(?!-)\s*/.exec(part);
    if (dash) replicas.push({ text: part.slice(dash[0].length), dashed: true });
    else if (replicas.length) replicas[replicas.length - 1].text += ` ${part}`;
    else replicas.push({ text: part, dashed: false });
  }
  return replicas;
}

function buildChapters(fps, cues) {
  const chapters = [];
  let chapter = null;
  let prevEnd = null;

  for (const cue of cues) {
    if (!chapter || (cue.start - prevEnd) / fps > CHAPTER_GAP_SECONDS) {
      chapter = { title: `Kapitola ${chapters.length + 1}`, items: [] };
      chapters.push(chapter);
    }
    const gap = prevEnd == null ? Infinity : (cue.start - prevEnd) / fps;
    prevEnd = cue.end;

    const whole = clean(cue.text.replace(/\|/g, " "));
    if (isBracketNote(whole) || isTitleCard(whole)) {
      chapter.items.push({ type: "note", text: whole.replace(/^\[|\]$/g, ""), start: cue.start, end: cue.end });
      continue;
    }

    // Long sentences are split over several cues; join them back so there are
    // fewer replicas to assign a speaker to by hand.
    const replicas = splitReplicas(cue.text);
    const prev = chapter.items[chapter.items.length - 1];
    const first = replicas[0];
    const canMerge = prev?.type === "line" && replicas.length === 1 && !first.dashed && gap <= MERGE_GAP_SECONDS
      && (!endsSentence(prev.text) && !prev.text.endsWith("...")
        || prev.text.endsWith("...") && first.text.startsWith("..."));
    if (canMerge) {
      prev.text += ` ${first.text.replace(/^\.\.\.\s*/, "")}`;
      prev.end = cue.end;
      continue;
    }
    for (const r of replicas) {
      chapter.items.push({ type: "line", text: r.text, start: cue.start, end: cue.end });
    }
  }
  return chapters;
}

function toMarkdown(fps, chapters, source) {
  const out = [
    "# Pár Pařmenů",
    "",
    `<!-- fps: ${fps} -->`,
    `<!-- Převedeno z ${source}. Jména postav doplňte místo **${UNKNOWN}** (viz data/characters.json), -->`,
    "<!-- názvy kapitol přepište podle sebe. Čísla v komentářích jsou snímky z titulků, nemazat. -->",
    "",
  ];
  for (const chapter of chapters) {
    out.push(`## ${chapter.title}`, "");
    for (const item of chapter.items) {
      const time = `<!-- ${item.start}-${item.end} -->`;
      if (item.type === "note") out.push(`(${item.text}) ${time}`, "");
      else out.push(`**${UNKNOWN}**`, `${item.text} ${time}`, "");
    }
  }
  return out.join("\n");
}

// The output is edited by hand afterwards, so never overwrite it silently.
if ((await exists(OUTPUT)) && !force) {
  console.error(`${OUTPUT} už existuje a mohl by obsahovat ruční úpravy. Přepsat jen s --force.`);
  process.exit(1);
}

const { fps, cues } = parseCues(await readFile(input, "utf8"));
const chapters = buildChapters(fps, cues);
const relativeSource = input.slice(ROOT.length + 1).replace(/\\/g, "/");
await writeFile(OUTPUT, toMarkdown(fps, chapters, relativeSource), "utf8");

const lines = chapters.reduce((n, c) => n + c.items.filter((i) => i.type === "line").length, 0);
const notes = chapters.reduce((n, c) => n + c.items.filter((i) => i.type === "note").length, 0);
console.log(`Hotovo: ${cues.length} titulků → ${chapters.length} kapitol, ${lines} replik, ${notes} poznámek.`);
console.log(`Zapsáno do ${OUTPUT}`);

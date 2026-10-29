import { fold } from "./text.js";

export class Screenplay {
  #data;
  #blocks = [];
  #characters = new Map();

  static async load(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new Screenplay(await response.json());
  }

  constructor(data) {
    this.#data = data;
    for (const c of data.characters ?? []) this.#characters.set(c.id, c);

    let idx = 0;
    data.chapters.forEach((chapter, chapterIndex) => {
      this.#blocks.push({ idx: idx++, type: "chapter", chapter: chapterIndex, text: chapter.title });
      for (const b of chapter.blocks) {
        const previous = this.#blocks.at(-1);
        this.#blocks.push({
          idx: idx++,
          type: b.type,
          chapter: chapterIndex,
          text: b.text,
          who: b.who ?? null,
          start: b.start,
          end: b.end,
          sameSpeaker: b.type === "line" && b.who != null && previous.type === "line" && previous.who === b.who,
          search: fold(b.text),
        });
      }
    });
  }

  get title() {
    return this.#data.title;
  }

  get subtitle() {
    return this.#data.subtitle ?? "";
  }

  get isSample() {
    return Boolean(this.#data.sample);
  }

  get blocks() {
    return this.#blocks;
  }

  get usedCharacters() {
    const used = new Set(this.#blocks.filter((b) => b.type === "line").map((b) => b.who));
    return [...this.#characters.values()].filter((c) => used.has(c.id));
  }

  hasCharacter(id) {
    return this.#characters.has(id);
  }

  characterName(id) {
    return this.#characters.get(id)?.name ?? "???";
  }

  chapterTitle(index) {
    return this.#data.chapters[index].title;
  }
}

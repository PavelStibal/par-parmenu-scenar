import { appendHighlighted, el } from "./text.js";

export function renderBlock(block, screenplay, query = "") {
  if (block.type === "chapter") {
    const head = el("div", "chapter-head");
    head.append(el("h2", "chapter__title", block.text), el("span", "chapter__ornament", "❦"));
    return head;
  }
  if (block.type === "note") {
    return el("p", "note", `(${block.text})`);
  }
  const line = el("div", block.firstInChapter ? "line line--first" : "line");
  line.dataset.idx = block.idx;
  const who = el("span", "line__who", screenplay.characterName(block.who));
  if (!screenplay.hasCharacter(block.who)) who.classList.add("line__who--unknown");
  const text = el("p", "line__text");
  appendHighlighted(text, block.text, query);
  line.append(who, text);
  return line;
}

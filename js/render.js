import { appendHighlighted, el } from "./text.js";

// The speaker name is printed once per run of replicas, so a replica continues
// the previous one only when that one is shown directly above it.
export function continuesPrevious(block, previous) {
  return Boolean(block.sameSpeaker && previous && previous.idx === block.idx - 1);
}

export function renderBlock(block, screenplay, { query = "", previous = null } = {}) {
  if (block.type === "chapter") {
    const head = el("div", "chapter-head");
    head.append(el("h2", "chapter__title", block.text), el("span", "chapter__ornament", "❦"));
    return head;
  }
  if (block.type === "note") {
    return el("p", "note", `(${block.text})`);
  }
  const line = el("div", "line");
  line.dataset.idx = block.idx;
  if (continuesPrevious(block, previous)) {
    line.classList.add("line--continued");
  } else {
    const who = el("span", "line__who", screenplay.characterName(block.who));
    if (!screenplay.hasCharacter(block.who)) who.classList.add("line__who--unknown");
    line.append(who);
  }
  const text = el("p", "line__text");
  appendHighlighted(text, block.text, query);
  line.append(text);
  return line;
}

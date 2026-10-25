"use strict";

const DATA_URL = "data/scenar.json";
const FLIP_MS = 800;
const MAX_STACK_PX = 10;
const SINGLE_PAGE_QUERY = window.matchMedia("(max-width: 799px)");
const REDUCED_MOTION_QUERY = window.matchMedia("(prefers-reduced-motion: reduce)");
const MODES = ["web", "pdf", "book"];

const state = {
  data: null,
  blocks: [],             // flat list of chapter headings, lines and notes
  characters: new Map(),  // id -> { id, name, original }
  query: "",              // folded (lowercase, no diacritics) search text
  activeChars: new Set(),
  mode: "web",
  soundOn: true,
  pdfRendered: false,
  book: {
    pages: [],            // { kind, blocks?, number? }
    pos: 0,               // shown page (left page of the spread in two-page mode)
    single: false,
    flipping: false,
    contentCount: 0,
  },
};

const els = {
  search: document.getElementById("search-input"),
  searchCount: document.getElementById("search-count"),
  chips: document.getElementById("character-filter"),
  status: document.getElementById("status"),
  sampleBanner: document.getElementById("sample-banner"),
  script: document.getElementById("script"),
  pdfView: document.getElementById("pdf-view"),
  pdfPages: document.getElementById("pdf-pages"),
  pdfInfo: document.getElementById("pdf-info"),
  printBtn: document.getElementById("print-btn"),
  bookView: document.getElementById("book-view"),
  book: document.getElementById("book"),
  pageLeft: document.getElementById("page-left"),
  pageRight: document.getElementById("page-right"),
  leaf: document.getElementById("leaf"),
  leafFront: document.getElementById("leaf-front"),
  leafBack: document.getElementById("leaf-back"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  pageIndicator: document.getElementById("page-indicator"),
  bookBack: document.getElementById("book-back"),
  soundBtn: document.getElementById("sound-btn"),
  fullscreenBtn: document.getElementById("fullscreen-btn"),
  measure: document.getElementById("measure"),
  modeBtns: document.querySelectorAll("[data-mode-btn]"),
};

/* ---------- Helpers ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function loadPref(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function savePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be blocked (private mode); preferences are optional.
  }
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Lowercase and strip diacritics, so "helium" finds "hélium". */
function fold(text) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Folded text plus a map from each folded char back to its index in the original. */
function foldWithMap(text) {
  let folded = "";
  const map = [];
  let i = 0;
  for (const ch of text) {
    const f = fold(ch);
    for (let j = 0; j < f.length; j++) map.push(i);
    folded += f;
    i += ch.length;
  }
  return { folded, map };
}

/** Appends text to parent, wrapping matches of the folded query in <mark>. */
function appendHighlighted(parent, text, query) {
  if (!query) {
    parent.append(text);
    return;
  }
  const { folded, map } = foldWithMap(text);
  let last = 0;
  let from = 0;
  let pos;
  while ((pos = folded.indexOf(query, from)) !== -1) {
    const start = map[pos];
    const afterEnd = pos + query.length;
    const end = afterEnd < map.length ? map[afterEnd] : text.length;
    if (start > last) parent.append(text.slice(last, start));
    if (end > start) parent.append(el("mark", null, text.slice(start, end)));
    last = Math.max(last, end);
    from = afterEnd;
  }
  if (last < text.length) parent.append(text.slice(last));
}

function czechPlural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

function characterName(id) {
  return state.characters.get(id)?.name ?? "???";
}

/* ---------- Data ---------- */

function prepare(data) {
  for (const c of data.characters ?? []) state.characters.set(c.id, c);
  let idx = 0;
  data.chapters.forEach((chapter, chapterIndex) => {
    state.blocks.push({ idx: idx++, type: "chapter", chapter: chapterIndex, text: chapter.title });
    let first = true;
    for (const b of chapter.blocks) {
      state.blocks.push({
        idx: idx++,
        type: b.type,
        chapter: chapterIndex,
        text: b.text,
        who: b.who ?? null,
        start: b.start,
        end: b.end,
        firstInChapter: b.type === "line" && first,
        search: fold(b.text),
      });
      if (b.type === "line") first = false;
    }
  });
}

function isFiltering() {
  return state.query !== "" || state.activeChars.size > 0;
}

function matches(block) {
  if (block.type !== "line") return false;
  if (state.activeChars.size && !state.activeChars.has(block.who)) return false;
  return !state.query || block.search.includes(state.query);
}

/* ---------- Rendering of single blocks (web, PDF and book) ---------- */

function renderBlock(block, query) {
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
  const who = el("span", "line__who", characterName(block.who));
  if (!state.characters.has(block.who)) who.classList.add("line__who--unknown");
  const text = el("p", "line__text");
  appendHighlighted(text, block.text, query);
  line.append(who, text);
  return line;
}

/* ---------- Web view ---------- */

function renderScript() {
  const filtering = isFiltering();
  const frag = document.createDocumentFragment();
  let section = null;
  let sectionHasContent = false;
  let hits = 0;

  const closeSection = () => {
    if (section && sectionHasContent) frag.append(section);
  };

  for (const block of state.blocks) {
    if (block.type === "chapter") {
      closeSection();
      section = el("section", "chapter");
      section.append(renderBlock(block, ""));
      sectionHasContent = !filtering;
      continue;
    }
    if (filtering) {
      if (!matches(block)) continue;
      hits++;
      sectionHasContent = true;
    }
    section.append(renderBlock(block, state.query));
  }
  closeSection();

  if (filtering && hits === 0) {
    frag.append(el("p", "empty", "Nic nenalezeno. Zkuste jiné slovo nebo zrušte filtr postav."));
  }

  els.script.replaceChildren(frag);
  els.searchCount.textContent = filtering
    ? `${hits} ${czechPlural(hits, "výsledek", "výsledky", "výsledků")}`
    : "";
}

function renderChips() {
  const used = new Set(state.blocks.filter((b) => b.type === "line").map((b) => b.who));
  const chips = [];
  for (const c of state.characters.values()) {
    if (!used.has(c.id)) continue;
    const chip = el("button", "chip", c.name);
    chip.type = "button";
    chip.dataset.id = c.id;
    if (c.original) chip.append(" ", el("span", "chip__original", `(${c.original})`));
    chip.addEventListener("click", () => {
      if (state.activeChars.has(c.id)) state.activeChars.delete(c.id);
      else state.activeChars.add(c.id);
      syncChips();
      renderScript();
    });
    chips.push(chip);
  }
  // Without any assigned speakers there is nothing to filter by.
  els.chips.hidden = chips.length === 0;
  if (!chips.length) return;

  const all = el("button", "chip", "Všechny postavy");
  all.type = "button";
  all.dataset.all = "";
  all.addEventListener("click", () => {
    state.activeChars.clear();
    syncChips();
    renderScript();
  });
  els.chips.replaceChildren(all, ...chips);
  syncChips();
}

function syncChips() {
  for (const chip of els.chips.children) {
    const pressed = "all" in chip.dataset
      ? state.activeChars.size === 0
      : state.activeChars.has(chip.dataset.id);
    chip.setAttribute("aria-pressed", String(pressed));
  }
}

/* ---------- Pagination (shared by book and PDF) ---------- */

/**
 * Splits all blocks into pages by filling the off-screen measure page until it
 * overflows. `skeleton(body)` returns the page parts (header, body, footer).
 * Every chapter starts on a new page. `slack` keeps a safety margin (0–1).
 */
function paginate(skeleton, slack = 0) {
  const body = el("div", "page__body");
  els.measure.replaceChildren(...skeleton(body));

  const pages = [];
  let current = [];
  const overflows = () => {
    if (body.scrollHeight > body.clientHeight + 1) return true;
    if (!slack) return false;
    // scrollHeight never drops below clientHeight, so measure the content itself.
    const contentBottom = body.lastElementChild.getBoundingClientRect().bottom - body.getBoundingClientRect().top;
    return contentBottom > body.clientHeight * (1 - slack);
  };
  const flush = () => {
    if (current.length) pages.push(current);
    current = [];
    body.replaceChildren();
  };

  for (const block of state.blocks) {
    if (block.type === "chapter") flush();
    const node = renderBlock(block, "");
    body.append(node);
    if (current.length && overflows()) {
      node.remove();
      flush();
      body.append(node);
    }
    current.push(block);
  }
  flush();
  return pages;
}

/* ---------- PDF view ---------- */

function renderPdf() {
  if (state.pdfRendered) return;
  const measure = els.measure;
  measure.removeAttribute("style");
  measure.className = "a4 measure";
  const contentPages = paginate((body) => [
    el("div", "a4__header", "X"),
    body,
    el("div", "a4__footer", "0"),
  ], 0.015);

  const frag = document.createDocumentFragment();
  const title = el("section", "a4 a4--title");
  title.append(
    el("span", "a4__ornament", "❦"),
    el("h2", null, state.data.title),
    el("p", null, state.data.subtitle ?? ""),
    el("p", "a4__byline", "Banda Trotlů · 2004"),
  );
  frag.append(title);

  contentPages.forEach((blocks, i) => {
    const page = el("section", "a4");
    const header = el("div", "a4__header");
    header.append(
      el("span", null, state.data.title),
      el("span", null, state.data.chapters[blocks[0].chapter].title),
    );
    const body = el("div", "page__body");
    for (const block of blocks) body.append(renderBlock(block, ""));
    page.append(header, body, el("div", "a4__footer", String(i + 1)));
    frag.append(page);
  });

  els.pdfPages.replaceChildren(frag);
  const total = contentPages.length + 1;
  els.pdfInfo.textContent = `Náhled tisku · ${total} ${czechPlural(total, "strana", "strany", "stran")} A4`;
  measure.className = "measure";
  measure.replaceChildren();
  state.pdfRendered = true;
}

/* ---------- Book: pages ---------- */

function buildBookPages(contentPages) {
  const single = state.book.single;
  const pages = [];
  // Two-page spreads: [nothing | cover], [endpaper | title], ... so the closed
  // cover sits on the right and opens like a real book.
  if (!single) pages.push({ kind: "none" });
  pages.push({ kind: "cover" });
  if (!single) pages.push({ kind: "endpaper" });
  pages.push({ kind: "title" });
  contentPages.forEach((blocks, i) => pages.push({ kind: "content", blocks, number: i + 1 }));
  pages.push({ kind: "end" });
  if (single) {
    pages.push({ kind: "back-cover" });
  } else {
    if (pages.length % 2 === 0) pages.push({ kind: "blank" });
    pages.push({ kind: "endpaper" }, { kind: "back-cover" }, { kind: "none" });
  }
  state.book.contentCount = contentPages.length;
  return pages;
}

function coverEmblem() {
  const emblem = el("div", "cover__emblem");
  emblem.append(el("span", "cover__ring"), el("span", "cover__chip"));
  return emblem;
}

function buildPageContent(page) {
  switch (page.kind) {
    case "cover": {
      const cover = el("div", "cover");
      cover.append(
        el("p", "cover__subtitle", "Kniha hlášek"),
        el("h2", "cover__title", state.data.title),
        coverEmblem(),
        el("p", "cover__subtitle", state.data.subtitle ?? ""),
        el("p", "cover__byline", "Banda Trotlů · 2004"),
      );
      return [cover];
    }
    case "back-cover": {
      const cover = el("div", "cover cover--back");
      cover.append(coverEmblem(), el("p", "cover__byline", "Jeden ringouš veli fšeckym"));
      return [cover];
    }
    case "endpaper": {
      const label = el("div", "exlibris");
      label.append(el("p", "exlibris__label", "EX LIBRIS"), el("p", null, state.data.title));
      return [label];
    }
    case "title": {
      const title = el("div", "title-page");
      title.append(
        el("span", "page-ornament", "❦"),
        el("h2", null, state.data.title),
        el("p", null, state.data.subtitle ?? ""),
        el("span", "title-page__rule"),
        el("p", "title-page__small", "podle titulků k fanouškovské parodii"),
        el("p", "page-byline", "Banda Trotlů · 2004"),
      );
      return [title];
    }
    case "end": {
      const end = el("div", "end-page");
      end.append(el("p", null, "Konec"), el("span", "page-ornament", "❦"));
      return [end];
    }
    case "content": {
      const body = el("div", "page__body");
      for (const block of page.blocks) body.append(renderBlock(block, ""));
      return [body, el("div", "page__num", `— ${page.number} —`)];
    }
    default:
      return [];
  }
}

function paintPage(pageEl, pageIndex, side) {
  const page = state.book.pages[pageIndex] ?? { kind: "none" };
  pageEl.dataset.kind = page.kind;
  if (side) pageEl.dataset.side = side;
  pageEl.replaceChildren(...buildPageContent(page));
}

/** Plain paper for the back of a page turned in single-page mode. */
function paintVerso(pageEl) {
  pageEl.dataset.kind = "blank";
  pageEl.dataset.side = "left";
  pageEl.replaceChildren();
}

function normalizePos(index) {
  const i = clamp(index, 0, state.book.pages.length - 1);
  return state.book.single ? i : i - (i % 2);
}

function pageIndexOfBlock(idx) {
  return state.book.pages.findIndex((p) =>
    p.kind === "content" && p.blocks[0].idx <= idx && idx <= p.blocks[p.blocks.length - 1].idx);
}

function visiblePages(pos = state.book.pos) {
  const { pages, single } = state.book;
  return single ? [pages[pos]] : [pages[pos], pages[pos + 1]];
}

function currentAnchor() {
  const content = visiblePages().find((p) => p?.kind === "content");
  return content ? content.blocks[0].idx : null;
}

/** (Re)builds the book for the current size while keeping the reading position. */
function layoutBook() {
  const book = state.book;
  if (state.mode !== "book" || !state.data) return;
  if (book.flipping) {
    setTimeout(layoutBook, FLIP_MS);
    return;
  }

  let anchor;
  let wasAtEnd = false;
  if (book.pages.length) {
    anchor = currentAnchor();
    wasAtEnd = book.pos >= book.pages.length - 3;
  } else {
    const saved = Number.parseInt(loadPref("ppm-book-anchor", ""), 10);
    anchor = Number.isNaN(saved) ? null : saved;
  }

  book.single = SINGLE_PAGE_QUERY.matches;
  els.book.classList.toggle("book--single", book.single);

  // The measure page must match a real page exactly.
  const rect = els.pageRight.getBoundingClientRect();
  const measure = els.measure;
  measure.className = "page measure";
  measure.style.width = `${rect.width}px`;
  measure.style.height = `${rect.height}px`;
  measure.style.fontSize = getComputedStyle(els.pageRight).fontSize;
  const contentPages = paginate((body) => [body, el("div", "page__num", "— 0 —")]);
  measure.className = "measure";
  measure.removeAttribute("style");
  measure.replaceChildren();

  book.pages = buildBookPages(contentPages);
  let target = 0;
  if (anchor != null) target = Math.max(0, pageIndexOfBlock(anchor));
  else if (wasAtEnd) target = book.pages.length - 1;
  book.pos = normalizePos(target);
  showPages();
}

/** Closed-book centring and page-block thickness for the given position. */
function updateFrame(pos) {
  const { pages, single } = state.book;
  const [left, right] = single ? [null, pages[pos]] : visiblePages(pos);
  els.book.classList.toggle("book--closed-front", !single && left?.kind === "none");
  els.book.classList.toggle("book--closed-back", !single && right?.kind === "none");

  const progress = pos / Math.max(1, pages.length - 1);
  const leftShown = !single && left && left.kind !== "none";
  const rightShown = right && right.kind !== "none";
  els.book.style.setProperty("--stack-l", leftShown ? `${(progress * MAX_STACK_PX).toFixed(1)}px` : "0px");
  els.book.style.setProperty("--stack-r", rightShown ? `${((1 - progress) * MAX_STACK_PX).toFixed(1)}px` : "0px");
}

function describePosition() {
  const pages = visiblePages().filter(Boolean);
  const content = pages.filter((p) => p.kind === "content");
  const total = state.book.contentCount;
  if (content.length === 2) return `Strany ${content[0].number}–${content[1].number} z ${total}`;
  if (content.length === 1) return `Strana ${content[0].number} z ${total}`;
  const kinds = pages.map((p) => p.kind);
  if (kinds.includes("cover")) return "Obálka – otevřete knihu";
  if (kinds.includes("title")) return "Titulní strana";
  if (kinds.includes("end")) return "Konec";
  return "Zadní obálka";
}

function showPages() {
  const book = state.book;
  if (!book.pages.length) return;
  if (book.single) {
    paintPage(els.pageRight, book.pos, "right");
  } else {
    paintPage(els.pageLeft, book.pos, "left");
    paintPage(els.pageRight, book.pos + 1, "right");
  }
  updateFrame(book.pos);
  const step = book.single ? 1 : 2;
  els.prevBtn.disabled = book.pos === 0;
  els.nextBtn.disabled = book.pos + step > book.pages.length - 1;
  els.pageIndicator.textContent = describePosition();

  const anchor = currentAnchor();
  savePref("ppm-book-anchor", anchor == null ? "" : String(anchor));
}

/* ---------- Book: turning pages ---------- */

function flip(direction) {
  const book = state.book;
  if (book.flipping || !book.pages.length) return;
  const step = book.single ? 1 : 2;
  const target = book.pos + direction * step;
  if (target < 0 || target > book.pages.length - 1) return;

  const heavy = [...visiblePages(), ...visiblePages(target)].some((p) => p?.kind.includes("cover") ?? false);
  playFlipSound(heavy);
  if (REDUCED_MOTION_QUERY.matches) {
    book.pos = target;
    showPages();
    return;
  }
  book.flipping = true;
  updateFrame(target);
  if (book.single) animateSingle(direction, target);
  else animateSpread(direction, target);
}

function runLeaf(className, fromDeg, toDeg, done) {
  const leaf = els.leaf;
  leaf.className = `leaf ${className} is-turning`;
  leaf.style.transition = "none";
  leaf.style.transform = `rotateY(${fromDeg}deg)`;
  leaf.hidden = false;
  leaf.getBoundingClientRect(); // commit the start state so the transition runs
  leaf.style.transition = "";
  leaf.style.transform = `rotateY(${toDeg}deg)`;

  afterTransition(leaf, () => {
    done();
    leaf.hidden = true;
    leaf.classList.remove("is-turning");
    leaf.style.transform = "";
    state.book.flipping = false;
  });
}

function animateSpread(direction, target) {
  const pos = state.book.pos;
  const finish = () => {
    state.book.pos = target;
    showPages();
  };
  if (direction > 0) {
    // The right page turns over to the left; the new right page lies underneath.
    paintPage(els.leafFront, pos + 1, "right");
    paintPage(els.leafBack, target, "left");
    paintPage(els.pageRight, target + 1, "right");
    runLeaf("leaf--forward", 0, -180, finish);
  } else {
    // The left page turns back to the right; the new left page lies underneath.
    paintPage(els.leafFront, pos, "left");
    paintPage(els.leafBack, target + 1, "right");
    paintPage(els.pageLeft, target, "left");
    runLeaf("leaf--backward", 0, 180, finish);
  }
}

function animateSingle(direction, target) {
  const pos = state.book.pos;
  paintVerso(els.leafBack);
  if (direction > 0) {
    // The current page swings away over the spine, revealing the next one.
    paintPage(els.leafFront, pos, "right");
    paintPage(els.pageRight, target, "right");
    runLeaf("leaf--single", 0, -180, () => {
      state.book.pos = target;
      showPages();
    });
  } else {
    // The previous page swings back in on top of the current one.
    paintPage(els.leafFront, target, "right");
    runLeaf("leaf--single", -180, 0, () => {
      state.book.pos = target;
      showPages();
    });
  }
}

function afterTransition(node, done) {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    node.removeEventListener("transitionend", onEnd);
    done();
  };
  const onEnd = (e) => {
    if (e.target === node && e.propertyName === "transform") finish();
  };
  node.addEventListener("transitionend", onEnd);
  setTimeout(finish, FLIP_MS + 150); // fallback if transitionend never fires
}

function goToPage(index) {
  const book = state.book;
  if (book.flipping || !book.pages.length) return;
  const target = normalizePos(index);
  if (target === book.pos) return;
  playFlipSound(false);
  book.pos = target;
  showPages();
}

/* ---------- Sound: synthesized paper rustle (no audio files needed) ---------- */

let audioCtx = null;

function playFlipSound(heavy) {
  if (!state.soundOn) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const duration = heavy ? 0.5 : 0.42;
    const rate = audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, Math.floor(rate * duration), rate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const t = i / samples.length;
      const envelope = Math.sin(Math.PI * t) ** 2 * (1 - 0.5 * t);
      samples[i] = (Math.random() * 2 - 1) * envelope;
    }
    const now = audioCtx.currentTime;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.7;
    // A leather cover sounds lower and duller than a sheet of paper.
    filter.frequency.setValueAtTime(heavy ? 1400 : 3800, now);
    filter.frequency.exponentialRampToValueAtTime(heavy ? 300 : 900, now + duration);
    const gain = audioCtx.createGain();
    gain.gain.value = heavy ? 0.5 : 0.35;
    source.connect(filter).connect(gain).connect(audioCtx.destination);
    source.start(now);
  } catch {
    // Audio is a nice-to-have; ignore unsupported browsers.
  }
}

function setSound(on) {
  state.soundOn = on;
  els.soundBtn.setAttribute("aria-pressed", String(on));
  els.soundBtn.textContent = on ? "Zvuk: zap" : "Zvuk: vyp";
  savePref("ppm-sound", on ? "on" : "off");
}

/* ---------- Modes ---------- */

function setMode(mode) {
  state.mode = MODES.includes(mode) ? mode : "web";
  document.body.dataset.mode = state.mode;
  savePref("ppm-mode", state.mode);
  for (const btn of els.modeBtns) {
    btn.setAttribute("aria-pressed", String(btn.dataset.modeBtn === state.mode));
  }
  els.script.hidden = state.mode !== "web";
  els.pdfView.hidden = state.mode !== "pdf";
  els.bookView.hidden = state.mode !== "book";
  window.scrollTo(0, 0);

  if (state.mode === "pdf") renderPdf();
  if (state.mode === "book") {
    layoutBook();
  } else if (document.fullscreenElement) {
    document.exitFullscreen?.();
  }
}

/* ---------- Events ---------- */

function bindEvents() {
  const onSearch = debounce(() => {
    state.query = fold(els.search.value.trim());
    renderScript();
  }, 120);
  els.search.addEventListener("input", onSearch);
  els.search.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.search.value) {
      e.preventDefault();
      els.search.value = "";
      onSearch();
    }
  });

  for (const btn of els.modeBtns) {
    btn.addEventListener("click", () => setMode(btn.dataset.modeBtn));
  }
  els.bookBack.addEventListener("click", () => setMode("web"));
  els.printBtn.addEventListener("click", () => window.print());
  els.soundBtn.addEventListener("click", () => setSound(!state.soundOn));
  els.prevBtn.addEventListener("click", () => flip(-1));
  els.nextBtn.addEventListener("click", () => flip(1));

  els.fullscreenBtn.hidden = !document.fullscreenEnabled;
  els.fullscreenBtn.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else els.bookView.requestFullscreen?.();
  });
  document.addEventListener("fullscreenchange", () => {
    els.fullscreenBtn.textContent = document.fullscreenElement ? "Zavřít celou obrazovku" : "Celá obrazovka";
  });

  document.addEventListener("keydown", (e) => {
    const typing = e.target instanceof Element && e.target.closest("input, textarea, select");
    if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (state.mode === "web" && e.key === "/") {
      e.preventDefault();
      els.search.focus();
      return;
    }
    if (state.mode !== "book") return;
    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
      case " ":
        flip(1);
        break;
      case "ArrowLeft":
      case "PageUp":
        flip(-1);
        break;
      case "Home":
        goToPage(0);
        break;
      case "End":
        goToPage(state.book.pages.length - 1);
        break;
      case "Escape":
        if (!document.fullscreenElement) setMode("web");
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  // Click on the left/right half of the book, or swipe, to turn pages.
  let startX = null;
  els.book.addEventListener("pointerdown", (e) => {
    startX = e.clientX;
  });
  els.book.addEventListener("pointerup", (e) => {
    if (startX == null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) {
      flip(dx < 0 ? 1 : -1);
    } else if (Math.abs(dx) < 8) {
      const rect = els.book.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      flip(ratio < (state.book.single ? 0.3 : 0.5) ? -1 : 1);
    }
  });

  window.addEventListener("resize", debounce(layoutBook, 200));
  SINGLE_PAGE_QUERY.addEventListener("change", layoutBook);
  // Late web fonts change text metrics, so pages must be measured again.
  document.fonts?.addEventListener("loadingdone", () => {
    state.pdfRendered = false;
    if (state.mode === "pdf") renderPdf();
    layoutBook();
  });
}

/* ---------- Start ---------- */

async function init() {
  setSound(loadPref("ppm-sound", "on") === "on");
  bindEvents();

  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
  } catch (err) {
    console.error("Loading the script failed:", err);
    els.status.textContent =
      "Scénář se nepodařilo načíst. Stránku je potřeba spustit přes lokální server („node tools/serve.mjs“) – "
      + "při otevření souboru přímo z disku prohlížeč data nenačte.";
    els.status.classList.add("status--error");
    return;
  }

  prepare(state.data);
  els.status.hidden = true;
  els.sampleBanner.hidden = !state.data.sample;
  renderChips();
  renderScript();
  await document.fonts?.ready;
  setMode(loadPref("ppm-mode", "web"));
}

init();

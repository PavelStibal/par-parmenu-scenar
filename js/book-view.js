import { paginate } from "./paginator.js";
import { loadPref, savePref } from "./prefs.js";
import { renderBlock } from "./render.js";
import { debounce, el } from "./text.js";

const FLIP_MS = 800;
const MAX_STACK_PX = 10;
const SINGLE_PAGE_QUERY = window.matchMedia("(max-width: 799px)");
const REDUCED_MOTION_QUERY = window.matchMedia("(prefers-reduced-motion: reduce)");

export class BookView {
  #screenplay;
  #sound;
  #root;
  #measure;
  #els;
  #pages = [];
  #pos = 0; // in two-page mode the left page of the spread
  #single = false;
  #flipping = false;
  #contentCount = 0;

  constructor({ root, measure, onClose }, screenplay, sound) {
    this.#screenplay = screenplay;
    this.#sound = sound;
    this.#root = root;
    this.#measure = measure;
    const $ = (selector) => root.querySelector(selector);
    this.#els = {
      book: $("#book"),
      pageLeft: $("#page-left"),
      pageRight: $("#page-right"),
      leaf: $("#leaf"),
      leafFront: $("#leaf-front"),
      leafBack: $("#leaf-back"),
      prevBtn: $("#prev-btn"),
      nextBtn: $("#next-btn"),
      indicator: $("#page-indicator"),
      soundBtn: $("#sound-btn"),
      fullscreenBtn: $("#fullscreen-btn"),
    };

    $("#book-back").addEventListener("click", onClose);
    this.#els.prevBtn.addEventListener("click", () => this.previous());
    this.#els.nextBtn.addEventListener("click", () => this.next());
    this.#els.soundBtn.addEventListener("click", () => this.#setSound(!this.#sound.enabled));
    this.#setSound(loadPref("ppm-sound", "on") === "on");
    this.#bindFullscreen();
    this.#bindPointer();

    window.addEventListener("resize", debounce(() => this.layout(), 200));
    SINGLE_PAGE_QUERY.addEventListener("change", () => this.layout());
  }

  show() {
    this.layout();
  }

  next() {
    this.#flip(1);
  }

  previous() {
    this.#flip(-1);
  }

  first() {
    this.#goToPage(0);
  }

  last() {
    this.#goToPage(this.#pages.length - 1);
  }

  layout() {
    if (this.#root.hidden) return;
    if (this.#flipping) {
      setTimeout(() => this.layout(), FLIP_MS);
      return;
    }

    let anchor;
    let fromEnd = null;
    if (this.#pages.length) {
      anchor = this.#currentAnchor();
      // Pages after the text have no anchor, so keep their distance from the end.
      if (anchor == null && this.#pos > 3) fromEnd = this.#pages.length - this.#pos;
    } else {
      const saved = Number.parseInt(loadPref("ppm-book-anchor", ""), 10);
      anchor = Number.isNaN(saved) ? null : saved;
    }

    this.#single = SINGLE_PAGE_QUERY.matches;
    this.#els.book.classList.toggle("book--single", this.#single);

    this.#pages = this.#buildPages(this.#paginate());
    let target = 0;
    if (anchor != null) target = Math.max(0, this.#pageIndexOfBlock(anchor));
    else if (fromEnd != null) target = this.#pages.length - fromEnd;
    this.#pos = this.#normalizePos(target);
    this.#showPages();
  }

  #paginate() {
    const { pageRight } = this.#els;
    const rect = pageRight.getBoundingClientRect();
    const measure = this.#measure;
    measure.className = "page measure";
    measure.style.width = `${rect.width}px`;
    measure.style.height = `${rect.height}px`;
    measure.style.fontSize = getComputedStyle(pageRight).fontSize;
    const pages = paginate({
      measure,
      blocks: this.#screenplay.blocks,
      render: (block) => renderBlock(block, this.#screenplay),
      skeleton: (body) => [body, el("div", "page__num", "— 0 —")],
    });
    measure.className = "measure";
    measure.removeAttribute("style");
    measure.replaceChildren();
    return pages;
  }

  #buildPages(contentPages) {
    const pages = [];
    // Spreads start with [nothing | cover], so the closed cover sits on the right
    // and opens like a real book.
    if (!this.#single) pages.push({ kind: "none" });
    pages.push({ kind: "cover" });
    if (!this.#single) pages.push({ kind: "endpaper" });
    pages.push({ kind: "title" });
    contentPages.forEach((blocks, i) => pages.push({ kind: "content", blocks, number: i + 1 }));
    pages.push({ kind: "end" });
    if (this.#single) {
      pages.push({ kind: "back-cover" });
    } else {
      if (pages.length % 2 === 0) pages.push({ kind: "blank" });
      pages.push({ kind: "endpaper" }, { kind: "back-cover" }, { kind: "none" });
    }
    this.#contentCount = contentPages.length;
    return pages;
  }

  #pageContent(page) {
    const screenplay = this.#screenplay;
    switch (page.kind) {
      case "cover": {
        const cover = el("div", "cover");
        cover.append(
          el("p", "cover__subtitle", "Kniha hlášek"),
          el("h2", "cover__title", screenplay.title),
          coverEmblem(),
          el("p", "cover__subtitle", screenplay.subtitle),
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
        label.append(el("p", "exlibris__label", "EX LIBRIS"), el("p", null, screenplay.title));
        return [label];
      }
      case "title": {
        const title = el("div", "title-page");
        title.append(
          el("span", "page-ornament", "❦"),
          el("h2", null, screenplay.title),
          el("p", null, screenplay.subtitle),
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
        for (const block of page.blocks) body.append(renderBlock(block, screenplay));
        return [body, el("div", "page__num", `— ${page.number} —`)];
      }
      default:
        return [];
    }
  }

  #paintPage(pageEl, pageIndex, side) {
    const page = this.#pages[pageIndex] ?? { kind: "none" };
    pageEl.dataset.kind = page.kind;
    if (side) pageEl.dataset.side = side;
    pageEl.replaceChildren(...this.#pageContent(page));
  }

  #paintVerso(pageEl) {
    pageEl.dataset.kind = "blank";
    pageEl.dataset.side = "left";
    pageEl.replaceChildren();
  }

  #normalizePos(index) {
    const i = Math.min(Math.max(index, 0), this.#pages.length - 1);
    return this.#single ? i : i - (i % 2);
  }

  #pageIndexOfBlock(idx) {
    return this.#pages.findIndex((p) =>
      p.kind === "content" && p.blocks[0].idx <= idx && idx <= p.blocks[p.blocks.length - 1].idx);
  }

  #visiblePages(pos = this.#pos) {
    return this.#single ? [this.#pages[pos]] : [this.#pages[pos], this.#pages[pos + 1]];
  }

  #currentAnchor() {
    const content = this.#visiblePages().find((p) => p?.kind === "content");
    return content ? content.blocks[0].idx : null;
  }

  #updateFrame(pos) {
    const { book } = this.#els;
    const [left, right] = this.#single ? [null, this.#pages[pos]] : this.#visiblePages(pos);
    book.classList.toggle("book--closed-front", !this.#single && left?.kind === "none");
    book.classList.toggle("book--closed-back", !this.#single && right?.kind === "none");

    const progress = pos / Math.max(1, this.#pages.length - 1);
    const leftShown = !this.#single && left && left.kind !== "none";
    const rightShown = right && right.kind !== "none";
    book.style.setProperty("--stack-l", leftShown ? `${(progress * MAX_STACK_PX).toFixed(1)}px` : "0px");
    book.style.setProperty("--stack-r", rightShown ? `${((1 - progress) * MAX_STACK_PX).toFixed(1)}px` : "0px");
  }

  #describePosition() {
    const pages = this.#visiblePages().filter(Boolean);
    const content = pages.filter((p) => p.kind === "content");
    const total = this.#contentCount;
    if (content.length === 2) return `Strany ${content[0].number}–${content[1].number} z ${total}`;
    if (content.length === 1) return `Strana ${content[0].number} z ${total}`;
    const kinds = pages.map((p) => p.kind);
    if (kinds.includes("cover")) return "Obálka – otevřete knihu";
    if (kinds.includes("title")) return "Titulní strana";
    if (kinds.includes("end")) return "Konec";
    return "Zadní obálka";
  }

  #showPages() {
    if (!this.#pages.length) return;
    const { pageLeft, pageRight, prevBtn, nextBtn, indicator } = this.#els;
    if (this.#single) {
      this.#paintPage(pageRight, this.#pos, "right");
    } else {
      this.#paintPage(pageLeft, this.#pos, "left");
      this.#paintPage(pageRight, this.#pos + 1, "right");
    }
    this.#updateFrame(this.#pos);
    const step = this.#single ? 1 : 2;
    prevBtn.disabled = this.#pos === 0;
    nextBtn.disabled = this.#pos + step > this.#pages.length - 1;
    indicator.textContent = this.#describePosition();

    const anchor = this.#currentAnchor();
    savePref("ppm-book-anchor", anchor == null ? "" : String(anchor));
  }

  #flip(direction) {
    if (this.#flipping || !this.#pages.length) return;
    const step = this.#single ? 1 : 2;
    const target = this.#pos + direction * step;
    if (target < 0 || target > this.#pages.length - 1) return;

    const heavy = [...this.#visiblePages(), ...this.#visiblePages(target)]
      .some((p) => p?.kind.includes("cover") ?? false);
    this.#sound.play(heavy);
    if (REDUCED_MOTION_QUERY.matches) {
      this.#pos = target;
      this.#showPages();
      return;
    }
    this.#flipping = true;
    this.#updateFrame(target);
    if (this.#single) this.#animateSingle(direction, target);
    else this.#animateSpread(direction, target);
  }

  #runLeaf(className, fromDeg, toDeg, done) {
    const { leaf } = this.#els;
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
      this.#flipping = false;
    });
  }

  #animateSpread(direction, target) {
    const { leafFront, leafBack, pageLeft, pageRight } = this.#els;
    const pos = this.#pos;
    const finish = () => {
      this.#pos = target;
      this.#showPages();
    };
    if (direction > 0) {
      this.#paintPage(leafFront, pos + 1, "right");
      this.#paintPage(leafBack, target, "left");
      this.#paintPage(pageRight, target + 1, "right");
      this.#runLeaf("leaf--forward", 0, -180, finish);
    } else {
      this.#paintPage(leafFront, pos, "left");
      this.#paintPage(leafBack, target + 1, "right");
      this.#paintPage(pageLeft, target, "left");
      this.#runLeaf("leaf--backward", 0, 180, finish);
    }
  }

  #animateSingle(direction, target) {
    const { leafFront, leafBack, pageRight } = this.#els;
    const finish = () => {
      this.#pos = target;
      this.#showPages();
    };
    this.#paintVerso(leafBack);
    if (direction > 0) {
      this.#paintPage(leafFront, this.#pos, "right");
      this.#paintPage(pageRight, target, "right");
      this.#runLeaf("leaf--single", 0, -180, finish);
    } else {
      this.#paintPage(leafFront, target, "right");
      this.#runLeaf("leaf--single", -180, 0, finish);
    }
  }

  #goToPage(index) {
    if (this.#flipping || !this.#pages.length) return;
    const target = this.#normalizePos(index);
    if (target === this.#pos) return;
    this.#sound.play(false);
    this.#pos = target;
    this.#showPages();
  }

  #setSound(on) {
    const { soundBtn } = this.#els;
    this.#sound.enabled = on;
    soundBtn.setAttribute("aria-pressed", String(on));
    soundBtn.textContent = on ? "Zvuk: zap" : "Zvuk: vyp";
    savePref("ppm-sound", on ? "on" : "off");
  }

  #bindFullscreen() {
    const { fullscreenBtn } = this.#els;
    fullscreenBtn.hidden = !document.fullscreenEnabled;
    fullscreenBtn.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else this.#root.requestFullscreen?.();
    });
    document.addEventListener("fullscreenchange", () => {
      fullscreenBtn.textContent = document.fullscreenElement ? "Zavřít celou obrazovku" : "Celá obrazovka";
    });
  }

  #bindPointer() {
    const { book } = this.#els;
    let startX = null;
    book.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
    });
    book.addEventListener("pointerup", (e) => {
      if (startX == null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 50) {
        this.#flip(dx < 0 ? 1 : -1);
      } else if (Math.abs(dx) < 8) {
        const rect = book.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        this.#flip(ratio < (this.#single ? 0.3 : 0.5) ? -1 : 1);
      }
    });
  }
}

function coverEmblem() {
  const emblem = el("div", "cover__emblem");
  emblem.append(el("span", "cover__ring"), el("span", "cover__chip"));
  return emblem;
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

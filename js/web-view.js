import { renderBlock } from "./render.js";
import { czechPlural, debounce, el, fold } from "./text.js";

export class WebView {
  #screenplay;
  #root;
  #search;
  #count;
  #chips;
  #castToggle;
  #query = "";
  #activeCharacters = new Set();
  #compact = false;
  #castOpen = false;

  constructor({ root, search, count, chips, castToggle }, screenplay) {
    this.#screenplay = screenplay;
    this.#root = root;
    this.#search = search;
    this.#count = count;
    this.#chips = chips;
    this.#castToggle = castToggle;

    castToggle.addEventListener("click", () => {
      this.#castOpen = !this.#castOpen;
      this.#syncCast();
    });
    window.addEventListener("scroll", () => this.#onScroll(), { passive: true });

    const onSearch = debounce(() => {
      this.#query = fold(search.value.trim());
      this.render();
    }, 120);
    search.addEventListener("input", onSearch);
    search.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && search.value) {
        e.preventDefault();
        search.value = "";
        onSearch();
      }
    });

    this.#renderChips();
  }

  focusSearch() {
    this.#search.focus();
  }

  render() {
    const filtering = this.#isFiltering();
    const frag = document.createDocumentFragment();
    let section = null;
    let sectionHasContent = false;
    let previous = null;
    let hits = 0;

    const closeSection = () => {
      if (section && sectionHasContent) frag.append(section);
    };

    for (const block of this.#screenplay.blocks) {
      if (block.type === "chapter") {
        closeSection();
        section = el("section", "chapter");
        section.append(renderBlock(block, this.#screenplay));
        sectionHasContent = !filtering;
        previous = null;
        continue;
      }
      if (filtering) {
        if (!this.#matches(block)) continue;
        hits++;
        sectionHasContent = true;
      }
      section.append(renderBlock(block, this.#screenplay, { query: this.#query, previous }));
      previous = block;
    }
    closeSection();

    if (filtering && hits === 0) {
      frag.append(el("p", "empty", "Nic nenalezeno. Zkuste jiné slovo nebo zrušte filtr postav."));
    }

    this.#root.replaceChildren(frag);
    this.#count.textContent = filtering
      ? `${hits} ${czechPlural(hits, "výsledek", "výsledky", "výsledků")}`
      : "";
  }

  #isFiltering() {
    return this.#query !== "" || this.#activeCharacters.size > 0;
  }

  #matches(block) {
    if (block.type !== "line") return false;
    if (this.#activeCharacters.size && !this.#activeCharacters.has(block.who)) return false;
    return !this.#query || block.search.includes(this.#query);
  }

  #renderChips() {
    const characters = this.#screenplay.usedCharacters;
    this.#chips.hidden = characters.length === 0;
    if (!characters.length) return;

    const all = el("button", "chip", "Všechny postavy");
    all.type = "button";
    all.dataset.all = "";
    all.addEventListener("click", () => {
      this.#activeCharacters.clear();
      this.#syncChips();
      this.render();
    });

    const chips = characters.map((c) => {
      const chip = el("button", "chip", c.name);
      chip.type = "button";
      chip.dataset.id = c.id;
      if (c.original) chip.append(" ", el("span", "chip__original", `(${c.original})`));
      chip.addEventListener("click", () => {
        if (this.#activeCharacters.has(c.id)) this.#activeCharacters.delete(c.id);
        else this.#activeCharacters.add(c.id);
        this.#syncChips();
        this.render();
      });
      return chip;
    });

    this.#chips.replaceChildren(all, ...chips);
    this.#syncChips();
  }

  #syncChips() {
    for (const chip of this.#chips.children) {
      const pressed = "all" in chip.dataset
        ? this.#activeCharacters.size === 0
        : this.#activeCharacters.has(chip.dataset.id);
      chip.setAttribute("aria-pressed", String(pressed));
    }
    this.#syncCast();
  }

  // Collapsing the chips shortens the sticky header and the browser may pull the
  // scroll position up by that height, so the threshold sits above it and the
  // chips come back only near the very top.
  #onScroll() {
    const y = window.scrollY;
    const compact = this.#compact ? y > 4 : y > this.#chips.offsetHeight + 120;
    if (compact === this.#compact) return;
    this.#compact = compact;
    this.#castOpen = false;
    this.#syncCast();
  }

  #syncCast() {
    const cast = this.#castToggle.parentElement;
    cast.classList.toggle("cast--compact", this.#compact);
    cast.classList.toggle("cast--open", this.#castOpen);
    this.#castToggle.setAttribute("aria-expanded", String(!this.#compact || this.#castOpen));
    const selected = this.#activeCharacters.size;
    this.#castToggle.textContent = this.#castOpen ? "Skrýt postavy" : selected ? `Postavy (${selected})` : "Postavy";
  }
}

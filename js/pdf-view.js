import { paginate } from "./paginator.js";
import { renderBlock } from "./render.js";
import { czechPlural, el } from "./text.js";

export class PdfView {
  #screenplay;
  #pages;
  #info;
  #measure;
  #rendered = false;

  constructor({ pages, info, printButton, measure }, screenplay) {
    this.#screenplay = screenplay;
    this.#pages = pages;
    this.#info = info;
    this.#measure = measure;
    printButton.addEventListener("click", () => window.print());
  }

  show() {
    if (!this.#rendered) this.#render();
  }

  invalidate() {
    this.#rendered = false;
  }

  #render() {
    const screenplay = this.#screenplay;
    const measure = this.#measure;
    measure.removeAttribute("style");
    measure.className = "a4 measure";
    const contentPages = paginate({
      measure,
      blocks: screenplay.blocks,
      render: (block) => renderBlock(block, screenplay),
      skeleton: (body) => [el("div", "a4__header", "X"), body, el("div", "a4__footer", "0")],
      slack: 0.015,
    });
    measure.className = "measure";
    measure.replaceChildren();

    const frag = document.createDocumentFragment();
    const title = el("section", "a4 a4--title");
    title.append(
      el("span", "a4__ornament", "❦"),
      el("h2", null, screenplay.title),
      el("p", null, screenplay.subtitle),
      el("p", "a4__byline", "Banda Trotlů · 2004"),
    );
    frag.append(title);

    contentPages.forEach((blocks, i) => {
      const page = el("section", "a4");
      const header = el("div", "a4__header");
      header.append(el("span", null, screenplay.title), el("span", null, screenplay.chapterTitle(blocks[0].chapter)));
      const body = el("div", "page__body");
      for (const block of blocks) body.append(renderBlock(block, screenplay));
      page.append(header, body, el("div", "a4__footer", String(i + 1)));
      frag.append(page);
    });

    this.#pages.replaceChildren(frag);
    const total = contentPages.length + 1;
    this.#info.textContent = `Náhled tisku · ${total} ${czechPlural(total, "strana", "strany", "stran")} A4`;
    this.#rendered = true;
  }
}

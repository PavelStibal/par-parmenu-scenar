import { BookView } from "./book-view.js";
import { PageSound } from "./page-sound.js";
import { PdfView } from "./pdf-view.js";
import { loadPref, savePref } from "./prefs.js";
import { Screenplay } from "./screenplay.js";
import { WebView } from "./web-view.js";

const DATA_URL = "data/screenplay.json";
const MODES = ["web", "pdf", "book"];

const $ = (id) => document.getElementById(id);
const status = $("status");
const modeButtons = document.querySelectorAll("[data-mode-btn]");
const sections = { web: $("script"), pdf: $("pdf-view"), book: $("book-view") };

let screenplay;
try {
  screenplay = await Screenplay.load(DATA_URL);
} catch (err) {
  console.error("Loading the script failed:", err);
  status.textContent =
    "Scénář se nepodařilo načíst. Stránku je potřeba spustit přes lokální server („node tools/serve.mjs“) – "
    + "při otevření souboru přímo z disku prohlížeč data nenačte.";
  status.classList.add("status--error");
  throw err;
}

status.hidden = true;
$("sample-banner").hidden = !screenplay.isSample;

const measure = $("measure");
const web = new WebView(
  {
    root: sections.web,
    search: $("search-input"),
    count: $("search-count"),
    chips: $("character-filter"),
    castToggle: $("cast-toggle"),
  },
  screenplay,
);
const pdf = new PdfView({ pages: $("pdf-pages"), info: $("pdf-info"), printButton: $("print-btn"), measure }, screenplay);
const book = new BookView({ root: sections.book, measure, onClose: () => setMode("web") }, screenplay, new PageSound());

let mode = "web";

function setMode(next) {
  mode = MODES.includes(next) ? next : "web";
  document.body.dataset.mode = mode;
  savePref("ppm-mode", mode);
  for (const btn of modeButtons) btn.setAttribute("aria-pressed", String(btn.dataset.modeBtn === mode));
  for (const [name, section] of Object.entries(sections)) section.hidden = name !== mode;
  window.scrollTo(0, 0);

  if (mode === "pdf") pdf.show();
  if (mode === "book") book.show();
  else if (document.fullscreenElement) document.exitFullscreen?.();
}

for (const btn of modeButtons) btn.addEventListener("click", () => setMode(btn.dataset.modeBtn));

document.addEventListener("keydown", (e) => {
  const typing = e.target instanceof Element && e.target.closest("input, textarea, select");
  if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
  if (mode === "web" && e.key === "/") {
    e.preventDefault();
    web.focusSearch();
    return;
  }
  if (mode !== "book") return;
  switch (e.key) {
    case "ArrowRight":
    case "PageDown":
    case " ":
      book.next();
      break;
    case "ArrowLeft":
    case "PageUp":
      book.previous();
      break;
    case "Home":
      book.first();
      break;
    case "End":
      book.last();
      break;
    case "Escape":
      if (!document.fullscreenElement) setMode("web");
      break;
    default:
      return;
  }
  e.preventDefault();
});

// Late web fonts change text metrics, so pages must be measured again.
document.fonts?.addEventListener("loadingdone", () => {
  pdf.invalidate();
  if (mode === "pdf") pdf.show();
  book.layout();
});

web.render();
await document.fonts?.ready;
setMode(loadPref("ppm-mode", "web"));

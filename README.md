# 🧙‍♂️ Projekt: Pár Pařmenů – Čistý Scénář

> **Stav projektu:** 🔒 PRIVATE (Ve vývoji)
> **Cíl:** Převést ošklivé titulky s časovými kódy do podoby interaktivní online knihy a e-booku (EPUB) pro fanoušky.

## 🛠 To-Do List (Co je potřeba udělat)
- [x] Získat surová data z titulků od Bandy Trotlů
- [x] Vyčistit časové značky `{1234}{5678}` z úvodní části
- [x] Vyčistit a naformátovat zbytek textu až do konce
- [ ] Doplnit jména postav k replikám
- [ ] Pojmenovat kapitoly
- [x] Vytvořit jednoduché HTML s vyhledáváním hlášek
- [x] Režim „Kniha“ s listováním stránek a režim „PDF“ pro tisk
- [x] Vygenerovat testovací `.epub` soubor pro Kindle/čtečky
- [ ] Otestovat `.epub` na čtečce
- [ ] Požádat Bandu Trotlů o souhlas se zveřejněním
- [ ] Přepnout repozitář do režimu **Public** 🚀

## 👥 Přehled kódových jmen postav
- Fritol Šourek (Frodo)
- Slim / Slimsněd Chrupavka (Sam)
- Šmajdalf Šmejdoplášť (Gandalf)
- Saudruh (Sauron)
- Paragon / Účtenka / Chodník (Aragorn)

## 📁 Struktura projektu

```
index.html              stránka (čisté HTML, bez frameworků)
style.css               vzhled: Web, PDF, Kniha, tisk
script.js               načtení dat, vyhledávání, filtr postav, stránkování, listování
data/raw/               surové titulky – necommitují se, viz .gitignore
data/scenar.md          scénář k ruční úpravě (jména postav, názvy kapitol)
data/postavy.json       seznam postav a jejich přezdívek
data/scenar.json        vygenerovaná data pro web (needitovat ručně)
tools/subs-to-md.mjs    titulky → scenar.md (jednorázově)
tools/build.mjs         scenar.md → scenar.json
tools/epub.mjs          scenar.json → dist/par-parmenu.epub
tools/serve.mjs         lokální vývojový server
```

## 🔄 Postup úpravy scénáře

1. `npm run convert` – jednorázový převod titulků do `data/scenar.md`. Existující soubor nepřepíše (jen s `--force`), aby se neztratily ruční úpravy.
2. V `data/scenar.md` nahradit `**???**` jménem postavy (např. `**Šmajdalf**`) a přejmenovat kapitoly (`## Kapitola 1`). Komentáře `<!-- 825-880 -->` jsou časy z titulků – nemazat.
3. `npm run build` – vygeneruje `data/scenar.json` a vypíše, kolik replik ještě nemá postavu a která jména nezná.

Jména se párují s `data/postavy.json` podle jména, křestního jména, id nebo přezdívky (bez ohledu na diakritiku a velikost písmen). Neznámé jméno se přidá jako nová postava.

## 🖥 Režimy zobrazení

- **Web** – celý text, vyhledávání hlášek (bez ohledu na diakritiku) a filtr podle postav.
- **PDF** – náhled stránek A4; tlačítko „Tisknout / uložit PDF“ vytiskne přesně tyto stránky.
- **Kniha** – kniha v kožené vazbě s listováním a zvukem stránek, přes celou obrazovku.

## ▶️ Spuštění lokálně

Stránka načítá `data/scenar.json` přes `fetch()`, což při otevření `index.html` přímo z disku (`file://`) prohlížeč nedovolí. Je potřeba jednoduchý lokální server:

```bash
node tools/serve.mjs
```

a otevřít `http://localhost:3000`. Server nemá žádné závislosti, stačí Node.js.

## ⌨️ Ovládání

| Klávesa | Akce |
|---|---|
| `/` | skok do vyhledávání (Web) |
| `Esc` | vymazání hledání (Web) / návrat z knihy |
| `←` `→` | listování v režimu Kniha (také PageUp / PageDown / mezerník) |
| `Home` `End` | obálka / konec knihy |

V režimu Kniha jde listovat také kliknutím na levou/pravou stránku nebo tažením prstem.

## 🗂 Formát dat (`data/scenar.json`)

```json
{
  "title": "Pár Pařmenů",
  "subtitle": "Čistý scénář",
  "fps": 25,
  "characters": [
    { "id": "fritol", "name": "Fritol Šourek", "original": "Frodo" }
  ],
  "chapters": [
    {
      "title": "Kraj",
      "blocks": [
        { "type": "note", "text": "Scénická poznámka bez závorek." },
        { "type": "line", "who": "fritol", "text": "Replika.", "start": 1234, "end": 1300 }
      ]
    }
  ]
}
```

- `who: null` = mluvčí zatím neurčen (zobrazí se jako „???“).
- `start` / `end` jsou čísla snímků z titulků. Na webu se nezobrazují, ale zůstávají v datech pro případné propojení s videem (čas = snímek / `fps`).

## 🖨 Export
- **Tisk / PDF:** režim PDF → „Tisknout / uložit PDF“ → v dialogu prohlížeče zvolit tiskárnu nebo „Uložit jako PDF“. Tisk funguje v běžném prohlížeči (Chrome, Edge, Firefox).
- **EPUB:** `npm run epub` → `dist/par-parmenu.epub` (EPUB 3 s obsahem kapitol, bez závislostí). Na Kindle jde poslat přes Send to Kindle. Generuje se z `data/scenar.json`, takže po úpravě scénáře nejdřív `npm run build`. Složka `dist/` se necommituje.

## ⚖️ Autorská práva a poděkování (Disclaimer)
Tento projekt je čistě nezisková, fanouškovská aktivita (Fan Project).
- Původní texty a hlášky jsou duševním vlastnictvím tvůrčí skupiny **Banda Trotlů** (2004).
- Původní vizuální a tematické dílo podléhá autorským právům držitelů licence *The Lord of the Rings*.
- Tento repozitář neslouží ke komerčním účelům a jeho cílem je pouze archivace a usnadnění přístupu komunitě.

## 📜 Licence
Bez licence – **všechna práva vyhrazena**. Repozitář záměrně neobsahuje soubor `LICENSE`, a nikomu tedy neuděluje práva k užití, kopírování ani šíření obsahu. Práva k textu scénáře náleží autorům (Banda Trotlů).

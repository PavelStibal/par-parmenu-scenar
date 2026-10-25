export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function fold(text) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// The map points each folded char back to the original, so matches can be highlighted.
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

export function appendHighlighted(parent, text, query) {
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

export function czechPlural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

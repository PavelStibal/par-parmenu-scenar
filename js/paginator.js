import { el } from "./text.js";

export function paginate({ measure, blocks, render, skeleton, slack = 0 }) {
  const body = el("div", "page__body");
  measure.replaceChildren(...skeleton(body));

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

  for (const block of blocks) {
    if (block.type === "chapter") flush();
    const node = render(block, current.at(-1) ?? null);
    body.append(node);
    if (current.length && overflows()) {
      node.remove();
      flush();
      body.append(render(block, null));
    }
    current.push(block);
  }
  flush();
  return pages;
}

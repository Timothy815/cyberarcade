type Attrs = Record<string, string | number | boolean | undefined>;

/** Tiny element builder: el('div.card.big', { 'data-id': 'x' }, 'text', childNode). */
export function el<K extends keyof HTMLElementTagNameMap = 'div'>(
  spec: string,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div') as HTMLElementTagNameMap[K];
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    node.setAttribute(k, v === true ? '' : String(v));
  }
  node.append(...children);
  return node;
}

/** Element whose content is trusted, hard-coded markup (icons). Never pass user text here. */
export function html(spec: string, markup: string): HTMLElement {
  const node = el(spec);
  node.innerHTML = markup;
  return node;
}

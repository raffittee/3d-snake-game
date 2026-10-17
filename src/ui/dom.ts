/** Typed lookup for elements that must exist in index.html. */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id} in index.html`);
  return el as T;
}

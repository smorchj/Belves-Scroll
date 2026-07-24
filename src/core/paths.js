/**
 * Base-aware asset paths.
 *
 * In dev `import.meta.env.BASE_URL` is '/', in the GitHub Pages build it is
 * '/Belves-Scroll/'. Everything under public/assets is fetched at runtime with
 * an absolute path, so each of those has to be resolved against the base or it
 * 404s when the site is served from a repo subpath. Works in workers too — Vite
 * inlines BASE_URL there as well.
 */
export const BASE = import.meta.env.BASE_URL;

/** Resolve a leading-slash asset path against the deploy base. */
export const asset = (p) => BASE + String(p).replace(/^\/+/, '');

/**
 * The 68-slider identity morph recipe.
 *
 * `/assets/recipes/<base>.json` stores each slider as sparse per-vertex deltas
 * against the neutral base mesh — the same trick FaceLibrary uses for ARKit
 * expressions, but these are *identity* shapes (bone structure, not emotion) and
 * they are driven bidirectionally in [-1, 1] rather than [0, 1].
 *
 * Three things about the file are worth knowing before reading the code:
 *
 *   1. `sliders` is an object KEYED BY SLIDER NAME, not an array of records. So
 *      a slider carries `{ region, range, targets }` and its name is the key.
 *
 *   2. `region` is unique per slider — 68 sliders, 68 distinct regions ("width",
 *      "bridge", "nostril", …). It is a sub-part label, not a grouping key, so
 *      grouping the UI by it would produce 68 groups of one. The anatomical
 *      grouping the UI actually wants is derived from the name prefix instead;
 *      see GROUPS / `groups`.
 *
 *   3. A single slider spans up to five meshes (head skin, teeth, both eyeballs,
 *      eyelashes). They must be applied together or the face tears at the seams,
 *      which is why `apply()` works in terms of *meshes touched* rather than
 *      one slider at a time.
 *
 * Deltas are stored as three parallel Float arrays `dx`/`dy`/`dz` alongside the
 * vertex index array `i`, each of length `count`.
 */

const RECIPE_BASE = `${import.meta.env.BASE_URL}assets/recipes`;

/** Anatomical grouping for the UI, in the order a face is usually built. */
const GROUPS = [
  ['Head & Skull', /^(headScale|headWidth|headLength|headHeight|backSkull|topHead)/],
  ['Face',         /^face/],
  ['Forehead',     /^forehead/],
  ['Brow',         /^brow/],
  ['Eyes',         /^eye/],
  ['Nose',         /^(nose|septum)/],
  ['Cheeks',       /^cheek/],
  ['Mouth & Lips', /^(mouth|lipFull|upperLip|lowerLip)/],
  ['Jaw',          /^jaw/],
  ['Chin',         /^chin/],
];

/**
 * 'eye.R' and 'eyeR' are the same mesh; 'eyelashes.001' and 'eyelashes' are too.
 * Punctuation and a trailing duplicate-suffix are the only differences the
 * exporters introduce.
 */
const normalise = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\d+$/, '');

const _cache = new Map();   // base -> Promise<FaceRecipe>

export class FaceRecipe {
  constructor(base, data) {
    this.base = base;
    this.data = data;
    this.sliders = data.sliders;
    this.names = Object.keys(data.sliders);

    // meshName -> sliderName -> target, so a mesh rebuild can find just the
    // targets that land on it without rescanning every slider's target list.
    this.byMesh = new Map();
    for (const name of this.names) {
      for (const t of this.sliders[name].targets) {
        if (!this.byMesh.has(t.mesh)) this.byMesh.set(t.mesh, new Map());
        this.byMesh.get(t.mesh).set(name, t);
      }
    }

    // Per-root binding state. Weak so a discarded character frees its caches.
    this._bindings = new WeakMap();
  }

  /** Fetches and caches the recipe for 'venus' | 'mars'. */
  static async load(base) {
    if (_cache.has(base)) return _cache.get(base);
    const p = (async () => {
      const res = await fetch(`${RECIPE_BASE}/${base}.json`);
      if (!res.ok) throw new Error(`FaceRecipe: cannot load ${base} (${res.status})`);
      return new FaceRecipe(base, await res.json());
    })();
    _cache.set(base, p);
    return p;
  }

  /** All 68 slider names, in the file's order. */
  get sliderNames() { return this.names.slice(); }

  /**
   * The same 68 names arranged for the UI: [{ name, sliders: [...] }, …].
   * Derived from the name prefix — see note 2 in the file header.
   */
  get groups() {
    const out = GROUPS.map(([name]) => ({ name, sliders: [] }));
    const other = { name: 'Other', sliders: [] };
    for (const n of this.names) {
      const hit = GROUPS.findIndex(([, re]) => re.test(n));
      (hit === -1 ? other : out[hit]).sliders.push(n);
    }
    if (other.sliders.length) out.push(other);
    return out.filter((g) => g.sliders.length);
  }

  /** The declared [min, max] for a slider (always [-1, 1] in the shipped files). */
  range(name) { return this.sliders[name]?.range ?? [-1, 1]; }

  /** The recipe's own fine-grained sub-part label, e.g. 'nostrilCorner'. */
  region(name) { return this.sliders[name]?.region ?? ''; }

  /** Every mesh a given slider moves — what a live update has to rebuild. */
  meshesFor(name) { return (this.sliders[name]?.targets ?? []).map((t) => t.mesh); }

  // ------------------------------------------------------------------ binding

  /**
   * Resolve the recipe's mesh names against the meshes actually in `root`, and
   * snapshot their pristine vertex positions.
   *
   * Matching is by vertex count, because some exports leave `mesh.name` unset.
   * That is ambiguous for exactly one pair: eyeL and eyeR are both 626 verts,
   * and their deltas are exact X-mirrors of each other — getting them the wrong
   * way round silently mirrors eyeSpacing and eyeSize. So a count collision is
   * broken by normalised name, and failing that by which mesh actually sits on
   * which side (the exports face +Z, so the character's left is +X).
   */
  _bind(root) {
    let bind = this._bindings.get(root);
    if (bind) return bind;

    const pool = [];
    root.traverse((o) => {
      const pos = o.isMesh ? o.geometry?.getAttribute('position') : null;
      if (pos) pool.push({ mesh: o, count: pos.count, claimed: false });
    });

    bind = { meshes: new Map(), lastTouched: new Set(), underlay: null };

    for (const [meshName] of this.byMesh) {
      const want = this.data.meshes.find((m) => m.name === meshName)?.verts;
      if (want === undefined) continue;

      const cands = pool.filter((c) => !c.claimed && c.count === want);
      if (cands.length === 0) continue;

      let pick = cands[0];
      if (cands.length > 1) {
        const exact = cands.filter((c) => normalise(c.mesh.name) === normalise(meshName));
        if (exact.length === 1) {
          pick = exact[0];
        } else {
          // Fall back to geometry: decide by which side of the body it is on.
          const side = /(^|[^a-z])([lr])$/i.exec(meshName)?.[2]?.toLowerCase();
          if (side) {
            const cx = (c) => {
              const a = c.mesh.geometry.getAttribute('position');
              let sum = 0;
              for (let k = 0; k < a.count; k++) sum += a.getX(k);
              return sum / a.count;
            };
            cands.sort((p, q) => cx(p) - cx(q));
            pick = side === 'l' ? cands[cands.length - 1] : cands[0];
          }
        }
      }
      pick.claimed = true;

      // SkeletonUtils.clone() shares BufferGeometry between instances, so
      // writing morphed positions straight into it would corrupt every other
      // character loaded from the same GLB — including the one the game is
      // already running. Take our own copy the first time we touch it.
      const mesh = pick.mesh;
      if (!mesh.userData.__faceRecipeOwned) {
        mesh.geometry = mesh.geometry.clone();
        mesh.userData.__faceRecipeOwned = true;
      }

      bind.meshes.set(meshName, this._describe(mesh));
    }

    this._bindings.set(root, bind);
    return bind;
  }

  /**
   * Snapshot a mesh's neutral positions and work out how to address them.
   *
   * These exports interleave position, normal, uv (and on the teeth, skinning
   * weights) into one buffer, at strides that vary per mesh — 6, 8 and 13 floats
   * respectively. So a vertex's X does NOT live at `array[i * 3]`; it lives at
   * `offset + i * stride`. Indexing this flatly writes the morph into the normals
   * and UVs instead, which is silent and looks like the model is fine.
   *
   * The pristine copy holds positions only, tightly packed. It deliberately does
   * not mirror the whole interleaved buffer: computeVertexNormals() rewrites the
   * normal slots of that same buffer, so a whole-buffer snapshot would go stale
   * the moment it is used.
   */
  _describe(mesh) {
    const attr = mesh.geometry.getAttribute('position');
    const interleaved = attr.isInterleavedBufferAttribute === true;
    const buf = interleaved ? attr.data.array : attr.array;
    const stride = interleaved ? attr.data.stride : attr.itemSize;
    const offset = interleaved ? attr.offset : 0;

    const pristine = new Float32Array(attr.count * 3);
    for (let i = 0; i < attr.count; i++) {
      const b = offset + i * stride;
      pristine[i * 3]     = buf[b];
      pristine[i * 3 + 1] = buf[b + 1];
      pristine[i * 3 + 2] = buf[b + 2];
    }

    return { mesh, attr, interleaved, buf, stride, offset, count: attr.count, pristine };
  }

  /** Restore one bound mesh's positions to neutral, leaving other channels be. */
  _restore(entry) {
    const { buf, stride, offset, count, pristine } = entry;
    for (let i = 0; i < count; i++) {
      const b = offset + i * stride;
      buf[b]     = pristine[i * 3];
      buf[b + 1] = pristine[i * 3 + 1];
      buf[b + 2] = pristine[i * 3 + 2];
    }
  }

  /** Interleaved attributes upload through their parent buffer, not themselves. */
  _flush(entry) {
    if (entry.interleaved) entry.attr.data.needsUpdate = true;
    else entry.attr.needsUpdate = true;
    entry.mesh.geometry.computeVertexNormals();
  }

  // ------------------------------------------------------------------ applying

  /**
   * Write `values` (slider name -> weight in [-1, 1]) into `root`.
   *
   * Always rebuilt from the pristine snapshot, so calls are idempotent rather
   * than cumulative — dragging a slider back to 0 really does restore neutral.
   *
   * `changed` is an optional iterable of the slider names that just moved. Given
   * it, only the meshes those sliders actually touch are rebuilt (a nose slider
   * costs one 6162-vert mesh instead of all five), which is what makes 68 live
   * sliders affordable. Every slider affecting a rebuilt mesh is still re-applied
   * to it, so the result is identical either way.
   */
  apply(root, values, changed = null) {
    const bind = this._bind(root);

    let targets;
    if (changed) {
      targets = new Set();
      for (const name of changed) {
        for (const m of this.meshesFor(name)) if (bind.meshes.has(m)) targets.add(m);
      }
    } else {
      targets = new Set(bind.meshes.keys());
    }
    if (targets.size === 0) return;

    // Anything moved last time but not named now still has to be rebuilt, or a
    // slider returning to 0 would leave its displacement baked in.
    for (const m of bind.lastTouched) if (bind.meshes.has(m)) targets.add(m);

    const touched = new Set();

    for (const meshName of targets) {
      const entry = bind.meshes.get(meshName);
      const sliderTargets = this.byMesh.get(meshName);
      const { buf, stride, offset } = entry;

      this._restore(entry);

      // The heritage blend sits between the pristine base and the sliders, so
      // a slider dragged back to 0 restores the blended face, not the neutral.
      const under = bind.underlay?.[meshName];
      if (under) {
        for (let i = 0; i < entry.count; i++) {
          const b = offset + i * stride;
          buf[b]     += under[i * 3];
          buf[b + 1] += under[i * 3 + 1];
          buf[b + 2] += under[i * 3 + 2];
        }
        touched.add(meshName);
      }

      for (const [name, t] of sliderTargets) {
        const w = values[name];
        if (!w || Math.abs(w) < 1e-4) continue;   // also skips undefined/NaN
        touched.add(meshName);

        const { i, dx, dy, dz, count } = t;
        for (let k = 0; k < count; k++) {
          const b = offset + i[k] * stride;
          buf[b]     += dx[k] * w;
          buf[b + 1] += dy[k] * w;
          buf[b + 2] += dz[k] * w;
        }
      }

      this._flush(entry);
    }

    // Meshes we rebuilt but left at neutral drop out, so the next call does not
    // keep paying for them.
    for (const m of bind.lastTouched) if (!targets.has(m)) touched.add(m);
    bind.lastTouched = touched;
  }

  /**
   * A dense offset layer applied under the sliders (the creator's heritage
   * blend). Keys are recipe mesh names; values Float32Array(count*3), or null
   * to clear. Takes effect on the next apply() — pass no `changed` so every
   * bound mesh rebuilds.
   */
  setUnderlay(root, byMesh) {
    this._bind(root).underlay = byMesh ?? null;
  }

  /**
   * Dense per-vertex displacement of a bound mesh from its pristine shape —
   * underlay plus sliders — what the hair conform replays against.
   * Float32Array of count*3, zeros where nothing touched.
   */
  displacement(root, meshName) {
    const entry = this._bind(root).meshes.get(meshName);
    if (!entry) return null;
    const { buf, stride, offset, count, pristine } = entry;
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const b = offset + i * stride;
      out[i * 3]     = buf[b]     - pristine[i * 3];
      out[i * 3 + 1] = buf[b + 1] - pristine[i * 3 + 1];
      out[i * 3 + 2] = buf[b + 2] - pristine[i * 3 + 2];
    }
    return out;
  }

  /** Restore every bound mesh to its pristine shape. */
  reset(root) {
    const bind = this._bind(root);
    for (const entry of bind.meshes.values()) {
      this._restore(entry);
      this._flush(entry);
    }
    bind.lastTouched = new Set();
  }

  /** Drop cached state for a root (its geometry copies are garbage anyway). */
  release(root) { this._bindings.delete(root); }

  /** A neutral value set — every slider at 0. */
  neutral() { return Object.fromEntries(this.names.map((n) => [n, 0])); }

  /**
   * A plausible face rather than uniform noise: most features sit near neutral
   * with a few pronounced ones, which is what a bell curve gives and a flat
   * random() does not (uniform noise reliably produces a melted face).
   *
   * Quantised to `step` because the UI's range inputs snap to it — emitting
   * finer values would leave the thumb showing 0.12 while the face was built
   * from 0.123, and the first touch of that slider would jump the model.
   */
  random(amount = 0.55, step = 0.01) {
    const out = {};
    for (const n of this.names) {
      const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      const [lo, hi] = this.range(n);
      // toFixed mops up the float dust in q * step (30 * 0.01 is not 0.3).
      const q = +(Math.round((g * amount) / step) * step).toFixed(6);
      out[n] = Math.max(lo, Math.min(hi, q));
    }
    return out;
  }
}

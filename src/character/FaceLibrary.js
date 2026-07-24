import * as THREE from 'three';

/**
 * Shared ARKit expression library.
 *
 * Every character exported from creategamecharacters.ai shares one head topology
 * (6162 verts) and one teeth topology (7669), so the 58 ARKit shapes are
 * identical data in every character file. Rather than ship them twelve times, the
 * asset pipeline strips them and tools/extract-morphs.mjs writes a single sparse
 * copy; this class expands that once and attaches it on demand.
 *
 * The expanded BufferAttributes are shared by reference across every character
 * that borrows them, so the cost is paid once no matter how many faces are live.
 * Attach when a character enters conversation, detach when they leave — a crowd
 * of idle villagers carries no morph cost at all.
 */
export class FaceLibrary {
  constructor() {
    this.ready = false;
    this.meshes = {};   // role -> { names, attributes: BufferAttribute[], vertexCount }
    this._loading = null;
  }

  async load(base = `${import.meta.env.BASE_URL}assets/morphs`) {
    if (this.ready) return this;
    if (this._loading) return this._loading;

    this._loading = (async () => {
      const [manifest, buffer] = await Promise.all([
        fetch(`${base}/arkit.json`).then((r) => r.json()),
        fetch(`${base}/arkit.bin`).then((r) => r.arrayBuffer()),
      ]);

      for (const [role, entry] of Object.entries(manifest.meshes)) {
        const names = [];
        const attributes = [];

        for (const target of entry.targets) {
          // Sparse -> dense. three.js wants a full-length delta array per shape;
          // the file only stores the vertices each shape actually moves.
          const dense = new Float32Array(entry.vertexCount * 3);
          const indices = new Uint16Array(buffer, target.indexOffset, target.count);
          const deltas = new Float32Array(buffer, target.deltaOffset, target.count * 3);

          for (let k = 0; k < target.count; k++) {
            const v = indices[k] * 3;
            dense[v] = deltas[k * 3];
            dense[v + 1] = deltas[k * 3 + 1];
            dense[v + 2] = deltas[k * 3 + 2];
          }

          names.push(target.name);
          attributes.push(new THREE.BufferAttribute(dense, 3));
        }

        this.meshes[role] = { names, attributes, vertexCount: entry.vertexCount };
      }

      this.ready = true;
      return this;
    })();

    return this._loading;
  }

  /**
   * Give a character a face. Meshes are matched by vertex count because the
   * exporter leaves them unnamed.
   */
  attach(root) {
    if (!this.ready) return 0;
    let attached = 0;

    root.traverse((o) => {
      if (!o.isMesh || o.userData.morphRole) return;
      const count = o.geometry.getAttribute('position')?.count;

      for (const [role, lib] of Object.entries(this.meshes)) {
        if (count !== lib.vertexCount) continue;

        // SkeletonUtils.clone shares BufferGeometry between clones, and several
        // NPCs reuse the same character model. Writing morph attributes onto a
        // shared geometry gives every other user of it morph targets with no
        // matching influence array, which crashes the renderer mid-frame. So
        // each speaking character gets its own geometry, restored on detach.
        o.userData.sharedGeometry = o.geometry;
        const geo = o.geometry.clone();

        geo.morphAttributes.position = lib.attributes;   // deltas stay shared
        geo.morphTargetsRelative = true;
        o.geometry = geo;

        o.morphTargetInfluences = new Array(lib.attributes.length).fill(0);
        o.morphTargetDictionary = Object.fromEntries(lib.names.map((n, i) => [n, i]));
        o.userData.morphRole = role;

        // The shader is compiled without morph support until the geometry has
        // morph attributes, so it has to be rebuilt.
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.needsUpdate = true;

        attached++;
        break;
      }
    });

    return attached;
  }

  /** Release the morph buffers for a character who is no longer speaking. */
  detach(root) {
    root.traverse((o) => {
      if (!o.isMesh || !o.userData.morphRole) return;

      // Put the shared geometry back and dispose the per-character clone. The
      // library's delta attributes are referenced, not owned, so they survive.
      const shared = o.userData.sharedGeometry;
      if (shared) {
        o.geometry.morphAttributes.position = [];
        o.geometry.dispose();
        o.geometry = shared;
        delete o.userData.sharedGeometry;
      }

      o.morphTargetInfluences = [];
      o.morphTargetDictionary = {};
      delete o.userData.morphRole;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.needsUpdate = true;
    });
  }
}

/** Process-wide singleton — the whole point is that there is exactly one. */
export const faceLibrary = new FaceLibrary();

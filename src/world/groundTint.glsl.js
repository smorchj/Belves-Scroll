/**
 * The ground's colour, as one GLSL function shared by the terrain and the grass.
 *
 * These were two separate implementations and they disagreed: the terrain shaded
 * itself lush green while the grass cards kept their photographed straw-and-olive,
 * so every clump read as a different plant from the ground it stood in. Colour
 * has to come from one place or the two will always drift.
 *
 * Given a world position and the local slope, this returns the tint that patch of
 * ground should carry — drainage-led, because on this island almost everything is
 * under 30m and keying off elevation alone leaves the whole map one flat green.
 */
/**
 * The same value noise the shaders use, on the CPU.
 *
 * Placement decisions have to agree with what the terrain shader actually paints:
 * if the ground is shaded as bedrock or laid cobble, nothing may be planted on
 * it. Reimplementing the noise here keeps the two in step — it is the one part
 * that genuinely must exist twice, because one side runs per pixel on the GPU and
 * the other per candidate on the CPU.
 */
function gtHashJS(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function gtNoiseJS(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  return (gtHashJS(xi, yi) * (1 - fx) + gtHashJS(xi + 1, yi) * fx) * (1 - fy)
       + (gtHashJS(xi, yi + 1) * (1 - fx) + gtHashJS(xi + 1, yi + 1) * fx) * fy;
}

const smoothstepJS = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How strongly the terrain shader paints bare rock here, 0..1.
 *
 * Mirrors the `wCobble` weight in Terrain's splat exactly. Grass grows in soil,
 * not on scoured bedrock, so anything above a low threshold is refused — without
 * this the field planted clumps straight through the outcrops and the shoreline
 * shingle that the shader had already decided were stone.
 */
export function rockinessAt(terrain, x, z) {
  const height = terrain.height(x, z);
  const flatness = terrain.normal(x, z).y;
  const rockNoise = gtNoiseJS(x * 0.018, z * 0.018) * 0.6
                  + gtNoiseJS(x * 0.061, z * 0.061) * 0.4;
  return Math.max(0, Math.min(1,
      smoothstepJS(0.88, 0.70, flatness)
    + smoothstepJS(0.62, 0.80, rockNoise) * 0.75
    + smoothstepJS(130.0, 230.0, height) * 0.9));
}

/** Shingle takes over at the waterline, and it is stone too. */
export function shingleAt(terrain, x, z) {
  return smoothstepJS(3.2, 0.1, terrain.height(x, z));
}

export const GROUND_TINT_GLSL = /* glsl */`
  float gtHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float gtNoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(gtHash(i), gtHash(i + vec2(1,0)), f.x),
               mix(gtHash(i + vec2(0,1)), gtHash(i + vec2(1,1)), f.x), f.y);
  }

  // 0 = damp hollow, 1 = wind-burnt and dry. The elevation term is scaled to
  // the island tile (everything under ~57m) — the old 8..70m ramp left the
  // whole map in the damp band and painted it one uniform lush green.
  float groundDryness(vec3 worldPos, float flatness){
    float macro = gtNoise(worldPos.xz * 0.0021);
    float meso  = gtNoise(worldPos.xz * 0.0115 + 17.3);
    return clamp(
        (macro - 0.40) * 2.1
      + (meso - 0.5) * 1.25
      + smoothstep(4.0, 30.0, worldPos.y) * 0.5
      + smoothstep(0.99, 0.86, flatness) * 0.40
      , 0.0, 1.0);
  }

  vec3 groundTint(vec3 worldPos, float flatness){
    const vec3 LUSH    = vec3(0.55, 0.72, 0.44);
    const vec3 OLIVE   = vec3(0.84, 0.82, 0.55);
    const vec3 STRAW   = vec3(1.00, 0.91, 0.63);
    const vec3 HEATHER = vec3(0.80, 0.62, 0.58);

    float dry = groundDryness(worldPos, flatness);
    float micro = gtNoise(worldPos.xz * 0.052 + 4.1);

    vec3 tint = mix(LUSH, OLIVE, smoothstep(0.0, 0.62, dry));
    tint = mix(tint, STRAW, smoothstep(0.48, 0.95, dry));
    // Heather rides its own field so the rust patches do not simply track the
    // dry gradient — it colonises regardless of how wet the ground is.
    tint = mix(tint, HEATHER,
               smoothstep(0.58, 0.88, gtNoise(worldPos.xz * 0.0074 + 41.0)) * 0.55);
    return tint * (0.92 + micro * 0.16);
  }
`;

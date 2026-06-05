<script lang="ts">
  let {
    rotation = $bindable(),
    skewX = $bindable(),
    skewY = $bindable(),
  }: { rotation: number; skewX: number; skewY: number } = $props();

  // Shared SVG viewBox size for both controls.
  const SIZE = 120;
  const C = SIZE / 2;

  // --- Rotate dial -------------------------------------------------------
  // The dot rides the perimeter; 0° points straight up (12 o'clock) and the
  // angle increases clockwise.
  const R = C - 12;

  const rad = $derived((rotation * Math.PI) / 180);
  const dotX = $derived(C + R * Math.sin(rad));
  const dotY = $derived(C - R * Math.cos(rad));

  let dial = $state<SVGSVGElement | null>(null);
  let dragging = $state(false);

  function angleFromEvent(e: PointerEvent): number {
    if (!dial) return rotation;
    const rect = dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return Math.round(deg);
  }

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    rotation = angleFromEvent(e);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    rotation = angleFromEvent(e);
  }

  function onPointerUp(e: PointerEvent) {
    dragging = false;
    (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
  }

  // --- Skew pad ----------------------------------------------------------
  // A draggable handle in a square: horizontal position drives the X-skew,
  // vertical drives the Y-skew, each clamped to ±MAX_SKEW degrees. The handle
  // travels within a margin so it never clips the edge.
  const MAX_SKEW = 45;
  const PAD = 16;
  const PAD_R = C - PAD;

  const handleX = $derived(C + (skewX / MAX_SKEW) * PAD_R);
  const handleY = $derived(C + (skewY / MAX_SKEW) * PAD_R);

  // Preview parallelogram: a centered reference square sheared by the current
  // angles, so the user sees the distortion they're dialing in.
  const preview = $derived.by(() => {
    const half = 34;
    const tx = Math.tan((skewX * Math.PI) / 180);
    const ty = Math.tan((skewY * Math.PI) / 180);
    const corner = (px: number, py: number) =>
      `${C + px + tx * py},${C + py + ty * px}`;
    return [
      corner(-half, -half),
      corner(half, -half),
      corner(half, half),
      corner(-half, half),
    ].join(" ");
  });

  let pad = $state<SVGSVGElement | null>(null);
  let skewing = $state(false);

  function clamp(v: number) {
    return Math.max(-MAX_SKEW, Math.min(MAX_SKEW, v));
  }

  function skewFromEvent(e: PointerEvent) {
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2; // -1..1
    const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    skewX = Math.round(clamp((nx * SIZE * MAX_SKEW) / (2 * PAD_R)));
    skewY = Math.round(clamp((ny * SIZE * MAX_SKEW) / (2 * PAD_R)));
  }

  function onSkewDown(e: PointerEvent) {
    skewing = true;
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    skewFromEvent(e);
  }

  function onSkewMove(e: PointerEvent) {
    if (!skewing) return;
    skewFromEvent(e);
  }

  function onSkewUp(e: PointerEvent) {
    skewing = false;
    (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
  }
</script>

<div class="add-panel">
  <fieldset class="layers">
    <legend>Rotate Map</legend>
    <div class="dial-wrap">
      <svg
        bind:this={dial}
        class="dial"
        class:dragging
        viewBox="0 0 {SIZE} {SIZE}"
        width={SIZE}
        height={SIZE}
        role="slider"
        tabindex="0"
        aria-label="Map rotation"
        aria-valuemin="0"
        aria-valuemax="359"
        aria-valuenow={rotation}
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
      >
        <circle class="track" cx={C} cy={C} r={R} />
        <line class="needle" x1={C} y1={C} x2={dotX} y2={dotY} />
        <circle class="dot" cx={dotX} cy={dotY} r="7" />
      </svg>
      <span class="readout">{rotation}°</span>
    </div>
  </fieldset>

  <fieldset class="layers">
    <legend>Skew Distortion</legend>
    <div class="dial-wrap">
      <svg
        bind:this={pad}
        class="dial"
        class:dragging={skewing}
        viewBox="0 0 {SIZE} {SIZE}"
        width={SIZE}
        height={SIZE}
        role="slider"
        tabindex="0"
        aria-label="Map skew"
        aria-valuemin={-MAX_SKEW}
        aria-valuemax={MAX_SKEW}
        aria-valuenow={skewX}
        onpointerdown={onSkewDown}
        onpointermove={onSkewMove}
        onpointerup={onSkewUp}
      >
        <rect class="frame" x="1" y="1" width={SIZE - 2} height={SIZE - 2} rx="4" />
        <line class="needle" x1="0" y1={C} x2={SIZE} y2={C} />
        <line class="needle" x1={C} y1="0" x2={C} y2={SIZE} />
        <polygon class="preview" points={preview} />
        <circle class="dot" cx={handleX} cy={handleY} r="7" />
      </svg>
      <span class="readout">{skewX}° / {skewY}°</span>
    </div>
  </fieldset>
</div>

<style>
  .add-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .layers {
    border: 1px solid #ddd;
    padding: 0.75rem 0.9rem;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .layers legend {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #555;
    padding: 0 0.35rem;
  }

  .dial-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0;
  }

  .dial {
    touch-action: none;
    cursor: grab;
  }

  .dial.dragging {
    cursor: grabbing;
  }

  .track {
    fill: none;
    stroke: #ddd;
    stroke-width: 2;
  }

  .frame {
    fill: none;
    stroke: #ddd;
    stroke-width: 2;
  }

  .preview {
    fill: rgba(255, 62, 0, 0.08);
    stroke: #ff3e00;
    stroke-width: 1.5;
  }

  .needle {
    stroke: #ccc;
    stroke-width: 1.5;
  }

  .dot {
    fill: #ff3e00;
    stroke: white;
    stroke-width: 2;
  }

  .readout {
    font-family: "Fira Mono", ui-monospace, monospace;
    font-size: 0.9rem;
    font-weight: 600;
    color: #222;
  }
</style>

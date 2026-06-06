<script lang="ts">
  import { ICONS, ICON_DND_TYPE } from "$lib/icons";

  let {
    rotation = $bindable(),
    skewX = $bindable(),
    skewY = $bindable(),
    tilt = $bindable(),
  }: { rotation: number; skewX: number; skewY: number; tilt: number } =
    $props();

  const MAX_TILT = 60;

  // Side-profile preview: a ground line that leans back as tilt increases, with
  // a raised block hinting at the resulting depth.
  const tiltRad = $derived((tilt * Math.PI) / 180);
  const profile = $derived.by(() => {
    const cx = C;
    const baseY = SIZE - 24;
    const halfW = C - 16;
    const dy = halfW * Math.sin(tiltRad) * 0.6;
    return {
      left: `${cx - halfW},${baseY + dy}`,
      right: `${cx + halfW},${baseY - dy}`,
      // A small box standing on the far (right) end to read as height.
      boxX: cx + halfW - 26,
      boxY: baseY - dy,
      boxLift: 22 * Math.cos(tiltRad),
    };
  });

  function onIconDragStart(e: DragEvent, id: string) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData(ICON_DND_TYPE, id);
    e.dataTransfer.effectAllowed = "copy";
  }

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

{#snippet resetIcon()}
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <polyline points="3 5 3 11 9 11" />
    <path d="M5 15a8 8 0 1 0 2-8.5L3 11" />
  </svg>
{/snippet}

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
      <div class="control-footer">
        <span class="readout">{rotation}°</span>
        <button
          type="button"
          class="reset-btn"
          disabled={rotation === 0}
          onclick={() => (rotation = 0)}
          title="Reset rotation"
          aria-label="Reset rotation"
        >
          {@render resetIcon()}
        </button>
      </div>
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
      <div class="control-footer">
        <span class="readout">{skewX}° / {skewY}°</span>
        <button
          type="button"
          class="reset-btn"
          disabled={skewX === 0 && skewY === 0}
          onclick={() => {
            skewX = 0;
            skewY = 0;
          }}
          title="Reset skew"
          aria-label="Reset skew"
        >
          {@render resetIcon()}
        </button>
      </div>
    </div>
  </fieldset>

  <fieldset class="layers">
    <legend>Perspective</legend>
    <div class="dial-wrap">
      <svg
        class="dial"
        viewBox="0 0 {SIZE} {SIZE}"
        width={SIZE}
        height={SIZE}
        aria-hidden="true"
      >
        <rect class="frame" x="1" y="1" width={SIZE - 2} height={SIZE - 2} rx="4" />
        <line
          class="needle"
          x1={profile.left.split(",")[0]}
          y1={profile.left.split(",")[1]}
          x2={profile.right.split(",")[0]}
          y2={profile.right.split(",")[1]}
        />
        <polygon
          class="preview"
          points="{profile.boxX},{profile.boxY} {profile.boxX + 20},{profile.boxY -
            profile.boxLift * 0.4} {profile.boxX + 20},{profile.boxY -
            profile.boxLift} {profile.boxX},{profile.boxY - profile.boxLift * 0.6}"
        />
      </svg>
      <label class="slider-row">
        <input
          type="range"
          min="0"
          max={MAX_TILT}
          step="1"
          bind:value={tilt}
          aria-label="Map perspective tilt"
        />
      </label>
      <div class="control-footer">
        <span class="readout">{tilt}°</span>
        <button
          type="button"
          class="reset-btn"
          disabled={tilt === 0}
          onclick={() => (tilt = 0)}
          title="Reset perspective"
          aria-label="Reset perspective"
        >
          {@render resetIcon()}
        </button>
      </div>
    </div>
  </fieldset>

  <!-- <fieldset class="layers">
    <legend>Icons</legend>
    <p class="hint">Drag an icon onto the map.</p>
    <div class="icon-grid">
      {#each ICONS as icon (icon.id)}
        <button
          type="button"
          class="icon-tile"
          draggable="true"
          title={icon.label}
          aria-label={icon.label}
          ondragstart={(e) => onIconDragStart(e, icon.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">{@html icon.svg}</svg>
        </button>
      {/each}
    </div>
  </fieldset> -->
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
    stroke: var(--color-theme-1);
    stroke-width: 1.5;
  }

  .needle {
    stroke: #ccc;
    stroke-width: 1.5;
  }

  .dot {
    fill: var(--color-theme-1);
    stroke: white;
    stroke-width: 2;
  }

  .slider-row {
    width: 100%;
    display: flex;
  }

  .slider-row input[type="range"] {
    width: 100%;
    cursor: pointer;
  }

  .control-footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .readout {
    font-family: "Fira Mono", ui-monospace, monospace;
    font-size: 0.9rem;
    font-weight: 600;
    color: #222;
  }

  .reset-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.6rem;
    height: 1.6rem;
    padding: 0;
    background: white;
    border: 1px solid #ddd;
    border-radius: 0.3rem;
    color: #555;
    cursor: pointer;
  }

  .reset-btn:hover:not(:disabled) {
    border-color: var(--color-theme-1);
    color: var(--color-theme-1);
  }

  .reset-btn:disabled {
    color: #ccc;
    cursor: default;
  }

  .reset-btn svg {
    width: 0.95rem;
    height: 0.95rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .hint {
    margin: 0;
    font-size: 0.78rem;
    color: #888;
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.4rem;
  }

  .icon-tile {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    padding: 0.35rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 0.3rem;
    color: #333;
    cursor: grab;
  }

  .icon-tile:hover {
    border-color: var(--color-theme-1);
    color: var(--color-theme-1);
  }

  .icon-tile:active {
    cursor: grabbing;
  }

  .icon-tile svg {
    width: 100%;
    height: 100%;
    fill: currentColor;
    pointer-events: none;
  }
</style>

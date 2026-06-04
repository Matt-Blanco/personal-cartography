<script lang="ts">
  let { rotation = $bindable() }: { rotation: number } = $props();

  // Dial geometry (SVG viewBox units). The dot rides the perimeter; 0° points
  // straight up (12 o'clock) and the angle increases clockwise.
  const SIZE = 120;
  const C = SIZE / 2;
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

<script lang="ts">
  import { DEFAULT_MARK, type MapStyles, type FillStyle } from "$lib/styles";
  import type { LayerKey } from "$lib/layers";

  let {
    styles,
    appliedLayers,
    contoursVisible,
    labelsVisible,
    boundaryVisible,
    onPrint,
  }: {
    styles: MapStyles;
    appliedLayers: Record<LayerKey, boolean>;
    contoursVisible: boolean;
    labelsVisible: boolean;
    boundaryVisible: boolean;
    onPrint: () => void;
  } = $props();

  function setFillMode(style: FillStyle, mode: string) {
    style.mark =
      mode === "mark" ? { ...DEFAULT_MARK, color: style.fill } : null;
  }
</script>

{#snippet fillLayer(legend: string, style: FillStyle)}
  <fieldset class="layers">
    <legend>{legend}</legend>
    <label class="color-row">
      <span class="color-name">Fill style</span>
      <select
        value={style.mark ? "mark" : "color"}
        onchange={(e) => setFillMode(style, e.currentTarget.value)}
      >
        <option value="color">Color</option>
        <option value="mark">Mark</option>
      </select>
    </label>

    {#if style.mark}
      <label class="color-row">
        <span class="color-name">Mark</span>
        <select bind:value={style.mark.type}>
          <option value="line">Lines</option>
          <option value="cross">Crosses</option>
          <option value="dot">Dots</option>
        </select>
      </label>
      <label class="color-row">
        <span class="color-name">Mark color</span>
        <input type="color" bind:value={style.mark.color} />
      </label>
      <label class="color-row">
        <span class="color-name">Spacing</span>
        <input type="range" min="3" max="20" step="1" bind:value={style.mark.spacing} />
      </label>
      <label class="color-row">
        <span class="color-name">Weight</span>
        <input type="range" min="0.3" max="3" step="0.1" bind:value={style.mark.weight} />
      </label>
      {#if style.mark.type !== "dot"}
        <label class="color-row">
          <span class="color-name">Angle</span>
          <input type="range" min="0" max="180" step="5" bind:value={style.mark.angle} />
        </label>
      {/if}
    {:else}
      <label class="color-row">
        <span class="color-name">Fill</span>
        <input type="color" bind:value={style.fill} />
      </label>
    {/if}

    <label class="color-row">
      <span class="color-name">Stroke</span>
      <input type="color" bind:value={style.stroke} />
    </label>
  </fieldset>
{/snippet}

<div class="edit-panel">
  <fieldset class="layers">
    <legend>Background</legend>
    <label class="color-row">
      <span class="color-name">Page</span>
      <input type="color" bind:value={styles.background} />
    </label>
  </fieldset>

  {#if boundaryVisible}
    {@render fillLayer("Boundary", styles.boundary)}
  {/if}

  {#if appliedLayers.green}
    {@render fillLayer("Parks & green", styles.green)}
  {/if}

  {#if appliedLayers.water}
    {@render fillLayer("Water", styles.water)}
  {/if}

  {#if appliedLayers.buildings}
    {@render fillLayer("Buildings", styles.buildings)}
  {/if}

  {#if appliedLayers.roads}
    <fieldset class="layers">
      <legend>Roads</legend>
      <label class="color-row">
        <span class="color-name">Major</span>
        <span class="color-tag">motorway, trunk</span>
        <input type="color" bind:value={styles.roads.major} />
      </label>
      <label class="color-row">
        <span class="color-name">Through</span>
        <span class="color-tag">primary, secondary, tertiary</span>
        <input type="color" bind:value={styles.roads.through} />
      </label>
      <label class="color-row">
        <span class="color-name">Local</span>
        <span class="color-tag">residential, unclassified</span>
        <input type="color" bind:value={styles.roads.local} />
      </label>
      <label class="color-row">
        <span class="color-name">Paths</span>
        <span class="color-tag">service, foot, cycle</span>
        <input type="color" bind:value={styles.roads.path} />
      </label>
    </fieldset>
  {/if}

  {#if appliedLayers.rail}
    <fieldset class="layers">
      <legend>Rail</legend>
      <label class="color-row">
        <span class="color-name">Stroke</span>
        <input type="color" bind:value={styles.rail} />
      </label>
    </fieldset>
  {/if}

  {#if contoursVisible}
    <fieldset class="layers">
      <legend>Contours</legend>
      <label class="color-row">
        <span class="color-name">Stroke</span>
        <input type="color" bind:value={styles.contour} />
      </label>
    </fieldset>
  {/if}

  {#if labelsVisible}
    <fieldset class="layers">
      <legend>Labels</legend>
      <label class="color-row">
        <span class="color-name">Text</span>
        <input type="color" bind:value={styles.label.fill} />
      </label>
      <label class="color-row">
        <span class="color-name">Halo</span>
        <input type="color" bind:value={styles.label.halo} />
      </label>
    </fieldset>
  {/if}

  <button type="button" class="print-btn" onclick={onPrint}>
    Print layers
  </button>
</div>

<style>
  .edit-panel {
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

  .color-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.95rem;
    cursor: pointer;
  }

  .color-row input[type="color"] {
    width: 2.2rem;
    height: 1.7rem;
    padding: 0;
    border: 1px solid #ccc;
    border-radius: 0.3rem;
    background: white;
    cursor: pointer;
  }

  .color-row input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 2px;
  }

  .color-row input[type="color"]::-webkit-color-swatch {
    border: none;
    border-radius: 0.2rem;
  }

  .color-row select {
    grid-column: 2 / 4;
    font-size: 0.85rem;
    padding: 0.2rem 0.3rem;
    border: 1px solid #ccc;
    border-radius: 0.3rem;
    background: white;
    cursor: pointer;
  }

  .color-row input[type="range"] {
    grid-column: 2 / 4;
    width: 100%;
    cursor: pointer;
  }

  .print-btn {
    margin-top: 0.25rem;
    padding: 0.6rem 1rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: white;
    background: #ff3e00;
    border: none;
    border-radius: 0.3rem;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .print-btn:hover {
    background: #e63800;
  }

  .color-name {
    font-size: 0.95rem;
    color: #222;
  }

  .color-tag {
    font-family: "Fira Mono", ui-monospace, monospace;
    font-size: 0.72rem;
    color: #888;
    text-align: right;
  }
</style>

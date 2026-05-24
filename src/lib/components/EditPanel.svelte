<script lang="ts">
  import type { MapStyles } from "$lib/styles";
  import type { LayerKey } from "$lib/layers";

  let {
    styles,
    appliedLayers,
    contoursVisible,
    labelsVisible,
    boundaryVisible,
  }: {
    styles: MapStyles;
    appliedLayers: Record<LayerKey, boolean>;
    contoursVisible: boolean;
    labelsVisible: boolean;
    boundaryVisible: boolean;
  } = $props();
</script>

<div class="edit-panel">
  <fieldset class="layers">
    <legend>Background</legend>
    <label class="color-row">
      <span class="color-name">Page</span>
      <input type="color" bind:value={styles.background} />
    </label>
  </fieldset>

  {#if boundaryVisible}
    <fieldset class="layers">
      <legend>Boundary</legend>
      <label class="color-row">
        <span class="color-name">Fill</span>
        <input type="color" bind:value={styles.boundary.fill} />
      </label>
      <label class="color-row">
        <span class="color-name">Stroke</span>
        <input type="color" bind:value={styles.boundary.stroke} />
      </label>
    </fieldset>
  {/if}

  {#if appliedLayers.green}
    <fieldset class="layers">
      <legend>Parks &amp; green</legend>
      <label class="color-row">
        <span class="color-name">Fill</span>
        <input type="color" bind:value={styles.green.fill} />
      </label>
      <label class="color-row">
        <span class="color-name">Stroke</span>
        <input type="color" bind:value={styles.green.stroke} />
      </label>
    </fieldset>
  {/if}

  {#if appliedLayers.water}
    <fieldset class="layers">
      <legend>Water</legend>
      <label class="color-row">
        <span class="color-name">Fill</span>
        <input type="color" bind:value={styles.water.fill} />
      </label>
      <label class="color-row">
        <span class="color-name">Stroke</span>
        <input type="color" bind:value={styles.water.stroke} />
      </label>
    </fieldset>
  {/if}

  {#if appliedLayers.buildings}
    <fieldset class="layers">
      <legend>Buildings</legend>
      <label class="color-row">
        <span class="color-name">Fill</span>
        <input type="color" bind:value={styles.buildings.fill} />
      </label>
      <label class="color-row">
        <span class="color-name">Stroke</span>
        <input type="color" bind:value={styles.buildings.stroke} />
      </label>
    </fieldset>
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

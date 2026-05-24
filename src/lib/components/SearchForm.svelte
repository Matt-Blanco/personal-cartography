<script lang="ts">
  import { LAYERS, type LayerKey } from "$lib/layers";

  type Status = "idle" | "geocoding" | "fetching" | "ready" | "error";

  let {
    query = $bindable(),
    radiusMiles = $bindable(),
    selected,
    contoursEnabled = $bindable(),
    labelsEnabled = $bindable(),
    status,
    busy,
    displayName,
    appliedRadius,
    errorMsg,
    onSubmit,
  }: {
    query: string;
    radiusMiles: number;
    selected: Record<LayerKey, boolean>;
    contoursEnabled: boolean;
    labelsEnabled: boolean;
    status: Status;
    busy: boolean;
    displayName: string | null;
    appliedRadius: number | null;
    errorMsg: string | null;
    onSubmit: (event: SubmitEvent) => void;
  } = $props();

  const RADIUS_MIN_MI = 0.25;
  const RADIUS_MAX_MI = 15;
  const RADIUS_STEP_MI = 0.25;

  const anySelected = $derived(Object.values(selected).some((v) => v));

  function formatRadius(mi: number): string {
    if (mi < 1) return `${Math.round(mi * 1609.34)} m`;
    return `${mi % 1 === 0 ? mi.toFixed(0) : mi.toFixed(2)} mi`;
  }
</script>

<form onsubmit={onSubmit}>
  <label class="field">
    <span class="field-label">Location</span>
    <input
      type="text"
      bind:value={query}
      placeholder="City, address, place…"
      autocomplete="off"
      disabled={busy}
    />
  </label>

  <label class="field">
    <span class="field-label">
      Radius
      <span class="field-value">{formatRadius(radiusMiles)}</span>
    </span>
    <input
      type="range"
      min={RADIUS_MIN_MI}
      max={RADIUS_MAX_MI}
      step={RADIUS_STEP_MI}
      bind:value={radiusMiles}
      disabled={busy}
    />
    <span class="range-bounds">
      <span>{formatRadius(RADIUS_MIN_MI)}</span>
      <span>{formatRadius(RADIUS_MAX_MI)}</span>
    </span>
  </label>

  <fieldset class="layers" disabled={busy}>
    <legend>Layers</legend>
    {#each LAYERS as layer (layer.key)}
      <label class="layer-option">
        <input type="checkbox" bind:checked={selected[layer.key]} />
        <span class="layer-name">{layer.label}</span>
        <span class="layer-tag">{layer.tagHint}</span>
      </label>
    {/each}
  </fieldset>

  <fieldset class="layers" disabled={busy}>
    <legend>Terrain</legend>
    <label class="layer-option">
      <input type="checkbox" bind:checked={contoursEnabled} />
      <span class="layer-name">Contour lines</span>
      <span class="layer-tag">ASTER GDEM</span>
    </label>
  </fieldset>

  <fieldset class="layers" disabled={busy}>
    <legend>Labels</legend>
    <label class="layer-option">
      <input type="checkbox" bind:checked={labelsEnabled} />
      <span class="layer-name">Road & feature names</span>
      <span class="layer-tag">name tag</span>
    </label>
  </fieldset>

  <button type="submit" disabled={busy || query.trim() === "" || !anySelected}>
    {#if status === "geocoding"}Finding location…{:else if status === "fetching"}Loading
      map…{:else}Search{/if}
  </button>

  {#if !anySelected}
    <p class="hint">Select at least one layer.</p>
  {/if}
</form>

{#if displayName && appliedRadius !== null}
  <p class="display-name">
    {displayName} · {formatRadius(appliedRadius)} radius
  </p>
{/if}
{#if errorMsg}
  <p class="error" role="alert">{errorMsg}</p>
{/if}

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .field-label {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #555;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .field-value {
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
    color: #222;
    font-family: "Fira Mono", ui-monospace, monospace;
    font-size: 0.85rem;
  }

  input[type="range"] {
    width: 100%;
    accent-color: #ff3e00;
  }

  .range-bounds {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: #888;
    font-family: "Fira Mono", ui-monospace, monospace;
  }

  input[type="text"] {
    padding: 0.6rem 0.75rem;
    font-size: 1rem;
    border: 1px solid #ccc;
    outline: none;
  }

  input[type="text"]:focus {
    border-color: #ff3e00;
    box-shadow: 0 0 0 3px rgba(255, 62, 0, 0.2);
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

  .layer-option {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.6rem;
    cursor: pointer;
    font-size: 0.95rem;
  }

  .layer-option input[type="checkbox"] {
    margin: 0;
    accent-color: #ff3e00;
  }

  .layer-tag {
    font-family: "Fira Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    color: #888;
  }

  button {
    padding: 0.7rem 1rem;
    font-size: 1rem;
    font-weight: 600;
    color: white;
    background: #ff3e00;
    border: none;
    border-radius: 0.4rem;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: #888;
  }

  .display-name {
    margin: 0;
    font-size: 0.85rem;
    color: #555;
  }

  .error {
    color: #c00;
    margin: 0;
    font-size: 0.9rem;
  }
</style>

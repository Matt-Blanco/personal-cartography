<script lang="ts">
  import type { Feature, FeatureCollection, GeometryObject } from "geojson";
  import { geocode, bboxFromRadius, type Bbox } from "$lib/geocode";
  import { fetchFeatures } from "$lib/overpass";
  import type { LayerKey } from "$lib/layers";
  import { fetchContours, type ContourFeature } from "$lib/contours";
  import { DEFAULT_STYLES, type MapStyles } from "$lib/styles";
  import SearchForm from "$lib/components/SearchForm.svelte";
  import EditPanel from "$lib/components/EditPanel.svelte";
  import MapCanvas from "$lib/components/MapCanvas.svelte";

  // Form state
  let query = $state("");
  let radiusMiles = $state(1);
  let selected = $state<Record<LayerKey, boolean>>({
    roads: true,
    buildings: false,
    water: false,
    green: false,
    rail: false,
  });
  let contoursEnabled = $state(false);
  let labelsEnabled = $state(false);

  // UI state
  let activeTab = $state<"search" | "edit">("search");
  let isMobile = $state(false);
  let collapsed = $state(false);
  let mapWidth = $state(0);
  let mapHeight = $state(0);

  // Result state
  let status = $state<"idle" | "geocoding" | "fetching" | "ready" | "error">(
    "idle",
  );
  let errorMsg = $state<string | null>(null);
  let displayName = $state<string | null>(null);
  let appliedRadius = $state<number | null>(null);
  let appliedSelected = $state<Record<LayerKey, boolean>>({
    roads: false,
    buildings: false,
    water: false,
    green: false,
    rail: false,
  });
  let appliedContours = $state(false);
  let appliedLabels = $state(false);
  let boundary = $state.raw<Feature<GeometryObject> | null>(null);
  let bbox = $state<Bbox | null>(null);
  let features = $state.raw<FeatureCollection<GeometryObject> | null>(null);
  let contours = $state.raw<ContourFeature[] | null>(null);

  const boundaryVisible = $derived(
    !!boundary &&
      (boundary.geometry.type === "Polygon" ||
        boundary.geometry.type === "MultiPolygon"),
  );
  const hasMap = $derived(bbox !== null);

  // Styling state — passed to MapCanvas and EditPanel
  let styles = $state<MapStyles>(structuredClone(DEFAULT_STYLES));

  let currentRequest: AbortController | null = null;

  const busy = $derived(status === "geocoding" || status === "fetching");

  $effect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const update = () => {
      isMobile = mq.matches;
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  });

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const q = query.trim();
    const anySelected = Object.values(selected).some((v) => v);
    if (!q || !anySelected) return;

    currentRequest?.abort();
    const controller = new AbortController();
    currentRequest = controller;

    status = "geocoding";
    errorMsg = null;
    displayName = null;
    boundary = null;
    bbox = null;
    features = null;
    contours = null;

    try {
      const hit = await geocode(q, controller.signal);
      if (!hit) {
        errorMsg = `No results for "${q}".`;
        status = "error";
        return;
      }

      displayName = hit.displayName;
      boundary = hit.boundary;
      appliedRadius = radiusMiles;
      bbox = bboxFromRadius(hit.lat, hit.lon, radiusMiles);

      const selectedKeys = (Object.keys(selected) as LayerKey[]).filter(
        (k) => selected[k],
      );

      status = "fetching";
      const featuresPromise = fetchFeatures(
        bbox,
        selectedKeys,
        controller.signal,
      );
      const contoursPromise = contoursEnabled
        ? fetchContours(bbox, controller.signal).catch((err) => {
            if ((err as Error).name === "AbortError") throw err;
            console.warn("[contours] failed:", err);
            return [] as ContourFeature[];
          })
        : Promise.resolve(null);

      const [featResult, contourResult] = await Promise.all([
        featuresPromise,
        contoursPromise,
      ]);
      features = featResult;
      contours = contourResult;
      appliedSelected = { ...selected };
      appliedContours = contoursEnabled;
      appliedLabels = labelsEnabled;
      status = "ready";
      if (isMobile) collapsed = true;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      errorMsg = e instanceof Error ? e.message : "Something went wrong.";
      status = "error";
    }
  }
</script>

<svelte:head>
  <title>Personal Cartography</title>
</svelte:head>

<section>
  <aside class="controls" class:collapsed={isMobile && collapsed}>
    <div class="tab-content">
      <header class="controls-header">
        <h1>Personal Cartography</h1>
        {#if isMobile && bbox}
          <button
            type="button"
            class="toggle"
            onclick={() => (collapsed = !collapsed)}
            aria-expanded={!collapsed}
          >
            {collapsed ? "Show" : "Hide"}
          </button>
        {/if}
      </header>

      {#if !(isMobile && collapsed) && activeTab === "search"}
        <SearchForm
          bind:query
          bind:radiusMiles
          {selected}
          bind:contoursEnabled
          bind:labelsEnabled
          {status}
          {busy}
          {displayName}
          {appliedRadius}
          {errorMsg}
          {onSubmit}
        />
      {:else if !(isMobile && collapsed) && activeTab === "edit" && hasMap}
        <EditPanel
          {styles}
          appliedLayers={appliedSelected}
          contoursVisible={appliedContours}
          labelsVisible={appliedLabels}
          {boundaryVisible}
        />
      {/if}
    </div>

    <nav class="tab-strip" aria-label="Panel tabs">
      <button
        type="button"
        class:active={activeTab === "search"}
        onclick={() => (activeTab = "search")}
      >
        Search
      </button>
      <button
        type="button"
        class:active={activeTab === "edit"}
        disabled={!hasMap}
        onclick={() => (activeTab = "edit")}
        title={hasMap ? undefined : "Generate a map first"}
      >
        Edit
      </button>
    </nav>
  </aside>

  <MapCanvas
    {bbox}
    {boundary}
    {features}
    {contours}
    {styles}
    showLabels={appliedLabels}
    bind:mapWidth
    bind:mapHeight
  />
</section>

<style>
  section {
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    box-sizing: border-box;
    height: 100vh;
    min-height: 100vh;
    overflow: hidden;
  }

  .controls {
    width: 20rem;
    flex-shrink: 0;
    display: flex;
    flex-direction: row;
    background-color: white;
    border-right: 1px solid #ddd;
    min-height: 0;
	max-height: 100vh;
  }

  .tab-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
  }

  .controls-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  h1 {
    margin: 0;
    text-align: left;
    font-size: 1.4rem;
  }

  .toggle {
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #ff3e00;
    background: white;
    border: 1px solid #ff3e00;
    cursor: pointer;
  }

  .tab-strip {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    border-left: 1px solid #ddd;
    background: #f4f3ee;
  }

  .tab-strip button {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    padding: 1.25rem 0.4rem;
    background: transparent;
    border: none;
    border-bottom: 1px solid #ddd;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
    color: #666;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-radius: 0;
  }

  .tab-strip button:last-child {
    border-bottom: none;
  }

  .tab-strip button.active {
    background: white;
    color: #ff3e00;
    margin-right: -1px;
  }

  .tab-strip button:disabled {
    color: #bbb;
    cursor: not-allowed;
  }

  @media (max-width: 720px) {
    section {
      flex-direction: column;
      height: auto;
      min-height: 100dvh;
      overflow: visible;
    }
    .controls {
      width: 100%;
      height: auto;
      border-right: none;
      border-bottom: 1px solid #ddd;
      max-height: 70vh;
    }
    .controls.collapsed {
      max-height: none;
    }
    .controls.collapsed .tab-content {
      padding: 0.75rem 1rem;
    }
    .controls.collapsed .tab-strip {
      display: none;
    }
    .controls.collapsed h1 {
      font-size: 1.1rem;
    }
  }
</style>

<script lang="ts">
  import { geoMercator, geoPath } from "d3-geo";
  import type { Feature, FeatureCollection, GeometryObject } from "geojson";
  import { bboxToCornersFeature, type Bbox } from "$lib/geocode";
  import { classify, type LayerKey } from "$lib/layers";
  import type { ContourFeature } from "$lib/contours";
  import { roadStyleFor, type MapStyles, type FillStyle, type LineStyle } from "$lib/styles";

  let {
    bbox,
    boundary,
    features,
    contours,
    styles,
    showLabels,
    mapWidth = $bindable(),
    mapHeight = $bindable(),
  }: {
    bbox: Bbox | null;
    boundary: Feature<GeometryObject> | null;
    features: FeatureCollection<GeometryObject> | null;
    contours: ContourFeature[] | null;
    styles: MapStyles;
    showLabels: boolean;
    mapWidth: number;
    mapHeight: number;
  } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);

  const fitFeature = $derived(bbox ? bboxToCornersFeature(bbox) : null);

  const projection = $derived.by(() => {
    if (!fitFeature || mapWidth <= 0 || mapHeight <= 0) return null;
    return geoMercator().fitSize([mapWidth, mapHeight], fitFeature);
  });

  const featuresByLayer = $derived.by(() => {
    const out: Record<LayerKey, Feature<GeometryObject>[]> = {
      roads: [],
      buildings: [],
      water: [],
      green: [],
      rail: [],
    };
    if (!features) return out;
    for (const f of features.features) {
      const key = classify(f.properties as Record<string, unknown>);
      if (key) out[key].push(f);
    }
    return out;
  });

  function drawFillBatch(
    ctx: CanvasRenderingContext2D,
    pathFn: ReturnType<typeof geoPath>,
    feats: Feature<GeometryObject>[],
    style: FillStyle,
  ) {
    if (feats.length === 0) return;
    ctx.beginPath();
    for (const f of feats) pathFn(f);
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.lineWidth;
    ctx.stroke();
  }

  function drawLineBatch(
    ctx: CanvasRenderingContext2D,
    pathFn: ReturnType<typeof geoPath>,
    feats: Feature<GeometryObject>[],
    style: LineStyle,
  ) {
    if (feats.length === 0) return;
    ctx.beginPath();
    for (const f of feats) pathFn(f);
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.lineWidth;
    ctx.setLineDash(style.dash ?? []);
    ctx.stroke();
  }

  $effect(() => {
    if (!canvas || !projection || mapWidth <= 0 || mapHeight <= 0) return;
    void features;
    void boundary;
    void featuresByLayer;
    void contours;
    void styles;
    void showLabels;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = mapWidth * dpr;
    canvas.height = mapHeight * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = styles.background;
    ctx.fillRect(0, 0, mapWidth, mapHeight);

    const pathFn = geoPath(projection, ctx);
    ctx.lineJoin = "round";
    ctx.lineCap = "butt";

    if (
      boundary &&
      (boundary.geometry.type === "Polygon" ||
        boundary.geometry.type === "MultiPolygon")
    ) {
      ctx.beginPath();
      pathFn(boundary);
      ctx.fillStyle = styles.boundary.fill;
      ctx.fill();
      ctx.strokeStyle = styles.boundary.stroke;
      ctx.lineWidth = styles.boundary.lineWidth;
      ctx.stroke();
    }

    if (contours && contours.length > 0) {
      ctx.lineCap = "butt";
      drawLineBatch(ctx, pathFn, contours, {
        stroke: styles.contour,
        lineWidth: 0.5,
      });
    }

    drawFillBatch(ctx, pathFn, featuresByLayer.green, styles.green);
    drawFillBatch(ctx, pathFn, featuresByLayer.water, styles.water);
    drawFillBatch(ctx, pathFn, featuresByLayer.buildings, styles.buildings);

    ctx.lineCap = "round";
    const roadGroups: Record<string, Feature<GeometryObject>[]> = {};
    for (const f of featuresByLayer.roads) {
      const hw = (f.properties as { highway?: string })?.highway ?? "other";
      (roadGroups[hw] ??= []).push(f);
    }
    for (const [hw, feats] of Object.entries(roadGroups)) {
      drawLineBatch(ctx, pathFn, feats, roadStyleFor(hw, styles.roads));
    }

    drawLineBatch(ctx, pathFn, featuresByLayer.rail, {
      stroke: styles.rail,
      lineWidth: 1,
      dash: [4, 3],
    });
    ctx.setLineDash([]);

    if (showLabels) drawLabels(ctx, pathFn);
  });

  function drawLabels(
    ctx: CanvasRenderingContext2D,
    pathFn: ReturnType<typeof geoPath>,
  ) {
    if (!features) return;

    type Placed = { name: string; x: number; y: number; w: number; h: number };
    const placed: Placed[] = [];
    const seenRoadName = new Set<string>();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeStyle = styles.label.halo;
    ctx.fillStyle = styles.label.fill;

    const roadFont = '500 10px "Fira Mono", ui-monospace, monospace';
    const areaFont = '600 11px system-ui, sans-serif';

    const items: { name: string; isRoad: boolean; x: number; y: number }[] = [];
    for (const f of features.features) {
      const name = (f.properties as { name?: string })?.name;
      if (!name) continue;
      const key = classify(f.properties as Record<string, unknown>);
      if (!key) continue;
      const isRoad = key === "roads" || key === "rail";
      if (isRoad) {
        if (seenRoadName.has(name)) continue;
        seenRoadName.add(name);
      }
      const c = pathFn.centroid(f);
      if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
      if (c[0] < 0 || c[1] < 0 || c[0] > mapWidth || c[1] > mapHeight) continue;
      items.push({ name, isRoad, x: c[0], y: c[1] });
    }

    items.sort((a, b) => (a.isRoad === b.isRoad ? 0 : a.isRoad ? 1 : -1));

    for (const it of items) {
      ctx.font = it.isRoad ? roadFont : areaFont;
      const m = ctx.measureText(it.name);
      const w = m.width;
      const h = it.isRoad ? 10 : 11;
      const overlap = placed.some(
        (p) =>
          Math.abs(p.x - it.x) < (p.w + w) / 2 + 2 &&
          Math.abs(p.y - it.y) < (p.h + h) / 2 + 2,
      );
      if (overlap) continue;
      ctx.lineWidth = 3;
      ctx.strokeText(it.name, it.x, it.y);
      ctx.fillText(it.name, it.x, it.y);
      placed.push({ name: it.name, x: it.x, y: it.y, w, h });
    }
  }
</script>

<div
  class="map"
  bind:clientWidth={mapWidth}
  bind:clientHeight={mapHeight}
  style:background={styles.background}
>
  {#if bbox}
    <canvas bind:this={canvas}></canvas>
  {:else}
    <div class="map-placeholder">Enter a location to draw the map.</div>
  {/if}
</div>

<style>
  .map {
    flex: 1;
    position: relative;
    min-width: 0;
    min-height: 0;
  }

  canvas {
    display: block;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .map-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #888;
  }

  @media (max-width: 720px) {
    .map {
      min-height: 60vh;
    }
  }
</style>

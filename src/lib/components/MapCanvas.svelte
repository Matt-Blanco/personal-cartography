<script lang="ts">
  import { geoMercator, geoPath } from "d3-geo";
  import type { Feature, FeatureCollection, GeometryObject } from "geojson";
  import { bboxToCornersFeature, type Bbox } from "$lib/geocode";
  import { classify, type LayerKey } from "$lib/layers";
  import type { ContourFeature } from "$lib/contours";
  import { roadStyleFor, type MapStyles, type FillStyle, type LineStyle } from "$lib/styles";

  // Flag to show all avaialble labels, otherwise only road labels will be displayed.
  const showAllLabels = false;

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

  type Pt = [number, number];

  function projectLine(coords: Pt[]): Pt[] {
    if (!projection) return [];
    const out: Pt[] = [];
    for (const c of coords) {
      const p = projection(c);
      if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) out.push([p[0], p[1]]);
    }
    return out;
  }

  function lineMidpointAndAngle(
    pts: Pt[],
  ): { x: number; y: number; angle: number; length: number } | null {
    if (pts.length < 2) return null;
    const lens: number[] = [0];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      lens.push(total);
    }
    if (total === 0) return null;
    const half = total / 2;
    let i = 1;
    while (i < lens.length - 1 && lens[i] < half) i++;
    const segLen = lens[i] - lens[i - 1] || 1;
    const t = (half - lens[i - 1]) / segLen;
    const x = pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]);
    const y = pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]);
    let angle = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    if (angle > Math.PI / 2) angle -= Math.PI;
    else if (angle < -Math.PI / 2) angle += Math.PI;
    return { x, y, angle, length: total };
  }

  function principalAngle(pts: Pt[]): number {
    if (pts.length < 2) return 0;
    let sx = 0, sy = 0;
    for (const [x, y] of pts) { sx += x; sy += y; }
    const cx = sx / pts.length, cy = sy / pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pts) {
      const dx = x - cx, dy = y - cy;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    if (angle > Math.PI / 2) angle -= Math.PI;
    else if (angle < -Math.PI / 2) angle += Math.PI;
    return angle;
  }

  function roadPlacement(
    f: Feature<GeometryObject>,
  ): { x: number; y: number; angle: number; length: number } | null {
    const g = f.geometry;
    if (g.type === "LineString") {
      return lineMidpointAndAngle(projectLine(g.coordinates as Pt[]));
    }
    if (g.type === "MultiLineString") {
      let best: ReturnType<typeof lineMidpointAndAngle> = null;
      for (const part of g.coordinates as Pt[][]) {
        const m = lineMidpointAndAngle(projectLine(part));
        if (m && (!best || m.length > best.length)) best = m;
      }
      return best;
    }
    return null;
  }

  function areaPlacement(
    f: Feature<GeometryObject>,
    pathFn: ReturnType<typeof geoPath>,
  ): { x: number; y: number; angle: number } | null {
    const c = pathFn.centroid(f);
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
    const g = f.geometry;
    let ring: Pt[] = [];
    if (g.type === "Polygon") {
      ring = projectLine((g.coordinates as Pt[][])[0] ?? []);
    } else if (g.type === "MultiPolygon") {
      let bestArea = -1;
      for (const poly of g.coordinates as Pt[][][]) {
        const r = projectLine(poly[0] ?? []);
        let area = 0;
        for (let i = 0; i < r.length; i++) {
          const [x1, y1] = r[i];
          const [x2, y2] = r[(i + 1) % r.length];
          area += x1 * y2 - x2 * y1;
        }
        const a = Math.abs(area);
        if (a > bestArea) { bestArea = a; ring = r; }
      }
    } else {
      return { x: c[0], y: c[1], angle: 0 };
    }
    const angle = principalAngle(ring);
    return { x: c[0], y: c[1], angle };
  }

  function drawLabels(
    ctx: CanvasRenderingContext2D,
    pathFn: ReturnType<typeof geoPath>,
  ) {
    if (!features) return;

    type Placed = { x: number; y: number; w: number; h: number };
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

    type Item = {
      name: string;
      isRoad: boolean;
      x: number;
      y: number;
      angle: number;
      length: number;
    };
    const items: Item[] = [];

    for (const f of features.features) {
      const name = (f.properties as { name?: string })?.name;
      if (!name) continue;
      const key = classify(f.properties as Record<string, unknown>);
      if (!key) continue;
      const isRoad = key === "roads" || key === "rail";
      if (isRoad) {
        if (seenRoadName.has(name)) continue;
        const p = roadPlacement(f);
        if (!p) continue;
        if (p.x < 0 || p.y < 0 || p.x > mapWidth || p.y > mapHeight) continue;
        seenRoadName.add(name);
        items.push({ name, isRoad, x: p.x, y: p.y, angle: p.angle, length: p.length });
      } else if (showAllLabels) {
        const p = areaPlacement(f, pathFn);
        if (!p) continue;
        if (p.x < 0 || p.y < 0 || p.x > mapWidth || p.y > mapHeight) continue;
        items.push({ name, isRoad, x: p.x, y: p.y, angle: p.angle, length: 0 });
      }
    }

    items.sort((a, b) => (a.isRoad === b.isRoad ? 0 : a.isRoad ? 1 : -1));

    for (const it of items) {
      ctx.font = it.isRoad ? roadFont : areaFont;
      const m = ctx.measureText(it.name);
      const w = m.width;
      const h = it.isRoad ? 10 : 11;
      if (it.isRoad && it.length < w * 0.75) continue;
      const cos = Math.abs(Math.cos(it.angle));
      const sin = Math.abs(Math.sin(it.angle));
      const bw = w * cos + h * sin;
      const bh = w * sin + h * cos;
      const overlap = placed.some(
        (p) =>
          Math.abs(p.x - it.x) < (p.w + bw) / 2 + 2 &&
          Math.abs(p.y - it.y) < (p.h + bh) / 2 + 2,
      );
      if (overlap) continue;
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.angle);
      ctx.lineWidth = 3;
      ctx.strokeText(it.name, 0, 0);
      ctx.fillText(it.name, 0, 0);
      ctx.restore();
      placed.push({ x: it.x, y: it.y, w: bw, h: bh });
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

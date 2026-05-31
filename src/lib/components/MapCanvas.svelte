<script lang="ts">
  import { geoMercator, geoPath } from "d3-geo";
  import type { Feature, FeatureCollection, GeometryObject } from "geojson";
  import { bboxToCornersFeature, type Bbox } from "$lib/geocode";
  import { classify, type LayerKey } from "$lib/layers";
  import type { ContourFeature } from "$lib/contours";
  import {
    roadStyleFor,
    type MapStyles,
    type FillStyle,
    type FillMark,
  } from "$lib/styles";

  // Flag to show all avaialble labels, otherwise only road labels will be displayed.
  const showAllLabels = false;

  let {
    bbox,
    boundary,
    features,
    contours,
    styles,
    showLabels,
    loading,
    mapWidth = $bindable(),
    mapHeight = $bindable(),
  }: {
    bbox: Bbox | null;
    boundary: Feature<GeometryObject> | null;
    features: FeatureCollection<GeometryObject> | null;
    contours: ContourFeature[] | null;
    styles: MapStyles;
    showLabels: boolean;
    loading: boolean;
    mapWidth: number;
    mapHeight: number;
  } = $props();

  // Each map layer renders onto its own stacked <canvas>, in this paint order
  // (earlier = underneath). Keeping layers physically separate lets the print
  // action emit one page per layer without re-deriving any geometry.
  type LayerId =
    | "boundary"
    | "contours"
    | "green"
    | "water"
    | "buildings"
    | "roads"
    | "rail"
    | "labels";

  const LAYER_ORDER: LayerId[] = [
    "boundary",
    "contours",
    "green",
    "water",
    "buildings",
    "roads",
    "rail",
    "labels",
  ];

  const LAYER_LABELS: Record<LayerId, string> = {
    boundary: "Boundary",
    contours: "Contours",
    green: "Parks & green",
    water: "Water",
    buildings: "Buildings",
    roads: "Roads",
    rail: "Rail",
    labels: "Labels",
  };

  // Plain (non-reactive) ref map populated by `bind:this`; read inside the
  // repaint frame, after the DOM has settled.
  const layerCanvases: Partial<Record<LayerId, HTMLCanvasElement | null>> = {};

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

  type Pt = [number, number];

  type PlacedLabel = {
    name: string;
    x: number;
    y: number;
    angle: number;
    font: string;
  };

  type Scene = {
    boundary: Path2D | null;
    contours: Path2D | null;
    green: Path2D;
    water: Path2D;
    buildings: Path2D;
    roads: { hw: string; path: Path2D }[];
    rail: Path2D;
    labels: PlacedLabel[];
  };

  // Projection-space geometry, baked once into Path2D objects (plus the label
  // layout, which is the other expensive step). This recomputes only when the
  // map data or projection changes — never when colors change — so edits in the
  // Edit panel skip reprojection/relayout and just re-fill the cached paths.
  const scene = $derived.by<Scene | null>(() => {
    const proj = projection;
    if (!proj || mapWidth <= 0 || mapHeight <= 0) return null;
    const path = geoPath(proj);

    const buildPath = (feats: Feature<GeometryObject>[]) => {
      const p = new Path2D();
      for (const f of feats) {
        const d = path(f);
        if (d) p.addPath(new Path2D(d));
      }
      return p;
    };

    let boundaryPath: Path2D | null = null;
    if (
      boundary &&
      (boundary.geometry.type === "Polygon" ||
        boundary.geometry.type === "MultiPolygon")
    ) {
      const d = path(boundary);
      if (d) boundaryPath = new Path2D(d);
    }

    const contoursPath =
      contours && contours.length > 0 ? buildPath(contours) : null;

    const roadGroups: Record<string, Feature<GeometryObject>[]> = {};
    for (const f of featuresByLayer.roads) {
      const hw = (f.properties as { highway?: string })?.highway ?? "other";
      (roadGroups[hw] ??= []).push(f);
    }
    const roads = Object.entries(roadGroups).map(([hw, feats]) => ({
      hw,
      path: buildPath(feats),
    }));

    return {
      boundary: boundaryPath,
      contours: contoursPath,
      green: buildPath(featuresByLayer.green),
      water: buildPath(featuresByLayer.water),
      buildings: buildPath(featuresByLayer.buildings),
      roads,
      rail: buildPath(featuresByLayer.rail),
      labels: showLabels ? layoutLabels(path) : [],
    };
  });

  // A layer is "visible" when it actually has something to draw — drives both
  // which canvases mount on screen and which pages the print action emits.
  function layerHasContent(id: LayerId, s: Scene): boolean {
    switch (id) {
      case "boundary":
        return !!s.boundary;
      case "contours":
        return !!s.contours;
      case "green":
        return featuresByLayer.green.length > 0;
      case "water":
        return featuresByLayer.water.length > 0;
      case "buildings":
        return featuresByLayer.buildings.length > 0;
      case "roads":
        return s.roads.length > 0;
      case "rail":
        return featuresByLayer.rail.length > 0;
      case "labels":
        return s.labels.length > 0;
    }
  }

  const visibleLayers = $derived.by<LayerId[]>(() =>
    scene ? LAYER_ORDER.filter((id) => layerHasContent(id, scene)) : [],
  );

  // Coalesce repaints into a single animation frame. A color-picker drag emits a
  // burst of `input` events; without this each one forces a synchronous full
  // canvas redraw. `$state.snapshot` deeply reads `styles`, registering every
  // nested color/width as a dependency while also handing the draw a plain copy.
  $effect(() => {
    const s = scene;
    const snap = $state.snapshot(styles) as MapStyles;
    const layers = visibleLayers;
    if (!s) return;
    const id = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      for (const lid of layers) {
        const c = layerCanvases[lid];
        if (!c) continue;
        c.width = mapWidth * dpr;
        c.height = mapHeight * dpr;
        const ctx = c.getContext("2d");
        if (!ctx) continue;
        ctx.scale(dpr, dpr);
        drawLayer(lid, ctx, s, snap, dpr);
      }
    });
    return () => cancelAnimationFrame(id);
  });

  // Build a repeating tile for a fill mark. Drawn at device-pixel resolution so
  // marks stay crisp on retina; the returned pattern is rotated for line/cross.
  function makeMarkPattern(
    ctx: CanvasRenderingContext2D,
    mark: FillMark,
    dpr: number,
  ): CanvasPattern | null {
    const spacing = Math.max(2, mark.spacing);
    const tile = document.createElement("canvas");
    tile.width = Math.round(spacing * dpr);
    tile.height = Math.round(spacing * dpr);
    const t = tile.getContext("2d");
    if (!t) return null;
    t.scale(dpr, dpr);
    t.strokeStyle = mark.color;
    t.fillStyle = mark.color;
    t.lineWidth = mark.weight;
    t.lineCap = "round";

    if (mark.type === "dot") {
      t.beginPath();
      t.arc(spacing / 2, spacing / 2, Math.max(0.3, mark.weight), 0, Math.PI * 2);
      t.fill();
    } else {
      // A horizontal midline tiles seamlessly into parallel lines; the pattern
      // transform rotates the whole lattice. "cross" adds the perpendicular set.
      t.beginPath();
      t.moveTo(0, spacing / 2);
      t.lineTo(spacing, spacing / 2);
      if (mark.type === "cross") {
        t.moveTo(spacing / 2, 0);
        t.lineTo(spacing / 2, spacing);
      }
      t.stroke();
    }

    const pat = ctx.createPattern(tile, "repeat");
    if (!pat) return null;
    // Undo the dpr baked into the tile, then rotate. createPattern coordinates
    // are in the untransformed canvas space, so scale back down by dpr.
    const m = new DOMMatrix().scaleSelf(1 / dpr);
    if (mark.type !== "dot") m.rotateSelf(mark.angle);
    pat.setTransform(m);
    return pat;
  }

  function fillStroke(
    ctx: CanvasRenderingContext2D,
    path: Path2D,
    style: FillStyle,
    dpr: number,
  ) {
    if (style.mark) {
      const pat = makeMarkPattern(ctx, style.mark, dpr);
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fill(path);
      }
    } else {
      ctx.fillStyle = style.fill;
      ctx.fill(path);
    }
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.lineWidth;
    ctx.stroke(path);
  }

  // Draw a single layer onto a fresh context. Each canvas starts transparent
  // (the page background shows through the `.map` element), so every layer sets
  // its own context state rather than inheriting it from a previous layer.
  function drawLayer(
    id: LayerId,
    ctx: CanvasRenderingContext2D,
    s: Scene,
    st: MapStyles,
    dpr: number,
  ) {
    switch (id) {
      case "boundary":
        if (!s.boundary) return;
        ctx.lineJoin = "round";
        ctx.lineCap = "butt";
        ctx.setLineDash([]);
        fillStroke(ctx, s.boundary, st.boundary, dpr);
        return;
      case "contours":
        if (!s.contours) return;
        ctx.setLineDash([]);
        ctx.strokeStyle = st.contour;
        ctx.lineWidth = 0.5;
        ctx.stroke(s.contours);
        return;
      case "green":
      case "water":
      case "buildings":
        ctx.lineJoin = "round";
        ctx.lineCap = "butt";
        ctx.setLineDash([]);
        fillStroke(ctx, s[id], st[id], dpr);
        return;
      case "roads":
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.setLineDash([]);
        for (const r of s.roads) {
          const rs = roadStyleFor(r.hw, st.roads);
          ctx.strokeStyle = rs.stroke;
          ctx.lineWidth = rs.lineWidth;
          ctx.stroke(r.path);
        }
        return;
      case "rail":
        ctx.lineCap = "butt";
        ctx.strokeStyle = st.rail;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.stroke(s.rail);
        ctx.setLineDash([]);
        return;
      case "labels":
        if (s.labels.length > 0) drawLabels(ctx, s.labels, st.label);
        return;
    }
  }

  // Width of the slug/bleed margin (map-space px) drawn around every print page.
  // Registration + crop marks live here; the content box sits inset by this.
  const PRINT_MARGIN = 28;

  // Crop marks at the trim corners and registration targets at the edge
  // midpoints. Identical on every page (same dimensions, margin, and scale), so
  // stacking the printouts lets each layer be aligned against the others.
  function drawPrintMarks(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    margin: number,
  ) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 0.5;

    const gap = 6;
    const len = margin - gap - 4;
    const corner = (x: number, y: number, dx: number, dy: number) => {
      ctx.beginPath();
      ctx.moveTo(x + dx * gap, y);
      ctx.lineTo(x + dx * (gap + len), y);
      ctx.moveTo(x, y + dy * gap);
      ctx.lineTo(x, y + dy * (gap + len));
      ctx.stroke();
    };
    corner(0, 0, -1, -1);
    corner(w, 0, 1, -1);
    corner(0, h, -1, 1);
    corner(w, h, 1, 1);

    // Temporary: Hide slug targets since graphically they clutter the map
    // const r = 5;
    // const ext = r * 1.7;
    // const target = (cx: number, cy: number) => {
    //   ctx.beginPath();
    //   ctx.arc(cx, cy, r, 0, Math.PI * 2);
    //   ctx.stroke();
    //   ctx.beginPath();
    //   ctx.moveTo(cx - ext, cy);
    //   ctx.lineTo(cx + ext, cy);
    //   ctx.moveTo(cx, cy - ext);
    //   ctx.lineTo(cx, cy + ext);
    //   ctx.stroke();
    // };
    // const m = margin / 2;
    // target(w / 2, -m);
    // target(w / 2, h + m);
    // target(-m, h / 2);
    // target(w + m, h / 2);

    ctx.restore();
  }

  // Render every visible layer to its own page and hand it to the browser's
  // print dialog. Layers are redrawn at a higher scale (the cached Path2D paths
  // are resolution-independent) so the output stays crisp on paper, inset inside
  // a slug/bleed margin carrying the alignment marks.
  export function printLayers() {
    const s = scene;
    if (!s) return;
    const layers = visibleLayers;
    if (layers.length === 0 || mapWidth <= 0 || mapHeight <= 0) return;
    const st = $state.snapshot(styles) as MapStyles;
    const scale = Math.max(2, Math.ceil((window.devicePixelRatio || 1) * 2));
    const margin = PRINT_MARGIN;

    const pages: { label: string; url: string }[] = [];
    for (const lid of layers) {
      const c = document.createElement("canvas");
      c.width = Math.round((mapWidth + margin * 2) * scale);
      c.height = Math.round((mapHeight + margin * 2) * scale);
      const ctx = c.getContext("2d");
      if (!ctx) continue;
      ctx.scale(scale, scale);
      ctx.translate(margin, margin);
      drawLayer(lid, ctx, s, st, scale);
      drawPrintMarks(ctx, mapWidth, mapHeight, margin);
      pages.push({ label: LAYER_LABELS[lid], url: c.toDataURL("image/png") });
    }
    openPrintWindow(pages);
  }

  function openPrintWindow(pages: { label: string; url: string }[]) {
    if (pages.length === 0) return;
    const win = window.open("", "_blank");
    if (!win) return;

    const body = pages
      .map(
        (p) =>
          `<section class="page"><h2>${p.label}</h2><img src="${p.url}" alt="${p.label}" /></section>`,
      )
      .join("");

    win.document.write(
      `<!doctype html><html><head><title>Map layers</title><meta charset="utf-8" /><style>
        @page { margin: 1.5cm; }
        html, body { margin: 0; padding: 0; }
        .page {
          page-break-after: always;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 92vh;
        }
        .page:last-child { page-break-after: auto; }
        h2 {
          font: 600 13px system-ui, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #555;
          margin: 0 0 1rem;
        }
        img { max-width: 100%; max-height: 84vh; object-fit: contain; }
      </style></head><body>${body}</body></html>`,
    );
    win.document.close();

    const imgs = Array.from(win.document.images);
    let remaining = imgs.length;
    const done = () => {
      if (--remaining <= 0) win.print();
    };
    if (remaining === 0) {
      win.print();
      return;
    }
    for (const img of imgs) {
      if (img.complete) done();
      else img.onload = img.onerror = done;
    }
  }

  let measureCtx: CanvasRenderingContext2D | null = null;
  function getMeasureCtx(): CanvasRenderingContext2D | null {
    if (!measureCtx) {
      measureCtx = document.createElement("canvas").getContext("2d");
    }
    return measureCtx;
  }

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

  // Color-independent: decides which labels survive overlap resolution and
  // where/how they sit. Measurement uses a detached context so layout can run
  // outside the paint, and the result is cached on the scene.
  function layoutLabels(
    pathFn: ReturnType<typeof geoPath>,
  ): PlacedLabel[] {
    if (!features) return [];
    const mctx = getMeasureCtx();
    if (!mctx) return [];

    type Placed = { x: number; y: number; w: number; h: number };
    const placed: Placed[] = [];
    const seenRoadName = new Set<string>();

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

    const result: PlacedLabel[] = [];
    for (const it of items) {
      const font = it.isRoad ? roadFont : areaFont;
      mctx.font = font;
      const w = mctx.measureText(it.name).width;
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
      result.push({ name: it.name, x: it.x, y: it.y, angle: it.angle, font });
      placed.push({ x: it.x, y: it.y, w: bw, h: bh });
    }
    return result;
  }

  function drawLabels(
    ctx: CanvasRenderingContext2D,
    labels: PlacedLabel[],
    style: MapStyles["label"],
  ) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = 3;
    ctx.strokeStyle = style.halo;
    ctx.fillStyle = style.fill;

    for (const it of labels) {
      ctx.font = it.font;
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.angle);
      ctx.strokeText(it.name, 0, 0);
      ctx.fillText(it.name, 0, 0);
      ctx.restore();
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
    {#each visibleLayers as id (id)}
      <canvas bind:this={layerCanvases[id]} data-layer={id}></canvas>
    {/each}
  {:else}
    <div class="map-placeholder">Enter a location to draw the map.</div>
  {/if}

  {#if loading}
    <div class="loading-overlay" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <span class="loading-text">Loading map…</span>
    </div>
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

  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    background: rgba(255, 255, 255, 0.55);
    backdrop-filter: blur(1px);
    pointer-events: none;
  }

  .spinner {
    width: 2.25rem;
    height: 2.25rem;
    border: 3px solid rgba(255, 62, 0, 0.25);
    border-top-color: #ff3e00;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .loading-text {
    font-size: 0.85rem;
    font-weight: 600;
    color: #555;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner { animation-duration: 2s; }
  }

  @media (max-width: 720px) {
    .map {
      min-height: 60vh;
    }
  }
</style>

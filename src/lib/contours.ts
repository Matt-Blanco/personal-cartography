import { contours as d3Contours } from "d3-contour";
import type { Feature, MultiPolygon } from "geojson";
import type { Bbox } from "./geocode";

const TILE_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const TILE_SIZE = 256;
const MAX_TILES = 16;

export type ContourFeature = Feature<MultiPolygon, { value: number }>;

export async function fetchContours(
  bbox: Bbox,
  signal?: AbortSignal,
): Promise<ContourFeature[]> {
  const z = pickZoom(bboxKm(bbox));

  const txMinF = lonToTileX(bbox.west, z);
  const txMaxF = lonToTileX(bbox.east, z);
  const tyMinF = latToTileY(bbox.north, z);
  const tyMaxF = latToTileY(bbox.south, z);

  const tx0 = Math.floor(txMinF);
  const tx1 = Math.floor(txMaxF);
  const ty0 = Math.floor(tyMinF);
  const ty1 = Math.floor(tyMaxF);

  const cols = tx1 - tx0 + 1;
  const rows = ty1 - ty0 + 1;
  if (cols * rows > MAX_TILES) {
    throw new Error(
      `Contour region too large (${cols * rows} tiles). Reduce radius.`,
    );
  }

  const tilePromises: Promise<{ x: number; y: number; img: HTMLImageElement }>[] =
    [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      tilePromises.push(fetchTile(z, tx, ty, signal));
    }
  }
  const tiles = await Promise.all(tilePromises);

  const sw = cols * TILE_SIZE;
  const sh = rows * TILE_SIZE;
  const stitched = document.createElement("canvas");
  stitched.width = sw;
  stitched.height = sh;
  const sctx = stitched.getContext("2d");
  if (!sctx) throw new Error("2D canvas context unavailable");
  for (const t of tiles) {
    sctx.drawImage(t.img, (t.x - tx0) * TILE_SIZE, (t.y - ty0) * TILE_SIZE);
  }

  const x0 = Math.floor((txMinF - tx0) * TILE_SIZE);
  const x1 = Math.ceil((txMaxF - tx0) * TILE_SIZE);
  const y0 = Math.floor((tyMinF - ty0) * TILE_SIZE);
  const y1 = Math.ceil((tyMaxF - ty0) * TILE_SIZE);
  const gw = x1 - x0;
  const gh = y1 - y0;

  const imgData = sctx.getImageData(x0, y0, gw, gh).data;
  const grid = new Array(gw * gh);
  let minE = Infinity;
  let maxE = -Infinity;
  for (let i = 0; i < gw * gh; i++) {
    const r = imgData[i * 4];
    const g = imgData[i * 4 + 1];
    const b = imgData[i * 4 + 2];
    const e = r * 256 + g + b / 256 - 32768;
    grid[i] = e;
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
  }

  if (!isFinite(minE) || !isFinite(maxE) || maxE - minE < 1) return [];

  const interval = pickInterval(maxE - minE);
  const thresholds: number[] = [];
  for (
    let v = Math.ceil(minE / interval) * interval;
    v <= maxE;
    v += interval
  ) {
    thresholds.push(v);
  }
  if (thresholds.length === 0) return [];

  const polys = d3Contours().size([gw, gh]).thresholds(thresholds)(grid);

  return polys.map((p) => ({
    type: "Feature",
    properties: { value: p.value },
    geometry: {
      type: "MultiPolygon",
      coordinates: p.coordinates.map((poly) =>
        poly.map((ring) =>
          ring.map(([x, y]) => {
            const tileX = (x0 + x) / TILE_SIZE + tx0;
            const tileY = (y0 + y) / TILE_SIZE + ty0;
            return [tileXToLon(tileX, z), tileYToLat(tileY, z)];
          }),
        ),
      ),
    },
  }));
}

function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * (1 << z);
}

function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << z);
}

function tileXToLon(tx: number, z: number): number {
  return (tx / (1 << z)) * 360 - 180;
}

function tileYToLat(ty: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * ty) / (1 << z);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

function bboxKm(bbox: Bbox): number {
  const latR = (((bbox.south + bbox.north) / 2) * Math.PI) / 180;
  const dLatKm = (bbox.north - bbox.south) * 111;
  const dLonKm = (bbox.east - bbox.west) * 111 * Math.cos(latR);
  return Math.max(dLatKm, dLonKm);
}

function pickZoom(km: number): number {
  // Target roughly 256-512 px across the bbox at the source tile resolution.
  return Math.min(14, Math.max(10, Math.round(Math.log2(23437 / km))));
}

function pickInterval(range: number): number {
  if (range < 50) return 5;
  if (range < 200) return 10;
  if (range < 500) return 25;
  if (range < 1500) return 50;
  if (range < 5000) return 100;
  return 250;
}

function fetchTile(
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal,
): Promise<{ x: number; y: number; img: HTMLImageElement }> {
  const url = TILE_URL.replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ x, y, img });
    img.onerror = () => reject(new Error(`Failed to load tile ${z}/${x}/${y}`));
    if (signal) {
      const onAbort = () => {
        img.src = "";
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    img.src = url;
  });
}

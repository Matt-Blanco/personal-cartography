import { R as attr, a as derived, i as bind_props, n as attr_class, o as ensure_array_like, r as attr_style, s as head, z as escape_html } from "../../chunks/dev.js";
import osmtogeojson from "osmtogeojson";
import rewind from "@mapbox/geojson-rewind";
import { contours } from "d3-contour";
import { geoMercator } from "d3-geo";
//#region src/lib/geocode.ts
async function geocode(query, signal) {
	const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&polygon_geojson=1&q=${encodeURIComponent(query)}`;
	const res = await fetch(url, {
		headers: { Accept: "application/json" },
		signal
	});
	if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
	const data = await res.json();
	if (data.length === 0) return null;
	const hit = data[0];
	return {
		lat: parseFloat(hit.lat),
		lon: parseFloat(hit.lon),
		displayName: hit.display_name,
		boundary: hit.geojson ? {
			type: "Feature",
			geometry: hit.geojson,
			properties: {}
		} : null
	};
}
var MILES_PER_DEG_LAT = 69;
function bboxFromRadius(lat, lon, radiusMiles) {
	const dLat = radiusMiles / MILES_PER_DEG_LAT;
	const dLon = radiusMiles / (MILES_PER_DEG_LAT * Math.cos(lat * Math.PI / 180));
	return {
		south: lat - dLat,
		north: lat + dLat,
		west: lon - dLon,
		east: lon + dLon
	};
}
function bboxToCornersFeature(bbox) {
	const { south, west, north, east } = bbox;
	return {
		type: "Feature",
		properties: {},
		geometry: {
			type: "MultiPoint",
			coordinates: [
				[west, south],
				[east, south],
				[east, north],
				[west, north]
			]
		}
	};
}
//#endregion
//#region src/lib/layers.ts
var LAYERS = [
	{
		key: "roads",
		label: "Roads",
		tagHint: "highway",
		selectors: ["way[\"highway\"]"],
		matches: (p) => typeof p.highway === "string"
	},
	{
		key: "buildings",
		label: "Buildings",
		tagHint: "building",
		selectors: ["way[\"building\"]"],
		matches: (p) => Boolean(p.building)
	},
	{
		key: "water",
		label: "Water",
		tagHint: "natural=water",
		selectors: ["way[\"natural\"=\"water\"]", "relation[\"natural\"=\"water\"]"],
		matches: (p) => p.natural === "water"
	},
	{
		key: "green",
		label: "Parks & green",
		tagHint: "leisure, landuse, natural",
		selectors: ["way[\"leisure\"~\"park|garden|natural\"]", "way[\"landuse\"~\"forest|grass|recreation_ground|natural\"]"],
		matches: (p) => {
			const leisure = p.leisure;
			const landuse = p.landuse;
			return leisure === "park" || leisure === "garden" || landuse === "forest" || landuse === "grass" || landuse === "recreation_ground";
		}
	},
	{
		key: "rail",
		label: "Rail",
		tagHint: "railway",
		selectors: ["way[\"railway\"]"],
		matches: (p) => typeof p.railway === "string"
	}
];
function classify(props) {
	if (!props) return null;
	for (const layer of LAYERS) if (layer.matches(props)) return layer.key;
	return null;
}
//#endregion
//#region src/lib/overpass.ts
var OVERPASS_URL = "https://overpass-api.de/api/interpreter";
async function fetchFeatures(bbox, selectedKeys, signal) {
	const { south, west, north, east } = bbox;
	const bboxStr = `${south},${west},${north},${east}`;
	const selectors = LAYERS.filter((l) => selectedKeys.includes(l.key)).flatMap((l) => l.selectors).map((s) => `${s}(${bboxStr});`).join("\n");
	if (!selectors) return {
		type: "FeatureCollection",
		features: []
	};
	const query = `
		[out:json][timeout:25];
		(
			${selectors}
		);
		(._;>;);
		out;
	`.trim();
	const res = await fetch(OVERPASS_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: "data=" + encodeURIComponent(query),
		signal
	});
	if (!res.ok) throw new Error(`Overpass query failed (${res.status})`);
	const fc = osmtogeojson(await res.json());
	fc.features = fc.features.filter((f) => f.geometry.type !== "Point");
	rewind(fc, true);
	return fc;
}
//#endregion
//#region src/lib/contours.ts
var TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
var TILE_SIZE = 256;
var MAX_TILES = 16;
async function fetchContours(bbox, signal) {
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
	if (cols * rows > MAX_TILES) throw new Error(`Contour region too large (${cols * rows} tiles). Reduce radius.`);
	const tilePromises = [];
	for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) tilePromises.push(fetchTile(z, tx, ty, signal));
	const tiles = await Promise.all(tilePromises);
	const sw = cols * TILE_SIZE;
	const sh = rows * TILE_SIZE;
	const stitched = document.createElement("canvas");
	stitched.width = sw;
	stitched.height = sh;
	const sctx = stitched.getContext("2d");
	if (!sctx) throw new Error("2D canvas context unavailable");
	for (const t of tiles) sctx.drawImage(t.img, (t.x - tx0) * TILE_SIZE, (t.y - ty0) * TILE_SIZE);
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
	const thresholds = [];
	for (let v = Math.ceil(minE / interval) * interval; v <= maxE; v += interval) thresholds.push(v);
	if (thresholds.length === 0) return [];
	return contours().size([gw, gh]).thresholds(thresholds)(grid).map((p) => ({
		type: "Feature",
		properties: { value: p.value },
		geometry: {
			type: "MultiPolygon",
			coordinates: p.coordinates.map((poly) => poly.map((ring) => ring.map(([x, y]) => {
				const tileX = (x0 + x) / TILE_SIZE + tx0;
				const tileY = (y0 + y) / TILE_SIZE + ty0;
				return [tileXToLon(tileX, z), tileYToLat(tileY, z)];
			})))
		}
	}));
}
function lonToTileX(lon, z) {
	return (lon + 180) / 360 * (1 << z);
}
function latToTileY(lat, z) {
	const r = lat * Math.PI / 180;
	return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z);
}
function tileXToLon(tx, z) {
	return tx / (1 << z) * 360 - 180;
}
function tileYToLat(ty, z) {
	const n = Math.PI - 2 * Math.PI * ty / (1 << z);
	return Math.atan(Math.sinh(n)) * 180 / Math.PI;
}
function bboxKm(bbox) {
	const latR = (bbox.south + bbox.north) / 2 * Math.PI / 180;
	const dLatKm = (bbox.north - bbox.south) * 111;
	const dLonKm = (bbox.east - bbox.west) * 111 * Math.cos(latR);
	return Math.max(dLatKm, dLonKm);
}
function pickZoom(km) {
	return Math.min(14, Math.max(10, Math.round(Math.log2(23437 / km))));
}
function pickInterval(range) {
	if (range < 50) return 5;
	if (range < 200) return 10;
	if (range < 500) return 25;
	if (range < 1500) return 50;
	if (range < 5e3) return 100;
	return 250;
}
function fetchTile(z, x, y, signal) {
	const url = TILE_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => resolve({
			x,
			y,
			img
		});
		img.onerror = () => reject(/* @__PURE__ */ new Error(`Failed to load tile ${z}/${x}/${y}`));
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
//#endregion
//#region src/lib/styles.ts
var DEFAULT_STYLES = {
	background: "#ffffff",
	boundary: {
		fill: "#ffffff",
		stroke: "#b8b09a",
		lineWidth: .6
	},
	green: {
		fill: "#d6e4c4",
		stroke: "#a8be8c",
		lineWidth: .5
	},
	water: {
		fill: "#b9d6e8",
		stroke: "#87a8c0",
		lineWidth: .5
	},
	buildings: {
		fill: "#e5d4b5",
		stroke: "#b89c70",
		lineWidth: .4
	},
	roads: {
		major: "#d97a3a",
		through: "#d9a23a",
		local: "#555555",
		path: "#aaaaaa"
	},
	rail: "#555555",
	contour: "#a07e54",
	label: {
		fill: "#333333",
		halo: "#ffffff"
	}
};
//#endregion
//#region src/lib/components/SearchForm.svelte
function SearchForm($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { query = void 0, radiusMiles = void 0, selected, contoursEnabled = void 0, labelsEnabled = void 0, status, busy, displayName, appliedRadius, errorMsg, onSubmit } = $$props;
		const RADIUS_MIN_MI = .25;
		const RADIUS_MAX_MI = 15;
		const RADIUS_STEP_MI = .25;
		const anySelected = derived(() => Object.values(selected).some((v) => v));
		function formatRadius(mi) {
			if (mi < 1) return `${Math.round(mi * 1609.34)} m`;
			return `${mi % 1 === 0 ? mi.toFixed(0) : mi.toFixed(2)} mi`;
		}
		$$renderer.push(`<form class="svelte-1l7vvd6"><label class="field svelte-1l7vvd6"><span class="field-label svelte-1l7vvd6">Location</span> <input type="text"${attr("value", query)} placeholder="City, address, place…" autocomplete="off"${attr("disabled", busy, true)} class="svelte-1l7vvd6"/></label> <label class="field svelte-1l7vvd6"><span class="field-label svelte-1l7vvd6">Radius <span class="field-value svelte-1l7vvd6">${escape_html(formatRadius(radiusMiles))}</span></span> <input type="range"${attr("min", RADIUS_MIN_MI)}${attr("max", RADIUS_MAX_MI)}${attr("step", RADIUS_STEP_MI)}${attr("value", radiusMiles)}${attr("disabled", busy, true)} class="svelte-1l7vvd6"/> <span class="range-bounds svelte-1l7vvd6"><span>${escape_html(formatRadius(RADIUS_MIN_MI))}</span> <span>${escape_html(formatRadius(RADIUS_MAX_MI))}</span></span></label> <fieldset class="layers svelte-1l7vvd6"${attr("disabled", busy, true)}><legend class="svelte-1l7vvd6">Layers</legend> <!--[-->`);
		const each_array = ensure_array_like(LAYERS);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let layer = each_array[$$index];
			$$renderer.push(`<label class="layer-option svelte-1l7vvd6"><input type="checkbox"${attr("checked", selected[layer.key], true)} class="svelte-1l7vvd6"/> <span class="layer-name">${escape_html(layer.label)}</span> <span class="layer-tag svelte-1l7vvd6">${escape_html(layer.tagHint)}</span></label>`);
		}
		$$renderer.push(`<!--]--></fieldset> <fieldset class="layers svelte-1l7vvd6"${attr("disabled", busy, true)}><legend class="svelte-1l7vvd6">Terrain</legend> <label class="layer-option svelte-1l7vvd6"><input type="checkbox"${attr("checked", contoursEnabled, true)} class="svelte-1l7vvd6"/> <span class="layer-name">Contour lines</span> <span class="layer-tag svelte-1l7vvd6">ASTER GDEM</span></label></fieldset> <fieldset class="layers svelte-1l7vvd6"${attr("disabled", busy, true)}><legend class="svelte-1l7vvd6">Labels</legend> <label class="layer-option svelte-1l7vvd6"><input type="checkbox"${attr("checked", labelsEnabled, true)} class="svelte-1l7vvd6"/> <span class="layer-name">Road &amp; feature names</span> <span class="layer-tag svelte-1l7vvd6">name tag</span></label></fieldset> <button type="submit"${attr("disabled", busy || query.trim() === "" || !anySelected(), true)} class="svelte-1l7vvd6">`);
		if (status === "geocoding") {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`Finding location…`);
		} else if (status === "fetching") {
			$$renderer.push("<!--[1-->");
			$$renderer.push(`Loading
      map…`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`Search`);
		}
		$$renderer.push(`<!--]--></button> `);
		if (!anySelected()) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p class="hint svelte-1l7vvd6">Select at least one layer.</p>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></form> `);
		if (displayName && appliedRadius !== null) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p class="display-name svelte-1l7vvd6">${escape_html(displayName)} · ${escape_html(formatRadius(appliedRadius))} radius</p>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> `);
		if (errorMsg) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p class="error svelte-1l7vvd6" role="alert">${escape_html(errorMsg)}</p>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]-->`);
		bind_props($$props, {
			query,
			radiusMiles,
			contoursEnabled,
			labelsEnabled
		});
	});
}
//#endregion
//#region src/lib/components/MapCanvas.svelte
function MapCanvas($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { bbox, boundary, features, contours, styles, showLabels, loading, mapWidth = void 0, mapHeight = void 0 } = $$props;
		const fitFeature = derived(() => bbox ? bboxToCornersFeature(bbox) : null);
		derived(() => {
			if (!fitFeature() || mapWidth <= 0 || mapHeight <= 0) return null;
			return geoMercator().fitSize([mapWidth, mapHeight], fitFeature());
		});
		derived(() => {
			const out = {
				roads: [],
				buildings: [],
				water: [],
				green: [],
				rail: []
			};
			if (!features) return out;
			for (const f of features.features) {
				const key = classify(f.properties);
				if (key) out[key].push(f);
			}
			return out;
		});
		$$renderer.push(`<div class="map svelte-4tz69q"${attr_style("", { background: styles.background })}>`);
		if (bbox) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<canvas class="svelte-4tz69q"></canvas>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<div class="map-placeholder svelte-4tz69q">Enter a location to draw the map.</div>`);
		}
		$$renderer.push(`<!--]--> `);
		if (loading) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<div class="loading-overlay svelte-4tz69q" role="status" aria-live="polite"><div class="spinner svelte-4tz69q" aria-hidden="true"></div> <span class="loading-text svelte-4tz69q">Loading map…</span></div>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></div>`);
		bind_props($$props, {
			mapWidth,
			mapHeight
		});
	});
}
//#endregion
//#region src/routes/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let query = "";
		let radiusMiles = 1;
		let selected = {
			roads: true,
			buildings: false,
			water: false,
			green: false,
			rail: false
		};
		let contoursEnabled = false;
		let labelsEnabled = false;
		let isMobile = false;
		let mapWidth = 0;
		let mapHeight = 0;
		let status = "idle";
		let errorMsg = null;
		let displayName = null;
		let appliedRadius = null;
		let appliedLabels = false;
		let boundary = null;
		let bbox = null;
		let features = null;
		let contours = null;
		derived(() => !!boundary && (boundary.geometry.type === "Polygon" || boundary.geometry.type === "MultiPolygon"));
		const hasMap = derived(() => bbox !== null);
		let styles = structuredClone(DEFAULT_STYLES);
		let currentRequest = null;
		const busy = derived(() => status === "geocoding" || status === "fetching");
		async function onSubmit(event) {
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
				const selectedKeys = Object.keys(selected).filter((k) => selected[k]);
				status = "fetching";
				const featuresPromise = fetchFeatures(bbox, selectedKeys, controller.signal);
				const contoursPromise = contoursEnabled ? fetchContours(bbox, controller.signal).catch((err) => {
					if (err.name === "AbortError") throw err;
					console.warn("[contours] failed:", err);
					return [];
				}) : Promise.resolve(null);
				const [featResult, contourResult] = await Promise.all([featuresPromise, contoursPromise]);
				features = featResult;
				contours = contourResult;
				({ ...selected });
				appliedLabels = labelsEnabled;
				status = "ready";
			} catch (e) {
				if (e.name === "AbortError") return;
				errorMsg = e instanceof Error ? e.message : "Something went wrong.";
				status = "error";
			}
		}
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer) {
			head("1uha8ag", $$renderer, ($$renderer) => {
				$$renderer.title(($$renderer) => {
					$$renderer.push(`<title>Personal Cartography</title>`);
				});
			});
			$$renderer.push(`<section class="svelte-1uha8ag"><aside${attr_class("controls svelte-1uha8ag", void 0, { "collapsed": isMobile })}><div class="tab-content svelte-1uha8ag"><header class="controls-header svelte-1uha8ag"><h1 class="svelte-1uha8ag">Personal Cartography</h1> `);
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--></header> `);
			$$renderer.push("<!--[0-->");
			SearchForm($$renderer, {
				selected,
				status,
				busy: busy(),
				displayName,
				appliedRadius,
				errorMsg,
				onSubmit,
				get query() {
					return query;
				},
				set query($$value) {
					query = $$value;
					$$settled = false;
				},
				get radiusMiles() {
					return radiusMiles;
				},
				set radiusMiles($$value) {
					radiusMiles = $$value;
					$$settled = false;
				},
				get contoursEnabled() {
					return contoursEnabled;
				},
				set contoursEnabled($$value) {
					contoursEnabled = $$value;
					$$settled = false;
				},
				get labelsEnabled() {
					return labelsEnabled;
				},
				set labelsEnabled($$value) {
					labelsEnabled = $$value;
					$$settled = false;
				}
			});
			$$renderer.push(`<!--]--></div> <nav class="tab-strip svelte-1uha8ag" aria-label="Panel tabs"><button type="button"${attr_class("svelte-1uha8ag", void 0, { "active": true })}>Search</button> <button type="button"${attr("disabled", !hasMap(), true)}${attr("title", hasMap() ? void 0 : "Generate a map first")}${attr_class("svelte-1uha8ag", void 0, { "active": false })}>Edit</button></nav></aside> `);
			MapCanvas($$renderer, {
				bbox,
				boundary,
				features,
				contours,
				styles,
				showLabels: appliedLabels,
				loading: busy(),
				get mapWidth() {
					return mapWidth;
				},
				set mapWidth($$value) {
					mapWidth = $$value;
					$$settled = false;
				},
				get mapHeight() {
					return mapHeight;
				},
				set mapHeight($$value) {
					mapHeight = $$value;
					$$settled = false;
				}
			});
			$$renderer.push(`<!----></section>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer.subsume($$inner_renderer);
	});
}
//#endregion
export { _page as default };

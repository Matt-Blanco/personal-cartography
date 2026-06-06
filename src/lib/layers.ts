export type LayerKey = 'roads' | 'buildings' | 'water' | 'green' | 'rail';

export type LayerDef = {
	key: LayerKey;
	label: string;
	tagHint: string;
	selectors: string[];
	matches: (props: Record<string, unknown>) => boolean;
};

// Water tag values feeding the "water" layer. Like the green sets below, these
// are Sets (for `classify`) compiled into anchored Overpass regexes (for
// fetching) so the query and classifier never drift apart.
//
// Water is tagged many ways in OSM, not just `natural=water`: large seas/lakes
// are often mapped only by their `natural=coastline`; rivers/canals live under
// `waterway=*`; reservoirs/basins under `landuse=*`; and most areas also carry
// a `water=*` key. Covering all of these is what makes the layer actually work.
const NATURAL_WATER = new Set(['water', 'bay', 'strait', 'coastline', 'spring']);
const WATERWAY_WATER = new Set([
	'riverbank',
	'river',
	'stream',
	'canal',
	'drain',
	'ditch',
	'dock'
]);
const LANDUSE_WATER = new Set(['reservoir', 'basin']);

const NATURAL_WATER_RX = [...NATURAL_WATER].join('|');
const WATERWAY_WATER_RX = [...WATERWAY_WATER].join('|');
const LANDUSE_WATER_RX = [...LANDUSE_WATER].join('|');

// Natural-environment tag values feeding the "green" layer. Kept as Sets (for
// `classify`) and compiled into anchored Overpass regexes (for fetching) so the
// two stay in lockstep — add a value once and both the query and classifier
// pick it up.
//
// `natural=*`: vegetation, bare land/rock, and water-margin land surfaces, plus
// linear natural boundaries (cliff, ridge, tree_row). Water-side values
// (water, coastline) are omitted — the Water layer, classified first, owns them.
const NATURAL_GREEN = new Set([
	'wood',
	'scrub',
	'heath',
	'grassland',
	'fell',
	'tundra',
	'moor',
	'wetland',
	'marsh',
	'beach',
	'sand',
	'scree',
	'shingle',
	'bare_rock',
	'rock',
	'dune',
	'glacier',
	'mud',
	'shrubbery',
	'tree_row',
	'hedge',
	'cliff',
	'ridge',
	'valley'
]);

const LANDUSE_GREEN = new Set([
	'forest',
	'grass',
	'recreation_ground',
	'meadow',
	'orchard',
	'vineyard',
	'allotments',
	'village_green',
	'greenfield',
	'plant_nursery',
	'flowerbed',
	'farmland'
]);

const LEISURE_GREEN = new Set(['park', 'garden', 'nature_reserve', 'dog_park', 'common']);

const NATURAL_GREEN_RX = [...NATURAL_GREEN].join('|');
const LANDUSE_GREEN_RX = [...LANDUSE_GREEN].join('|');
const LEISURE_GREEN_RX = [...LEISURE_GREEN].join('|');

export const LAYERS: LayerDef[] = [
	{
		key: 'roads',
		label: 'Roads',
		tagHint: 'highway',
		selectors: ['way["highway"]'],
		matches: (p) => typeof p.highway === 'string'
	},
	{
		key: 'buildings',
		label: 'Buildings',
		tagHint: 'building',
		selectors: ['way["building"]'],
		matches: (p) => Boolean(p.building)
	},
	{
		key: 'water',
		label: 'Water',
		tagHint: 'natural, water, waterway, landuse',
		selectors: [
			`way["natural"~"^(${NATURAL_WATER_RX})$"]`,
			`relation["natural"~"^(${NATURAL_WATER_RX})$"]`,
			'way["water"]',
			'relation["water"]',
			`way["waterway"~"^(${WATERWAY_WATER_RX})$"]`,
			`relation["waterway"~"^(${WATERWAY_WATER_RX})$"]`,
			`way["landuse"~"^(${LANDUSE_WATER_RX})$"]`,
			`relation["landuse"~"^(${LANDUSE_WATER_RX})$"]`
		],
		matches: (p) => {
			const natural = typeof p.natural === 'string' ? p.natural : undefined;
			if (natural && NATURAL_WATER.has(natural)) return true;
			if (typeof p.water === 'string') return true;
			const waterway = typeof p.waterway === 'string' ? p.waterway : undefined;
			if (waterway && WATERWAY_WATER.has(waterway)) return true;
			const landuse = typeof p.landuse === 'string' ? p.landuse : undefined;
			return !!landuse && LANDUSE_WATER.has(landuse);
		}
	},
	{
		key: 'green',
		label: 'Parks & green',
		tagHint: 'natural, leisure, landuse',
		// Natural environment: vegetated/bare-land areas plus linear natural
		// boundaries (coastline, cliff, tree rows, hedges). `natural=water` is
		// intentionally excluded — it belongs to the Water layer, which is
		// classified ahead of this one.
		selectors: [
			`way["natural"~"^(${NATURAL_GREEN_RX})$"]`,
			`relation["natural"~"^(${NATURAL_GREEN_RX})$"]`,
			`way["landuse"~"^(${LANDUSE_GREEN_RX})$"]`,
			`relation["landuse"~"^(${LANDUSE_GREEN_RX})$"]`,
			`way["leisure"~"^(${LEISURE_GREEN_RX})$"]`,
			`relation["leisure"~"^(${LEISURE_GREEN_RX})$"]`,
			'way["barrier"="hedge"]'
		],
		matches: (p) => {
			const natural = typeof p.natural === 'string' ? p.natural : undefined;
			if (natural && natural !== 'water' && NATURAL_GREEN.has(natural)) return true;
			const landuse = typeof p.landuse === 'string' ? p.landuse : undefined;
			if (landuse && LANDUSE_GREEN.has(landuse)) return true;
			const leisure = typeof p.leisure === 'string' ? p.leisure : undefined;
			if (leisure && LEISURE_GREEN.has(leisure)) return true;
			return p.barrier === 'hedge';
		}
	},
	{
		key: 'rail',
		label: 'Rail',
		tagHint: 'railway',
		selectors: ['way["railway"]'],
		matches: (p) => typeof p.railway === 'string'
	}
];

export function classify(props: Record<string, unknown> | null | undefined): LayerKey | null {
	if (!props) return null;
	for (const layer of LAYERS) {
		if (layer.matches(props)) return layer.key;
	}
	return null;
}

// Storeys are ~3m; untagged buildings extrude to a default so the whole layer
// gains depth under a perspective tilt.
const METERS_PER_LEVEL = 3;
const DEFAULT_BUILDING_HEIGHT = 6;

// Best-effort building height in meters from OSM tags: an explicit `height`
// (stripping unit suffixes like " m"), else `building:levels` × 3, else a
// sensible default. Always returns a positive number.
export function buildingHeightMeters(
	props: Record<string, unknown> | null | undefined,
): number {
	if (props) {
		const raw = props.height ?? props['building:height'];
		if (raw != null) {
			const m = parseFloat(String(raw));
			if (Number.isFinite(m) && m > 0) return m;
		}
		const levels = props['building:levels'];
		if (levels != null) {
			const n = parseFloat(String(levels));
			if (Number.isFinite(n) && n > 0) return n * METERS_PER_LEVEL;
		}
	}
	return DEFAULT_BUILDING_HEIGHT;
}

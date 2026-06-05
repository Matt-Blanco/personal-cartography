export type LayerKey = 'roads' | 'buildings' | 'water' | 'green' | 'rail';

export type LayerDef = {
	key: LayerKey;
	label: string;
	tagHint: string;
	selectors: string[];
	matches: (props: Record<string, unknown>) => boolean;
};

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
		tagHint: 'natural=water',
		selectors: ['way["natural"="water"]', 'relation["natural"="water"]'],
		matches: (p) => p.natural === 'water'
	},
	{
		key: 'green',
		label: 'Parks & green',
		tagHint: 'leisure, landuse, natural',
		selectors: [
			'way["leisure"~"park|garden|natural"]',
			'way["landuse"~"forest|grass|recreation_ground|natural"]',
		],
		matches: (p) => {
			const leisure = p.leisure as string | undefined;
			const landuse = p.landuse as string | undefined;
			return (
				leisure === 'park' ||
				leisure === 'garden' ||
				landuse === 'forest' ||
				landuse === 'grass' ||
				landuse === 'recreation_ground'
			);
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

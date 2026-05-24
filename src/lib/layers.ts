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

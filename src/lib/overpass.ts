import osmtogeojson from 'osmtogeojson';
import rewind from '@mapbox/geojson-rewind';
import type { FeatureCollection, GeometryObject } from 'geojson';
import type { Bbox } from './geocode';
import { LAYERS, type LayerKey } from './layers';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export async function fetchFeatures(
	bbox: Bbox,
	selectedKeys: LayerKey[],
	signal?: AbortSignal
): Promise<FeatureCollection<GeometryObject>> {
	const { south, west, north, east } = bbox;
	const bboxStr = `${south},${west},${north},${east}`;

	const selectors = LAYERS.filter((l) => selectedKeys.includes(l.key))
		.flatMap((l) => l.selectors)
		.map((s) => `${s}(${bboxStr});`)
		.join('\n');

	if (!selectors) {
		return { type: 'FeatureCollection', features: [] };
	}

	const query = `
		[out:json][timeout:25];
		(
			${selectors}
		);
		(._;>;);
		out;
	`.trim();

	const res = await fetch(OVERPASS_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: 'data=' + encodeURIComponent(query),
		signal
	});
	if (!res.ok) throw new Error(`Overpass query failed (${res.status})`);

	const data = await res.json();
	const fc = osmtogeojson(data);
	fc.features = fc.features.filter((f) => f.geometry.type !== 'Point');
	rewind(fc, true);
	return fc;
}

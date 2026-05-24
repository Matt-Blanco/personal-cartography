import type { Feature, Geometry } from 'geojson';

export type GeocodeResult = {
	lat: number;
	lon: number;
	displayName: string;
	boundary: Feature<Geometry> | null;
};

type NominatimRaw = {
	lat: string;
	lon: string;
	display_name: string;
	geojson?: Geometry;
};

export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult | null> {
	const url =
		`https://nominatim.openstreetmap.org/search` +
		`?format=json&limit=1&polygon_geojson=1&q=${encodeURIComponent(query)}`;

	const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
	if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);

	const data: NominatimRaw[] = await res.json();
	if (data.length === 0) return null;

	const hit = data[0];
	return {
		lat: parseFloat(hit.lat),
		lon: parseFloat(hit.lon),
		displayName: hit.display_name,
		boundary: hit.geojson ? { type: 'Feature', geometry: hit.geojson, properties: {} } : null
	};
}

export type Bbox = { south: number; west: number; north: number; east: number };

const MILES_PER_DEG_LAT = 69;

export function bboxFromRadius(lat: number, lon: number, radiusMiles: number): Bbox {
	const dLat = radiusMiles / MILES_PER_DEG_LAT;
	const dLon = radiusMiles / (MILES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
	return {
		south: lat - dLat,
		north: lat + dLat,
		west: lon - dLon,
		east: lon + dLon
	};
}

export function bboxToPolygon(bbox: Bbox): Feature<Geometry> {
	const { south, west, north, east } = bbox;
	return {
		type: 'Feature',
		properties: {},
		geometry: {
			type: 'Polygon',
			coordinates: [
				[
					[west, south],
					[east, south],
					[east, north],
					[west, north],
					[west, south]
				]
			]
		}
	};
}

export function bboxToCornersFeature(bbox: Bbox): Feature<Geometry> {
	const { south, west, north, east } = bbox;
	return {
		type: 'Feature',
		properties: {},
		geometry: {
			type: 'MultiPoint',
			coordinates: [
				[west, south],
				[east, south],
				[east, north],
				[west, north]
			]
		}
	};
}

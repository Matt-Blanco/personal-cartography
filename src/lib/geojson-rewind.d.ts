declare module '@mapbox/geojson-rewind' {
	function rewind<T>(gj: T, outer?: boolean): T;
	export default rewind;
}

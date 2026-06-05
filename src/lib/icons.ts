// Icons offered in the Add panel's gallery and stamped onto the map. Each entry
// holds the inner markup of a 24×24 SVG (path/shape elements only); both the
// gallery tile and the placed overlay wrap it in the same <svg viewBox>. Shapes
// use `fill: currentColor` so a single color drives the whole glyph.
export type MapIcon = { id: string; label: string; svg: string };

export const ICONS: MapIcon[] = [
  {
    id: "pin",
    label: "Pin",
    svg: '<path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"/><circle cx="12" cy="9" r="2.4" fill="#fff"/>',
  },
  {
    id: "star",
    label: "Star",
    svg: '<path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7z"/>',
  },
  {
    id: "tree",
    label: "Tree",
    svg: '<path d="M12 2l6 9h-4l4 6H6l4-6H6z"/><rect x="11" y="16" width="2" height="6"/>',
  },
  {
    id: "home",
    label: "Home",
    svg: '<path d="M12 3l9 8h-2v9h-5v-6h-4v6H5v-9H3z"/>',
  },
  {
    id: "flag",
    label: "Flag",
    svg: '<path d="M7 2v20H5V2z"/><path d="M8 3h10l-2.5 3.5L18 10H8z"/>',
  },
  {
    id: "mountain",
    label: "Mountain",
    svg: '<path d="M3 20l6-12 4 7 3-5 5 10z"/>',
  },
  {
    id: "drop",
    label: "Water",
    svg: '<path d="M12 2s6 6.5 6 11a6 6 0 0 1-12 0C6 8.5 12 2 12 2z"/>',
  },
  {
    id: "dot",
    label: "Marker",
    svg: '<circle cx="12" cy="12" r="7"/>',
  },
];

export const ICONS_BY_ID: Record<string, MapIcon> = Object.fromEntries(
  ICONS.map((i) => [i.id, i]),
);

// A single icon stamped on the map. `x`/`y` are fractions (0..1) of the map's
// width/height so placements survive resizes; `iconId` keys into ICONS_BY_ID.
export type PlacedIcon = {
  uid: number;
  iconId: string;
  x: number;
  y: number;
};

// Drag payload key shared between the gallery (dragstart) and canvas (drop).
export const ICON_DND_TYPE = "application/x-map-icon";

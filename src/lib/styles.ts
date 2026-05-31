export type FillMarkType = "dot" | "line" | "cross";

export type FillMark = {
  type: FillMarkType;
  color: string;
  spacing: number; // px between repeats
  weight: number; // stroke width / dot radius
  angle: number; // degrees (line/cross orientation; ignored for dot)
};

// `mark` absent/null ⇒ solid fill (the default). When set, the mark pattern
// replaces the solid fill and the page background shows through.
export type FillStyle = {
  fill: string;
  stroke: string;
  lineWidth: number;
  mark?: FillMark | null;
};

export type LineStyle = { stroke: string; lineWidth: number; dash?: number[] };

export const DEFAULT_MARK: FillMark = {
  type: "line",
  color: "#888888",
  spacing: 6,
  weight: 0.7,
  angle: 45,
};

export type RoadGroup = "major" | "through" | "local" | "path";

export const ROAD_WIDTHS: Record<string, number> = {
  motorway: 2.2,
  trunk: 2.2,
  primary: 1.8,
  secondary: 1.4,
  tertiary: 1.1,
  residential: 0.7,
  unclassified: 0.7,
  service: 0.4,
  footway: 0.4,
  path: 0.4,
  cycleway: 0.4,
};

export const ROAD_GROUPS: Record<string, RoadGroup> = {
  motorway: "major",
  trunk: "major",
  primary: "through",
  secondary: "through",
  tertiary: "through",
  residential: "local",
  unclassified: "local",
  service: "path",
  footway: "path",
  path: "path",
  cycleway: "path",
};

export type MapStyles = {
  background: string;
  boundary: FillStyle;
  green: FillStyle;
  water: FillStyle;
  buildings: FillStyle;
  roads: Record<RoadGroup, string>;
  rail: string;
  contour: string;
  label: { fill: string; halo: string };
};

export const DEFAULT_STYLES: MapStyles = {
  background: "#ffffff",
  boundary: { fill: "#ffffff", stroke: "#b8b09a", lineWidth: 0.6 },
  green: { fill: "#d6e4c4", stroke: "#a8be8c", lineWidth: 0.5 },
  water: { fill: "#b9d6e8", stroke: "#87a8c0", lineWidth: 0.5 },
  buildings: { fill: "#e5d4b5", stroke: "#b89c70", lineWidth: 0.4 },
  roads: {
    major: "#d97a3a",
    through: "#d9a23a",
    local: "#555555",
    path: "#aaaaaa",
  },
  rail: "#555555",
  contour: "#a07e54",
  label: { fill: "#333333", halo: "#ffffff" },
};

export function roadStyleFor(
  hw: string,
  colors: Record<RoadGroup, string>,
): LineStyle {
  const group = ROAD_GROUPS[hw] ?? "local";
  return { stroke: colors[group], lineWidth: ROAD_WIDTHS[hw] ?? 0.5 };
}

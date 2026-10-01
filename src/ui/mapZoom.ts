/**
 * Zoom, pan and turn for the 2D floor map (docs/spec/07-map-routing.md, 2D zoom, pan and turn): pure maths on the
 * SVG viewBox, so it is unit tested. A view is a zoom factor (1 = the whole floor), the centre of what is shown and
 * the plan's quarter turn. The plan turns around the floor's centre; x and y are in the turned (on-screen) frame.
 */
export type Box = [number, number, number, number];
export interface View {
  zoom: number;
  cx: number;
  cy: number;
  /** Clockwise quarter turn of the plan: 0, 90, 180 or 270. */
  angle: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
/** One button press or keyboard step. */
export const ZOOM_STEP = 1.5;
/** One Turn button press or R key: a quarter turn. */
export const TURN_STEP = 90;

const centre = (box: Box) => [box[0] + box[2] / 2, box[1] + box[3] / 2] as const;
const quarter = (angle: number) => angle % 180 !== 0;

/** The box a rectangle fills once turned by `angle` (a multiple of 90°) around its centre. */
export function rotatedBox(box: Box, angle: number): Box {
  if (!quarter(angle)) return box;
  const [cx, cy] = centre(box);
  return [cx - box[3] / 2, cy - box[2] / 2, box[3], box[2]];
}

/** The window at zoom 1: the floor's own shape (so the map keeps its size on screen), big enough for the turned floor. */
function frame(box: Box, angle: number): [number, number] {
  if (!quarter(angle)) return [box[2], box[3]];
  const s = Math.max(box[2] / box[3], box[3] / box[2]);
  return [box[2] * s, box[3] * s];
}

export const fitView = (box: Box, angle = 0): View => {
  const [cx, cy] = centre(box);
  return { zoom: 1, cx, cy, angle };
};

/** One axis: a window wider than the floor stays centred on it; a smaller one stays inside it. */
const keepIn = (c: number, win: number, lo: number, len: number) => (win >= len ? lo + len / 2 : Math.min(lo + len - win / 2, Math.max(lo + win / 2, c)));

/** Keeps the zoom in range and the visible window on the (turned) floor. */
export function clampView(v: View, box: Box): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom));
  const [fw, fh] = frame(box, v.angle);
  const [x, y, w, h] = rotatedBox(box, v.angle);
  return { zoom, cx: keepIn(v.cx, fw / zoom, x, w), cy: keepIn(v.cy, fh / zoom, y, h), angle: v.angle };
}

/** The SVG viewBox that shows a view. */
export function viewBoxOf(v: View, box: Box): Box {
  const [fw, fh] = frame(box, v.angle);
  const w = fw / v.zoom;
  const h = fh / v.zoom;
  return [v.cx - w / 2, v.cy - h / 2, w, h];
}

/** Zoom by `factor`, keeping the map point (px, py) where it is on screen (the pointer or the pinch centre). */
export function zoomAt(v: View, factor: number, px: number, py: number, box: Box): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const keep = v.zoom / zoom;
  return clampView({ ...v, zoom, cx: px - (px - v.cx) * keep, cy: py - (py - v.cy) * keep }, box);
}

/** Move the view by (dx, dy) map units: dragging right shows what is to the left. */
export const panBy = (v: View, dx: number, dy: number, box: Box): View => clampView({ ...v, cx: v.cx - dx, cy: v.cy - dy }, box);

/** Turn the plan a quarter clockwise (dir 1) or anticlockwise (dir −1), keeping the zoom and the spot in the middle. */
export function turnView(v: View, dir: 1 | -1, box: Box): View {
  const [cx, cy] = centre(box);
  const dx = v.cx - cx;
  const dy = v.cy - cy;
  const angle = (((v.angle + dir * TURN_STEP) % 360) + 360) % 360;
  // SVG y points down, so clockwise takes (dx, dy) to (−dy, dx).
  return clampView({ zoom: v.zoom, cx: cx - dir * dy, cy: cy + dir * dx, angle }, box);
}

/** The SVG transform that turns the plan around the floor's centre. */
export const turnTransform = (v: View, box: Box) => (v.angle ? `rotate(${v.angle} ${centre(box).join(' ')})` : undefined);

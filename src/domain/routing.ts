/**
 * Floor plan data and walking routes. Spec: docs/spec/07-map-routing.md.
 * Coordinates are map units; `unitMeters` converts them to meters.
 */
export type NodeKind = 'door' | 'corridor' | 'lift_lobby' | 'lift' | 'stairs' | 'entrance' | 'landmark';

export interface MapNode {
  id: string;
  floor: string;
  x: number;
  y: number;
  kind: NodeKind;
  label?: string;
}

/** A link between floors (lift or stairs) with a fixed time cost. */
export interface VerticalLink {
  from: string;
  to: string;
  seconds: number;
  stairs: boolean;
}

export interface RoomShape {
  roomId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Node id of the room's door. */
  door: string;
  /** Bookable but not on the appendix layout: drawn in a strip under the plan and left out of directions. */
  unplaced?: boolean;
}

/**
 * Everything on the plan that is not a bookable room. core = the lift and stair core (background for its
 * parts); unlisted = yellow on the layout but not in the tool's room list; open = a labelled area without walls.
 */
export type AreaKind = 'core' | 'lift' | 'stairs' | 'restroom' | 'office' | 'service' | 'amenity' | 'open' | 'unlisted';

export interface Area {
  label: string;
  kind: AreaKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Furniture drawn on the plan (map units). Expanded into desks, chairs and tables by src/ui/floorLayout.ts.
 * bench: n desks in a row along x or y, back to back when double (chairs on the outer sides).
 * diagonal: bands of back-to-back desks at `angle` degrees, `pitch` apart, clipped to the box (herringbone areas).
 * table: a meeting or lounge table with seats around it. desk: one desk with its chair on side n, s, e or w.
 */
export type FurnitureItem =
  | { t: 'bench'; x: number; y: number; w: number; h: number; n: number; along: 'x' | 'y'; double: boolean }
  | { t: 'diagonal'; x: number; y: number; w: number; h: number; angle: number; pitch: number; desk: number }
  | { t: 'table'; x: number; y: number; w: number; h: number; seats: number; round?: boolean }
  | { t: 'desk'; x: number; y: number; w: number; h: number; chair: 'n' | 's' | 'e' | 'w' };

export interface FloorData {
  floor: string;
  viewBox: [number, number, number, number];
  /** Default start point for directions on this floor. */
  liftLobby: string;
  /** Outer wall of the floor plate, clockwise. */
  outline: Array<[number, number]>;
  areas: Area[];
  furniture: FurnitureItem[];
  rooms: RoomShape[];
  nodes: Array<Omit<MapNode, 'floor'>>;
  /** Walkable corridor segments between two nodes on this floor. */
  edges: Array<[string, string]>;
}

export interface FloorPlan {
  site: string;
  building: string;
  /** true while the geometry is invented; false once traced from real plans (now: the guidelines appendix layouts). */
  placeholder: boolean;
  unitMeters: number;
  floors: FloorData[];
  verticalLinks: VerticalLink[];
}

export const WALK_METERS_PER_SECOND = 1.2;

interface Step {
  to: string;
  seconds: number;
  meters: number;
  stairs: boolean;
}

export interface Graph {
  nodes: Map<string, MapNode>;
  adjacency: Map<string, Step[]>;
  unitMeters: number;
}

export interface Route {
  nodeIds: string[];
  seconds: number;
  meters: number;
  /** Floors in the order they are visited, e.g. ["2F", "3F"]. */
  floors: string[];
  usesStairs: boolean;
}

function distance(a: MapNode, b: MapNode): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Builds the walkable graph and checks that every edge and door points at a real node. */
export function buildGraph(plan: FloorPlan): Graph {
  const nodes = new Map<string, MapNode>();
  const adjacency = new Map<string, Step[]>();
  const link = (from: string, step: Step) => {
    const list = adjacency.get(from) ?? [];
    list.push(step);
    adjacency.set(from, list);
  };

  for (const floor of plan.floors) {
    for (const n of floor.nodes) {
      if (nodes.has(n.id)) throw new Error(`Duplicate map node "${n.id}"`);
      nodes.set(n.id, { ...n, floor: floor.floor });
    }
  }
  for (const floor of plan.floors) {
    if (!nodes.has(floor.liftLobby)) throw new Error(`${floor.floor}: lift lobby "${floor.liftLobby}" is not a node`);
    for (const r of floor.rooms) {
      if (!nodes.has(r.door)) throw new Error(`${floor.floor}: door "${r.door}" of ${r.roomId} is not a node`);
    }
    for (const [a, b] of floor.edges) {
      const na = nodes.get(a);
      const nb = nodes.get(b);
      if (!na || !nb) throw new Error(`${floor.floor}: edge ${a} – ${b} uses an unknown node`);
      const meters = distance(na, nb) * plan.unitMeters;
      const seconds = meters / WALK_METERS_PER_SECOND;
      link(a, { to: b, meters, seconds, stairs: false });
      link(b, { to: a, meters, seconds, stairs: false });
    }
  }
  for (const v of plan.verticalLinks) {
    if (!nodes.has(v.from) || !nodes.has(v.to)) throw new Error(`Vertical link ${v.from} – ${v.to} uses an unknown node`);
    link(v.from, { to: v.to, meters: 0, seconds: v.seconds, stairs: v.stairs });
    link(v.to, { to: v.from, meters: 0, seconds: v.seconds, stairs: v.stairs });
  }
  return { nodes, adjacency, unitMeters: plan.unitMeters };
}

/** Fastest walking route (A*). Returns null if either node is unknown or there is no path. */
export function shortestRoute(g: Graph, from: string, to: string, opts: { avoidStairs?: boolean } = {}): Route | null {
  const goal = g.nodes.get(to);
  if (!g.nodes.has(from) || !goal) return null;
  const heuristic = (id: string) => {
    const n = g.nodes.get(id);
    return n && n.floor === goal.floor ? (distance(n, goal) * g.unitMeters) / WALK_METERS_PER_SECOND : 0;
  };

  const best = new Map<string, number>([[from, 0]]);
  const cameFrom = new Map<string, { prev: string; step: Step }>();
  const open = new Set<string>([from]);
  const estimate = new Map<string, number>([[from, heuristic(from)]]);

  while (open.size > 0) {
    let current = '';
    let lowest = Infinity;
    for (const id of open) {
      const f = estimate.get(id) ?? Infinity;
      if (f < lowest) {
        lowest = f;
        current = id;
      }
    }
    if (current === to) break;
    open.delete(current);
    for (const step of g.adjacency.get(current) ?? []) {
      if (opts.avoidStairs && step.stairs) continue;
      const cost = (best.get(current) ?? Infinity) + step.seconds;
      if (cost < (best.get(step.to) ?? Infinity)) {
        best.set(step.to, cost);
        cameFrom.set(step.to, { prev: current, step });
        estimate.set(step.to, cost + heuristic(step.to));
        open.add(step.to);
      }
    }
  }
  if (!best.has(to)) return null;

  const nodeIds = [to];
  let meters = 0;
  let usesStairs = false;
  for (let id = to; id !== from; ) {
    const hop = cameFrom.get(id);
    if (!hop) return null;
    meters += hop.step.meters;
    usesStairs ||= hop.step.stairs;
    nodeIds.unshift(hop.prev);
    id = hop.prev;
  }
  const floors: string[] = [];
  for (const id of nodeIds) {
    const f = g.nodes.get(id)?.floor;
    if (f && floors[floors.length - 1] !== f) floors.push(f);
  }
  return { nodeIds, seconds: Math.round(best.get(to) ?? 0), meters: Math.round(meters), floors, usesStairs };
}

import raw from '../../data/floors/manila-bldg-h.json';
import { buildGraph, type FloorPlan, type Graph } from '../domain/routing';

/**
 * Bldg. H floor plans and corridor graph, traced from the guidelines' appendix layouts by scripts/trace-floors.py
 * (docs/spec/07-map-routing.md, appendix F). Positions are approximate; corridors are an approximate walking graph.
 */
export const MANILA_BLDG_H = raw as unknown as FloorPlan;

let graph: Graph | null = null;
export function manilaGraph(): Graph {
  graph ??= buildGraph(MANILA_BLDG_H);
  return graph;
}

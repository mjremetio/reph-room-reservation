'use client';

/**
 * Realistic 3D model of Bldg. H (docs/spec/06-ui.md S6): an architectural cutaway with drywall and glass
 * partitions, carpet, furniture sized to each room, a concrete core, columns and a curtain wall on the far
 * sides. Lighting: soft sun shadows, image-based light (RoomEnvironment) and ambient occlusion (GTAO).
 *
 * Room state reads at a glance, in the 2D map's colours: carpet tint and a glowing strip on the wall tops (green free
 * and fits, orange partly free, red taken, blue "yours"), people seated in taken rooms (group size only), and the
 * label above each room.
 * Animations: walls build up when the view opens, fitting rooms pulse once, people sit down or leave,
 * floors spread apart and the camera glides between them. frameloop="demand": nothing renders when idle.
 */
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MANILA_BLDG_H } from '../../data/floorPlans';
import type { Area, FloorData, RoomShape } from '../../domain/routing';
import type { RoomView } from '../api';
import { floorFurniture } from '../floorLayout';
import type { RoomState, RoomStatus } from '../roomStates';
import { roomFurniture, roomWalls, WALL_T, type Rect, type Seat } from './layout';
import { carpetTexture, groundTexture, tileFloorTexture } from './textures';

// ---------- Scale and layout ----------
export const S = 0.01; // map units → world units (1 map unit = 5 cm, so 1 world unit = 5 m)
const PLAN = (() => {
  const b = MANILA_BLDG_H.floors.map((f) => f.viewBox);
  const x0 = Math.min(...b.map((v) => v[0]));
  const y0 = Math.min(...b.map((v) => v[1]));
  const x1 = Math.max(...b.map((v) => v[0] + v[2]));
  const y1 = Math.max(...b.map((v) => v[1] + v[3]));
  return { cx: (x0 + x1) / 2, cz: (y0 + y1) / 2, size: Math.max(x1 - x0, y1 - y0) };
})();
const CX = PLAN.cx;
const CZ = PLAN.cz;
/** How much bigger the plan is than the 940-unit one the camera, fog and shadows were first tuned for. */
export const VIEW = (PLAN.size * S) / 9.4;
export const SLAB_T = 0.07;
export const WALL_H = 0.32; // section cut at 1.6 m, so interiors stay visible
const CAP_H = 0.008;
export const FLOOR_GAP = 1.15;
const SPREAD = 2.2; // extra lift for floors above the active one
const TABLE_H = 0.146;

export const wx = (x: number) => (x - CX) * S;
export const wz = (y: number) => (y - CZ) * S;

// ---------- State look ----------
const LOOK: Record<RoomState, { carpet: string; cap: string; glow: number }> = {
  fits: { carpet: '#62c283', cap: '#16a34a', glow: 1.3 },
  yours: { carpet: '#5f8ce6', cap: '#1f5fd6', glow: 1.6 },
  partial: { carpet: '#f0ad78', cap: '#e0701c', glow: 1.3 },
  taken: { carpet: '#d99a93', cap: '#c0352b', glow: 0.35 },
  free: { carpet: '#a3d9b3', cap: '#22c55e', glow: 0.45 },
  unsuitable: { carpet: '#d8d8d3', cap: '#c3c9c5', glow: 0 },
};
const PEOPLE = ['#e9e6df', '#dcd8cf', '#f1efea', '#d3d0c8', '#e4e1da', '#cfd3d6'];
const PEOPLE_MINE = ['#dbe6fb', '#c9daf9', '#e6eefc'];

// ---------- Shared state between the scene and the DOM labels ----------
interface Anchor {
  floor: number;
  x: number;
  z: number;
  y: number;
}
export interface Shared {
  floorY: number[];
  hovered: string | null;
  labels: Map<string, HTMLElement>;
  anchors: Map<string, Anchor>;
  invalidate: (() => void) | null;
  /** Set by the camera rig: turn the building an eighth clockwise (1) or anticlockwise (−1), seen from above. */
  turn: ((dir: 1 | -1) => void) | null;
  /** Set by the camera rig: start or stop the slow 360° spin. A drag, a turn or a reset stops it (reported by onSpin). */
  spin: ((on: boolean) => void) | null;
  onSpin: ((on: boolean) => void) | null;
  /** Set by the camera rig: glide back to the starting view (direction, tilt, zoom and position). */
  resetView: (() => void) | null;
  /** The compass needle; the camera rig turns it so it always points to the top of the 2D plan. */
  compass: HTMLElement | null;
}

// ---------- Helpers ----------
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function damp(current: number, target: number, rate: number, dt: number, instant: boolean): number {
  if (instant) return target;
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

/** Many boxes as one geometry (one draw call). Positions are world units relative to the parent group. */
function boxes(list: Box[]): THREE.BufferGeometry | null {
  if (list.length === 0) return null;
  const parts = list.map((b) => new THREE.BoxGeometry(b.w, b.h, b.d).translate(b.x, b.y, b.z));
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** A plan rectangle (map units) as a box from y0 to y1, relative to a centre (map units). */
function planBox(r: Rect, y0: number, y1: number, cx = CX, cz = CZ): Box {
  return { x: (r.x + r.w / 2 - cx) * S, z: (r.y + r.h / 2 - cz) * S, w: r.w * S, d: r.h * S, y: (y0 + y1) / 2, h: y1 - y0 };
}

function std(color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

/** Fades a material with its floor; switches transparency on only while faded, so AO and depth stay right. */
function setOpacity(m: THREE.Material, floorOpacity: number): void {
  const base = (m.userData.baseOpacity as number | undefined) ?? 1;
  const alwaysTransparent = !!m.userData.alwaysTransparent;
  const value = base * floorOpacity;
  const transparent = alwaysTransparent || value < 0.999;
  if (m.transparent !== transparent) {
    m.transparent = transparent;
    m.depthWrite = !transparent || !!m.userData.keepDepth;
    m.needsUpdate = true;
  }
  m.opacity = value;
}

// Seated person and office chair, facing +z (rotated per seat). Built once.
let chairGeo: THREE.BufferGeometry | null = null;
let personGeo: THREE.BufferGeometry | null = null;
function chairGeometry(): THREE.BufferGeometry {
  chairGeo ??= mergeGeometries([
    new THREE.BoxGeometry(0.085, 0.012, 0.08).translate(0, 0.09, 0),
    new THREE.BoxGeometry(0.085, 0.085, 0.012).translate(0, 0.14, -0.042),
    new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6).translate(0, 0.045, 0),
    new THREE.CylinderGeometry(0.034, 0.034, 0.006, 12).translate(0, 0.003, 0),
  ]) as THREE.BufferGeometry;
  return chairGeo;
}
function personGeometry(): THREE.BufferGeometry {
  personGeo ??= mergeGeometries([
    new THREE.CapsuleGeometry(0.024, 0.055, 4, 10).translate(0, 0.165, -0.012), // torso
    new THREE.SphereGeometry(0.02, 14, 12).translate(0, 0.235, -0.006), // head
    new THREE.BoxGeometry(0.07, 0.022, 0.07).translate(0, 0.108, 0.03), // thighs
    new THREE.BoxGeometry(0.06, 0.09, 0.024).translate(0, 0.055, 0.066), // lower legs
  ]) as THREE.BufferGeometry;
  return personGeo;
}

function occupants(status: RoomStatus | undefined): { count: number; mine: boolean } {
  if (!status) return { count: 0, mine: false };
  if (status.state === 'taken') return { count: Math.max(0, ...status.busy.map((b) => b.participants)), mine: false };
  if (status.state === 'yours') {
    const mine = status.busy.find((b) => b.mine);
    return { count: mine?.participants ?? 0, mine: true };
  }
  return { count: 0, mine: false };
}

// ---------- Floor materials (one set per floor, so each floor can fade on its own) ----------
function useFloorMaterials(floor: FloorData) {
  const mats = useMemo(() => {
    const [, , vw, vh] = floor.viewBox;
    const glass = std('#cfe3ea', 0.04, 0.1, { envMapIntensity: 1.8 });
    glass.userData = { baseOpacity: 0.22, alwaysTransparent: true };
    const facade = std('#c4dbe4', 0.03, 0.2, { envMapIntensity: 2 });
    facade.userData = { baseOpacity: 0.16, alwaysTransparent: true };
    const tile = new THREE.MeshStandardMaterial({ map: tileFloorTexture(vw, vh), roughness: 0.42, metalness: 0 });
    return {
      slab: std('#c7c8c2', 0.95),
      tile,
      wall: std('#efeeea', 0.92),
      glass,
      frame: std('#56606a', 0.35, 0.6),
      wood: std('#a57a50', 0.5),
      metal: std('#3a4247', 0.4, 0.7),
      chair: std('#3c454b', 0.85),
      screen: std('#101417', 0.15, 0.4, { emissive: '#1a2a3c', emissiveIntensity: 0.35 }),
      concrete: std('#d6d6d0', 0.95),
      cut: std('#5b656b', 0.9),
      lift: std('#9aa3a8', 0.28, 0.85),
      column: std('#ecebe6', 0.9),
      facade,
      person: std('#ffffff', 0.85),
      ink: std('#22303a', 0.6),
      desk: std('#f1f0ec', 0.55),
      officeFloor: std('#d8d2c6', 0.95),
      serviceFloor: std('#cdd0cb', 0.95),
      wetFloor: std('#dde5e7', 0.5),
      amenityFloor: std('#d3ddd1', 0.95),
      unlistedFloor: std('#e8dcaa', 0.95),
    };
  }, [floor]);
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
    },
    [mats],
  );
  return mats;
}
type FloorMats = ReturnType<typeof useFloorMaterials>;

// ---------- One room ----------
function Room({
  shape,
  door,
  room,
  status,
  selected,
  mats,
  carpetTex,
  fade,
  buildDelay,
  shared,
  onOpen,
}: {
  shape: RoomShape;
  door: { x: number; y: number };
  room: RoomView;
  status: RoomStatus | undefined;
  selected: boolean;
  mats: FloorMats;
  carpetTex: THREE.Texture;
  fade: Set<THREE.Material>;
  buildDelay: number;
  shared: Shared;
  onOpen: (roomId: string) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const clock = useThree((s) => s.clock);
  const canvas = useThree((s) => s.gl.domElement);
  const reduced = useMemo(prefersReducedMotion, []);
  const state = status?.state ?? 'free';
  const look = LOOK[state];
  const cx = shape.x + shape.w / 2;
  const cz = shape.y + shape.h / 2;

  const layout = useMemo(() => {
    const walls = roomWalls(shape, door);
    const furniture = roomFurniture(shape, door, room.kind, room.capacity, room.av);
    const T = WALL_T;
    const local = (r: Rect, y0: number, y1: number) => planBox(r, y0, y1, cx, cz);
    const solid = walls.filter((w) => !w.glass);
    const glass = walls.filter((w) => w.glass);
    return {
      furniture,
      walls: boxes(solid.map((w) => local(w, 0, WALL_H))),
      glass: boxes(glass.map((w) => local({ x: w.x + (w.w > w.h ? 0 : 0.8), y: w.y + (w.w > w.h ? 0.8 : 0), w: w.w > w.h ? w.w : 1.4, h: w.w > w.h ? 1.4 : w.h }, 0.012, WALL_H - 0.012))),
      rails: boxes(glass.flatMap((w) => [local(w, 0, 0.012), local(w, WALL_H - 0.012, WALL_H)])),
      caps: boxes(walls.map((w) => local(w, WALL_H, WALL_H + CAP_H))),
      tables: boxes(furniture.tables.map((t) => local(t, TABLE_H - 0.012, TABLE_H))),
      legs: boxes(
        furniture.tables.flatMap((t) => {
          const alongX = t.w >= t.h;
          const inset = 3;
          const ends: Rect[] = alongX
            ? [
                { x: t.x + inset, y: t.y + t.h * 0.2, w: 1.2, h: t.h * 0.6 },
                { x: t.x + t.w - inset - 1.2, y: t.y + t.h * 0.2, w: 1.2, h: t.h * 0.6 },
              ]
            : [
                { x: t.x + t.w * 0.2, y: t.y + inset, w: t.w * 0.6, h: 1.2 },
                { x: t.x + t.w * 0.2, y: t.y + t.h - inset - 1.2, w: t.w * 0.6, h: 1.2 },
              ];
          return ends.map((e) => local(e, 0, TABLE_H - 0.012));
        }),
      ),
      screen: furniture.screen ? boxes([local(furniture.screen, 0.14, 0.27)]) : null,
      stage: furniture.stage ? boxes([local(furniture.stage, 0, 0.04)]) : null,
      carpet: { w: (shape.w - 2 * T) * S, d: (shape.h - 2 * T) * S },
      ring: boxes(
        [
          { x: shape.x - 3, y: shape.y - 3, w: shape.w + 6, h: 1.6 },
          { x: shape.x - 3, y: shape.y + shape.h + 1.4, w: shape.w + 6, h: 1.6 },
          { x: shape.x - 3, y: shape.y - 3, w: 1.6, h: shape.h + 6 },
          { x: shape.x + shape.w + 1.4, y: shape.y - 3, w: 1.6, h: shape.h + 6 },
        ].map((r) => local(r, 0.004, 0.012)),
      ),
    };
  }, [shape, door, room.kind, room.capacity, room.av, cx, cz]);

  useEffect(
    () => () => {
      for (const g of [layout.walls, layout.glass, layout.rails, layout.caps, layout.tables, layout.legs, layout.screen, layout.stage, layout.ring]) g?.dispose();
    },
    [layout],
  );

  // Per-room materials: carpet and the glowing cap strip change colour with the state.
  const carpet = useMemo(() => {
    const map = carpetTex.clone();
    map.repeat.set(shape.w / 14, shape.h / 14);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map, color: LOOK.free.carpet, roughness: 1 });
  }, [carpetTex, shape.w, shape.h]);
  const cap = useMemo(() => new THREE.MeshStandardMaterial({ color: LOOK.free.cap, emissive: LOOK.free.cap, emissiveIntensity: 0, roughness: 0.35 }), []);
  useEffect(() => {
    fade.add(carpet);
    fade.add(cap);
    return () => {
      fade.delete(carpet);
      fade.delete(cap);
      carpet.map?.dispose();
      carpet.dispose();
      cap.dispose();
    };
  }, [carpet, cap, fade]);

  const wallsGroup = useRef<THREE.Group>(null);
  const furnGroup = useRef<THREE.Group>(null);
  const people = useRef<THREE.InstancedMesh>(null);
  const chairs = useRef<THREE.InstancedMesh>(null);
  const seats = layout.furniture.seats;
  const occ = occupants(status);
  const occCount = Math.min(occ.count, seats.length);
  const anim = useRef({
    build: reduced ? 1 : 0,
    buildAt: clock.elapsedTime + buildDelay,
    carpet: new THREE.Color(LOOK.free.carpet),
    cap: new THREE.Color(LOOK.free.cap),
    glow: 0,
    pulse: 0,
    people: 0,
    peopleShown: -1,
    stateAt: 0,
  });

  const targetCarpet = useMemo(() => new THREE.Color(look.carpet), [look.carpet]);
  const targetCap = useMemo(() => new THREE.Color(look.cap), [look.cap]);

  // A new state: fitting rooms pulse once, after a rank-based stagger.
  useEffect(() => {
    const a = anim.current;
    a.stateAt = clock.elapsedTime + (reduced ? 0 : status?.rank ? 0.08 * status.rank : 0.1);
    a.pulse = state === 'fits' || state === 'yours' || state === 'partial' ? 1 : 0;
    invalidate();
  }, [state, status?.rank, clock, reduced, invalidate]);
  useEffect(() => invalidate(), [selected, occCount, invalidate]);

  // Chairs never move: set their matrices once.
  useLayoutEffect(() => {
    const m = chairs.current;
    if (!m) return;
    const o = new THREE.Object3D();
    seats.forEach((s: Seat, i: number) => {
      o.position.set((s.x - cx) * S, 0, (s.y - cz) * S);
      o.rotation.set(0, Math.atan2(s.fx, s.fy), 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [seats, cx, cz]);

  // People colours (muted like an architectural model; your own group in blue).
  useLayoutEffect(() => {
    const m = people.current;
    if (!m) return;
    const c = new THREE.Color();
    for (let i = 0; i < seats.length; i++) {
      const palette = occ.mine ? PEOPLE_MINE : PEOPLE;
      m.setColorAt(i, c.set(palette[(i * 7 + shape.x) % palette.length] as string));
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [seats.length, occ.mine, shape.x]);

  useFrame((_, dt) => {
    const a = anim.current;
    const t = clock.elapsedTime;
    let moving = false;

    // Build-up: walls rise, then the furniture.
    if (a.build < 0.999) {
      if (t >= a.buildAt) a.build = damp(a.build, 1, 6, dt, reduced);
      moving = true;
    } else a.build = 1;
    if (wallsGroup.current) wallsGroup.current.scale.y = Math.max(0.001, a.build);
    if (furnGroup.current) furnGroup.current.scale.y = Math.max(0.001, Math.min(1, (a.build - 0.55) / 0.45));

    // Colours and glow.
    if (t >= a.stateAt) {
      const k = reduced ? 1 : 1 - Math.exp(-7 * dt);
      a.carpet.lerp(targetCarpet, k);
      a.cap.lerp(targetCap, k);
      a.pulse = damp(a.pulse, 0, 2.2, dt, reduced);
      const hover = shared.hovered === room.id ? 0.9 : 0;
      const glowTarget = look.glow + a.pulse * 2.4 + hover + (selected ? 0.6 : 0);
      a.glow = damp(a.glow, glowTarget, 10, dt, reduced);
      moving ||= a.pulse > 0.01 || Math.abs(a.glow - glowTarget) > 0.01 || a.carpet.getHex() !== targetCarpet.getHex() || a.cap.getHex() !== targetCap.getHex();
    } else moving = true;
    carpet.color.copy(a.carpet);
    cap.color.copy(a.cap);
    cap.emissive.copy(a.cap);
    cap.emissiveIntensity = a.glow;

    // People sit down one after another (or leave).
    a.people = damp(a.people, occCount, 5, dt, reduced);
    if (Math.abs(a.people - occCount) < 0.01) a.people = occCount;
    const m = people.current;
    if (m && a.people !== a.peopleShown) {
      const o = new THREE.Object3D();
      seats.forEach((s, i) => {
        const v = Math.max(0, Math.min(1, a.people - i));
        o.position.set((s.x - cx) * S, 0, (s.y - cz) * S);
        o.rotation.set(0, Math.atan2(s.fx, s.fy), 0);
        o.scale.set(v, v, v);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
      a.peopleShown = a.people;
      moving ||= a.people !== occCount;
    }
    if (moving) invalidate();
  });

  const hover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    shared.hovered = on ? room.id : shared.hovered === room.id ? null : shared.hovered;
    canvas.style.cursor = on ? 'pointer' : ''; // otherwise the canvas's grab hand
    shared.labels.get(room.id)?.classList.toggle('is-hovered', on);
    invalidate();
  };

  return (
    <group
      position={[wx(cx), SLAB_T, wz(cz)]}
      onPointerOver={hover(true)}
      onPointerOut={hover(false)}
      onClick={(e) => {
        if (e.delta > 4) return; // a drag to turn the view, not a click
        e.stopPropagation();
        onOpen(room.id);
      }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} material={carpet} receiveShadow userData={{ noCast: true }}>
        <planeGeometry args={[layout.carpet.w, layout.carpet.d]} />
      </mesh>
      <group ref={wallsGroup}>
        {layout.walls && <mesh geometry={layout.walls} material={mats.wall} receiveShadow />}
        {layout.caps && <mesh geometry={layout.caps} material={cap} userData={{ noCast: true }} />}
        {layout.rails && <mesh geometry={layout.rails} material={mats.frame} />}
        {layout.glass && <mesh geometry={layout.glass} material={mats.glass} userData={{ noAO: true, noCast: true, detail: true }} />}
      </group>
      <group ref={furnGroup} userData={{ detail: true }}>
        {layout.tables && <mesh geometry={layout.tables} material={mats.wood} receiveShadow />}
        {layout.legs && <mesh geometry={layout.legs} material={mats.metal} />}
        {layout.screen && <mesh geometry={layout.screen} material={mats.screen} />}
        {layout.stage && <mesh geometry={layout.stage} material={mats.wood} receiveShadow />}
        {seats.length > 0 && <instancedMesh ref={chairs} args={[chairGeometry(), mats.chair, seats.length]} />}
        {seats.length > 0 && <instancedMesh ref={people} args={[personGeometry(), mats.person, seats.length]} />}
      </group>
      {layout.ring && <mesh geometry={layout.ring} material={mats.ink} visible={selected} userData={{ noCast: true }} />}
    </group>
  );
}

// ---------- Rooms that are not bookable, the core, columns and facade ----------
const AREA_FLOOR: Partial<Record<Area['kind'], 'officeFloor' | 'serviceFloor' | 'wetFloor' | 'amenityFloor' | 'unlistedFloor' | 'slab'>> = {
  core: 'slab',
  lift: 'serviceFloor',
  stairs: 'serviceFloor',
  restroom: 'wetFloor',
  office: 'officeFloor',
  service: 'serviceFloor',
  amenity: 'amenityFloor',
  unlisted: 'unlistedFloor',
};

/** Offices, service rooms, amenities and the core parts from the traced layout: walls, a floor tint, stairs and lift cars. */
function AreaModels({ areas, mats }: { areas: Area[]; mats: FloorMats }) {
  const geo = useMemo(() => {
    const T = WALL_T;
    const drywall: Box[] = [];
    const concrete: Box[] = [];
    const steps: Box[] = [];
    const lifts: Box[] = [];
    const floors = new Map<string, Box[]>();
    for (const a of areas) {
      const tint = AREA_FLOOR[a.kind];
      if (!tint) continue; // open areas have no walls
      floors.set(tint, [...(floors.get(tint) ?? []), planBox({ x: a.x + T, y: a.y + T, w: a.w - 2 * T, h: a.h - 2 * T }, SLAB_T, SLAB_T + 0.003)]);
      if (a.kind === 'core') continue; // its parts have the walls
      const hard = a.kind === 'lift' || a.kind === 'stairs' || a.kind === 'restroom';
      const H = hard ? WALL_H + 0.04 : WALL_H;
      const walls: Rect[] = [
        { x: a.x, y: a.y, w: a.w, h: T },
        { x: a.x, y: a.y + a.h - T, w: a.w, h: T },
        { x: a.x, y: a.y + T, w: T, h: a.h - 2 * T },
        { x: a.x + a.w - T, y: a.y + T, w: T, h: a.h - 2 * T },
      ];
      (hard ? concrete : drywall).push(...walls.map((w) => planBox(w, SLAB_T, SLAB_T + H)));
      if (a.kind === 'lift') lifts.push(planBox({ x: a.x + T + 2, y: a.y + T + 2, w: a.w - 2 * T - 4, h: a.h - 2 * T - 4 }, SLAB_T, SLAB_T + WALL_H));
      if (a.kind === 'stairs') {
        const alongX = a.w >= a.h;
        const len = alongX ? a.w : a.h;
        const n = Math.max(4, Math.floor((len - 2 * T) / 7));
        for (let i = 0; i < n; i++) {
          const step: Rect = alongX ? { x: a.x + T + i * 7, y: a.y + T, w: 7, h: a.h - 2 * T } : { x: a.x + T, y: a.y + T + i * 7, w: a.w - 2 * T, h: 7 };
          steps.push(planBox(step, SLAB_T, SLAB_T + Math.min(WALL_H, 0.034 * (i + 1))));
        }
      }
    }
    return {
      drywall: boxes(drywall),
      concrete: boxes(concrete),
      cuts: boxes([...drywall, ...concrete].map((b) => ({ ...b, y: b.y + b.h / 2 + 0.002, h: 0.004 }))),
      steps: boxes(steps),
      lifts: boxes(lifts),
      floors: [...floors.entries()].map(([k, list]) => ({ key: k as keyof FloorMats, geo: boxes(list) })),
    };
  }, [areas]);
  useEffect(
    () => () => {
      for (const g of [geo.drywall, geo.concrete, geo.cuts, geo.steps, geo.lifts, ...geo.floors.map((f) => f.geo)]) g?.dispose();
    },
    [geo],
  );
  return (
    <group>
      {geo.floors.map((f) => f.geo && <mesh key={f.key} geometry={f.geo} material={mats[f.key] as THREE.Material} receiveShadow userData={{ noCast: true }} />)}
      {geo.drywall && <mesh geometry={geo.drywall} material={mats.wall} castShadow receiveShadow />}
      {geo.concrete && <mesh geometry={geo.concrete} material={mats.concrete} castShadow receiveShadow />}
      {geo.cuts && <mesh geometry={geo.cuts} material={mats.cut} userData={{ noCast: true }} />}
      {geo.lifts && <mesh geometry={geo.lifts} material={mats.lift} userData={{ detail: true }} />}
      {geo.steps && <mesh geometry={geo.steps} material={mats.concrete} receiveShadow userData={{ detail: true }} />}
    </group>
  );
}

// Desk: a top on a modesty panel; table: the same top; round table: a disc. Unit sized, scaled per instance.
let deskGeo: THREE.BufferGeometry | null = null;
let discGeo: THREE.BufferGeometry | null = null;
function deskGeometry(): THREE.BufferGeometry {
  deskGeo ??= mergeGeometries([
    new THREE.BoxGeometry(1, 0.012, 1).translate(0, TABLE_H - 0.006, 0),
    new THREE.BoxGeometry(0.96, TABLE_H - 0.012, 0.05).translate(0, (TABLE_H - 0.012) / 2, 0),
  ]) as THREE.BufferGeometry;
  return deskGeo;
}
function discGeometry(): THREE.BufferGeometry {
  discGeo ??= mergeGeometries([
    new THREE.CylinderGeometry(0.5, 0.5, 0.012, 24).translate(0, TABLE_H - 0.006, 0),
    new THREE.CylinderGeometry(0.05, 0.05, TABLE_H - 0.012, 8).translate(0, (TABLE_H - 0.012) / 2, 0),
  ]) as THREE.BufferGeometry;
  return discGeo;
}

/** Workstations, lounge and meeting tables and their chairs from the traced layout (instanced: a few draw calls). */
function FloorFurnitureModel({ floor, mats }: { floor: FloorData; mats: FloorMats }) {
  const f = useMemo(() => floorFurniture(floor.furniture), [floor]);
  const flat = useMemo(() => [...f.desks, ...f.tables.filter((t) => !t.round)], [f]);
  const round = useMemo(() => f.tables.filter((t) => t.round), [f]);
  const desks = useRef<THREE.InstancedMesh>(null);
  const discs = useRef<THREE.InstancedMesh>(null);
  const chairs = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const place = (m: THREE.InstancedMesh | null, list: Array<{ cx: number; cy: number; w: number; h: number; angle: number }>) => {
      if (!m) return;
      list.forEach((p, i) => {
        o.position.set(wx(p.cx), SLAB_T, wz(p.cy));
        o.rotation.set(0, -p.angle, 0);
        o.scale.set(p.w * S, 1, p.h * S);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    };
    place(desks.current, flat);
    place(discs.current, round);
    const c = chairs.current;
    if (c) {
      f.chairs.forEach((s, i) => {
        o.position.set(wx(s.x), SLAB_T, wz(s.y));
        o.rotation.set(0, Math.atan2(s.fx, s.fy), 0);
        o.scale.set(1, 1, 1);
        o.updateMatrix();
        c.setMatrixAt(i, o.matrix);
      });
      c.instanceMatrix.needsUpdate = true;
    }
  }, [f, flat, round]);
  return (
    <group userData={{ detail: true }}>
      {flat.length > 0 && <instancedMesh ref={desks} args={[deskGeometry(), mats.desk, flat.length]} castShadow receiveShadow />}
      {round.length > 0 && <instancedMesh ref={discs} args={[discGeometry(), mats.desk, round.length]} castShadow receiveShadow />}
      {f.chairs.length > 0 && <instancedMesh ref={chairs} args={[chairGeometry(), mats.chair, f.chairs.length]} castShadow />}
    </group>
  );
}

/** Outward normal (plan) of each outline edge, for the curtain wall that only shows on the far sides. */
function edgeNormals(pts: Array<[number, number]>): Array<[number, number]> {
  const cx = pts.reduce((n, p) => n + p[0], 0) / pts.length;
  const cy = pts.reduce((n, p) => n + p[1], 0) / pts.length;
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length] as [number, number];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let n: [number, number] = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
    const mx = (a[0] + b[0]) / 2 - cx;
    const my = (a[1] + b[1]) / 2 - cy;
    if (n[0] * mx + n[1] * my < 0) n = [-n[0], -n[1]];
    return n;
  });
}

function Shell({ floor, mats, facadeRefs }: { floor: FloorData; mats: FloorMats; facadeRefs: React.RefObject<Array<THREE.Group | null>> }) {
  const geo = useMemo(() => {
    const pts = floor.outline;
    const [vx, vy, vw, vh] = floor.viewBox;
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(wx(x), -wz(y))));
    const slab = new THREE.ExtrudeGeometry(shape, { depth: SLAB_T - 0.002, bevelEnabled: false }).rotateX(-Math.PI / 2);
    const tile = new THREE.ShapeGeometry(shape);
    // UVs across the view box, so the tile texture (sized to it) keeps its 60 cm tiles.
    const pos = tile.attributes.position as THREE.BufferAttribute;
    const uv = tile.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - wx(vx)) / (vw * S), 1 - (-pos.getY(i) - wz(vy)) / (vh * S));
    tile.rotateX(-Math.PI / 2).translate(0, SLAB_T, 0);

    const normals = edgeNormals(pts);
    const col = 8;
    const cols: Rect[] = [];
    const sides = pts.map((a, i) => {
      const b = pts[(i + 1) % pts.length] as [number, number];
      const n = normals[i] as [number, number];
      const horizontal = Math.abs(b[1] - a[1]) < 0.5;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const dir = [(b[0] - a[0]) / (len || 1), (b[1] - a[1]) / (len || 1)];
      // Columns on the structural grid (~8.4 m = 165 units), just inside the facade.
      for (let t = 0; t <= len; t += 165) {
        const px = a[0] + (dir[0] as number) * t - n[0] * (col / 2 + 2);
        const py = a[1] + (dir[1] as number) * t - n[1] * (col / 2 + 2);
        cols.push({ x: px - col / 2, y: py - col / 2, w: col, h: col });
      }
      const pane: Rect = horizontal ? { x: Math.min(a[0], b[0]), y: a[1] - 0.5, w: len, h: 1 } : { x: a[0] - 0.5, y: Math.min(a[1], b[1]), w: 1, h: len };
      const mullions: Rect[] = [];
      for (let p = 0; p <= len; p += 30) {
        const at = Math.min(p, len - 1.5);
        mullions.push(horizontal ? { x: pane.x + at, y: a[1] - 1, w: 1.5, h: 2 } : { x: a[0] - 1, y: pane.y + at, w: 2, h: 1.5 });
      }
      return {
        normal: n,
        glass: boxes([planBox(pane, SLAB_T, SLAB_T + WALL_H + 0.02)]),
        frame: boxes([...mullions.map((m) => planBox(m, SLAB_T, SLAB_T + WALL_H + 0.02)), planBox(horizontal ? { ...pane, y: a[1] - 1, h: 2 } : { ...pane, x: a[0] - 1, w: 2 }, SLAB_T + WALL_H + 0.02, SLAB_T + WALL_H + 0.03)]),
      };
    });
    return { slab, tile, columns: boxes(cols.map((c) => planBox(c, SLAB_T, SLAB_T + WALL_H + 0.03))), sides };
  }, [floor]);
  useEffect(
    () => () => {
      geo.slab.dispose();
      geo.tile.dispose();
      geo.columns?.dispose();
      for (const s of geo.sides) {
        s.glass?.dispose();
        s.frame?.dispose();
      }
    },
    [geo],
  );
  return (
    <group>
      <mesh geometry={geo.slab} material={mats.slab} receiveShadow />
      <mesh geometry={geo.tile} material={mats.tile} receiveShadow userData={{ noCast: true }} />
      {geo.columns && <mesh geometry={geo.columns} material={mats.column} />}
      {geo.sides.map((side, i) => (
        <group
          key={i}
          ref={(g) => {
            if (facadeRefs.current) facadeRefs.current[i] = g;
          }}
          userData={{ detail: true, normal: side.normal }}
        >
          {side.glass && <mesh geometry={side.glass} material={mats.facade} userData={{ noAO: true, noCast: true }} />}
          {side.frame && <mesh geometry={side.frame} material={mats.frame} />}
        </group>
      ))}
    </group>
  );
}

function YouMarker({ x, z, mats }: { x: number; z: number; mats: FloorMats }) {
  const geo = useMemo(
    () =>
      mergeGeometries([
        new THREE.CapsuleGeometry(0.026, 0.14, 4, 10).translate(0, 0.11, 0),
        new THREE.SphereGeometry(0.024, 16, 12).translate(0, 0.235, 0),
      ]) as THREE.BufferGeometry,
    [],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={mats.ink} position={[x, SLAB_T, z]} userData={{ detail: true }} />;
}

// ---------- One floor ----------
function Floor({
  floor,
  index,
  activeIndex,
  rooms,
  statuses,
  selectedRoomId,
  shared,
  onOpen,
}: {
  floor: FloorData;
  index: number;
  activeIndex: number;
  rooms: Map<string, RoomView>;
  statuses: Map<string, RoomStatus>;
  selectedRoomId: string | null;
  shared: Shared;
  onOpen: (roomId: string) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const reduced = useMemo(prefersReducedMotion, []);
  const active = index === activeIndex;
  const above = index > activeIndex;
  const targetY = index * FLOOR_GAP + (above ? SPREAD : 0);
  const targetOpacity = active ? 1 : above ? 0.06 : 0.16;
  const anim = useRef({ y: targetY, opacity: targetOpacity });
  const group = useRef<THREE.Group>(null);
  const facades = useRef<Array<THREE.Group | null>>([]);
  const mats = useFloorMaterials(floor);
  const carpetTex = useMemo(() => carpetTexture(), []);
  useEffect(() => () => carpetTex.dispose(), [carpetTex]);
  const fade = useMemo(() => new Set<THREE.Material>(), []);
  const nodes = useMemo(() => new Map(floor.nodes.map((n) => [n.id, n] as const)), [floor]);
  const lobby = nodes.get(floor.liftLobby);
  const center = useMemo(() => {
    const [vx, vy, vw, vh] = floor.viewBox;
    return new THREE.Vector3(wx(vx + vw / 2), 0, wz(vy + vh / 2));
  }, [floor]);

  // Only the active floor casts shadows; ghosts must not darken it.
  useEffect(() => {
    group.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh || (o as THREE.InstancedMesh).isInstancedMesh) mesh.castShadow = active && !o.userData.noCast;
    });
    invalidate();
  });

  useFrame((_, dt) => {
    const a = anim.current;
    a.y = damp(a.y, targetY, 6, dt, reduced);
    a.opacity = damp(a.opacity, targetOpacity, 7, dt, reduced);
    if (Math.abs(a.y - targetY) < 0.0005) a.y = targetY;
    if (Math.abs(a.opacity - targetOpacity) < 0.002) a.opacity = targetOpacity;
    shared.floorY[index] = a.y;
    const g = group.current;
    if (g) {
      g.position.y = a.y;
      const showDetail = a.opacity > 0.5;
      g.traverse((o) => {
        if (o.userData.detail) o.visible = showDetail;
      });
    }
    for (const m of Object.values(mats)) setOpacity(m, a.opacity);
    for (const m of fade) setOpacity(m, a.opacity);
    // Curtain wall only on the far sides, so it never blocks the view into the floor.
    for (const f of facades.current) {
      if (!f) continue;
      const n = f.userData.normal as [number, number];
      const dx = camera.position.x - center.x;
      const dz = camera.position.z - center.z;
      f.visible = a.opacity > 0.5 && dx * n[0] + dz * n[1] < 0;
    }
    if (a.y !== targetY || a.opacity !== targetOpacity) invalidate();
  });

  const buildDelay = (shape: RoomShape) => {
    if (!lobby) return 0.1;
    const d = Math.hypot(shape.x + shape.w / 2 - lobby.x, shape.y + shape.h / 2 - lobby.y);
    return 0.1 + (d / (520 * VIEW)) * 0.7;
  };

  return (
    <group ref={group}>
      <Shell floor={floor} mats={mats} facadeRefs={facades} />
      <AreaModels areas={floor.areas} mats={mats} />
      <FloorFurnitureModel floor={floor} mats={mats} />
      {lobby && active && <YouMarker x={wx(lobby.x)} z={wz(lobby.y)} mats={mats} />}
      {floor.rooms.map((shape) => {
        const room = rooms.get(shape.roomId);
        const door = nodes.get(shape.door);
        if (!room || !door || shape.unplaced) return null; // not on the layout: 2D map and list only
        return (
          <Room
            key={shape.roomId}
            shape={shape}
            door={door}
            room={room}
            status={statuses.get(shape.roomId)}
            selected={selectedRoomId === shape.roomId}
            mats={mats}
            carpetTex={carpetTex}
            fade={fade}
            buildDelay={buildDelay(shape)}
            shared={shared}
            onOpen={onOpen}
          />
        );
      })}
    </group>
  );
}

// ---------- Lights, environment, ground ----------
function Lighting({ activeIndex }: { activeIndex: number }) {
  const { gl, scene, invalidate } = useThree();
  const rig = useRef<THREE.Group>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const target = useRef<THREE.Object3D>(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const ground = useMemo(() => groundTexture(), []);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.32;
    scene.background = new THREE.Color('#eef0ec');
    scene.fog = new THREE.Fog('#eef0ec', 26 * VIEW, 50 * VIEW);
    invalidate();
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
      ground.dispose();
    };
  }, [gl, scene, ground, invalidate]);

  useEffect(() => {
    if (sun.current && target.current) sun.current.target = target.current;
  }, []);

  useFrame((_, dt) => {
    const r = rig.current;
    if (!r) return;
    const y = activeIndex * FLOOR_GAP;
    r.position.y = damp(r.position.y, y, 6, dt, reduced);
    if (Math.abs(r.position.y - y) > 0.0005) invalidate();
  });

  return (
    <>
      <hemisphereLight args={['#f4f8ff', '#cbc3b3', 0.35]} />
      <group ref={rig}>
        <object3D ref={target} position={[0, 0, 0]} />
        <directionalLight
          ref={sun}
          position={[4.5 * VIEW, 9 * VIEW, 6 * VIEW]}
          color="#fff3e2"
          intensity={2.6}
          castShadow
          shadow-mapSize={[4096, 4096]}
          shadow-camera-left={-6.5 * VIEW}
          shadow-camera-right={6.5 * VIEW}
          shadow-camera-top={6.5 * VIEW}
          shadow-camera-bottom={-6.5 * VIEW}
          shadow-camera-near={1}
          shadow-camera-far={30 * VIEW}
          shadow-bias={-0.0004}
          shadow-normalBias={0.015}
        />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} userData={{ noAO: true }}>
        <planeGeometry args={[18 * VIEW, 12 * VIEW]} />
        <meshBasicMaterial map={ground} transparent depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} receiveShadow userData={{ noAO: true }}>
        <planeGeometry args={[30 * VIEW, 30 * VIEW]} />
        <shadowMaterial opacity={0.2} />
      </mesh>
    </>
  );
}

// ---------- Camera ----------
const TURN_3D = Math.PI / 4;
/** The start view: 15% farther than the tuned camera, and the floor's width plus 15% fitted to the canvas. */
const START_OUT = 1.15;
const FIT_MARGIN = 1.15;
/** The 360° spin: one full turn in 24 seconds. */
const SPIN_RATE = (2 * Math.PI) / 24;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** An angle in (−π, π], so a turn back home takes the short way round. */
const shortest = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const view = new THREE.Spherical();
const orbit = new THREE.Vector3();

function CameraRig({ activeIndex, shared }: { activeIndex: number; shared: Shared }) {
  const { camera, gl, invalidate } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const targetY = activeIndex * FLOOR_GAP + SLAB_T + 0.1;
  // Turn buttons and R keys: the angle still to turn, eased in useFrame. The camera circles the other way.
  const spin = useRef(0);
  // The 360° button: the building keeps turning until a drag, a turn or a reset stops it.
  const spinning = useRef(false);
  // The compass button: the starting view (camera around the target, and the target on the floor) to glide back to.
  const home = useRef<{ view: THREE.Spherical; x: number; z: number } | null>(null);
  const resetting = useRef(false);
  const heading = useRef(Number.NaN);
  useEffect(() => {
    const stopSpin = () => {
      if (!spinning.current) return;
      spinning.current = false;
      shared.onSpin?.(false);
    };
    shared.turn = (dir) => {
      stopSpin();
      resetting.current = false;
      spin.current += dir * TURN_3D;
      invalidate();
    };
    shared.spin = (on) => {
      if (!on) return stopSpin();
      spinning.current = true;
      shared.onSpin?.(true);
      invalidate();
    };
    shared.resetView = () => {
      stopSpin();
      spin.current = 0;
      resetting.current = true;
      invalidate();
    };
    return () => {
      shared.turn = null;
      shared.spin = null;
      shared.resetView = null;
    };
  }, [shared, invalidate]);

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = !reduced;
    c.dampingFactor = 0.1;
    // Turn all the way round: drag turns the building 360° and tilts it; right-drag or Shift/Ctrl/⌘-drag moves along
    // the floor; the wheel zooms. Touch: one finger turns, two fingers move and zoom. Arrow keys move once focused.
    c.enablePan = true;
    c.screenSpacePanning = false;
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    gl.domElement.tabIndex = 0;
    c.listenToKeyEvents(gl.domElement);
    c.keyPanSpeed = 20;
    c.minDistance = 2.5;
    c.maxDistance = 25 * VIEW;
    // From straight down to just above eye level; never under the floor.
    c.minPolarAngle = 0.05;
    c.maxPolarAngle = 1.42;
    c.target.set(0, targetY, 0.2);
    // Any drag stops the 360° spin and a glide home, so the building never moves under the pointer.
    c.addEventListener('start', () => {
      resetting.current = false;
      shared.spin?.(false);
    });
    // The point the camera looks at stays over the building, so moving can never lose it.
    const half = (PLAN.size * S) / 2;
    c.addEventListener('change', () => {
      const x = Math.min(half, Math.max(-half, c.target.x));
      const z = Math.min(half, Math.max(-half, c.target.z));
      if (x !== c.target.x || z !== c.target.z) {
        camera.position.x += x - c.target.x;
        camera.position.z += z - c.target.z;
        c.target.x = x;
        c.target.z = z;
      }
      invalidate();
    });
    // Start a little farther out than the tuned camera, and far enough that the whole floor fits the canvas's width,
    // so a narrow window (a laptop, or the assistant open) shows the building whole instead of cropped.
    const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov);
    const aspect = gl.domElement.clientWidth / Math.max(1, gl.domElement.clientHeight);
    const halfWidth = Math.tan(fov / 2) * aspect;
    orbit.copy(camera.position).sub(c.target);
    const fit = Math.max(orbit.length() * START_OUT, ((PLAN.size * S) / 2) * FIT_MARGIN / halfWidth);
    camera.position.copy(c.target).add(orbit.setLength(Math.min(c.maxDistance, fit)));
    c.update();
    home.current = { view: new THREE.Spherical().setFromVector3(orbit.copy(camera.position).sub(c.target)), x: c.target.x, z: c.target.z };
    controls.current = c;
    return () => {
      c.stopListenToKeyEvents();
      c.dispose();
    };
    // Created once; the floor target is animated in useFrame.
  }, [camera, gl]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const dy = damp(c.target.y, targetY, 5, dt, reduced) - c.target.y;
    if (Math.abs(dy) > 0.0005) {
      c.target.y += dy;
      camera.position.y += dy;
      invalidate();
    }
    if (spin.current) {
      const step = Math.abs(spin.current) < 0.001 ? spin.current : damp(0, spin.current, 6, dt, reduced);
      orbit.copy(camera.position).sub(c.target).applyAxisAngle(Y_AXIS, step);
      camera.position.copy(c.target).add(orbit);
      spin.current -= step;
      invalidate();
    }
    if (spinning.current) {
      orbit.copy(camera.position).sub(c.target).applyAxisAngle(Y_AXIS, SPIN_RATE * Math.min(dt, 0.1));
      camera.position.copy(c.target).add(orbit);
      invalidate();
    }
    const h = home.current;
    if (resetting.current && h) {
      const k = reduced ? 1 : 1 - Math.exp(-6 * dt);
      view.setFromVector3(orbit.copy(camera.position).sub(c.target));
      const dTheta = shortest(h.view.theta - view.theta);
      view.radius += (h.view.radius - view.radius) * k;
      view.phi += (h.view.phi - view.phi) * k;
      view.theta += dTheta * k;
      c.target.x += (h.x - c.target.x) * k;
      c.target.z += (h.z - c.target.z) * k;
      camera.position.copy(c.target).add(orbit.setFromSpherical(view));
      const near = Math.abs(h.view.radius - view.radius) < 0.01 && Math.abs(h.view.phi - view.phi) < 0.001 && Math.abs(dTheta) < 0.001;
      if (near && Math.abs(h.x - c.target.x) < 0.005 && Math.abs(h.z - c.target.z) < 0.005) resetting.current = false;
      invalidate();
    }
    if (c.update()) invalidate();
    // The compass needle points to the top of the 2D plan (−z), whichever way the building is turned.
    const azimuth = c.getAzimuthalAngle();
    if (shared.compass && Math.abs(azimuth - heading.current) > 0.001) {
      heading.current = azimuth;
      shared.compass.style.transform = `rotate(${(azimuth * 180) / Math.PI}deg)`;
    }
  });
  return null;
}

// ---------- Post-processing: ambient occlusion ----------
function Effects() {
  const { gl, scene, camera, size } = useThree();
  const composer = useMemo(() => {
    try {
      const c = new EffectComposer(gl);
      c.addPass(new RenderPass(scene, camera));
      const ao = new GTAOPass(scene, camera, size.width, size.height);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 1;
      ao.updateGtaoMaterial({ radius: 0.18, distanceExponent: 1, thickness: 0.6, scale: 1.1, samples: 16, distanceFallOff: 1 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
      // Glass, the ground and faded floors must not cast AO onto what is behind them.
      const pass = ao as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] };
      const base = pass._overrideVisibility.bind(ao);
      pass._overrideVisibility = () => {
        base();
        scene.traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (o.visible && (o.userData.noAO || (mat && !Array.isArray(mat) && mat.transparent))) {
            o.visible = false;
            pass._visibilityCache.push(o);
          }
        });
      };
      c.addPass(ao);
      c.addPass(new OutputPass());
      return c;
    } catch (error) {
      console.warn('3D: ambient occlusion unavailable, rendering without it', error);
      return null;
    }
  }, [gl, scene, camera]);

  useEffect(() => {
    if (!composer) return;
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);
  useEffect(() => () => composer?.dispose(), [composer]);

  useFrame(() => {
    if (composer) composer.render();
    else gl.render(scene, camera);
  }, 1);
  return null;
}

// ---------- DOM labels follow their rooms ----------
function LabelProjector({ shared, activeIndex }: { shared: Shared; activeIndex: number }) {
  const { camera, size, invalidate } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    shared.invalidate = invalidate;
    invalidate();
    return () => {
      shared.invalidate = null;
    };
  }, [shared, invalidate]);
  useFrame(() => {
    for (const [id, el] of shared.labels) {
      const a = shared.anchors.get(id);
      if (!a) continue;
      v.set(a.x, (shared.floorY[a.floor] ?? 0) + a.y, a.z).project(camera);
      const show = a.floor === activeIndex && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      el.style.visibility = show ? 'visible' : 'hidden';
      if (show) el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%)`;
    }
  }, 2);
  return null;
}

// ---------- The scene ----------
export function Scene({
  floors,
  activeIndex,
  rooms,
  statuses,
  selectedRoomId,
  shared,
  onOpen,
}: {
  floors: FloorData[];
  activeIndex: number;
  rooms: Map<string, RoomView>;
  statuses: Map<string, RoomStatus>;
  selectedRoomId: string | null;
  shared: Shared;
  onOpen: (roomId: string) => void;
}) {
  return (
    <>
      <Lighting activeIndex={activeIndex} />
      {floors.map((f, i) => (
        <Floor key={f.floor} floor={f} index={i} activeIndex={activeIndex} rooms={rooms} statuses={statuses} selectedRoomId={selectedRoomId} shared={shared} onOpen={onOpen} />
      ))}
      <CameraRig activeIndex={activeIndex} shared={shared} />
      <Effects />
      <LabelProjector shared={shared} activeIndex={activeIndex} />
    </>
  );
}

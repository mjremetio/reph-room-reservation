# Appendix G · 3D view (blueprint)

Everything needed to rebuild the realistic 3D view **without the codebase**: every constant, material, light, animation and the reference implementation. Summary: 07 (3D model) and 06 (3D view). Floor data and furniture expansion: Appendix F.

| File | How |
|---|---|
| `src/ui/building3d/layout.ts` | G.8, verbatim (pure; tests in `src/ui/__tests__/layout3d.test.ts`) |
| `src/ui/building3d/textures.ts` | G.9, verbatim |
| `src/ui/building3d/Scene.tsx` | G.10, verbatim |
| `src/ui/Building3D.tsx` | G.11, verbatim |
| `src/ui/styles/map.css` (3D parts) | G.12: which rules, with a pointer to the exact copy in appendix E |

Packages: `three` 0.186 and `@react-three/fiber` 9 (`Canvas`, `useFrame`, `useThree`, `ThreeEvent`). Add-ons come from `three/examples/jsm`: `OrbitControls`, `RoomEnvironment`, `EffectComposer`, `RenderPass`, `GTAOPass`, `OutputPass` and `mergeGeometries` (BufferGeometryUtils). No other 3D library.

## G.1 Loading and fallback
- `MapPanel.tsx` loads it lazily, so three.js stays out of the first page load: `const Building3D = dynamic(() => import('./Building3D'), { ssr: false, loading: () => <div className="building3d building3d--loading" role="status">Loading 3D view…</div> })`. A production build puts the 3D code in its own chunk (≈ 259 KB gzipped, 26 Sep 2026 build); the first page load stays ≈ 217 KB gzipped with no three.js.
- `<Canvas>`: `frameloop="demand"` (renders only after `invalidate()`, so an idle view costs nothing), `shadows="soft"` (three 0.186 falls back to PCF shadows with a console warning), `dpr={[1, 1.5]}`, `gl={{ antialias: true, powerPreference: 'high-performance', toneMappingExposure: 0.92 }}`, `role="img"`.
  - `aria-label`: "3D model of Bldg. H, <floor> in front<, N rooms fit>. Room labels are buttons; the 2D map and the list work without a pointer."
  - WebGL missing → `<p class="building3d__fallback">`: "3D view needs WebGL, which this browser can't use. Switch back to 2D."
- Hint at the bottom left (`aria-hidden`): "Drag to turn 360° · Shift- or right-drag to move · scroll to zoom".
- Turn buttons at the top right: `div.map-zoom` (`role="group"`, `aria-label="Turn"`, `z-index` 4 so it sits above the labels) with `<TurnButtons>` from `FloorMap.tsx` (calling `shared.turn(dir)`), then the **360°** button (`.b3d-spin`, `.is-on` and `aria-pressed` while spinning; `shared.spin(!spinning)`; the `spinning` state is set through `shared.onSpin`) and the **compass** button (`shared.resetView()`; its `<span class="b3d-compass">` is `shared.compass`, an 18 × 18 SVG needle: red tip `M9 1.5l3 7.5H6z` in `--red`, tail `M9 16.5l-3-7.5h6z` at 45% `currentColor`). The wrapper's `onKeyDown` (ignored with Ctrl, ⌘ or Alt): `r` turns right, `R` left, `s`/`S` toggles the spin, `0` resets the view.
- The canvas has no `onPointerMissed` handler: a click or a drag on empty space changes nothing (the selection stays).

## G.2 Scale and constants
| Name | Value | Meaning |
|---|---|---|
| `S` | 0.01 | World units per map unit (1 map unit = 5 cm, so 1 world unit = 5 m) |
| `PLAN` | union of all floors' view boxes: x 13 → 1440, y 10 → 1064 | `CX` = 726.5, `CZ` = 537 (its centre), size = 1427 (its larger side) |
| `wx(x)`, `wz(y)` | `(x − CX) × S`, `(y − CZ) × S` | Plan → world; the model sits around the origin |
| `VIEW` | size × S ÷ 9.4 ≈ 1.518 | Scales the camera, fog, shadow box, sun and ground (the scene was first tuned for a 940-unit plan) |
| `SLAB_T` | 0.07 | Slab thickness (35 cm); floors stand on it |
| `WALL_H` | 0.32 | Walls cut at 1.6 m, so interiors stay visible |
| `CAP_H` | 0.008 | Glowing strip on top of room walls |
| `TABLE_H` | 0.146 | Table and desk height (73 cm) |
| `FLOOR_GAP` | 1.15 | Vertical spacing between floors (exploded view) |
| `SPREAD` | 2.2 | Extra lift for floors above the active one |
| `WALL_T` | 3 map units | 15 cm partitions (`layout.ts`) |
| `DOOR_W` | 18 map units | 90 cm door opening, centred on the door node, clamped inside the wall |
| `START_OUT` | 1.15 | The start view is 15% farther out than the tuned camera (P1-37) |
| `FIT_MARGIN` | 1.15 | …and far enough that the floor's width plus 15% fits across the canvas (P1-37) |

## G.3 Materials (one set per floor, so each floor fades on its own)
`std(color, roughness, metalness = 0, extra)` = `MeshStandardMaterial`.

| Key | Colour | Roughness | Metalness | Extra |
|---|---|---|---|---|
| slab | #c7c8c2 | 0.95 | 0 | |
| tile | texture (G.9) | 0.42 | 0 | polished concrete, 60 cm tiles |
| wall | #efeeea | 0.92 | 0 | drywall |
| glass | #cfe3ea | 0.04 | 0.1 | envMapIntensity 1.8; always transparent, base opacity 0.22 |
| frame | #56606a | 0.35 | 0.6 | glass rails, mullions |
| wood | #a57a50 | 0.5 | 0 | room tables, stage |
| metal | #3a4247 | 0.4 | 0.7 | table legs |
| chair | #3c454b | 0.85 | 0 | |
| screen | #101417 | 0.15 | 0.4 | emissive #1a2a3c at 0.35 |
| concrete | #d6d6d0 | 0.95 | 0 | lift, stair and restroom walls, steps |
| cut | #5b656b | 0.9 | 0 | section-cut tops |
| lift | #9aa3a8 | 0.28 | 0.85 | lift cars |
| column | #ecebe6 | 0.9 | 0 | |
| facade | #c4dbe4 | 0.03 | 0.2 | envMapIntensity 2; always transparent, base opacity 0.16 |
| person | #ffffff | 0.85 | 0 | tinted per instance |
| ink | #22303a | 0.6 | 0 | "you" figure, selection ring |
| desk | #f1f0ec | 0.55 | 0 | workstations and plan tables |
| officeFloor / serviceFloor / wetFloor / amenityFloor / unlistedFloor | #d8d2c6 / #cdd0cb / #dde5e7 / #d3ddd1 / #e8dcaa | 0.95 / 0.95 / 0.5 / 0.95 / 0.95 | 0 | floor tints of areas |

Per room: a **carpet** material (carpet texture, repeat w/14 × h/14, roughness 1) and a **cap** material (emissive = colour), both coloured by state, in the 2D map's colours (green free and fits, orange partly free, red taken, blue yours; since 29 Sep 2026, before that fits were blue, taken grey and free beige):

| State | Carpet | Cap | Glow |
|---|---|---|---|
| fits | #62c283 | #16a34a | 1.3 |
| yours | #5f8ce6 | #1f5fd6 | 1.6 |
| partial | #f0ad78 | #e0701c | 1.3 |
| taken | #d99a93 | #c0352b | 0.35 |
| free | #a3d9b3 | #22c55e | 0.45 |
| unsuitable | #d8d8d3 | #c3c9c5 | 0 |

People colours: `#e9e6df, #dcd8cf, #f1efea, #d3d0c8, #e4e1da, #cfd3d6` (others), `#dbe6fb, #c9daf9, #e6eefc` (yours); colour index `(i × 7 + shape.x) % length`.

`setOpacity(material, floorOpacity)`: opacity = base × floor opacity; transparency (and no depth write) switches on only below 0.999 or for always-transparent materials, so AO and depth stay right on the active floor.

## G.4 Geometry
- **Merging:** `boxes(list)` merges many `BoxGeometry`s (one draw call). `planBox(rect, y0, y1, cx = CX, cz = CZ)` turns a plan rectangle into a box from height y0 to y1.
- **Office chair** (built once, facing +z): seat 0.085 × 0.012 × 0.08 at y 0.09; back 0.085 × 0.085 × 0.012 at (0, 0.14, −0.042); stem cylinder r 0.006, h 0.08 at y 0.045; base disc r 0.034, h 0.006 at y 0.003.
- **Seated person** (built once): torso capsule (r 0.024, length 0.055) at (0, 0.165, −0.012); head sphere r 0.02 at (0, 0.235, −0.006); thighs 0.07 × 0.022 × 0.07 at (0, 0.108, 0.03); lower legs 0.06 × 0.09 × 0.024 at (0, 0.055, 0.066).
- **Desk** (unit size, scaled per instance to w·S × 1 × h·S): top 1 × 0.012 × 1 at y TABLE_H − 0.006; modesty panel 0.96 × (TABLE_H − 0.012) × 0.05 centred. **Round table:** a disc (r 0.5, h 0.012, 24 segments) at TABLE_H − 0.006 on a stem (r 0.05).
- Seats and chairs turn by `atan2(fx, fy)` about y; floor desks by `−angle`.

## G.5 Scene parts
- **Shell** (per floor): the outline as `THREE.Shape` with points `(wx(x), −wz(y))`.
  - Slab: `ExtrudeGeometry` depth `SLAB_T − 0.002`, no bevel, rotated −90° about x.
  - Floor: `ShapeGeometry` with UVs set across the floor's view box (`u = (x − wx(vx)) / (vw·S)`, `v = 1 − (z − wz(vy)) / (vh·S)`), rotated and raised to `SLAB_T`, tile material, receives shadows.
  - Columns: 8-unit squares every 165 units (≈ 8.4 m) along each outline edge, starting at its first corner, set `col/2 + 2` inside the outward normal, from SLAB_T to SLAB_T + WALL_H + 0.03.
  - Curtain wall per edge: a 1-unit pane from SLAB_T to SLAB_T + WALL_H + 0.02 (facade glass), mullions every 30 units (1.5 × 2), a top rail (0.01 high). Outward normal per edge from the outline's centroid (`edgeNormals`). Each edge's group is visible only when the floor's opacity > 0.5 **and** the camera is on the inside of that edge (`(camera − floor centre) · normal < 0`), so glass never blocks the view.
- **AreaModels** (per floor; everything except `open`):
  - Floor tint: a 0.003-high box inside the walls in the kind's floor material (core → slab, lift and stairs → serviceFloor, restroom → wetFloor, office → officeFloor, service → serviceFloor, amenity → amenityFloor, unlisted → unlistedFloor).
  - Walls: four boxes of `WALL_T` around the area; drywall for office, service, amenity and unlisted (height WALL_H); concrete for lift, stairs and restroom (height WALL_H + 0.04). The core gets no walls (its parts have them).
  - Dark `cut` caps 0.004 thick on every wall top.
  - Lift: a metal car inset `WALL_T + 2`, full wall height.
  - Stairs: steps 7 units deep along the long side, each 0.034 higher (capped at WALL_H).
- **FloorFurnitureModel:** instanced desks (desk material, flat tables included), instanced discs (round tables) and instanced chairs, from `floorFurniture()` (Appendix F.4). The group is marked `detail`, so it hides on faded floors.
- **Room** (every placed bookable room; unplaced rooms are skipped):
  - Positioned at its centre (`wx(cx)`, SLAB_T, `wz(cz)`); all parts are local to it.
  - Walls from `roomWalls(shape, door)` (G.8): solid walls in drywall; the door side is glass (inset 0.8, 1.4 thick, from 0.012 to WALL_H − 0.012) with frame rails at the bottom and top (0.012 each). Caps (height CAP_H) on every wall in the room's cap material.
  - Carpet: a plane inside the walls at y 0.002 (carpet material).
  - Furniture from `roomFurniture(shape, door, kind, capacity, av)` (G.8): tables (wood, TABLE_H − 0.012 → TABLE_H), two leg panels per table (metal: inset 3, 1.2 thick, 60% of the short side), a screen (0.14 → 0.27, screen material), a stage (0 → 0.04, wood), instanced chairs and instanced people (one per seat).
  - Selection ring: four 1.6-unit strips 3 units outside the room at 0.004–0.012 in ink, visible when selected.
  - Occupants: taken → the largest group size among the bookings at that time; yours → the user's own group size; never more than the seats.
  - Pointer: hover sets the canvas cursor to `pointer` (leaving sets it back to `''`, so the canvas's grab hand returns), marks the room hovered (brighter glow) and toggles `is-hovered` on its label; a click opens the room sheet unless the pointer moved more than 4 px (`e.delta > 4`: a drag that moved or turned the view).
- **YouMarker:** on the active floor at the lift lobby: a capsule (r 0.026, length 0.14) at y 0.11 and a head (r 0.024) at y 0.235 in ink.

## G.6 Animation (all eased with `damp(current, target, rate, dt) = current + (target − current)(1 − e^(−rate·dt))`; instant with `prefers-reduced-motion`)
- **Build-up when the view opens:** each room starts after `0.1 + (distance from the lobby ÷ (520 × VIEW)) × 0.7` s. Walls grow (`scale.y`, rate 6); furniture follows at `(build − 0.55) ÷ 0.45`.
- **State change:** after `0.08 × rank` s (0.1 s without a rank), the carpet and cap colours blend (`1 − e^(−7·dt)`); fits, yours and partial rooms **pulse** once (pulse 1, rate 2.2). Cap glow target = state glow + pulse × 2.4 + 0.9 when hovered + 0.6 when selected (rate 10).
- **People** sit down one after another or leave: count eased at rate 5; seat `i` is scaled by `clamp(count − i, 0, 1)`.
- **Floors:** active floor at `index × FLOOR_GAP`; floors above it are lifted a further `SPREAD`. Opacity: active 1, above 0.06, below 0.16. Height rate 6, opacity rate 7. Details (glass, lift cars, steps, furniture, people, facades) show only above opacity 0.5. Only the active floor casts shadows.
- Every animation calls `invalidate()` while it moves and stops when settled (demand frame loop).

## G.7 Light, camera, effects
- **Environment:** `PMREMGenerator.fromScene(new RoomEnvironment(), 0.04)` as `scene.environment` at intensity 0.32. Background #eef0ec; fog #eef0ec from 26 × VIEW to 50 × VIEW (P1-37; was 18 → 38, moved out with the farther start view).
- **Lights:** hemisphere #f4f8ff / #cbc3b3 at 0.35. Sun: directional #fff3e2, intensity 2.6, at (4.5, 9, 6) × VIEW inside a rig that follows the active floor's height (rate 6), aimed at the rig's origin. Shadows: map 4096², camera box ±6.5 × VIEW, near 1, far 30 × VIEW, bias −0.0004, normal bias 0.015.
- **Ground:** a radial-gradient shadow plane (18 × 12) × VIEW at y −0.005 (basic material, transparent, no depth write) and a shadow catcher (30 × 30) × VIEW at −0.004 (`ShadowMaterial` opacity 0.2). Neither gets AO.
- **Camera:** the canvas starts it at (2.6, 6.9, 7.1) × VIEW, raised by `active × FLOOR_GAP`; fov 34, near 0.1, far 80 × VIEW. **Start view (P1-37):** when the controls are made, the camera's offset from the target keeps its direction and gets the length `min(maxDistance, max(offset × START_OUT, (PLAN.size × S ÷ 2) × FIT_MARGIN ÷ (tan(fov ÷ 2) × aspect)))`, with `START_OUT = 1.15`, `FIT_MARGIN = 1.15` and `aspect = canvas.clientWidth ÷ max(1, canvas.clientHeight)`: 15% farther than the tuned camera, and never so close that the floor's width plus 15% overflows the canvas. That view is saved as `home` (the compass goes back to it). `OrbitControls` (created once in `CameraRig`): damping 0.1 (off with reduced motion), distance 2.5 → 25 × VIEW (P1-37; was 15), polar angle 0.05 → 1.42 (straight down to just above eye level), no azimuth limit (a full 360°), target (0, active × FLOOR_GAP + SLAB_T + 0.1, 0.2); the target and camera glide up or down with the active floor (rate 5).
- **Controls: turn all the way round** (P1-35).
  - Mouse: `mouseButtons = { LEFT: ROTATE, MIDDLE: DOLLY, RIGHT: PAN }` with `enablePan = true` and `screenSpacePanning = false`, so a left drag turns the building 360° and tilts it. OrbitControls turns a left drag into a pan along the floor plane while Shift, Ctrl or ⌘ is held. The wheel zooms (dolly).
  - Touch: `touches = { ONE: ROTATE, TWO: DOLLY_PAN }`: one finger turns, two fingers zoom and move.
  - Any drag (`start` event) stops the spin and a glide home.
  - Spin: `shared.spin(on)` sets `spinning` (and calls `shared.onSpin(on)`); while on, every frame turns the camera's offset around the world Y axis by `SPIN_RATE × min(dt, 0.1)` (`SPIN_RATE = 2π / 24`: one turn in 24 s) and invalidates. Turn buttons, a reset and any drag stop it.
  - Reset: when the controls are made, `home = { view: Spherical of (camera − target), x, z of the target }`. `shared.resetView()` stops the spin, clears the pending turn and sets `resetting`; each frame then eases the camera's spherical offset (radius, phi, theta the short way round with `shortest(a) = atan2(sin a, cos a)`) and the target's x and z toward `home` with `k = 1 − e^(−6·dt)` (1 with reduced motion), until all are within 0.01 / 0.001 rad / 0.005.
  - Compass: every frame, when the azimuth (`getAzimuthalAngle()`) changed by more than 0.001 rad, `shared.compass.style.transform = rotate(<azimuth in degrees>deg)`, so the needle points to the top of the 2D plan (−z) on screen.
  - Keys: `gl.domElement.tabIndex = 0` makes the canvas focusable; `listenToKeyEvents(canvas)` with `keyPanSpeed = 20` moves the view with the arrow keys while it has focus (`stopListenToKeyEvents()` and `dispose()` on unmount).
  - Clamp: on every `change`, the target's x and z are clamped to ±`PLAN.size × S ÷ 2` (the plan's half size) and the camera is shifted by the same amount, so the view keeps its angle and the building can't be dragged out of sight; then `invalidate()`.
  - Cursor and focus (G.12): the canvas shows `grab`, `grabbing` while pressed, `pointer` over a room; `touch-action: none`; no outline, a 3 px inset `--blue` ring on `:focus-visible`.
  - Turn: `CameraRig` sets `shared.turn = (dir) => { spin += dir × TURN_3D (π/4); invalidate() }` (null on unmount). In `useFrame`, while `spin ≠ 0`: `step = |spin| < 0.001 ? spin : damp(0, spin, 6, dt, reduced)`; the camera's offset from the target turns by `step` around the world Y axis (`applyAxisAngle`), `spin −= step`, `invalidate()`. A positive angle circles the camera anticlockwise seen from above, so the building appears to turn clockwise (Turn right).
- **Ambient occlusion:** `EffectComposer` → `RenderPass` → `GTAOPass` (output Default, blend 1; GTAO radius 0.18, distance exponent 1, thickness 0.6, scale 1.1, 16 samples, distance fall-off 1; denoise lumaPhi 10, depthPhi 2, normalPhi 3, radius 5, 2 rings, 16 samples) → `OutputPass`. The pass's visibility override also hides transparent meshes and anything marked `noAO` (glass, facades, ground), so they don't darken what is behind them. If the composer can't be created: warn "3D: ambient occlusion unavailable, rendering without it" and render normally. Rendered in `useFrame(…, 1)`.
- **Labels:** real `<button class="b3d-label b3d-label--<state>">` elements over the canvas (sharp, keyboard reachable). Each room has an anchor at its centre at height SLAB_T + WALL_H + 0.05; `LabelProjector` (in `useFrame(…, 2)`) projects it and sets `transform: translate(<x>px, <y>px) translate(-50%, -100%)`. A label shows only for the active floor and when on screen; rooms that are "not suitable" have no label. Content: the rank (1–3, fits) or a state dot, the name, the seats; a second line with the holder (`reservedBy.short`). `aria-label`: "<name>, <floor>, seats N, <state word>, rank N, reserved by <full name>" (parts only when known). Hover or focus on a label highlights its room like the pointer does; a click opens the room sheet.
- The legend highlight (06 Legend) sets `data-highlight` on `.b3d-labels`; labels in other states fade to 18% (G.12).

## G.8 `src/ui/building3d/layout.ts` (verbatim)
Walls, door side and furniture for one room, in map units. Summary: `doorSide` = the room edge nearest the door node; `roomWalls` = four walls inside the outline, the door side glass and split around a `DOOR_W` opening; `roomFurniture`: training → rows of two-person desks facing the wall opposite the door (row pitch 22, seat pitch 13, 16 units kept free at the front, up to 30 people); halls → rows of chairs (row pitch 11, seat pitch 10, up to 60) facing a stage (60% of the far wall, 10 deep); lactation room → at most 2 seats, no screen; others → one meeting table along the long side (12–24 wide, length `max(18, min(long − 16, per side × 12))`), chairs 7 units from both long edges then the ends, up to 14; a screen on the far wall (42% of its length) for VC/BYOD rooms, training rooms and halls; `capacity ?? 4` seats at most.

<!-- verbatim: src/ui/building3d/layout.ts -->
```ts
/**
 * Plan layout for the realistic 3D view: walls with a glass front and door opening, and furniture sized to
 * the room. Pure (map units, no three.js) so it is unit tested. 1 map unit = 5 cm (unitMeters in the floor data).
 */
import type { AV, RoomKind } from '../../domain/types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Side = 'top' | 'bottom' | 'left' | 'right';
export interface Wall extends Rect {
  glass: boolean;
}
/** A seat and the direction the person faces (unit vector in plan, +y = south). */
export interface Seat {
  x: number;
  y: number;
  fx: number;
  fy: number;
}
export interface Furniture {
  tables: Rect[];
  seats: Seat[];
  screen: Rect | null;
  stage: Rect | null;
}

export const WALL_T = 3; // 15 cm partitions
export const DOOR_W = 18; // 90 cm door opening
const CLEAR = 6; // space kept free along the walls
const CHAIR_GAP = 7; // chair centre to table edge
const SEAT_PITCH = 12; // 60 cm per person along a table

export function doorSide(room: Rect, door: { x: number; y: number }): Side {
  const d = [
    ['top', Math.abs(door.y - room.y)],
    ['bottom', Math.abs(door.y - (room.y + room.h))],
    ['left', Math.abs(door.x - room.x)],
    ['right', Math.abs(door.x - (room.x + room.w))],
  ] as const;
  return [...d].sort((a, b) => a[1] - b[1])[0]![0];
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/** Four walls inside the room outline; the door side is glass with an opening centred on the door. */
export function roomWalls(room: Rect, door: { x: number; y: number }): Wall[] {
  const T = WALL_T;
  const side = doorSide(room, door);
  const sides: Record<Side, Rect> = {
    top: { x: room.x, y: room.y, w: room.w, h: T },
    bottom: { x: room.x, y: room.y + room.h - T, w: room.w, h: T },
    left: { x: room.x, y: room.y + T, w: T, h: room.h - 2 * T },
    right: { x: room.x + room.w - T, y: room.y + T, w: T, h: room.h - 2 * T },
  };
  const walls: Wall[] = [];
  for (const s of ['top', 'bottom', 'left', 'right'] as const) {
    const r = sides[s];
    if (s !== side) {
      walls.push({ ...r, glass: false });
      continue;
    }
    const horizontal = s === 'top' || s === 'bottom';
    const start = horizontal ? r.x : r.y;
    const len = horizontal ? r.w : r.h;
    const centre = Math.min(Math.max(horizontal ? door.x : door.y, start + DOOR_W / 2), start + len - DOOR_W / 2);
    const gapA = centre - DOOR_W / 2;
    const gapB = centre + DOOR_W / 2;
    const parts: Array<[number, number]> = [
      [start, gapA],
      [gapB, start + len],
    ];
    for (const [a, b] of parts) {
      if (b - a < 1) continue;
      walls.push(horizontal ? { x: a, y: r.y, w: b - a, h: r.h, glass: true } : { x: r.x, y: a, w: r.w, h: b - a, glass: true });
    }
  }
  return walls;
}

function inner(room: Rect): Rect {
  const m = WALL_T + CLEAR;
  return { x: room.x + m, y: room.y + m, w: room.w - 2 * m, h: room.h - 2 * m };
}

/** A screen on the wall opposite the door (rooms with VC or a BYOD dock, training rooms and halls). */
function screenFor(room: Rect, side: Side): Rect {
  const far = OPPOSITE[side];
  const T = WALL_T;
  const horizontal = far === 'top' || far === 'bottom';
  const len = (horizontal ? room.w : room.h) * 0.42;
  if (horizontal) return { x: room.x + room.w / 2 - len / 2, y: far === 'top' ? room.y + T : room.y + room.h - T - 1.5, w: len, h: 1.5 };
  return { x: far === 'left' ? room.x + T : room.x + room.w - T - 1.5, y: room.y + room.h / 2 - len / 2, w: 1.5, h: len };
}

/** Meeting-style table along the room's long side with chairs on both long edges (and the ends if needed). */
function meetingLayout(r: Rect, people: number): Pick<Furniture, 'tables' | 'seats'> {
  const alongX = r.w >= r.h;
  const long = alongX ? r.w : r.h;
  const short = alongX ? r.h : r.w;
  const tableW = Math.max(12, Math.min(24, short - 2 * (CHAIR_GAP + 6)));
  const perSide = Math.max(1, Math.ceil(people / 2));
  const tableL = Math.max(18, Math.min(long - 16, perSide * SEAT_PITCH));
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const table: Rect = alongX
    ? { x: cx - tableL / 2, y: cy - tableW / 2, w: tableL, h: tableW }
    : { x: cx - tableW / 2, y: cy - tableL / 2, w: tableW, h: tableL };
  const fit = Math.max(1, Math.floor(tableL / SEAT_PITCH));
  const seats: Seat[] = [];
  for (const sign of [-1, 1] as const) {
    const count = Math.min(fit, sign === -1 ? Math.ceil(people / 2) : Math.floor(people / 2));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5; // -0.5..0.5 along the table
      const off = tableW / 2 + CHAIR_GAP;
      seats.push(
        alongX
          ? { x: cx + t * tableL, y: cy + sign * off, fx: 0, fy: -sign }
          : { x: cx + sign * off, y: cy + t * tableL, fx: -sign, fy: 0 },
      );
    }
  }
  // Heads of the table when the long sides are full.
  let left = people - seats.length;
  for (const sign of [-1, 1] as const) {
    if (left <= 0) break;
    const off = tableL / 2 + CHAIR_GAP;
    const room = (alongX ? r.w : r.h) / 2 - off;
    if (room < 5) break;
    seats.push(alongX ? { x: cx + sign * off, y: cy, fx: -sign, fy: 0 } : { x: cx, y: cy + sign * off, fx: 0, fy: -sign });
    left--;
  }
  return { tables: [table], seats };
}

/** Rows of two-person desks (training) or plain rows of chairs (halls), all facing the screen wall. */
function rowsLayout(r: Rect, people: number, facing: Side, desks: boolean): Pick<Furniture, 'tables' | 'seats'> {
  const f = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[facing] as [number, number];
  const rowsAlongX = facing === 'top' || facing === 'bottom';
  const width = rowsAlongX ? r.w : r.h; // along a row
  const depth = rowsAlongX ? r.h : r.w; // front to back
  const rowPitch = desks ? 22 : 11;
  const seatPitch = desks ? 13 : 10;
  const front = 16; // space for the screen or stage
  const rows = Math.max(1, Math.floor((depth - front) / rowPitch));
  const perRow = Math.max(1, Math.floor((width - 8) / seatPitch));
  const tables: Rect[] = [];
  const seats: Seat[] = [];
  for (let row = 0; row < rows && seats.length < people; row++) {
    const d = front + row * rowPitch + rowPitch / 2; // distance from the screen wall
    const inRow = Math.min(perRow, people - seats.length);
    const rowLen = inRow * seatPitch;
    for (let i = 0; i < inRow; i++) {
      const a = -rowLen / 2 + (i + 0.5) * seatPitch;
      // Plan position: along = a (centred), back from the facing wall by d.
      const x = rowsAlongX ? r.x + r.w / 2 + a : f[0] < 0 ? r.x + d : r.x + r.w - d;
      const y = rowsAlongX ? (f[1] < 0 ? r.y + d : r.y + r.h - d) : r.y + r.h / 2 + a;
      seats.push({ x, y, fx: f[0], fy: f[1] });
    }
    if (desks) {
      const deskD = 8;
      const dd = d - 7; // desk in front of the chairs
      tables.push(
        rowsAlongX
          ? { x: r.x + r.w / 2 - rowLen / 2, y: (f[1] < 0 ? r.y + dd : r.y + r.h - dd) - deskD / 2, w: rowLen, h: deskD }
          : { x: (f[0] < 0 ? r.x + dd : r.x + r.w - dd) - deskD / 2, y: r.y + r.h / 2 - rowLen / 2, w: deskD, h: rowLen },
      );
    }
  }
  return { tables, seats };
}

/** Furniture for one room, never more seats than its capacity (demo value when the real one is unknown). */
export function roomFurniture(room: Rect, door: { x: number; y: number }, kind: RoomKind, capacity: number | null, av: AV): Furniture {
  const side = doorSide(room, door);
  const r = inner(room);
  const cap = capacity ?? 4;
  const screen = av || kind === 'Training' || kind === 'Multi-purpose' ? screenFor(room, side) : null;
  if (kind === 'Training') return { ...rowsLayout(r, Math.min(cap, 30), OPPOSITE[side], true), screen, stage: null };
  if (kind === 'Multi-purpose') {
    const far = OPPOSITE[side];
    const horizontal = far === 'top' || far === 'bottom';
    const stage: Rect = horizontal
      ? { x: r.x + r.w * 0.2, y: far === 'top' ? r.y : r.y + r.h - 10, w: r.w * 0.6, h: 10 }
      : { x: far === 'left' ? r.x : r.x + r.w - 10, y: r.y + r.h * 0.2, w: 10, h: r.h * 0.6 };
    return { ...rowsLayout(r, Math.min(cap, 60), far, false), screen, stage };
  }
  // A lactation room holds one or two people, not a meeting table.
  if (kind === 'Lactation Room') return { ...meetingLayout(r, Math.min(capacity ?? 2, 2)), screen: null, stage: null };
  return { ...meetingLayout(r, Math.min(cap, 14)), screen, stage: null };
}
```

## G.9 `src/ui/building3d/textures.ts` (verbatim)
Canvas textures (no image files): polished concrete tiles (2 px per map unit, #d8d5ce with noise 12, grout lines rgba(60, 62, 58, 0.14) every 12 units = 60 cm, anisotropy 8), carpet fibre (128 px, #f2f2f2 with noise 38, repeating) and a soft radial ground shadow (512 px).

<!-- verbatim: src/ui/building3d/textures.ts -->
```ts
/** Procedural textures for the realistic 3D view (no image files to ship). Browser only. */
import * as THREE from 'three';

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed = 1): void {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    img.data[i] = Math.max(0, Math.min(255, (img.data[i] ?? 0) + n));
    img.data[i + 1] = Math.max(0, Math.min(255, (img.data[i + 1] ?? 0) + n));
    img.data[i + 2] = Math.max(0, Math.min(255, (img.data[i + 2] ?? 0) + n));
  }
  ctx.putImageData(img, 0, 0);
}

/** Polished concrete with 60 cm tiles, sized to a floor plate of `w` × `h` map units (1 unit = 5 cm). */
export function tileFloorTexture(w: number, h: number): THREE.CanvasTexture {
  const k = 2; // pixels per map unit
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#d8d5ce';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  noise(ctx, canvas.width, canvas.height, 12, 7);
  ctx.strokeStyle = 'rgba(60, 62, 58, 0.14)';
  ctx.lineWidth = 1;
  const tile = 12 * k;
  for (let x = 0; x <= canvas.width; x += tile) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += tile) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(canvas.width, y + 0.5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Tileable carpet fibre noise; the material colour tints it per room state. */
export function carpetTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, size, 38, 11);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial shadow under the building, like a model standing on a table. */
export function groundTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(34, 48, 58, 0.16)');
  g.addColorStop(1, 'rgba(34, 48, 58, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
```

## G.10 `src/ui/building3d/Scene.tsx` (verbatim)
<!-- verbatim: src/ui/building3d/Scene.tsx -->
```tsx
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
```

## G.11 `src/ui/Building3D.tsx` (verbatim)
<!-- verbatim: src/ui/Building3D.tsx -->
```tsx
'use client';

/**
 * 3D view of Bldg. H (docs/spec/06-ui.md S6 and 07 Rendering): the realistic cutaway model from
 * ./building3d/Scene plus room labels as real buttons, which stay sharp, follow their rooms and can be
 * reached with the keyboard. Lazy-loaded (next/dynamic) so three.js stays out of the initial bundle.
 */
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import type { RoomView } from './api';
import { Scene, FLOOR_GAP, SLAB_T, VIEW, WALL_H, wx, wz, type Shared } from './building3d/Scene';
import { FLOORS, TurnButtons } from './FloorMap';
import { reservedBy, STATE_WORDS, type RoomState, type RoomStatus } from './roomStates';

export default function Building3D({
  floor,
  rooms,
  statuses,
  selectedRoomId,
  highlight = null,
  onOpen,
}: {
  floor: string;
  rooms: Map<string, RoomView>;
  statuses: Map<string, RoomStatus>;
  selectedRoomId: string | null;
  /** Legend highlight: labels of rooms in other states fade. */
  highlight?: RoomState | null;
  onOpen: (roomId: string) => void;
}) {
  const activeIndex = Math.max(0, FLOORS.findIndex((f) => f.floor === floor));
  const shared = useMemo<Shared>(() => {
    const anchors: Shared['anchors'] = new Map();
    FLOORS.forEach((f, i) => {
      for (const s of f.rooms.filter((r) => !r.unplaced)) anchors.set(s.roomId, { floor: i, x: wx(s.x + s.w / 2), z: wz(s.y + s.h / 2), y: SLAB_T + WALL_H + 0.05 });
    });
    return {
      floorY: FLOORS.map((_, i) => i * FLOOR_GAP),
      hovered: null,
      labels: new Map(),
      anchors,
      invalidate: null,
      turn: null,
      spin: null,
      onSpin: null,
      resetView: null,
      compass: null,
    };
  }, []);
  // The 360° button shows whether the building is spinning; a drag in the view stops it.
  const [spinning, setSpinning] = useState(false);
  useEffect(() => {
    shared.onSpin = setSpinning;
    return () => {
      shared.onSpin = null;
    };
  }, [shared]);

  // Labels for the active floor; rooms that can't host the request stay unlabelled to keep the view calm.
  const active = FLOORS[activeIndex];
  const labels = (active?.rooms ?? [])
    .filter((s) => !s.unplaced)
    .map((s) => ({ room: rooms.get(s.roomId), status: statuses.get(s.roomId) }))
    .filter((l): l is { room: RoomView; status: RoomStatus | undefined } => !!l.room && l.status?.state !== 'unsuitable');

  useEffect(() => {
    shared.invalidate?.();
  }, [shared, activeIndex, statuses, selectedRoomId]);

  const fits = [...statuses.values()].filter((s) => s.state === 'fits').length;

  return (
    <div
      className="building3d"
      onKeyDown={(e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'r' || e.key === 'R') shared.turn?.(e.shiftKey ? -1 : 1);
        else if (e.key === 's' || e.key === 'S') shared.spin?.(!spinning);
        else if (e.key === '0') shared.resetView?.();
      }}
    >
      <Canvas
        frameloop="demand"
        shadows="soft"
        dpr={[1, 1.5]}
        camera={{ position: [2.6 * VIEW, 6.9 * VIEW + activeIndex * FLOOR_GAP, 7.1 * VIEW], fov: 34, near: 0.1, far: 80 * VIEW }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMappingExposure: 0.92 }}
        aria-label={`3D model of Bldg. H, ${floor} in front${fits ? `, ${fits} rooms fit` : ''}. Room labels are buttons; the 2D map and the list work without a pointer.`}
        role="img"
        fallback={<p className="building3d__fallback">3D view needs WebGL, which this browser can&apos;t use. Switch back to 2D.</p>}
      >
        <Scene floors={FLOORS} activeIndex={activeIndex} rooms={rooms} statuses={statuses} selectedRoomId={selectedRoomId} shared={shared} onOpen={onOpen} />
      </Canvas>

      <div className="b3d-labels" data-highlight={highlight ?? undefined}>
        {labels.map(({ room, status }) => {
          const state = status?.state ?? 'free';
          const rank = status?.rank && status.rank <= 3 && state === 'fits' ? status.rank : null;
          const who = reservedBy(status);
          return (
            <button
              key={room.id}
              ref={(el) => {
                if (el) shared.labels.set(room.id, el);
                else shared.labels.delete(room.id);
              }}
              className={`b3d-label b3d-label--${state}${selectedRoomId === room.id ? ' is-selected' : ''}`}
              style={{ visibility: 'hidden' }}
              onClick={() => onOpen(room.id)}
              onMouseEnter={() => {
                shared.hovered = room.id;
                shared.invalidate?.();
              }}
              onMouseLeave={() => {
                if (shared.hovered === room.id) shared.hovered = null;
                shared.invalidate?.();
              }}
              onFocus={() => {
                shared.hovered = room.id;
                shared.invalidate?.();
              }}
              onBlur={() => {
                if (shared.hovered === room.id) shared.hovered = null;
                shared.invalidate?.();
              }}
              aria-label={`${room.name}, ${room.floor}, ${room.capacity ? `seats ${room.capacity}, ` : ''}${STATE_WORDS[state]}${rank ? `, rank ${rank}` : ''}${who ? `, reserved by ${who.full}` : ''}`}
            >
              <span className="b3d-label__row">
                {rank ? <span className="b3d-label__rank">{rank}</span> : <span className="b3d-label__dot" aria-hidden />}
                <span>{room.name}</span>
                {room.capacity ? <span className="b3d-label__seats">{room.capacity}</span> : null}
              </span>
              {who && <span className="b3d-label__owner">{who.short}</span>}
            </button>
          );
        })}
      </div>

      <div className="map-zoom" role="group" aria-label="Turn">
        <TurnButtons onTurn={(dir) => shared.turn?.(dir)} />
        <button
          type="button"
          className={`b3d-spin${spinning ? ' is-on' : ''}`}
          aria-pressed={spinning}
          onClick={() => shared.spin?.(!spinning)}
          aria-label={spinning ? 'Stop turning' : 'Turn all the way round'}
          title={spinning ? 'Stop turning (S)' : 'Turn 360° (S)'}
        >
          360°
        </button>
        <button type="button" onClick={() => shared.resetView?.()} aria-label="Back to the start view" title="Back to the start view (0). The arrow points to the top of the 2D plan.">
          <span
            className="b3d-compass"
            ref={(el) => {
              shared.compass = el;
            }}
            aria-hidden
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M9 1.5l3 7.5H6z" fill="var(--red)" />
              <path d="M9 16.5l-3-7.5h6z" fill="currentColor" opacity="0.45" />
            </svg>
          </span>
        </button>
      </div>

      <div className="building3d__hint" aria-hidden>
        Drag to turn 360° · Shift- or right-drag to move · scroll to zoom
      </div>
    </div>
  );
}
```

## G.12 3D styles (from `src/ui/styles/map.css`)
Legend highlight (the 3D half; the first rule is shared with the 2D map):
No copy here: the rule is in `src/ui/styles/map.css`, verbatim in [appendix E](E-styles.md) (section `src/ui/styles/map.css`): `.b3d-labels[data-highlight='<state>'] .b3d-label:not(.b3d-label--<state>)` → `opacity: 0.18` for each of the six states, sharing the transition with the 2D map (appendix F, F.6).

The 3D container, hint, labels and fallback:
No copy here either (one exact copy only): `.building3d`, `.building3d canvas` (`touch-action: none`, `cursor: grab`, `outline: none`; `:active` → `grabbing`; `:focus-visible` → `box-shadow: inset 0 0 0 3px var(--blue)`), `.building3d--loading`, `.building3d__hint`, `.b3d-labels`, `.b3d-label` (hover, `.is-hovered`, `:focus-visible`, `.is-selected`), `.b3d-label__dot` per state (green for free and fits, orange partly free, red taken, white on yours), `.b3d-label--fits` (green border), `.b3d-label--taken`, `.b3d-label--yours`, `.b3d-label__seats` (and `::before`), `.b3d-label__rank` (green circle), `.b3d-label__row`, `.b3d-label__owner` and `.building3d__fallback` are in `map.css`, verbatim in [appendix E](E-styles.md) (section `src/ui/styles/map.css`).

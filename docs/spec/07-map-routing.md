# 07 · Map and routing

Rebuild detail (verbatim reference code, every constant): **Appendix F** (`appendix/F-floor-plans.md`: the trace script, floor data format, routing, furniture expansion, the 2D map and its CSS) and **Appendix G** (`appendix/G-3d.md`: the 3D view). The map's other browser files (`mapZoom.ts`, `MapPanel.tsx`, `MapLegend.tsx`, `roomStates.ts`) and their tests are verbatim in **Appendix I** (`appendix/I-source.md`).

## Floor plans [Built]
`data/floors/manila-bldg-h.json` holds 2F and 3F of Bldg. H. It is **traced from the 2F and 3F layouts in the appendix of the Room Reservation Guidelines v3.0** (`"placeholder": false`). The layouts are low-resolution images, so positions and sizes are approximate, not CAD-accurate. The file has:
- the outer wall of each floor;
- every bookable room;
- every other room and area on the layouts: offices, the lift and stair core, restrooms, service rooms, amenities, open areas, and yellow rooms that are not in the tool's list;
- the furniture drawn on the layouts: workstation benches, herringbone desk bands, tables and chairs;
- an approximate corridor graph for routing.

Loaded by `src/data/floorPlans.ts` (`MANILA_BLDG_H`, cached `manilaGraph()`; its doc comment says the plans are traced from the appendix layouts by `scripts/trace-floors.py` and are approximate); the graph is built and checked by `buildGraph` in `src/domain/routing.ts`. Tests:
- `src/domain/__tests__/routing.test.ts`:
  - every map room is in `ROOMS`, on the right floor;
  - every self-bookable Manila room has a shape;
  - every placed door is reachable from both lift lobbies;
  - exactly `huddle6`, `huddle7`, `huddle8` and `intramuros` are unplaced;
  - Cape Town is under a minute from the 2F lobby;
  - 3F is reached by lift unless `avoidStairs`.
- `src/ui/__tests__/floorLayout.test.ts`: furniture expansion; both floors have an outline, lifts, stairs, restrooms and more than 150 desks.

### How it was traced: `scripts/trace-floors.py`
The JSON is generated. Do not hand-edit it for bulk changes; edit the trace and re-run:
```
python3 scripts/trace-floors.py data/floors/manila-bldg-h.json
```
- **Python 3, standard library only.** The script holds every room, area, furniture item, corridor and fixed point as a box in **layout pixels**. The pixel frames are the images embedded in the guidelines PDF: 2F is 1064 × 650, 3F is 1027 × 753.
- **Scale:**
  - 3F: the structural column grid is about 118 px ≈ 8.4 m, so **7 cm per pixel**. With 1 map unit = 5 cm, that is ×1.4.
  - 2F: drawn 1.12× smaller (its lift pairs are 410 px apart against 460 px on 3F), so ×1.568.
- **Alignment:** both floors line up at the lift core, so they stack in 3D.
  - 2F: `u = (px − 413.5) × 1.568 + 450`, `v = (py − 328) × 1.568 + 540`.
  - 3F: `u = (px − 294) × 1.4 + 450`, `v = (py − 405) × 1.4 + 540`.
- **View boxes:** 2F `[13, 148, 1420, 749]`, 3F `[64, 10, 1376, 1054]`. Each is the outline (plus the unplaced strip) with a 16-unit margin.
- **2F benches:** the 2F desk blocks are drawn with their chairs, so the script insets them by 5 px on the chair sides (`benchInset`).
- **Offices:** every office smaller than 3000 px² gets a desk and chair (`desk` item).
- **Doors and corridors:** each door, the lift lobby and the stairs are snapped to the nearest corridor segment. Crossing corridors are split at their intersections. Corridor node ids are `<floor>-c-<px>-<py>`.
- **Check:** re-running the script reproduces the committed file byte for byte (54,758 bytes, MD5 `dfd5d804b4f16de9da29ff393bc44d5e`, 26 Sep 2026). The script is in Appendix F.1, so the floor data can be rebuilt from the docs alone.
- **To replace with CAD plans:** write the same JSON shape (`FloorData` below) and keep the room ids and door node ids.

### What is on each floor
| | 2F | 3F |
|---|---|---|
| Outline | Rectangle | 8-point outline (the top wall steps in and out) |
| Bookable rooms | 16 | 15 placed + 4 unplaced |
| Areas | 62: core 1, lift 6, stairs 2, restroom 2, office 36, service 8, open 5, unlisted 2 | 47: core 1, lift 5, stairs 2, restroom 3, office 10, service 11, amenity 6, open 7, unlisted 2 |
| Furniture (expanded) | 322 desks, 13 tables, 378 chairs | 349 desks, 9 tables, 371 chairs |

**2F areas:**
- the core (lifts, stairs, restrooms);
- magenta and orange offices, drawn as small offices with a desk;
- service rooms (their labels can't be read on the layout);
- open areas: the north and south collaboration areas and three workstation zones;
- two yellow rooms that are not in the tool's list (top-left corner, and one above Sydney).

**3F areas:**
- Director's rooms 1–6, OSC, MD, HR, OM;
- Fax / copy, Admin storage, UPS, MDF, IT storage, IT room, Facility storage, Storage;
- Main reception, Clinic, Multimedia room, Nap room, Galley, Lounge;
- open areas: Recruiting area, Collab area, Game room, Workforce seats, Production 2, two workstation zones;
- MPV and Callao Cave (yellow or labelled on the layout, not in the tool's list).

**Unplaced rooms:** `huddle6`, `huddle7`, `huddle8` and `intramuros` are bookable but not on the appendix layout. They are drawn in a dashed strip under 3F, captioned "Location to confirm". They have door nodes that are not linked to corridors, and they are left out of routing tests and the 3D model (RULES open question 12).

Walking times from the 2F lift lobby on this data (1 unit = 0.05 m, 1.2 m/s, lift 40 s). They are rough, because the corridors are approximate:

| 2F | seconds | 3F | seconds |
|---|---|---|---|
| Central Park, Sao Paolo, Rio De Janeiro | 2–6 | Siargao, Camiguin | 68 |
| MPH 1, New York, MPH 2 | 16–20 | El Nido, Coron, Bacolod | 72 |
| London, Cape Town | 23 | Mt. Mayon, Mt. Apo, Lactation Room | 75–76 |
| Paris, Amsterdam | 27–31 | Binondo, Jolo, Vigan | 79–85 |
| Tokyo, Sydney | 35–38 | Batanes, Mactan | 87–90 |
| Hyde Park, Johannesburg, Denali, Snowdon | 45–56 | Tagaytay, Tanay | 91–92 |

## File format
Types in `src/domain/routing.ts`: `FloorPlan`, `FloorData`, `RoomShape`, `Area`, `AreaKind`, `FurnitureItem`, `MapNode`, `VerticalLink`. Coordinates are map units (5 cm).
```jsonc
{
  "site": "Manila",
  "building": "Bldg. H",
  "placeholder": false,           // true only for invented geometry
  "_note": "Traced from the 2F and 3F appendix layouts …",
  "unitMeters": 0.05,             // meters per map unit
  "floors": [
    {
      "floor": "2F",
      "viewBox": [13, 148, 1420, 749],
      "liftLobby": "2F-lobby",    // default start point on this floor
      "outline": [[29.0, 163.7], [1416.7, 163.7], [1416.7, 880.3], [29.0, 880.3]],
      "areas": [
        { "label": "Lifts, stairs and restrooms", "kind": "core", "x": 403.7, "y": 464.7, "w": 730.7, "h": 152.1 },
        { "label": "Lift", "kind": "lift", "x": 421.0, "y": 480.4, "w": 53.3, "h": 56.4 }
      ],
      "furniture": [
        { "t": "bench", "x": 192.1, "y": 743.8, "w": 34.5, "h": 73.7, "n": 4, "along": "y", "double": true },
        { "t": "table", "x": 425.7, "y": 191.9, "w": 37.6, "h": 25.1, "seats": 4 },
        { "t": "desk", "x": 127.6, "y": 198.2, "w": 30.2, "h": 17.2, "chair": "s" }
      ],
      "rooms": [ { "roomId": "capetown", "x": 363.0, "y": 667.0, "w": 75.3, "h": 59.6, "door": "2F-door-capetown" } ],
      "nodes": [
        { "id": "2F-lobby", "x": 828.7, "y": 616.8, "kind": "lift_lobby", "label": "lift lobby, 2F" },
        { "id": "2F-door-capetown", "x": 400.6, "y": 726.6, "kind": "door" },
        { "id": "2F-c-382-452", "x": 400.6, "y": 734.4, "kind": "corridor" }
      ],
      "edges": [ ["2F-door-capetown", "2F-c-382-452"] ]
    }
  ],
  "verticalLinks": [
    { "from": "2F-lift", "to": "3F-lift", "seconds": 40, "stairs": false },
    { "from": "2F-stairs", "to": "3F-stairs", "seconds": 50, "stairs": true }
  ]
}
```

| Field | Meaning |
|---|---|
| `outline` | Outer wall of the floor plate, clockwise |
| `areas[].kind` | `core` (the lift and stair core; drawn as the background of its parts), `lift`, `stairs`, `restroom`, `office`, `service`, `amenity`, `open` (a labelled area without walls), `unlisted` (yellow on the layout but not in the tool's room list) |
| `furniture[]` | `bench` (`n` desks in a row along `x` or `y`, back to back when `double`), `diagonal` (bands of back-to-back desks at `angle` degrees, `pitch` apart, desk length `desk`, clipped to the box), `table` (`seats` around it, `round` optional), `desk` (one desk, chair on side `n`\|`s`\|`e`\|`w`) |
| `rooms[].unplaced` | Bookable but not on the layout: drawn under the plan, no route, not in 3D |

Rules
- Node ids are unique across the building and start with the floor: `2F-door-capetown`, `2F-c-382-452`, `3F-lift`.
- Node kinds: `door`, `corridor`, `lift_lobby`, `lift`, `stairs`, `entrance`, `landmark`.
- Edges are straight walkable segments on one floor; their length comes from coordinates. Floors connect only through `verticalLinks`, which have a fixed time.
- Every placed room shape has a `door` node linked to a corridor node.
- Rooms not drawn at all (visitor offices 2F-024 to 2F-027, Iloilo) are allowed, because only self-bookable rooms need a shape.
- Rooms may later be polygons: add `"points": [[x,y], ...]` and keep `x, y, w, h` as the bounding box.

## Better plans [P2]
1. Get CAD exports of 2F and 3F from Facilities (the appendix images are too small to be exact).
2. Replace the pixel boxes in `scripts/trace-floors.py` (or write the JSON another way) with one unit = 5 cm, keeping room ids and door ids.
3. Draw real corridors: nodes at every junction and in front of every door. The map editor (S5) makes this faster.
4. Place the four unplaced rooms once Admin says where they are (RULES open question 12).
5. Run `npm test`; fix any unreachable room.
6. Walk three routes on site with a phone timer and adjust `unitMeters` or the lift time if estimates are off by more than 20%.

## Routing [Built]
`shortestRoute(graph, fromNodeId, toNodeId, { avoidStairs })` is A*:
- **Edge cost:** walking time = length × `unitMeters` ÷ 1.2 m/s. Vertical links cost their fixed `seconds`.
- **Heuristic:** straight-line walking time to the goal on the same floor, 0 on other floors (never overestimates).
- **`avoidStairs: true`:** skips links with `stairs: true` (for accessibility or a user setting).
- **Returns** `{ nodeIds, seconds, meters, floors, usesStairs }`, or `null` when unreachable.

**Start point:** the user's saved start node [P3 user settings]; otherwise the lift lobby of their floor; otherwise `2F-lobby`.

**Walking time in ranking [P2]:** `rankRooms(rooms, req, (roomId) => walkSeconds)`. Ranking subtracts up to 30 points (seconds ÷ 10).

The corridor graph is invisible: the 2D map no longer draws corridor lines.

## Directions text [P2]
Turn a route into 2–4 short steps:
1. Split the route at floor changes: "Take the lift to 3F."
2. Merge consecutive corridor segments with the same direction (bearing within 30°).
3. At each change of direction, say "Turn left" or "Turn right" (signed angle between segments; more than 30° counts as a turn), and name the corridor ("into the south corridor") when it has a label.
4. Last step: the door's position among the doors on the same side of the final corridor, like "Cape Town is the second door on your left, after New York."
5. Keep landmarks (lift lobby, pantry, reception) when a `landmark` node is within 3 m of a turn.

Tests: exact step text for Cape Town and Batanes, written once real corridors exist.

## 2D rendering [Built] (`src/ui/FloorMap.tsx`)
The SVG (`class="floormap"`, `role="group"`, `aria-label="Floor map, <floor>, Bldg. H"`) uses the floor's `viewBox`. Text scales with the plan: `k = viewBox width ÷ 940`, so labels look the same size as on the first 940-unit plan. A `<pattern id="hatch">` (8 × 8, 45°, `--taken` with `#b9c1bd` lines) fills taken rooms. The legend's highlighted state is set as `data-highlight` on the SVG; CSS fades rooms in other states to 18% opacity (06 Legend). Exact code, sizes and CSS: Appendix F.5–F.6.

Layers, bottom to top:
1. **Floor plate:** the `outline` polygon (fill `#f7f7f4`, 4-unit dark wall stroke).
2. **`AreaShapes`:** a rectangle per area except `open`, filled by kind:
   - core: `--plate-dark`;
   - restroom: light blue;
   - amenity: light green;
   - unlisted: pale yellow with a dashed border;
   - plus plan symbols: an ✕ in each lift car, treads every 8 units across the stairs.
3. **Furniture:** from `floorFurniture()` (`src/ui/floorLayout.ts`), as three paths: desks (white, grey outline), tables (rectangles or circles), chairs (grey circles, r 4.2).
4. **`AreaLabels`:** area names above the furniture, with a halo.
   - Size: 10 → 6 (× k); open areas 12 → 6 in spaced capitals, fitted to 72% of the width.
   - No labels on the core or lift cars.
5. **Unplaced caption:** "Location to confirm" (11 × k), 8 × k above the strip's top-left corner.
6. **Bookable rooms**, in reading order (top to bottom, then left to right). Each has:
   - the shape with its state fill (green free and fits, orange partly free, red hatch for taken via the SVG `<pattern id="hatch">`: 8 × 8, 45°, `--red-tint` with a 3-unit `--red-hatch` line; blue yours; grey not suitable); unplaced rooms have a dashed border;
   - a faint table and chairs from `roomFurniture()` (the same layout as 3D; in the ink colour, white on "yours");
   - the name label and the second line;
   - the state icon (a green dot for free and fits, a half clock for partly free, a white check for yours; 14 units in from the top-left) and the green rank badge (the badge is scaled by k in a wrapper `<g>`, so its pop animation keeps its position);
   - the focus ring.
7. **"You" marker** at the floor's `liftLobby` node, scaled by k: a dot with a halo and the word "You"; `aria-label` "You are here: <the node's label, or 'lift lobby'>".

Room labels:
- **Name:** Barlow Condensed 700 at the largest size from 17 down to 7 (× k) that fits on one or two lines (≈ 0.47 em per character, 8 × k padding).
  - If it still doesn't fit, the first word alone from 12 down to 4 (× k); "Lactation Room" shows as "Lactation".
  - A 4 px halo in the room's fill colour.
- **Second line:** the holder at the selected time (`reservedBy`) or "seats N". 13 × k, shrinking to fit, hidden below 9 × k; shown only when the room is at least 50 × k tall.
- States, icons and badges: 06 Room states.

Sizing:
- The SVG scales to the panel width (`max-height: calc(100dvh - 428px)`). On phones it fits the width too (no minimum width, no sideways scroll; `max-height: none`).

## 2D zoom, pan and turn [Built] (`src/ui/mapZoom.ts`, `FloorMap.tsx`)
The whole floor (the floor's view box `box = [x, y, w, h]`) is zoom 1. A view `{ zoom, cx, cy, angle }` is a zoom factor, the centre of what is shown and the plan's clockwise quarter turn (0, 90, 180 or 270). The plan turns around the box centre (the floor layer gets `transform="rotate(angle cx cy)"`); `cx, cy` are in the turned, on-screen frame. The window at zoom 1 (the *frame*) keeps the floor's own shape, so the map keeps its size on screen: `[w, h]` at 0° and 180°, and `[w·s, h·s]` with `s = max(w/h, h/w)` at 90° and 270°, just big enough for the turned floor. The SVG's `viewBox` is `viewBoxOf(view, box)` = `[cx − fw/zoom/2, cy − fh/zoom/2, fw/zoom, fh/zoom]`. The maths is pure and tested (`src/ui/__tests__/mapZoom.test.ts`):
- `MIN_ZOOM` 1, `MAX_ZOOM` 5, `ZOOM_STEP` 1.5 (one button press or key), `TURN_STEP` 90.
- `rotatedBox(box, angle)`: the box a rectangle fills once turned around its centre (width and height swap on a quarter turn).
- `fitView(box, angle = 0)`: zoom 1 at the box centre.
- `clampView(v, box)`: zoom kept in 1–5; on each axis a window wider than the turned floor stays centred on it, a smaller one stays inside it.
- `zoomAt(v, factor, px, py, box)`: zoom by `factor` keeping the map point (px, py) at the same place on screen (the pointer or the pinch centre), then clamp.
- `panBy(v, dx, dy, box)`: move by (dx, dy) map units (dragging right shows what is to the left), then clamp.
- `turnView(v, dir, box)`: a quarter turn clockwise (`dir` 1) or anticlockwise (−1): the centre turns with the plan around the box centre (clockwise takes the offset (dx, dy) to (−dy, dx), since SVG y points down), the zoom stays, then clamp. Four turns give back the same view.
- `turnTransform(v, box)`: the floor layer's `rotate(…)` transform, or none at 0°.

Text stays upright: `upright(x, y, w, h, angle)` in `FloorMap.tsx` gives the rectangle as it looks on screen (`rotatedBox`) and the counter-turn `rotate(−angle cx cy)` around its centre. Room names, the second line, the state icon and the rank badge are drawn in that counter-turned group and fitted to the on-screen width and height; area names likewise; the "You" marker is `translate(x y) rotate(−angle) scale(k)`; "Location to confirm" sits above the unplaced rooms' on-screen box.

How `FloorMap` uses it:
- The view starts at `fitView`; when the floor changes it goes back to the whole floor and keeps its turn (`fitView(box, angle)`).
- **Wheel** (a non-passive listener on the SVG): zooms at the pointer by `exp(−deltaY × 0.0015)`; when scrolling down at zoom 1 it does nothing, so the page scrolls.
- **Drag** (pointer events): under 5 px of movement a press stays a click. At zoom 1 there is nothing to pan. Once zoomed, the first move past 5 px calls `setPointerCapture`, and every move pans by the pointer's movement divided by the screen scale (`getScreenCTM()` a and d). After a drag the next click is swallowed (`onClickCapture` stops it), so a drag never opens a room.
- **Pinch** (two active pointers): zooms by the change in their distance around their midpoint; it also counts as a drag.
- **Keys** (on the wrapper `.floormap-wrap`; nothing happens with Ctrl, ⌘ or Alt held): `r` turn right, `R` (Shift) turn left, `+` or `=` zoom in, `-` or `_` zoom out (by `ZOOM_STEP`, around the view centre), `0` whole floor with no turn; the arrow keys pan by an eighth of the current window, only when zoomed.
- **Buttons** `.map-zoom` (top right): Zoom in (+), Zoom out (−), Turn left (Shift+R), Turn right (R), Fit the whole floor (0: 1× and no turn), disabled at the limits (06, 2D floor map).
- **Cursor and touch:** `.floormap.is-zoomed` shows `grab` (`grabbing` while pressed); `touch-action` is `pan-x pan-y` at zoom 1 (one finger scrolls the page, two fingers reach the map) and `none` when zoomed.

Later work:
- Route drawing [P2]: one `<path>` per floor from the route points, drawn by animating `stroke-dashoffset` over 1.2 s. On a floor change, pause at the lift, cross-fade the floors, then continue.

## 3D model [Built] (`src/ui/building3d/`)
Built from the same floor data, so better plans improve 2D and 3D together.

| Constant | Value | Meaning |
|---|---|---|
| `S` | 0.01 | World units per map unit (1 map unit = 5 cm, so 1 world unit = 5 m) |
| `CX`, `CZ` | Centre of the union of all floors' view boxes | The model sits around the origin |
| `VIEW` | (largest side of that union × `S`) ÷ 9.4 ≈ 1.52 | Scales the camera distance, fog, shadow box, sun position and ground to the traced plan (the scene was first tuned for a 940-unit plan) |
| `SLAB_T` | 0.07 | Slab thickness (35 cm) |
| `CAP_H` | 0.008 | Glowing strip on top of room walls (state colour) |
| `TABLE_H` | 0.146 | Table and desk height (73 cm) |
| `WALL_H` | 0.32 | Section cut at 1.6 m, so interiors stay visible |
| `FLOOR_GAP` | 1.15 | Vertical gap between stacked floors (exploded view) |
| `SPREAD` | 2.2 | Extra lift for floors above the active one |
| `WALL_T` | 3 map units | 15 cm partitions |
| `DOOR_W` | 18 map units | 90 cm door opening, centred on the room's `door` node (clamped inside the wall) |

Layout helpers (pure, tested):
- `layout.ts` (tests in `layout3d.test.ts`):
  - `doorSide(room, door)`: the room edge nearest the door node.
  - `roomWalls(room, door)`: four walls inside the outline; the door side is glass, split around the opening.
  - `roomFurniture(room, door, kind, capacity, av)`:
    - meeting, collaboration and huddle rooms: one table along the long side, chairs on both long sides then the ends, up to `min(capacity ?? 4, 14)`;
    - training rooms: rows of desks facing the wall opposite the door, up to 30;
    - halls: rows of chairs facing a stage, up to 60;
    - lactation room: at most 2 seats and no screen;
    - a screen on the far wall for VC/BYOD rooms, training rooms and halls;
    - never more seats than the capacity.
- `floorLayout.ts`: `floorFurniture(items)` expands `bench`, `diagonal`, `table` and `desk` items into desks (centre, size, angle), tables and chairs (position and facing). `corners(piece)` gives a rotated desk's corners. Diagonal bands keep every desk and chair inside their box.

Scene parts (`Scene.tsx`):
- **`Shell`:**
  - the outline extruded into the slab;
  - a tiled polished-concrete floor (`ShapeGeometry` with UVs across the view box, texture sized to the view box in `textures.ts`);
  - columns every 165 units (≈ 8.4 m) along each outline edge, just inside the facade;
  - a curtain wall (glass pane plus mullions every 30 units) per outline edge, shown only when the edge's outward normal faces away from the camera.
- **`AreaModels`:**
  - a floor tint per kind (office, service, restroom, amenity, unlisted; the core uses the slab colour);
  - drywall walls for offices, service rooms, amenities and unlisted rooms;
  - concrete walls (0.04 world units, 20 cm, taller) for lifts, stairs and restrooms;
  - dark section-cut tops;
  - a metal car in each lift;
  - steps rising 7 units apart in each stair;
  - open areas and the core outline have no walls.
- **`FloorFurnitureModel`:** instanced desks (a top on a modesty panel, scaled per instance), round tables (discs) and office chairs. Hidden on faded floors.
- **Rooms:** as in 06, drywall and glass, carpet, furniture, state colours, seated figures. Unplaced rooms are not built.
- **Start view (`CameraRig`, P1-37):** from the tuned start (2.6, 6.9, 7.1) × VIEW the camera moves out along the same direction to `max(tuned distance × START_OUT, (PLAN.size × S ÷ 2) × FIT_MARGIN ÷ (tan(fov ÷ 2) × aspect))`, capped at `maxDistance` (25 × VIEW), with `START_OUT` = `FIT_MARGIN` = 1.15 and `aspect` = the canvas's width ÷ height when the controls are made: 15% farther than before, and the floor's width plus 15% always fits across the canvas (the user found the old start "super large" on narrower windows). The fog runs from 26 to 50 × VIEW (was 18 → 38) so the farther start stays clear. This fitted view is the one the compass returns to.
- **Controls (`CameraRig`):** turn all the way round (P1-35). Left drag turns the building 360° around the point the camera looks at and tilts it (polar angle 0.05 → 1.42: from straight down to just above eye level); right drag or Shift/Ctrl/⌘ + left drag pans along the floor (`screenSpacePanning = false`); the wheel or middle button zooms. Touch: one finger turns, two fingers pan and zoom. The canvas is focusable (`tabIndex = 0`) and pans with the arrow keys (`keyPanSpeed` 20). The target stays within ±`PLAN.size × S ÷ 2` of the centre, and the camera moves with it. Cursor `grab`/`grabbing`, `pointer` over a room. Hint: "Drag to turn 360° · Shift- or right-drag to move · scroll to zoom". **360° button and S**: `shared.spin(on)` keeps the camera circling the target at `SPIN_RATE` (one turn in 24 s, `dt` capped at 0.1 s) until pressed again, a drag starts (OrbitControls `start`), a turn button or a reset; `shared.onSpin` tells the button. **Compass button and 0**: `shared.resetView()` glides the camera back to the starting view (the spherical offset and the target's x/z saved when the controls were made; rate 6, the heading the short way round); the needle (`shared.compass`) is rotated by the camera's azimuth every frame, so it points to the top of the 2D plan. **Turn buttons and R / Shift+R**: `shared.turn(dir)` (set by `CameraRig`) adds `dir × π/4` to the angle still to turn; each frame turns the camera around the target's vertical axis by `damp(0, remaining, 6, dt)` (all of it with reduced motion, or once under 0.001 rad) and invalidates, so a positive angle circles the camera anticlockwise and the building appears to turn clockwise seen from above.
- **Draw calls:** geometry is merged per room and material; chairs, people and floor furniture are instanced.

Everything else (materials, lights, camera, ambient occlusion, animations, labels, loading and fallback, with the reference code): Appendix G.

## Map editor (S5) [P2]
An Admin-only page:
- load a floor;
- drag room rectangles;
- click to add nodes, and drag between nodes to add edges;
- pick a room id from a list;
- validate (reachability, unknown ids);
- download the JSON.

No database is needed: the JSON goes into the repo through a pull request.

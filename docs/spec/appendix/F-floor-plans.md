# Appendix F · Floor plans, routing and the 2D map (blueprint)

Everything needed to rebuild the floor data, the walking graph and the 2D SVG map **without the codebase**. The prose says what each part does; the verbatim listings are the reference implementation (copy them as they are). Summary and rules: 07 (Map and routing). States, colours and room-sheet behaviour: 06. The 3D view: Appendix G.

Files this appendix recreates:

| File | How |
|---|---|
| `scripts/trace-floors.py` | F.1, verbatim |
| `data/floors/manila-bldg-h.json` | Generated: `python3 scripts/trace-floors.py data/floors/manila-bldg-h.json` |
| `src/domain/routing.ts` | F.2, verbatim (types, `buildGraph`, `shortestRoute`) |
| `src/data/floorPlans.ts` | F.3, verbatim |
| `src/ui/floorLayout.ts` | F.4, verbatim |
| `src/ui/FloorMap.tsx` | F.5, verbatim |
| `src/ui/styles/map.css` (map parts) | F.6: which rules, with a pointer to the exact copy in appendix E |

Dependencies the listings import from elsewhere: `RoomView` (`src/ui/api.ts`, the `/api/rooms` view: `id, name, toolName, site, building, floor, kind, av, capacity, selfBookable`), `roomFurniture` and `Seat` (`src/ui/building3d/layout.ts`, Appendix G.8), `fmtSpan` (`src/ui/format.ts`: "3:00–4:00 PM" style, Asia/Manila), `reservedBy`, `STATE_WORDS`, `RoomState`, `RoomStatus` (`src/ui/roomStates.ts`, 06 Room states), and `fitView`, `MAX_ZOOM`, `panBy`, `viewBoxOf`, `zoomAt`, `ZOOM_STEP`, `Box`, `View` (`src/ui/mapZoom.ts`: pure zoom maths, 07 2D zoom and pan; verbatim in [appendix I](I-source.md) with its test `src/ui/__tests__/mapZoom.test.ts`). `tsconfig` needs `"resolveJsonModule": true` for the JSON import.

## F.1 Floor data: `scripts/trace-floors.py`
- A hand trace of the 2F and 3F layouts in the appendix of the *Room Reservation Guidelines* v3.0. Python 3, **standard library only**. It is the source of truth for the floor data: the JSON is generated from it.
- **Byte-for-byte check:** running it writes `data/floors/manila-bldg-h.json` of **54,758 bytes, MD5 `dfd5d804b4f16de9da29ff393bc44d5e`** (checked 26 Sep 2026 with `python3 scripts/trace-floors.py /tmp/x.json && cmp /tmp/x.json data/floors/manila-bldg-h.json`). It prints one line per floor:
  ```
  2F viewBox [13, 148, 1420, 749] rooms 16 areas 62 furniture 95 nodes 49 edges 52
  3F viewBox [64, 10, 1376, 1054] rooms 19 areas 47 furniture 40 nodes 56 edges 55
  ```
- **Coordinates** in the script are pixels of the layout images as embedded in the PDF (2F 1064 × 650, 3F 1027 × 753). `T[floor]` maps them to map units (1 unit = 5 cm): 3F `u = (px − 294) × 1.4 + 450`, `v = (py − 405) × 1.4 + 540`; 2F `u = (px − 413.5) × 1.568 + 450`, `v = (py − 328) × 1.568 + 540`. Both floors meet at the lift core. Values are rounded to 0.1 (`round(v, 1)`).
- **What `build()` does per floor:**
  1. Rooms: each `(id, (x, y, w, h), door)` becomes a `RoomShape` plus a `door` node `<F>-door-<id>`; the door is snapped to the corridor.
  2. Unplaced rooms (3F only: `huddle6`, `huddle7`, `huddle8`, `intramuros`): a shape with `"unplaced": true` in the strip under the plan and a door node at the top middle, **not** linked to a corridor.
  3. Fixed points: `<F>-lobby` (`lift_lobby`, with the label "lift lobby, 2F" / "lift lobby, 3F"), `<F>-lift` and `<F>-stairs`. The lobby and stairs are snapped to the corridor; the lift links only to the lobby.
  4. Corridors: axis-aligned segments. Every crossing of a horizontal and a vertical segment becomes a shared point; every snapped point (the projection of a door, the lobby or the stairs onto the nearest segment) is added to its segment. Points on each segment are sorted along it, become `corridor` nodes `<F>-c-<px>-<py>` (pixel coordinates, rounded), and consecutive points become edges. Each snapped item gets an edge to its projection.
  5. Areas: `{label, kind, x, y, w, h}` in the order listed (the core first, so it draws under its parts).
  6. Furniture: `bench` (2F benches are inset by `benchInset` = 5 px on the chair sides, because the 2F blocks include their chairs), `diagonal` (`pitch` and `desk` scaled like lengths), `table` (`round` only when true). Then every `office` area smaller than 3000 px² gets a `desk` item: width 55% of the office, depth max(5 px, 22%), 30% down from the top, chair on side `s`.
  7. `viewBox` = the outline and every room box (the unplaced strip included), with a 16-unit margin: `[round(minX − 16), round(minY − 16), round(maxX − minX + 32), round(maxY − minY + 32)]`.
- **Top level:** `site` "Manila", `building` "Bldg. H", `placeholder` false, `_note`, `unitMeters` 0.05, `floors` [2F, 3F], `verticalLinks` lift 40 s (`stairs: false`) and stairs 50 s (`stairs: true`). Written with `json.dump(plan, fh, indent=1)` plus a final newline.

<!-- verbatim: scripts/trace-floors.py -->
```python
"""
Writes data/floors/manila-bldg-h.json from a hand trace of the 2F and 3F layouts in the appendix of the
Room Reservation Guidelines v3.0 (docs/spec/07-map-routing.md, Floor plans). Python 3 standard library only.

    python3 scripts/trace-floors.py data/floors/manila-bldg-h.json

Coordinates below are pixels of the layout images as embedded in the guidelines PDF (2F 1064x650, 3F 1027x753).
They are scaled to map units (1 unit = 5 cm) so both floors line up at the lift core: the 3F structural grid is
~118 px = ~8.4 m, so 7 cm per pixel; the 2F drawing is 1.12x smaller. To move a room, edit its pixel box here
and re-run; to replace the trace with CAD plans, write the same JSON shape (src/domain/routing.ts FloorData).
"""
import json, math, sys

OUT = sys.argv[1]

# ---------- transforms (px -> map units) ----------
K3 = 1.4             # 3F: 7 cm per px / 5 cm per unit
K2 = 1.4 * 1.12      # 2F layout is drawn 1.12x smaller (lift pairs 410 px apart vs 460 px on 3F)
T = {
    '2F': lambda x, y: ((x - 413.5) * K2 + 450, (y - 328) * K2 + 540),
    '3F': lambda x, y: ((x - 294) * K3 + 450, (y - 405) * K3 + 540),
}
K = {'2F': K2, '3F': K3}

def r1(v):
    return round(v, 1)

def rect(f, x, y, w, h):
    X, Y = T[f](x, y)
    return {'x': r1(X), 'y': r1(Y), 'w': r1(w * K[f]), 'h': r1(h * K[f])}

def pt(f, x, y):
    X, Y = T[f](x, y)
    return [r1(X), r1(Y)]

# ---------- 2F ----------
F2 = {
    'outline': [(145, 88), (1030, 88), (1030, 545), (145, 545)],
    'rooms': [
        ('johannesburg', (265, 94, 61, 48), (295, 142)),
        ('snowdon', (384, 170, 105, 105), (436, 170)),
        ('denali', (489, 170, 88, 105), (533, 170)),
        ('hydepark', (581, 187, 91, 31), (626, 187)),
        ('sydney', (171, 216, 51, 35), (222, 233)),
        ('tokyo', (171, 252, 51, 35), (222, 270)),
        ('london', (273, 287, 86, 84), (316, 371)),
        ('amsterdam', (240, 409, 49, 38), (264, 447)),
        ('paris', (290, 409, 68, 38), (324, 447)),
        ('capetown', (358, 409, 48, 38), (382, 447)),
        ('newyork', (407, 383, 84, 63), (449, 446)),
        ('saopaolo', (581, 383, 54, 37), (608, 383)),
        ('centralpark', (635, 383, 77, 37), (673, 383)),
        ('rio', (713, 383, 53, 37), (739, 383)),
        ('mph1', (870, 292, 155, 103), (870, 343)),
        ('mph2', (870, 397, 155, 143), (870, 470)),
    ],
    'areas': [
        # core first (background), then its parts
        ('Lifts, stairs and restrooms', 'core', (384, 280, 466, 97)),
        ('Lift', 'lift', (395, 290, 34, 36)), ('Lift', 'lift', (395, 329, 34, 36)),
        ('Stairs', 'stairs', (440, 288, 58, 80)),
        ('Restroom', 'restroom', (515, 288, 100, 38)), ('Restroom', 'restroom', (515, 330, 100, 38)),
        ('Lift', 'lift', (622, 310, 27, 25)), ('Lift', 'lift', (622, 338, 27, 25)),
        ('Stairs', 'stairs', (697, 288, 62, 80)),
        ('Lift', 'lift', (800, 290, 48, 36)), ('Lift', 'lift', (800, 330, 48, 36)),
        # yellow on the layout but not in the tool's room list
        ('Meeting room (not in the tool list)', 'unlisted', (151, 94, 47, 51)),
        ('Meeting room (not in the tool list)', 'unlisted', (171, 187, 51, 28)),
        # offices (magenta and orange on the layout) and other rooms
        ('Office', 'office', (200, 95, 35, 50)),
        ('Room', 'office', (150, 150, 85, 40)),
        ('Room', 'office', (300, 168, 60, 75)),
        ('Office', 'office', (240, 157, 28, 25)), ('Office', 'office', (269, 157, 28, 25)),
        ('Office', 'office', (240, 182, 28, 25)), ('Office', 'office', (269, 182, 28, 25)),
        ('Office', 'office', (240, 224, 26, 24)), ('Office', 'office', (240, 250, 27, 23)), ('Office', 'office', (269, 250, 29, 23)),
        ('Office', 'office', (238, 290, 32, 19)), ('Office', 'office', (238, 309, 32, 19)), ('Office', 'office', (238, 328, 32, 20)),
        *[('Office', 'office', (x, 384, w, 24)) for x, w in [(240, 27), (268, 28), (297, 27), (325, 27), (353, 26), (380, 26)]],
        *[('Office', 'office', (x, 420, 29, 26)) for x in [582, 613, 644, 675, 706, 736]],
        *[('Office', 'office', (x, y, 27, 30)) for y in [384, 415] for x in [768, 796, 824]],
        *[('Office', 'office', (x, 104, w, 24)) for x, w in [(862, 32), (896, 35), (933, 37), (973, 29)]],
        ('Office', 'office', (655, 238, 45, 18)),
        # service rooms (labels not legible on the layout)
        ('Service room', 'service', (300, 247, 40, 23)), ('Service room', 'service', (343, 247, 40, 23)),
        ('Service room', 'service', (360, 297, 24, 48)),
        ('Service room', 'service', (738, 95, 52, 35)), ('Service room', 'service', (790, 95, 62, 50)),
        ('Service room', 'service', (745, 168, 55, 33)), ('Service room', 'service', (812, 168, 52, 38)),
        ('Service room', 'service', (858, 245, 30, 40)),
        # open areas
        ('Collaboration area', 'open', (390, 96, 395, 52)),
        ('Collaboration area', 'open', (495, 381, 80, 64)),
        ('Workstations', 'open', (160, 290, 70, 225)),
        ('Workstations', 'open', (240, 453, 600, 70)),
        ('Workstations', 'open', (895, 140, 130, 150)),
    ],
    'furniture': [
        # bottom workstation row: 2 x 4 desk blocks
        *[('bench', (x, 458, 32, 47), 4, 'y', True) for x in [244, 284, 324, 364, 404, 443, 483, 523, 563, 603, 642, 682, 721, 761, 801]],
        *[('bench', (x, 508, 32, 12), 2, 'x', False) for x in [394, 498, 603, 707]],
        ('bench', (284, 521, 96, 13), 6, 'x', False),
        # west column
        *[('bench', (172, y, 47, 23), 3, 'x', True) for y in [292, 320, 349, 378, 406, 435, 464]],
        ('bench', (171, 492, 49, 17), 3, 'x', False),
        ('bench', (237, 96, 16, 47), 3, 'y', False),
        # north-east blocks
        *[('bench', (x, y, w, h), n, 'x', h > 15) for (x, w, n) in [(903, 49, 3), (963, 66, 4)] for (y, h) in [(144, 11), (160, 24), (188, 24), (220, 24), (249, 23), (277, 11)]],
        ('bench', (731, 191, 32, 34), 3, 'y', True), ('bench', (775, 191, 31, 34), 3, 'y', True),
        ('bench', (816, 191, 27, 34), 3, 'y', True), ('bench', (858, 191, 15, 34), 3, 'y', False),
        ('bench', (740, 238, 16, 34), 3, 'y', False), ('bench', (766, 238, 30, 34), 3, 'y', True),
        ('bench', (808, 238, 30, 34), 3, 'y', True),
        # collaboration tables along the north wall and in the south lounge
        *[('table', (x, 106, 24, 16), 4, False) for x in [398, 440, 482, 524, 604, 646, 688, 730]],
        ('table', (523, 390, 22, 20), 4, True), ('table', (523, 418, 22, 20), 4, True),
        # rooms not in the tool list
        ('table', (160, 106, 28, 28), 8, False), ('table', (182, 193, 28, 14), 4, False),
        ('table', (175, 163, 32, 14), 4, False),
    ],
    # corridors (invisible walking graph) and fixed points
    'corridors': [
        [(150, 162), (865, 162)], [(230, 162), (230, 452)], [(230, 377), (865, 377)], [(160, 452), (865, 452)],
        [(865, 162), (865, 540)], [(160, 162), (160, 452)], [(578, 377), (578, 452)],
    ],
    'points': {'lobby': (655, 377), 'lift': (640, 368), 'stairs': (727, 372)},
    'lobbyLabel': 'lift lobby, 2F',
    'benchInset': 5,
    'unplaced': [],
}

# ---------- 3F ----------
F3 = {
    'outline': [(30, 38), (258, 38), (258, 75), (700, 75), (700, 50), (990, 50), (990, 705), (30, 705)],
    'rooms': [
        ('batanes', (31, 40, 63, 71), (80, 111)),
        ('jolo', (148, 58, 42, 54), (169, 112)),
        ('tagaytay', (479, 79, 69, 31), (513, 110)),
        ('tanay', (560, 79, 65, 30), (592, 110)),
        ('mactan', (471, 119, 119, 81), (530, 200)),
        ('vigan', (594, 111, 71, 77), (628, 188)),
        ('binondo', (688, 151, 48, 49), (712, 200)),
        ('lactation-3f', (760, 222, 30, 48), (775, 222)),
        ('siargao', (180, 469, 54, 50), (207, 519)),
        ('elnido', (287, 468, 130, 77), (400, 545)),
        ('coron', (647, 490, 86, 65), (690, 555)),
        ('camiguin', (735, 525, 47, 31), (758, 556)),
        ('mtmayon', (380, 587, 176, 118), (468, 587)),
        ('mtapo', (557, 587, 177, 118), (645, 587)),
        ('bacolod', (327, 655, 51, 50), (327, 680)),
    ],
    # bookable rooms that are not on the appendix layout: drawn in a strip under the plan
    'unplaced': [
        ('huddle6', (40, 728, 62, 40)), ('huddle7', (110, 728, 62, 40)), ('huddle8', (180, 728, 62, 40)), ('intramuros', (250, 728, 80, 40)),
    ],
    'areas': [
        ('Lifts, stairs and restrooms', 'core', (258, 345, 532, 120)),
        ('Lift', 'lift', (275, 357, 38, 46)), ('Lift', 'lift', (275, 407, 38, 46)),
        ('Stairs', 'stairs', (318, 348, 72, 114)),
        ('Restroom (F)', 'restroom', (410, 347, 90, 53)), ('Restroom (M)', 'restroom', (410, 405, 90, 57)),
        ('Accessible restroom', 'restroom', (520, 347, 45, 22)),
        ('Lift', 'lift', (520, 380, 45, 82)),
        ('Stairs', 'stairs', (612, 348, 70, 114)),
        ('Service room', 'service', (682, 350, 48, 112)),
        ('Lift', 'lift', (734, 357, 40, 46)), ('Lift', 'lift', (734, 407, 40, 46)),
        # offices
        ("Director's room 1", 'office', (94, 40, 50, 70)),
        ("Director's room 2", 'office', (420, 110, 50, 90)),
        ("Director's room 3", 'office', (688, 100, 48, 50)),
        ("Director's room 4", 'office', (453, 510, 38, 47)),
        ("Director's room 5", 'office', (491, 510, 38, 47)),
        ("Director's room 6", 'office', (529, 510, 39, 47)),
        ('OSC', 'office', (265, 72, 125, 40)),
        ('MD', 'office', (735, 222, 25, 28)),
        ('HR', 'office', (333, 585, 45, 65)),
        ('OM', 'office', (895, 58, 40, 37)),
        # service
        ('Fax / copy', 'service', (265, 112, 35, 20)),
        ('Admin storage', 'service', (335, 230, 60, 30)),
        ('UPS', 'service', (440, 225, 60, 105)),
        ('MDF', 'service', (330, 262, 110, 68)),
        ('IT storage', 'service', (290, 295, 38, 40)),
        ('IT room', 'service', (615, 270, 175, 72)),
        ('Facility storage', 'service', (399, 532, 47, 25)),
        ('Service room', 'service', (685, 40, 50, 60)),
        ('Service room', 'service', (733, 592, 57, 110)),
        ('Storage', 'service', (965, 440, 25, 30)),
        # amenities
        ('Main reception', 'amenity', (500, 215, 100, 125)),
        ('Clinic', 'amenity', (675, 218, 60, 52)),
        ('Multimedia room', 'amenity', (809, 487, 63, 62)),
        ('Nap room', 'amenity', (809, 549, 63, 65)),
        ('Galley', 'amenity', (872, 520, 77, 30)),
        ('Lounge', 'amenity', (872, 550, 77, 32)),
        # open areas
        ('Recruiting area', 'open', (570, 478, 75, 82)),
        ('Collab area', 'open', (177, 520, 60, 45)),
        ('Game room', 'open', (790, 585, 140, 118)),
        ('Workforce seats', 'open', (930, 610, 58, 92)),
        ('Production 2', 'open', (745, 58, 215, 410)),
        ('Workstations', 'open', (35, 118, 222, 330)),
        ('Workstations', 'open', (35, 470, 280, 230)),
        # yellow on the layout but not in the tool's room list
        ('MPV (not in the tool list)', 'unlisted', (417, 468, 83, 62)),
        ('Callao Cave (not in the tool list)', 'unlisted', (735, 487, 47, 38)),
    ],
    'furniture': [
        # herringbone L-desk bands (drawn at an angle on the layout)
        ('diagonal', (35, 120, 105, 185), 32, 52, 21),
        ('diagonal', (150, 122, 105, 180), -32, 52, 21),
        ('diagonal', (265, 135, 140, 120), -32, 52, 21),
        ('diagonal', (745, 100, 215, 110), 35, 52, 21),
        ('diagonal', (745, 58, 145, 42), 35, 52, 21),
        ('diagonal', (805, 212, 155, 256), 35, 52, 21),
        # bench rows
        *[('bench', (38, y, 84, 22), 5, 'x', True) for y in [318, 368, 418]],
        ('bench', (152, 368, 70, 22), 4, 'x', True), ('bench', (152, 418, 103, 22), 6, 'x', True),
        *[('bench', (cx - 8, 478, 16, 80), 5, 'y', True) for cx in [47, 93, 145]],
        *[('bench', (cx - 8, 592, 16, 98), 6, 'y', True) for cx in [47, 90, 140, 190, 237, 290]],
        ('bench', (630, 283, 150, 40), 7, 'x', True),
        ('bench', (270, 90, 115, 14), 6, 'x', False),
        ('bench', (935, 625, 20, 75), 5, 'y', True),
        ('bench', (345, 592, 10, 52), 4, 'y', False),
        # tables
        ('table', (195, 530, 24, 24), 4, True),
        ('table', (592, 500, 30, 16), 4, False),
        ('table', (826, 502, 30, 20), 4, False),
        ('table', (889, 559, 22, 14), 2, False),
        ('table', (805, 652, 48, 24), 0, False),
        ('table', (872, 640, 30, 40), 0, False),
        ('table', (440, 482, 40, 18), 6, False),
        ('table', (748, 495, 20, 16), 2, False),
        ('table', (520, 268, 44, 14), 0, False),
    ],
    'corridors': [
        [(35, 118), (965, 118)], [(420, 118), (420, 208)], [(420, 208), (800, 208)],
        [(262, 118), (262, 572)], [(262, 340), (800, 340)], [(262, 466), (800, 466)],
        [(150, 572), (965, 572)], [(800, 118), (800, 572)], [(318, 572), (318, 700)],
    ],
    'points': {'lobby': (505, 466), 'lift': (505, 458), 'stairs': (647, 466)},
    'lobbyLabel': 'lift lobby, 3F',
}

def build(fid, F):
    rooms, nodes, edges = [], {}, []

    def node(nid, kind, p, label=None):
        X, Y = pt(fid, *p)
        n = {'id': nid, 'x': X, 'y': Y, 'kind': kind}
        if label:
            n['label'] = label
        nodes[nid] = n
        return nid

    # corridor segments with the points that must sit on them
    segs = [(a, b) for a, b in F['corridors']]
    on = [[a, b] for a, b in segs]

    def project(p):
        best = None
        for i, (a, b) in enumerate(segs):
            ax, ay = a; bx, by = b; px, py = p
            dx, dy = bx - ax, by - ay
            t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
            q = (ax + t * dx, ay + t * dy)
            d = math.hypot(px - q[0], py - q[1])
            if best is None or d < best[0]:
                best = (d, i, (round(q[0]), round(q[1])))
        return best[1], best[2]

    # intersections between segments (axis-aligned only)
    for i, (a, b) in enumerate(segs):
        for j, (c, d) in enumerate(segs):
            if j <= i:
                continue
            h1 = a[1] == b[1]; h2 = c[1] == d[1]
            if h1 == h2:
                continue
            (hs, vs) = ((a, b), (c, d)) if h1 else ((c, d), (a, b))
            y = hs[0][1]; x = vs[0][0]
            if min(hs[0][0], hs[1][0]) <= x <= max(hs[0][0], hs[1][0]) and min(vs[0][1], vs[1][1]) <= y <= max(vs[0][1], vs[1][1]):
                on[i].append((x, y)); on[j].append((x, y))

    attach = []  # (node id, px point) to link to the corridor

    for rid, (x, y, w, h), door in F['rooms']:
        did = f'{fid}-door-{rid}'
        node(did, 'door', door)
        rooms.append({'roomId': rid, **rect(fid, x, y, w, h), 'door': did})
        attach.append((did, door))
    for rid, (x, y, w, h) in F['unplaced']:
        did = f'{fid}-door-{rid}'
        node(did, 'door', (x + w / 2, y))
        rooms.append({'roomId': rid, **rect(fid, x, y, w, h), 'door': did, 'unplaced': True})
    P = F['points']
    node(f'{fid}-lobby', 'lift_lobby', P['lobby'], F['lobbyLabel'])
    node(f'{fid}-lift', 'lift', P['lift'])
    node(f'{fid}-stairs', 'stairs', P['stairs'])
    attach.append((f'{fid}-lobby', P['lobby']))
    attach.append((f'{fid}-stairs', P['stairs']))
    edges.append([f'{fid}-lift', f'{fid}-lobby'])

    links = []
    for nid, p in attach:
        i, q = project(p)
        on[i].append(q)
        links.append((nid, q))

    cid = lambda q: f'{fid}-c-{q[0]}-{q[1]}'
    for i, (a, b) in enumerate(segs):
        horizontal = a[1] == b[1]
        pts = sorted(set((round(p[0]), round(p[1])) for p in on[i]), key=lambda p: p[0] if horizontal else p[1])
        for p in pts:
            if cid(p) not in nodes:
                node(cid(p), 'corridor', p)
        for p, q in zip(pts, pts[1:]):
            if p != q:
                edges.append([cid(p), cid(q)])
    for nid, q in links:
        if nodes[nid]['x'] == nodes[cid(q)]['x'] and nodes[nid]['y'] == nodes[cid(q)]['y']:
            # the point sits on the corridor: reuse the corridor node's links
            edges.append([nid, cid(q)])
        else:
            edges.append([nid, cid(q)])

    areas = [{'label': label, 'kind': kind, **rect(fid, *r)} for label, kind, r in F['areas']]

    furniture = []
    for item in F['furniture']:
        t = item[0]
        if t == 'bench':
            _, r, n, along, double = item
            x, y, w, h = r
            c = F.get('benchInset', 0)  # 2F blocks are drawn with their chairs: keep only the desks
            if along == 'y':
                x, w = (x + c, w - 2 * c) if double else (x, w - c)
            else:
                y, h = (y + c, h - 2 * c) if double else (y, h - c)
            furniture.append({'t': 'bench', **rect(fid, x, y, w, h), 'n': n, 'along': along, 'double': double})
        elif t == 'diagonal':
            _, r, angle, pitch, desk = item
            furniture.append({'t': 'diagonal', **rect(fid, *r), 'angle': angle, 'pitch': r1(pitch * K[fid]), 'desk': r1(desk * K[fid])})
        elif t == 'table':
            _, r, seats, rnd = item
            furniture.append({'t': 'table', **rect(fid, *r), 'seats': seats, **({'round': True} if rnd else {})})
    # every office gets a desk and chair
    for label, kind, (x, y, w, h) in F['areas']:
        if kind == 'office' and w * h < 3000:
            dw, dh = w * 0.55, max(5, h * 0.22)
            furniture.append({'t': 'desk', **rect(fid, x + (w - dw) / 2, y + h * 0.3, dw, dh), 'chair': 's'})

    outline = [pt(fid, *p) for p in F['outline']]
    xs = [p[0] for p in outline] + [r['x'] + r['w'] for r in rooms]
    ys = [p[1] for p in outline] + [r['y'] + r['h'] for r in rooms]
    minx, miny = min(p[0] for p in outline), min(p[1] for p in outline)
    viewBox = [round(minx - 16), round(miny - 16), round(max(xs) - minx + 32), round(max(ys) - miny + 32)]
    return {
        'floor': fid,
        'viewBox': viewBox,
        'liftLobby': f'{fid}-lobby',
        'outline': outline,
        'areas': areas,
        'furniture': furniture,
        'rooms': rooms,
        'nodes': list(nodes.values()),
        'edges': edges,
    }

plan = {
    'site': 'Manila',
    'building': 'Bldg. H',
    'placeholder': False,
    '_note': 'Traced from the 2F and 3F appendix layouts of the Room Reservation Guidelines v3.0 (approximate: the layouts are low-resolution images). 1 map unit = 5 cm; floors aligned at the lift core. Corridors are an approximate walking graph. Replace with CAD plans when Facilities shares them (docs/spec/07-map-routing.md).',
    'unitMeters': 0.05,
    'floors': [build('2F', F2), build('3F', F3)],
    'verticalLinks': [
        {'from': '2F-lift', 'to': '3F-lift', 'seconds': 40, 'stairs': False},
        {'from': '2F-stairs', 'to': '3F-stairs', 'seconds': 50, 'stairs': True},
    ],
}

with open(OUT, 'w') as fh:
    json.dump(plan, fh, indent=1)
    fh.write('\n')
for f in plan['floors']:
    print(f['floor'], 'viewBox', f['viewBox'], 'rooms', len(f['rooms']), 'areas', len(f['areas']), 'furniture', len(f['furniture']), 'nodes', len(f['nodes']), 'edges', len(f['edges']))
```

## F.2 Types and routing: `src/domain/routing.ts`
- Types: `NodeKind`, `MapNode`, `VerticalLink`, `RoomShape`, `AreaKind`, `Area`, `FurnitureItem`, `FloorData`, `FloorPlan`, `Graph`, `Route`. Coordinates are map units.
- `buildGraph(plan)` validates and throws these exact messages: `Duplicate map node "<id>"`, `<floor>: lift lobby "<id>" is not a node`, `<floor>: door "<id>" of <roomId> is not a node`, `<floor>: edge <a> – <b> uses an unknown node`, `Vertical link <a> – <b> uses an unknown node`. Edges are two-way; cost = distance × `unitMeters` ÷ `WALK_METERS_PER_SECOND` (1.2 m/s). Vertical links cost their `seconds`, 0 meters.
- `shortestRoute(g, from, to, { avoidStairs })`: A* with the straight-line walking time to the goal on the goal's floor (0 on other floors) as the heuristic; `avoidStairs` skips `stairs: true` links. Returns `{ nodeIds, seconds (rounded), meters (rounded), floors (in visiting order), usesStairs }` or `null` when a node is unknown or there is no path.

<!-- verbatim: src/domain/routing.ts -->
```ts
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
```

## F.3 Loader: `src/data/floorPlans.ts`
Imports the JSON, exports `MANILA_BLDG_H` and a cached `manilaGraph()`. Its doc comment says the plans are traced from the guidelines' appendix layouts by `scripts/trace-floors.py` and are approximate.

<!-- verbatim: src/data/floorPlans.ts -->
```ts
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
```

## F.4 Furniture expansion: `src/ui/floorLayout.ts`
Pure; used by the 2D map and the 3D model. Outputs desks and tables as `Piece` (`cx, cy, w, h, angle` in radians) and chairs as `Seat` (`x, y` and the facing unit vector `fx, fy`, +y = south).
- Constants: `CHAIR_GAP` 6 (chair centre to desk edge, 30 cm), `INSET` 3 (diagonal bands stay this far inside their box).
- **bench:** `rows` = 2 when `double`, else 1. Along `x`: desk width `w/n`, row height `h/rows`; each desk is drawn 1 unit narrower and 0.6 shorter than its cell. Row 0 of a double bench has chairs above (`y − 6`, facing +y); otherwise chairs below (`y + h + 6`, facing −y). Along `y`: the same with columns; column 0 of a double bench has chairs on the left (`x − 6`, facing +x), otherwise on the right (`x + w + 6`, facing −x).
- **diagonal:** `u = (cos a, sin a)` along the band, `v = (−sin a, cos a)` across it; desk depth `desk × 0.55`. For every band `k` (spacing `pitch`) and step `s` (spacing `desk`) out to half the box diagonal, and for both sides: the desk centre is the band point ± `v × depth/2`, and the chair is at ± `v × (depth + 6)`, facing back toward the band. A pair is kept only when the desk centre is inside the box by `3 + desk/2` and the chair by 3. Each desk is drawn `desk − 1.2` long and `depth − 0.6` deep, rotated by `a`.
- **table:** a `Table` piece at the box centre. Round: `seats` chairs evenly on a circle of radius `max(w, h)/2 + 6`, starting at the top (−90°), facing the centre. Rectangular: chairs along the two long sides, `floor(seats/2)` on the first side and `ceil(seats/2)` on the second, spread evenly (`t = ((i + 0.5)/count − 0.5) × long`), 6 beyond the edge, facing in.
- **desk:** the desk piece plus one chair 6 beyond the named side (`n` above, `s` below, `e` right, `w` left), facing the desk.
- `corners(piece)`: the four rotated corners, for SVG paths.

<!-- verbatim: src/ui/floorLayout.ts -->
```ts
/**
 * Expands a floor's furniture items (data/floors/*.json) into desks, tables and chairs for the 2D map and the
 * 3D model (docs/spec/07-map-routing.md, Furniture). Pure and in map units (1 unit = 5 cm), so it is unit tested.
 */
import type { FurnitureItem } from '../domain/routing';
import type { Seat } from './building3d/layout';

/** A rectangle given by its centre, size and rotation (radians, clockwise in plan). */
export interface Piece {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
}
export interface Table extends Piece {
  round: boolean;
}
export interface FloorFurniture {
  desks: Piece[];
  tables: Table[];
  chairs: Seat[];
}

const CHAIR_GAP = 6; // chair centre to desk edge (30 cm)
const INSET = 3; // diagonal bands stay this far inside their box

function bench(f: Extract<FurnitureItem, { t: 'bench' }>, out: FloorFurniture) {
  const rows = f.double ? 2 : 1;
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < f.n; i++) {
      if (f.along === 'x') {
        const w = f.w / f.n;
        const h = f.h / rows;
        const cx = f.x + (i + 0.5) * w;
        const cy = f.y + (row + 0.5) * h;
        out.desks.push({ cx, cy, w: w - 1, h: h - 0.6, angle: 0 });
        // Back-to-back: the first row's chairs above, the second's below (a single row: below).
        const up = f.double && row === 0;
        out.chairs.push({ x: cx, y: up ? f.y - CHAIR_GAP : f.y + f.h + CHAIR_GAP, fx: 0, fy: up ? 1 : -1 });
      } else {
        const w = f.w / rows;
        const h = f.h / f.n;
        const cx = f.x + (row + 0.5) * w;
        const cy = f.y + (i + 0.5) * h;
        out.desks.push({ cx, cy, w: w - 0.6, h: h - 1, angle: 0 });
        const left = f.double && row === 0;
        out.chairs.push({ x: left ? f.x - CHAIR_GAP : f.x + f.w + CHAIR_GAP, y: cy, fx: left ? 1 : -1, fy: 0 });
      }
    }
  }
}

/** Parallel bands of back-to-back desks at an angle, clipped to the box: the layout's herringbone areas. */
function diagonal(f: Extract<FurnitureItem, { t: 'diagonal' }>, out: FloorFurniture) {
  const a = (f.angle * Math.PI) / 180;
  const u = [Math.cos(a), Math.sin(a)] as const; // along the band
  const v = [-Math.sin(a), Math.cos(a)] as const; // across it
  const depth = f.desk * 0.55;
  const cx0 = f.x + f.w / 2;
  const cy0 = f.y + f.h / 2;
  const reach = Math.hypot(f.w, f.h) / 2;
  const inside = (x: number, y: number, m: number) => x >= f.x + m && x <= f.x + f.w - m && y >= f.y + m && y <= f.y + f.h - m;
  for (let k = -Math.ceil(reach / f.pitch); k <= Math.ceil(reach / f.pitch); k++) {
    for (let s = -Math.ceil(reach / f.desk); s <= Math.ceil(reach / f.desk); s++) {
      const bx = cx0 + v[0] * k * f.pitch + u[0] * s * f.desk;
      const by = cy0 + v[1] * k * f.pitch + u[1] * s * f.desk;
      for (const side of [-1, 1] as const) {
        const dx = bx + v[0] * side * (depth / 2);
        const dy = by + v[1] * side * (depth / 2);
        const chx = bx + v[0] * side * (depth + CHAIR_GAP);
        const chy = by + v[1] * side * (depth + CHAIR_GAP);
        if (!inside(dx, dy, INSET + f.desk / 2) || !inside(chx, chy, INSET)) continue;
        out.desks.push({ cx: dx, cy: dy, w: f.desk - 1.2, h: depth - 0.6, angle: a });
        out.chairs.push({ x: chx, y: chy, fx: -v[0] * side, fy: -v[1] * side });
      }
    }
  }
}

function table(f: Extract<FurnitureItem, { t: 'table' }>, out: FloorFurniture) {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  out.tables.push({ cx, cy, w: f.w, h: f.h, angle: 0, round: !!f.round });
  if (f.round) {
    const r = Math.max(f.w, f.h) / 2 + CHAIR_GAP;
    for (let i = 0; i < f.seats; i++) {
      const t = (i / f.seats) * Math.PI * 2 - Math.PI / 2;
      out.chairs.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r, fx: -Math.cos(t), fy: -Math.sin(t) });
    }
    return;
  }
  // Chairs along the two long sides (the second side takes the odd one out).
  const alongX = f.w >= f.h;
  const long = alongX ? f.w : f.h;
  for (const side of [-1, 1] as const) {
    const count = side === -1 ? Math.floor(f.seats / 2) : Math.ceil(f.seats / 2);
    for (let i = 0; i < count; i++) {
      const t = ((i + 0.5) / count - 0.5) * long;
      const off = (alongX ? f.h : f.w) / 2 + CHAIR_GAP;
      out.chairs.push(alongX ? { x: cx + t, y: cy + side * off, fx: 0, fy: -side } : { x: cx + side * off, y: cy + t, fx: -side, fy: 0 });
    }
  }
}

function desk(f: Extract<FurnitureItem, { t: 'desk' }>, out: FloorFurniture) {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  out.desks.push({ cx, cy, w: f.w, h: f.h, angle: 0 });
  const [fx, fy] = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] }[f.chair];
  const x = f.chair === 'e' ? f.x + f.w + CHAIR_GAP : f.chair === 'w' ? f.x - CHAIR_GAP : cx;
  const y = f.chair === 's' ? f.y + f.h + CHAIR_GAP : f.chair === 'n' ? f.y - CHAIR_GAP : cy;
  out.chairs.push({ x, y, fx: fx as number, fy: fy as number });
}

export function floorFurniture(items: FurnitureItem[]): FloorFurniture {
  const out: FloorFurniture = { desks: [], tables: [], chairs: [] };
  for (const f of items) {
    if (f.t === 'bench') bench(f, out);
    else if (f.t === 'diagonal') diagonal(f, out);
    else if (f.t === 'table') table(f, out);
    else desk(f, out);
  }
  return out;
}

/** The four corners of a piece, for drawing it as a polygon. */
export function corners(p: Piece): Array<[number, number]> {
  const c = Math.cos(p.angle);
  const s = Math.sin(p.angle);
  return [
    [-p.w / 2, -p.h / 2],
    [p.w / 2, -p.h / 2],
    [p.w / 2, p.h / 2],
    [-p.w / 2, p.h / 2],
  ].map(([x, y]) => [p.cx + (x as number) * c - (y as number) * s, p.cy + (x as number) * s + (y as number) * c]);
}
```

## F.5 2D map: `src/ui/FloorMap.tsx`
Props: `floor, rooms (Map id → RoomView), statuses (Map id → RoomStatus), selectedRoomId, slot {start, end}, highlight (RoomState | null), onOpen(roomId)`. Only bookable rooms are interactive.

- **Wrapper:** `<div class="floormap-wrap" onKeyDown>` holds the SVG and the zoom and turn buttons (keys, ignored with Ctrl, ⌘ or Alt: `r` turn right, `R` turn left, `+`/`=` zoom in, `-`/`_` zoom out, `0` whole floor with no turn, arrows pan an eighth of the current window when zoomed; handled keys `preventDefault`).
- **Zoom, pan and turn** (07, 2D zoom, pan and turn): state `view` (`{ zoom, cx, cy, angle }`) starts at `fitView(box)` (`box` = the floor's view box); when `floor` changes it becomes `fitView(newBox, angle)` (the turn stays); the SVG's `viewBox` is `viewBoxOf(view, box)` and the floor layer gets `turnTransform(view, box)`. `turnBy(dir)` = `turnView(v, dir, box)`. A non-passive `wheel` listener zooms at the pointer (`zoomAt(v, exp(−deltaY × 0.0015), …)`; it returns early when `deltaY > 0` at zoom ≤ 1). Pointer handlers keep the active pointers in a map: two or more → pinch (`zoomAt` by the distance ratio at the midpoint); one → nothing until it has moved 5 px, nothing at zoom 1, then `setPointerCapture` once and `panBy` the movement ÷ the screen matrix's `a`/`d`. A drag or pinch sets `suppressClick`, and `onClickCapture` then stops that click. `toMap(x, y)` converts screen points with `getScreenCTM().inverse()`.
- **Zoom and turn buttons:** `div.map-zoom` (`role="group"`, `aria-label="Zoom and turn"`) after the SVG, five `type="button"` buttons with 14 × 14 SVG icons: "Zoom in" (`title` "Zoom in (+)", disabled at `MAX_ZOOM`), "Zoom out" (`title` "Zoom out (−)", disabled at zoom 1), then `<TurnButtons onTurn={turnBy} />` ("Turn left", `title` "Turn left (Shift+R)"; "Turn right", `title` "Turn right (R)"; arrow icons drawn in a 24 × 24 viewBox, stroke 3), then "Fit the whole floor" (`title` "Whole floor (0)", sets `fitView(box)`, disabled at zoom 1 with no turn). `TurnButtons` is exported for the 3D view.
- **Upright text:** `upright(x, y, w, h, angle)` returns the on-screen rectangle (`rotatedBox`) and `rotate(−angle cx cy)` (none at 0°). Areas and rooms fit their labels to that rectangle's width and height and draw them (with the room's state icon at its top left + 14 and rank badge at its top right) inside the counter-turn.
- **SVG:** `class="floormap"` (plus `is-zoomed` when zoom > 1), `style` `touch-action: none` when zoomed or `pan-x pan-y` at zoom 1, `viewBox` from the view, `role="group"`, `aria-label="Floor map, <floor>, Bldg. H"`, `data-highlight` = the legend's highlighted state (06 Legend; the CSS in F.6 fades the other rooms). A `<pattern id="hatch">` (8 × 8, rotated 45°, fill `var(--taken)` with a 3-unit `#b9c1bd` line) fills taken rooms.
- **Text scale:** `k = viewBox width ÷ 940` (≈ 1.51 on 2F, 1.46 on 3F), so text looks the same size as on the first 940-unit plan.
- **Layers (`<g key={floor} class="floor-layer">`, bottom to top):**
  1. `path.plate`: the outline polygon.
  2. `AreaShapes`: a `rect.area.area--<kind>` for every area except `open`; then one `path.area-symbols`: a cross in each lift (corners inset 3) and stair treads every 8 units across the short side (from 8 to length − 4, inset 3).
  3. `g.furniture`: three paths from `floorFurniture()`: `furniture__desks` (rotated rectangles, coordinates to 0.1), `furniture__tables` (rectangles, or circles of radius `w/2` when round), `furniture__chairs` (circles, radius `CHAIR_R` 4.2).
  4. `AreaLabels`: every area except `core`, `lift` and the generic names in `UNLABELLED` (`Office`, `Service room`, `Room`, `Workstations`: their colour and the legend's Key already say what they are), so only specific names are written (Restroom, Stairs, Clinic, Director's room 2…). `fitLabel(label, w, h, k, max, min)` with max 10 and min 6; open areas use max 12, a width of `w × 0.72` (their labels are spaced capitals) and `area-label--open`. Lines are 1.05 × size apart, centred vertically; each line is a `tspan` at the box centre.
  5. The unplaced caption (only when the floor has unplaced rooms): "Location to confirm", at the left of the unplaced rooms' bounding box as it looks on screen (`upright` of that box), 8 × k above it, font size 11 × k.
  6. Bookable rooms, sorted by `y` then `x` (keyboard reading order).
  7. The "you are here" marker at the floor's `liftLobby` node: `g.you-marker` translated there, turned back by −angle and scaled by k, with a halo circle (r 14), a dot (r 6) and the text "You" at (18, 4); `aria-label="You are here: <label>"` (the label, e.g. "lift lobby, 2F", is for screen readers only).
- **`fitLabel`:** `CHAR_WIDTH` 0.47 em per character. Options: the whole name on one line, and every split into two lines at a space. For each size step from max down to min (size = step × k), keep the options where every line fits `length × size × 0.47 ≤ w − 8k` and `lines × size × 1.05 ≤ h − 8k`; prefer fewer lines, then the shortest longest line. None fits → `null` (no label).
- **Room (`g.room.room--<state>`, plus `room--selected`):** `role="button"`, `tabIndex 0`, `aria-pressed` = selected, Enter or Space opens it, click opens it.
  - `aria-label`: "<name>, <floor>, <kind in lower case> room, seats N" (or "capacity not on file"), then with a status: the state word (`STATE_WORDS`); for fits/free "free <span with 'to' instead of the dash>"; "rank N"; "reserved by <full name>" — joined with ", ".
  - `rect.shape` (rx 3; `shape--unplaced` adds a dash), then the faint furniture from `roomFurniture(shape, door node or the bottom middle, kind, capacity, av)`: tables as `path.room__furn` rectangles, seats as `path.room__chairs` circles of radius 4.2 × 0.8; then `rect.focus-ring` (4 units outside, rx 6).
  - Second line text: the holder at the selected time (`reservedBy(status).short`) or "seats N"; size `min(13k, (w − 10) ÷ (length × 0.5))`, used only when ≥ 9k and the room is at least 50k tall; then the name is fitted into `h − subSize − 4`. Otherwise the name alone with max 17, min 7; if that fails, the **first word** alone with max 12, min 4 ("Lactation Room" → "Lactation"). The name block is centred vertically; `text.label` at `size × 0.8` below each line top; `text.sub` (`sub--owner` for a holder) at the bottom of the block.
  - State icon at (x + 14, y + 14): yours → a white check `M x−6 y l4 4 8−9` (stroke 2.4); partial → a half-filled clock (circle r 7, surface fill, orange stroke 1.5, right half orange). Others: none.
  - Rank badge (fits, rank 1–3): `<g transform="translate(x + w − 14k, y + 14k) scale(k)">` wrapping `g.badge` (circle r 11, number at y 5). The wrapper keeps the badge in place while the CSS `pop` animation scales it.
- `FLOORS` (all `FloorData`) is exported for the floor tabs, the legend counts and the 3D view.

<!-- verbatim: src/ui/FloorMap.tsx -->
```tsx
'use client';

/**
 * SVG floor map from data/floors/*.json (docs/spec/07-map-routing.md, Rendering; 06 Room states): the floor plate,
 * every room and area from the appendix layouts (offices, core, service rooms, amenities), workstations with
 * their chairs, and the bookable rooms on top, coloured by state. Only bookable rooms are interactive.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MANILA_BLDG_H } from '../data/floorPlans';
import type { Area, FloorData, RoomShape } from '../domain/routing';
import type { RoomView } from './api';
import { roomFurniture } from './building3d/layout';
import { corners, floorFurniture, type Piece } from './floorLayout';
import { fmtSpan } from './format';
import { fitView, MAX_ZOOM, panBy, rotatedBox, turnTransform, turnView, viewBoxOf, zoomAt, ZOOM_STEP, type Box, type View } from './mapZoom';
import { reservedBy, STATE_WORDS, type RoomState, type RoomStatus } from './roomStates';

export const FLOORS: FloorData[] = MANILA_BLDG_H.floors;
const floorData = (floor: string) => FLOORS.find((f) => f.floor === floor) ?? (FLOORS[0] as FloorData);

const CHAR_WIDTH = 0.47; // Barlow Condensed semibold, em per character (approximate)
const SUB_SIZE = 13;
const CHAIR_R = 4.2;

/**
 * Largest font (max → min map units, times the floor's text scale) at which the text fits on one or two lines;
 * null = too small, hide the label.
 */
function fitLabel(name: string, w: number, h: number, k: number, max = 17, min = 13): { lines: string[]; size: number } | null {
  const words = name.split(' ');
  const options: string[][] = [[name]];
  for (let i = 1; i < words.length; i++) options.push([words.slice(0, i).join(' '), words.slice(i).join(' ')]);
  for (let step = max; step >= min; step--) {
    const size = step * k;
    const fits = options
      .filter((lines) => lines.every((l) => l.length * size * CHAR_WIDTH <= w - 8 * k) && lines.length * size * 1.05 <= h - 8 * k)
      .sort((a, b) => a.length - b.length || Math.max(...a.map((l) => l.length)) - Math.max(...b.map((l) => l.length)));
    if (fits[0]) return { lines: fits[0], size };
  }
  return null;
}

/**
 * Keeps text upright on a turned plan: the rectangle as it looks on screen (width and height swap on a quarter
 * turn) and the counter-turn around its centre for the text drawn in it.
 */
function upright(x: number, y: number, w: number, h: number, angle: number) {
  const [ux, uy, uw, uh] = rotatedBox([x, y, w, h], angle);
  return { x: ux, y: uy, w: uw, h: uh, transform: angle ? `rotate(${-angle} ${x + w / 2} ${y + h / 2})` : undefined };
}

const rectPath = (p: Piece) => `M${corners(p).map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
const circlePath = (x: number, y: number, r: number) => `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** Plan symbols: treads for stairs, a cross for a lift car. */
function symbolPath(a: Area): string {
  if (a.kind === 'lift') return `M${a.x + 3} ${a.y + 3}L${a.x + a.w - 3} ${a.y + a.h - 3}M${a.x + a.w - 3} ${a.y + 3}L${a.x + 3} ${a.y + a.h - 3}`;
  if (a.kind !== 'stairs') return '';
  const alongX = a.w >= a.h;
  const len = alongX ? a.w : a.h;
  let d = '';
  for (let t = 8; t < len - 4; t += 8) d += alongX ? `M${a.x + t} ${a.y + 3}V${a.y + a.h - 3}` : `M${a.x + 3} ${a.y + t}H${a.x + a.w - 3}`;
  return d;
}

/** Walls, fills and plan symbols for everything that is not a bookable room. */
function AreaShapes({ areas }: { areas: Area[] }) {
  return (
    <g className="areas" aria-hidden>
      {areas.map((a, i) => (a.kind === 'open' ? null : <rect key={i} className={`area area--${a.kind}`} x={a.x} y={a.y} width={a.w} height={a.h} />))}
      <path className="area-symbols" d={areas.map(symbolPath).join('')} />
    </g>
  );
}

/** Generic names the colour and the legend's Key already say; only specific names are written on the plan. */
const UNLABELLED = new Set(['Office', 'Service room', 'Room', 'Workstations']);

/** Their names, drawn above the furniture. */
function AreaLabels({ areas, k, angle }: { areas: Area[]; k: number; angle: number }) {
  return (
    <g aria-hidden>
      {areas.map((a, i) => {
        if (a.kind === 'core' || a.kind === 'lift' || UNLABELLED.has(a.label)) return null;
        const u = upright(a.x, a.y, a.w, a.h, angle);
        // Open-area labels are spaced capitals: about a third wider than the estimate.
        const label = fitLabel(a.label, a.kind === 'open' ? u.w * 0.72 : u.w, u.h, k, a.kind === 'open' ? 12 : 10, 6);
        if (!label) return null;
        const lineH = label.size * 1.05;
        const top = u.y + u.h / 2 - (label.lines.length * lineH) / 2;
        return (
          <text key={i} className={`area-label area-label--${a.kind}`} fontSize={label.size} textAnchor="middle" transform={u.transform}>
            {label.lines.map((line, j) => (
              <tspan key={j} x={u.x + u.w / 2} y={top + j * lineH + label.size * 0.8}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </g>
  );
}

function ariaLabel(room: RoomView, status: RoomStatus | undefined, slot: { start: Date; end: Date }): string {
  const bits = [`${room.name}, ${room.floor}`, `${room.kind.toLowerCase()} room`, room.capacity ? `seats ${room.capacity}` : 'capacity not on file'];
  if (status) {
    bits.push(STATE_WORDS[status.state]);
    if (status.state === 'fits' || status.state === 'free') bits.push(`free ${fmtSpan(slot.start, slot.end).replace('–', ' to ')}`);
    if (status.rank) bits.push(`rank ${status.rank}`);
    const who = reservedBy(status);
    if (who) bits.push(`reserved by ${who.full}`);
  }
  return bits.join(', ');
}

function StateIcon({ status, x, y }: { status: RoomStatus; x: number; y: number }) {
  if (status.state === 'free' || status.state === 'fits') {
    // Green dot: the second cue for "free" (red rooms are hatched, partly free ones carry a half clock).
    return <circle cx={x} cy={y} r="5" fill="var(--green)" stroke="var(--surface)" strokeWidth="1.5" aria-hidden />;
  }
  if (status.state === 'yours') {
    return <path d={`M${x - 6} ${y}l4 4 8-9`} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden />;
  }
  if (status.state === 'partial') {
    // Half-filled clock: the second cue for "partly free".
    return (
      <g aria-hidden>
        <circle cx={x} cy={y} r="7" fill="var(--surface)" stroke="var(--orange)" strokeWidth="1.5" />
        <path d={`M${x} ${y - 7}A7 7 0 0 1 ${x} ${y + 7}Z`} fill="var(--orange)" />
      </g>
    );
  }
  return null;
}

function Room({
  shape,
  door,
  room,
  status,
  selected,
  slot,
  k,
  angle,
  onOpen,
}: {
  shape: RoomShape;
  door: { x: number; y: number } | undefined;
  room: RoomView;
  status?: RoomStatus;
  selected: boolean;
  slot: { start: Date; end: Date };
  /** Text scale of this floor (map units per 940-wide plan). */
  k: number;
  /** The plan's turn; the name, icon and badge stay upright. */
  angle: number;
  onOpen: (roomId: string) => void;
}) {
  const { x, y, w, h } = shape;
  const u = upright(x, y, w, h, angle);
  const state = status?.state ?? 'free';
  // Second line: who has the room at this time, otherwise the capacity. Shrinks to fit, hidden below 9 units.
  const who = reservedBy(status);
  const subText = who ? who.short : room.capacity ? `seats ${room.capacity}` : null;
  const subSize = subText ? Math.min(SUB_SIZE * k, (u.w - 10) / (subText.length * 0.5)) : 0;
  const withSub = subText && subSize >= 9 * k ? fitLabel(room.name, u.w, u.h - subSize - 4, k) : null;
  // Small rooms on the traced plan still get their name, smaller, or its first word ("Lactation").
  const label = withSub && u.h >= 50 * k ? withSub : (fitLabel(room.name, u.w, u.h, k, 17, 7) ?? fitLabel(room.name.split(' ')[0] ?? room.name, u.w, u.h, k, 12, 4));
  const showSub = !!(withSub && u.h >= 50 * k && label === withSub);
  // The room's own table and chairs, faint under the label (same layout as the 3D model).
  const furniture = useMemo(() => {
    const f = roomFurniture(shape, door ?? { x: x + w / 2, y: y + h }, room.kind, room.capacity, room.av);
    return {
      tables: f.tables.map((t) => `M${t.x} ${t.y}h${t.w}v${t.h}h${-t.w}Z`).join(''),
      chairs: f.seats.map((c) => circlePath(c.x, c.y, CHAIR_R * 0.8)).join(''),
    };
  }, [shape, door, room.kind, room.capacity, room.av, x, y, w, h]);
  const lineH = label ? label.size * 1.05 : 0;
  const blockH = label ? label.lines.length * lineH + (showSub ? subSize + 4 : 0) : 0;
  const top = u.y + u.h / 2 - blockH / 2;
  return (
    <g
      className={`room room--${state}${selected ? ' room--selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel(room, status, slot)}
      aria-pressed={selected}
      onClick={() => onOpen(room.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(room.id);
        }
      }}
    >
      <rect className={`shape${shape.unplaced ? ' shape--unplaced' : ''}`} x={x} y={y} width={w} height={h} rx="3" />
      <path className="room__furn" d={furniture.tables} />
      <path className="room__chairs" d={furniture.chairs} />
      <rect className="focus-ring" x={x - 4} y={y - 4} width={w + 8} height={h + 8} rx="6" />
      <g transform={u.transform}>
        {label?.lines.map((line, i) => (
          <text key={i} className="label" x={u.x + u.w / 2} y={top + i * lineH + label.size * 0.8} fontSize={label.size} textAnchor="middle">
            {line}
          </text>
        ))}
        {showSub && (
          <text className={`sub${who ? ' sub--owner' : ''}`} x={u.x + u.w / 2} y={top + blockH - 2} fontSize={subSize} textAnchor="middle">
            {subText}
          </text>
        )}
        {status && <StateIcon status={status} x={u.x + 14} y={u.y + 14} />}
        {status?.rank && status.rank <= 3 && state === 'fits' && (
          <g transform={`translate(${u.x + u.w - 14 * k} ${u.y + 14 * k}) scale(${k})`} aria-hidden>
            <g className="badge">
              <circle cx={0} cy={0} r="11" />
              <text x={0} y={5} textAnchor="middle">
                {status.rank}
              </text>
            </g>
          </g>
        )}
      </g>
    </g>
  );
}

export function FloorMap({
  floor,
  rooms,
  statuses,
  selectedRoomId,
  slot,
  highlight = null,
  onOpen,
}: {
  floor: string;
  rooms: Map<string, RoomView>;
  statuses: Map<string, RoomStatus>;
  selectedRoomId: string | null;
  slot: { start: Date; end: Date };
  /** Legend highlight: rooms in other states fade. */
  highlight?: RoomState | null;
  onOpen: (roomId: string) => void;
}) {
  const f = floorData(floor);
  const [vx, vy, vw, vh] = f.viewBox;
  const k = vw / 940;
  const nodes = new Map(f.nodes.map((n) => [n.id, n] as const));
  const lobby = nodes.get(f.liftLobby);
  // Reading order for keyboard users: top to bottom, then left to right.
  const shapes = [...f.rooms].sort((a, b) => a.y - b.y || a.x - b.x);
  const unplaced = f.rooms.filter((r) => r.unplaced);
  const furniture = useMemo(() => {
    const ff = floorFurniture(f.furniture);
    return {
      desks: ff.desks.map(rectPath).join(''),
      tables: ff.tables.map((t) => (t.round ? circlePath(t.cx, t.cy, t.w / 2) : rectPath(t))).join(''),
      chairs: ff.chairs.map((c) => circlePath(c.x, c.y, CHAIR_R)).join(''),
    };
  }, [f]);

  // Zoom, pan and turn (mapZoom.ts): wheel at the pointer, drag once zoomed, pinch, the buttons and + − 0 R keys.
  const box: Box = [vx, vy, vw, vh];
  const [view, setView] = useState<View>(() => fitView(box));
  const svgRef = useRef<SVGSVGElement>(null);
  const live = useRef({ view, box });
  live.current = { view, box };
  const gesture = useRef({ pointers: new Map<number, { x: number; y: number }>(), start: { x: 0, y: 0 }, pinch: 0, moved: false, suppressClick: false });
  useEffect(() => setView((v) => fitView(live.current.box, v.angle)), [floor]);
  const toMap = (x: number, y: number) => {
    const m = svgRef.current?.getScreenCTM();
    return m ? new DOMPoint(x, y).matrixTransform(m.inverse()) : null;
  };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      // Scrolling down on the whole floor scrolls the page as usual.
      if (e.deltaY > 0 && live.current.view.zoom <= 1) return;
      e.preventDefault();
      const p = toMap(e.clientX, e.clientY);
      if (p) setView((v) => zoomAt(v, Math.exp(-e.deltaY * 0.0015), p.x, p.y, live.current.box));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);
  const zoomBy = (factor: number) => setView((v) => zoomAt(v, factor, v.cx, v.cy, box));
  const ARROWS: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  const turnBy = (dir: 1 | -1) => setView((v) => turnView(v, dir, box));
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave the browser's own shortcuts alone
    const arrow = ARROWS[e.key];
    if (e.key === 'r' || e.key === 'R') turnBy(e.shiftKey ? -1 : 1);
    else if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / ZOOM_STEP);
    else if (e.key === '0') setView(fitView(box));
    else if (arrow && view.zoom > 1) {
      setView((v) => {
        const [, , w, h] = viewBoxOf(v, box);
        return panBy(v, (arrow[0] * w) / 8, (arrow[1] * h) / 8, box); // an eighth of the view
      });
    } else return;
    e.preventDefault();
  };
  const [x0, y0, w0, h0] = viewBoxOf(view, box);
  const unplacedBox = unplaced.length
    ? (() => {
        const x = Math.min(...unplaced.map((r) => r.x));
        const y = Math.min(...unplaced.map((r) => r.y));
        return upright(x, y, Math.max(...unplaced.map((r) => r.x + r.w)) - x, Math.max(...unplaced.map((r) => r.y + r.h)) - y, view.angle);
      })()
    : null;

  return (
    <div className="floormap-wrap" onKeyDown={onKeyDown}>
    <svg
      ref={svgRef}
      className={`floormap${view.zoom > 1 ? ' is-zoomed' : ''}`}
      viewBox={`${x0} ${y0} ${w0} ${h0}`}
      role="group"
      aria-label={`Floor map, ${floor}, Bldg. H`}
      data-highlight={highlight ?? undefined}
      // Whole floor: one finger scrolls the page and two fingers zoom the map. Zoomed: one finger pans.
      style={{ touchAction: view.zoom > 1 ? 'none' : 'pan-x pan-y' }}
      onPointerDown={(e) => {
        const g = gesture.current;
        g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        g.start = { x: e.clientX, y: e.clientY };
        g.moved = false;
        g.suppressClick = false;
        g.pinch = 0;
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        const prev = g.pointers.get(e.pointerId);
        if (!prev) return;
        const cur = { x: e.clientX, y: e.clientY };
        g.pointers.set(e.pointerId, cur);
        if (g.pointers.size >= 2) {
          const [a, b] = [...g.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const mid = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
          if (g.pinch && mid) setView((v) => zoomAt(v, d / g.pinch, mid.x, mid.y, box));
          g.pinch = d;
          g.moved = true;
          return;
        }
        if (!g.moved && Math.hypot(cur.x - g.start.x, cur.y - g.start.y) < 5) return; // still a click
        if (live.current.view.zoom <= 1) return; // nothing to pan
        if (!g.moved) {
          g.moved = true;
          svgRef.current?.setPointerCapture(e.pointerId);
        }
        const m = svgRef.current?.getScreenCTM();
        if (m) setView((v) => panBy(v, (cur.x - prev.x) / m.a, (cur.y - prev.y) / m.d, box));
      }}
      onPointerUp={(e) => {
        const g = gesture.current;
        g.pointers.delete(e.pointerId);
        if (g.moved) g.suppressClick = true; // a drag or pinch is not a click on a room
      }}
      onPointerCancel={(e) => gesture.current.pointers.delete(e.pointerId)}
      onClickCapture={(e) => {
        if (!gesture.current.suppressClick) return;
        gesture.current.suppressClick = false;
        e.stopPropagation();
      }}
    >
      <defs>
        <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="var(--red-tint)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--red-hatch)" strokeWidth="3" />
        </pattern>
      </defs>
      <g key={floor} className="floor-layer" transform={turnTransform(view, box)}>
        <path className="plate" d={`M${f.outline.map(([x, y]) => `${x} ${y}`).join('L')}Z`} />
        <AreaShapes areas={f.areas} />
        <g className="furniture" aria-hidden>
          <path className="furniture__desks" d={furniture.desks} />
          <path className="furniture__tables" d={furniture.tables} />
          <path className="furniture__chairs" d={furniture.chairs} />
        </g>
        <AreaLabels areas={f.areas} k={k} angle={view.angle} />
        {unplacedBox && (
          <g className="unplaced" aria-hidden transform={unplacedBox.transform}>
            <text x={unplacedBox.x} y={unplacedBox.y - 8 * k} fontSize={11 * k}>
              Location to confirm
            </text>
          </g>
        )}
        {shapes.map((shape) => {
          const room = rooms.get(shape.roomId);
          if (!room) return null;
          return (
            <Room
              key={shape.roomId}
              shape={shape}
              door={nodes.get(shape.door)}
              room={room}
              status={statuses.get(shape.roomId)}
              selected={selectedRoomId === shape.roomId}
              slot={slot}
              k={k}
              angle={view.angle}
              onOpen={onOpen}
            />
          );
        })}
        {lobby && (
          <g className="you-marker" aria-label={`You are here: ${lobby.label ?? 'lift lobby'}`} transform={`translate(${lobby.x} ${lobby.y}) rotate(${-view.angle}) scale(${k})`}>
            <circle className="halo" cx={0} cy={0} r="14" />
            <circle cx={0} cy={0} r="6" />
            <text x={18} y={4}>
              You
            </text>
          </g>
        )}
      </g>
    </svg>
      <div className="map-zoom" role="group" aria-label="Zoom and turn">
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)} disabled={view.zoom >= MAX_ZOOM} aria-label="Zoom in" title="Zoom in (+)">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={view.zoom <= 1} aria-label="Zoom out" title="Zoom out (−)">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <TurnButtons onTurn={turnBy} />
        <button type="button" onClick={() => setView(fitView(box))} disabled={view.zoom <= 1 && !view.angle} aria-label="Fit the whole floor" title="Whole floor (0)">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Turn left and Turn right, shared by the 2D map (a quarter turn) and the 3D view (an eighth). */
export function TurnButtons({ onTurn }: { onTurn: (dir: 1 | -1) => void }) {
  return (
    <>
      <button type="button" onClick={() => onTurn(-1)} aria-label="Turn left" title="Turn left (Shift+R)">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path d="M1 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L1 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" onClick={() => onTurn(1)} aria-label="Turn right" title="Turn right (R)">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path d="M23 4v6h-6M20.5 15a9 9 0 1 1-2.1-9.4L23 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </>
  );
}
```

## F.6 Map styles (from `src/ui/styles/map.css`)
Tokens used (`src/ui/styles/base.css`): `--ink #22303a`, `--muted #4a575e`, `--page #f4f5f2`, `--surface #ffffff`, `--plate #e3e7e3`, `--plate-dark #d3d9d4`, `--line #bcc4c0`, `--blue #1f5fd6`, `--blue-tint #dce7fb`, `--green #15803d`, `--green-tint #dcf5e3`, `--green-fill #b5e8c4`, `--orange #b54c08`, `--orange-tint #fce3cf`, `--red #c0352b`, `--red-tint #fbe4e1`, `--red-hatch #f0bcb6`, `--danger #b42318`; `--font-display` = Barlow Condensed (then Barlow), `--font-ui` = Barlow (via `next/font/google`). Phone (≤ 767 px, `responsive.css`): the plan fits the width (`.floormap { max-height: none; min-height: 0; }`, `.map-card { padding: 8px; }`); there is no minimum width and no sideways scroll, so pinch or the zoom buttons zoom in and one finger then pans.

The map, areas, furniture, rooms, badges and marker:
No copy here, so there is one exact copy only: these rules are in `src/ui/styles/map.css`, verbatim in [appendix E](E-styles.md) (section `src/ui/styles/map.css`): `.floormap`, the zoom rules (`.floormap-wrap` position relative; `.floormap.is-zoomed` cursor `grab`, `:active` `grabbing`; `.map-zoom` absolute 8 px from the top right, a grid with gap 4; `.map-zoom button` 34 × 34, radius 8, `--surface`, `--line` border, `--shadow`; hover `--page`; disabled opacity 0.4), `.floormap .plate`, `.area` and its kinds (`--core`, `--lift`, `--stairs`, `--restroom`, `--service`, `--amenity`, `--unlisted`), `.area-symbols`, `.area-label` (`--open`), `.furniture__desks`, `__tables`, `__chairs`, `.room__furn`, `.room__chairs`, `.shape--unplaced`, `.unplaced text`, `.room` with `.shape`, `.label`, `.sub` and the six state classes, hover and focus rings, `.badge` with `@keyframes pop`, and `.you-marker`.

Legend highlight (the 2D half) and the owner line:
Also in `map.css` ([appendix E](E-styles.md)): the shared fade rule (`.floormap .room` and `.b3d-label` transition; `.floormap[data-highlight='<state>'] .room:not(.room--<state>)` → `opacity: 0.18` for each of the six states) and the owner line (`.room .sub--owner`, `.room--yours .sub--owner`).

## F.7 Checks for a rebuild
| | 2F | 3F |
|---|---|---|
| Outline points | 4 | 8 |
| Bookable rooms on the plan | 16 | 15 (+ 4 unplaced) |
| Areas | 62 (core 1, lift 6, stairs 2, restroom 2, office 36, service 8, open 5, unlisted 2) | 47 (core 1, lift 5, stairs 2, restroom 3, office 10, service 11, amenity 6, open 7, unlisted 2) |
| Furniture items → expanded | 95 → 322 desks, 13 tables, 378 chairs | 40 → 349 desks, 9 tables, 371 chairs |
| Nodes / edges | 49 / 52 | 56 / 55 |

Walking times from `2F-lobby` (seconds): Central Park 2, Sao Paolo 3, Rio De Janeiro 6, MPH 1 16, New York 19, MPH 2 20, London 23, Cape Town 23, Paris 27, Amsterdam 31, Tokyo 35, Sydney 38, Hyde Park 45, Johannesburg 47, Denali 50, Snowdon 56; 3F: Siargao 68, Camiguin 68, El Nido 72, Coron 72, Bacolod 72, Mt. Mayon 75, Mt. Apo 75, Lactation Room 76, Binondo 79, Jolo 82, Vigan 85, Batanes 87, Mactan 90, Tagaytay 91, Tanay 92.

Tests that pin this down: `src/domain/__tests__/routing.test.ts` and `src/ui/__tests__/floorLayout.test.ts` (07, Floor plans).

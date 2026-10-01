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

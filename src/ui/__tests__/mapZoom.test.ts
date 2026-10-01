import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampView, fitView, MAX_ZOOM, panBy, rotatedBox, turnView, viewBoxOf, zoomAt, type Box } from '../mapZoom';

const box: Box = [0, 0, 1000, 500];

test('the fitted view shows the whole floor', () => {
  assert.deepEqual(viewBoxOf(fitView(box), box), box);
});

test('zooming keeps the point under the pointer in place', () => {
  const v = zoomAt(fitView(box), 2, 250, 125, box);
  assert.equal(v.zoom, 2);
  const [x, y, w, h] = viewBoxOf(v, box);
  // (250, 125) was a quarter of the way across and down; it still is.
  assert.equal((250 - x) / w, 0.25);
  assert.equal((125 - y) / h, 0.25);
});

test('zoom stays between 1 and the maximum, and the view never leaves the floor', () => {
  assert.equal(zoomAt(fitView(box), 100, 500, 250, box).zoom, MAX_ZOOM);
  assert.equal(zoomAt(fitView(box), 0.1, 500, 250, box).zoom, 1);
  const v = panBy(zoomAt(fitView(box), 2, 500, 250, box), 10_000, 10_000, box);
  const [x, y] = viewBoxOf(v, box);
  assert.deepEqual([x, y], [0, 0]);
  assert.deepEqual(clampView({ zoom: 1, cx: 9999, cy: -9999, angle: 0 }, box), fitView(box));
});

test('a quarter turn shows the whole turned floor in a window of the same shape', () => {
  assert.deepEqual(rotatedBox(box, 90), [250, -250, 500, 1000]);
  assert.deepEqual(rotatedBox(box, 180), box);
  const turned = turnView(fitView(box), 1, box);
  assert.equal(turned.angle, 90);
  // The window keeps the floor's 2:1 shape and is tall enough for the turned floor (1000 high).
  assert.deepEqual(viewBoxOf(turned, box), [-500, -250, 2000, 1000]);
});

test('turning keeps the spot in the middle, and four turns come back to the start', () => {
  const zoomed = clampView({ zoom: 4, cx: 800, cy: 250, angle: 0 }, box);
  const turned = turnView(zoomed, 1, box);
  // (800, 250) is 300 right of the centre (500, 250); a clockwise quarter turn puts it 300 below.
  assert.deepEqual([turned.cx, turned.cy], [500, 550]);
  assert.equal(turnView(turned, -1, box).angle, 0);
  let v = zoomed;
  for (let i = 0; i < 4; i++) v = turnView(v, 1, box);
  assert.deepEqual(v, zoomed);
});

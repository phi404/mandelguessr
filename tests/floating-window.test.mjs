import assert from "node:assert/strict";
import test from "node:test";
import { importTypeScriptModule } from "./helpers/import-typescript-module.mjs";

const {
  constrainWindow, initialWindow, resizeWindow, toggleWindowMinimized,
  visibleWindowWidth, windowHeight, windowWidthLimits,
} = await importTypeScriptModule("../app/game/floating-window-layout.ts");

const desktop = { width: 1200, height: 760, bottomInset: 72 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function assertInside(layout, bounds) {
  assert.ok(layout.x >= 0 && layout.y >= 0);
  assert.ok(layout.x + visibleWindowWidth(layout) <= bounds.width + 1e-8);
  assert.ok(layout.y + windowHeight(layout) <= bounds.height - bounds.bottomInset + 1e-8);
}

test("target resize accepts continuous widths and anchors the opposite corner", () => {
  const start = initialWindow(desktop);
  for (const width of [281.25, 333.875, 467.375, 700.125]) {
    const resized = resizeWindow(start, width, desktop, "top-left");
    near(resized.width, width);
    near(resized.x + resized.width, start.x + start.width);
    near(resized.y + windowHeight(resized), start.y + windowHeight(start));
    assertInside(resized, desktop);
  }
  const moved = { ...start, x: 40, y: 30 };
  const resized = resizeWindow(moved, 360.5, desktop, "bottom-right");
  near(resized.x, moved.x);
  near(resized.y, moved.y);
});

test("moving a manually resized target does not reset its size", () => {
  const resized = resizeWindow(initialWindow(desktop), 527.375, desktop, "top-left");
  const moved = constrainWindow({ ...resized, x: -500, y: 2000 }, desktop);
  near(moved.width, 527.375);
  assertInside(moved, desktop);
});

test("minimize and restore preserve the target width and its bottom-right anchor", () => {
  const start = resizeWindow(initialWindow(desktop), 517.375, desktop, "top-left");
  const minimized = toggleWindowMinimized(start, desktop);
  assert.equal(minimized.minimized, true);
  near(minimized.width, start.width);
  assert.ok(windowHeight(minimized) < 50);
  near(minimized.x + visibleWindowWidth(minimized), start.x + start.width);
  near(minimized.y + windowHeight(minimized), start.y + windowHeight(start));
  const restored = toggleWindowMinimized(minimized, desktop);
  assert.deepEqual(restored, start);
  const moved = constrainWindow({ ...minimized, x: 0, y: 0 }, desktop);
  assertInside(toggleWindowMinimized(moved, desktop), desktop);
});

test("resizing and restoring stay inside narrow and short screens above the footer", () => {
  for (const bounds of [
    { width: 320, height: 684, bottomInset: 72 },
    { width: 740, height: 264, bottomInset: 72 },
    { width: 280, height: 260, bottomInset: 72 },
  ]) {
    const start = constrainWindow({ ...initialWindow(desktop), x: 3000, y: 3000 }, bounds);
    const { minimum, maximum } = windowWidthLimits(bounds);
    assertInside(start, bounds);
    for (const corner of ["top-left", "bottom-right"]) {
      for (const width of [-1000, minimum + 0.5, maximum, 10000]) {
        const resized = resizeWindow(start, width, bounds, corner);
        assertInside(resized, bounds);
        assert.ok(resized.width >= minimum && resized.width <= maximum);
        assertInside(toggleWindowMinimized(toggleWindowMinimized(resized, bounds), bounds), bounds);
      }
    }
  }
});

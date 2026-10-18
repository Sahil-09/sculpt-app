import test from "node:test";
import assert from "node:assert/strict";

interface Draft {
  startedAt: number;
  pausedAt?: number | null;
  pausedMs?: number;
}

/** Copy of `elapsedFrom` in lib/workoutSession.tsx. That module imports react-native and
 * expo-file-system, neither of which tsx can load here, so the maths is pinned here.
 * Keep the two in sync. */
function elapsedFrom(draft: Draft, now: number): { elapsedSec: number; isPaused: boolean } {
  const pausedAt = typeof draft.pausedAt === "number" ? draft.pausedAt : null;
  const currentPause = pausedAt == null ? 0 : Math.max(0, now - pausedAt);
  const total = now - draft.startedAt - (draft.pausedMs ?? 0) - currentPause;
  return { elapsedSec: Math.max(0, Math.floor(total / 1000)), isPaused: pausedAt != null };
}

const T0 = 1_700_000_000_000;

test("elapsed counts up while running", () => {
  assert.deepEqual(elapsedFrom({ startedAt: T0 }, T0 + 90_000), {
    elapsedSec: 90,
    isPaused: false
  });
});

test("elapsed freezes while paused", () => {
  // Paused at +60s, observed 5 minutes later: the clock must still read 60.
  const r = elapsedFrom({ startedAt: T0, pausedAt: T0 + 60_000 }, T0 + 360_000);
  assert.equal(r.isPaused, true);
  assert.equal(r.elapsedSec, 60);
});

test("previously paused time is excluded after resuming", () => {
  // Ran 60s, paused 300s, ran another 20s => 80s total.
  const d: Draft = { startedAt: T0, pausedMs: 300_000, pausedAt: null };
  assert.deepEqual(elapsedFrom(d, T0 + 380_000), { elapsedSec: 80, isPaused: false });
});

test("multiple pauses accumulate", () => {
  // Two 120s pauses inside a 600s span => 360s of real work.
  const d: Draft = { startedAt: T0, pausedMs: 240_000 };
  assert.equal(elapsedFrom(d, T0 + 600_000).elapsedSec, 360);
});

test("pausedAt null or undefined means running", () => {
  assert.equal(elapsedFrom({ startedAt: T0, pausedAt: null }, T0 + 10_000).isPaused, false);
  assert.equal(elapsedFrom({ startedAt: T0 }, T0 + 10_000).isPaused, false);
});

test("elapsed never goes negative", () => {
  // Clock skew or a stale draft must not render a negative duration.
  assert.equal(elapsedFrom({ startedAt: T0 }, T0 - 5_000).elapsedSec, 0);
  assert.equal(elapsedFrom({ startedAt: T0, pausedMs: 999_999 }, T0 + 1_000).elapsedSec, 0);
});
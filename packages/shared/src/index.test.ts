import test from "node:test";
import assert from "node:assert/strict";
import { estimate1RM, plateBreakdown, warmupRamp } from "./index.js";

test("estimate1RM calculates accurate 1RM using Epley formula", () => {
  assert.equal(estimate1RM(100, 1), 100);
  assert.equal(estimate1RM(100, 10), 133.33);
  assert.equal(estimate1RM(0, 5), null);
  assert.equal(estimate1RM(null, 5), null);
  assert.equal(estimate1RM(100, null), null);
});

test("plateBreakdown breaks down weights into rack plates correctly", () => {
  const result = plateBreakdown(100, 20, [20, 15, 10, 5, 2.5, 1.25]);
  // (100 - 20) / 2 = 40 per side -> 20 + 20
  assert.deepEqual(result.plates, [20, 20]);
  assert.equal(result.remainder, 0);

  const odd = plateBreakdown(63, 20, [20, 15, 10, 5, 2.5, 1.25]);
  // 43 / 2 = 21.5 -> 20 + 1.25 = 21.25, remainder 0.5 total
  assert.deepEqual(odd.plates, [20, 1.25]);
  assert.equal(odd.remainder, 0.5);
});

test("warmupRamp produces progression sets", () => {
  const ramp = warmupRamp(100, 3);
  assert.equal(ramp.length, 3);
  assert.ok(ramp[0].kg < ramp[1].kg);
  assert.ok(ramp[1].kg < ramp[2].kg);
  assert.ok(ramp[2].kg < 100);
});

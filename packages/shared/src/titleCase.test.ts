import test from "node:test";
import assert from "node:assert/strict";
import { EXERCISE_DATASET } from "./index.js";
import { titleCase } from "./exerciseDataset.js";

test("titleCase capitalises words without mangling numbers or symbols", () => {
  assert.equal(titleCase("air bike"), "Air Bike");
  assert.equal(titleCase("45° side bend"), "45° Side Bend");
  assert.equal(titleCase("3/4 sit-up"), "3/4 Sit-Up");
  assert.equal(titleCase("barbell bent-over row"), "Barbell Bent-Over Row");
  assert.equal(titleCase("standing cable row (rope)"), "Standing Cable Row (Rope)");
  assert.equal(titleCase("push-up"), "Push-Up");
  assert.equal(titleCase("on incline decline bench press"), "On Incline Decline Bench Press");
});

test("titleCase is idempotent", () => {
  const once = titleCase("weighted donkey calf raise");
  assert.equal(titleCase(once), once);
  assert.equal(once, "Weighted Donkey Calf Raise");
});

test("every catalogue name is title cased", () => {
  for (const e of EXERCISE_DATASET) {
    assert.equal(e.name, titleCase(e.name), `${e.id} "${e.name}" is not title cased`);
    // A lowercase first letter is the specific defect users reported.
    assert.ok(!/^[a-z]/.test(e.name), `${e.id} "${e.name}" starts lowercase`);
  }
});

test("title casing changes only letter case, never which name is which", () => {
  // Guards the real risk: two distinct upstream names merging into one label. Because
  // titleCase only upper-cases letters, the lower-cased form is invariant, so the set of
  // distinct names -- and therefore any pre-existing duplicates -- is unchanged.
  const lower = new Set<string>();
  const distinct = new Set<string>();
  for (const e of EXERCISE_DATASET) {
    lower.add(e.name.toLowerCase());
    distinct.add(e.name);
  }
  // 1324 records, 1318 distinct lower-cased names: upstream ships 6 duplicate pairs
  // (0088/1371, 0454/1628, 0576/0577, 0655/0656, 0697/1766, 0763/1394).
  assert.equal(EXERCISE_DATASET.length, 1324);
  assert.equal(lower.size, 1318);
  assert.equal(distinct.size, 1318);
});
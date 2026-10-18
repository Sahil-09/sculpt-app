import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkoutPayload, payloadVolume } from "./workoutPayload.js";

test("buildWorkoutPayload converts live exercises into valid API payload", () => {
  const payload = buildWorkoutPayload({
    name: "Push Day",
    startTimeMs: 1700000000000,
    endTimeMs: 1700003600000,
    exercises: [
      {
        exerciseId: "bench",
        notes: "belt on, pause 1s on rep 3",
        restSec: 90,
        supersetGroup: null,
        sets: [
          { kg: "100", reps: "5", rpe: "8.5", done: true, kind: "normal" },
          { kg: "", reps: "", rpe: "", done: false, kind: "normal" }
        ]
      },
      {
        exerciseId: "empty-ex",
        notes: "",
        restSec: null,
        supersetGroup: null,
        sets: [] // should filter out
      }
    ]
  });

  assert.equal(payload.name, "Push Day");
  assert.equal(payload.exercises.length, 1);
  assert.equal(payload.exercises[0].exerciseId, "bench");
  assert.equal(payload.exercises[0].notes, "belt on, pause 1s on rep 3");
  assert.equal(payload.exercises[0].sets[0].kg, 100);
  assert.equal(payload.exercises[0].sets[0].reps, 5);
  assert.equal(payload.exercises[0].sets[0].rpe, 8.5);
  assert.equal(payload.exercises[0].sets[1].kg, null);

  const vol = payloadVolume(payload);
  assert.equal(vol, 500); // 100 * 5 for the done set
});

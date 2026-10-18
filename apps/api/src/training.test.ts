import test from "node:test";
import assert from "node:assert/strict";
import { computeBests, detectPRs } from "@sculpt/shared";

test("computeBests aggregates prior session bests", () => {
  const prior = [
    {
      startTime: new Date("2026-01-01T10:00:00Z"),
      exercises: [
        {
          exerciseId: "bench-press",
          sets: [
            { kg: 80, reps: 5, done: true },
            { kg: 85, reps: 3, done: true },
            { kg: 90, reps: 1, done: false } // not done, should ignore
          ]
        }
      ]
    }
  ];

  const bests = computeBests(prior);
  const bench = bests.get("bench-press");
  assert.ok(bench);
  assert.equal(bench.heaviest, 85);
  assert.equal(bench.mostReps, 5);
  assert.equal(bench.sessions, 1);
});

test("detectPRs flags new personal records", () => {
  const prior = [
    {
      startTime: new Date("2026-01-01T10:00:00Z"),
      exercises: [
        {
          exerciseId: "bench-press",
          sets: [{ kg: 80, reps: 5, done: true }]
        }
      ]
    }
  ];

  const bests = computeBests(prior);

  const newWorkout = {
    exercises: [
      {
        exerciseId: "bench-press",
        sets: [
          { kg: 85, reps: 5, done: true, pr: false }
        ]
      }
    ]
  };

  const prs = detectPRs(bests, newWorkout);
  assert.ok(prs.length > 0);
  assert.ok(prs.some((p) => p.kind === "heaviest" && p.value === 85));
  assert.equal(newWorkout.exercises[0].sets[0].pr, true);
});

import test from "node:test";
import assert from "node:assert/strict";

/** Copy of the helpers in app/(tabs)/stats.tsx. They are module-private to a screen file
 * that React Native cannot import under tsx, so they are mirrored here and pinned. */

/** Whole kilos below 1000, thousands above, so small numbers never collapse to "0k". */
const kgLabel = (kg: number) => {
  const v = Math.round(kg);
  return v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
};

interface SetRow {
  kg?: number | null;
  reps?: number | null;
  done?: boolean;
}
interface WorkoutDoc {
  startTime: string;
  exercises: Array<{ exerciseId: string; sets: SetRow[] }>;
}

function dailyVolumeByDay(items: WorkoutDoc[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const w of items) {
    const d = new Date(w.startTime);
    if (Number.isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 10);
    let vol = totals.get(key) ?? 0;
    for (const ex of w.exercises ?? []) {
      for (const set of ex.sets ?? []) {
        if (set.done === false) continue;
        vol += (set.kg ?? 0) * (set.reps ?? 0);
      }
    }
    totals.set(key, vol);
  }
  return totals;
}

test("kgLabel never renders a real tonnage as zero", () => {
  // Regression: the Stats summary used Math.round(kg/1000), which printed "0k" for the
  // 450 kg that the Muscle Split section displayed correctly two cards below.
  assert.equal(kgLabel(450), "450");
  assert.equal(kgLabel(999), "999");
  assert.equal(kgLabel(1000), "1k");
  assert.equal(kgLabel(1450), "1k");
  assert.equal(kgLabel(24_850), "25k");
  assert.equal(kgLabel(0), "0");
  assert.notEqual(kgLabel(450), "0k");
});

test("dailyVolumeByDay sums volume and skips undone sets", () => {
  const items: WorkoutDoc[] = [
    {
      startTime: "2026-10-18T07:00:00.000Z",
      exercises: [
        {
          exerciseId: "a",
          sets: [
            { kg: 30, reps: 15, done: true },
            { kg: 100, reps: 10, done: false },
            { kg: null, reps: 10, done: true }
          ]
        }
      ]
    },
    {
      startTime: "2026-10-18T18:00:00.000Z",
      exercises: [{ exerciseId: "b", sets: [{ kg: 20, reps: 10, done: true }] }]
    }
  ];
  const totals = dailyVolumeByDay(items);
  assert.equal(totals.get("2026-10-18"), 450 + 200);
  assert.equal(totals.size, 1);
});

test("dailyVolumeByDay ignores unparseable dates instead of throwing", () => {
  const totals = dailyVolumeByDay([
    { startTime: "not-a-date", exercises: [{ exerciseId: "a", sets: [{ kg: 10, reps: 10 }] }] }
  ]);
  assert.equal(totals.size, 0);
});
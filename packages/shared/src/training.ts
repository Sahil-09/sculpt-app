import { z } from "zod";

// This module is a leaf: it must not import from ./index, or the compiled
// output becomes index -> training -> index and Metro warns about a require
// cycle on every startup. index.ts re-exports everything below.
export const PersonalRecordSchema = z.object({
  exerciseId: z.string(),
  kind: z.enum(["heaviest", "most_reps", "best_1rm", "best_set_volume", "best_duration", "most_distance"]),
  value: z.number(),
  unit: z.string()
});
export type PersonalRecord = z.infer<typeof PersonalRecordSchema>;

/** Epley formula estimated 1RM. Returns null when inputs are unusable. */
export function estimate1RM(kg: number | null | undefined, reps: number | null | undefined): number | null {
  if (kg == null || reps == null || kg <= 0 || reps <= 0) return null;
  if (reps === 1) return Math.round(kg * 100) / 100;
  return Math.round(kg * (1 + reps / 30) * 100) / 100;
}

// Loose input shapes: accept both plain JSON and Mongoose lean docs.
interface LooseSet {
  kg?: unknown;
  reps?: unknown;
  durationSec?: unknown;
  distanceM?: unknown;
  done?: unknown;
  pr?: boolean;
}

interface LooseExercise {
  exerciseId: string;
  sets: LooseSet[];
}

interface LooseWorkout {
  startTime: Date;
  exercises: LooseExercise[];
}

export interface ExerciseBests {
  heaviest: number | null;
  mostReps: number | null;
  best1rm: number | null;
  bestSetVolume: number | null;
  bestDuration: number | null;
  mostDistance: number | null;
  sessions: number;
  lastPerformed: Date | null;
}

type MetricKey = "heaviest" | "mostReps" | "best1rm" | "bestSetVolume" | "bestDuration" | "mostDistance";

const METRICS: MetricKey[] = ["heaviest", "mostReps", "best1rm", "bestSetVolume", "bestDuration", "mostDistance"];

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function better(cur: number | null, v: number): number {
  return cur == null || v > cur ? v : cur;
}

function empty(): ExerciseBests {
  return {
    heaviest: null,
    mostReps: null,
    best1rm: null,
    bestSetVolume: null,
    bestDuration: null,
    mostDistance: null,
    sessions: 0,
    lastPerformed: null
  };
}

function foldSet(b: ExerciseBests, s: LooseSet): void {
  const kg = num(s.kg);
  const reps = num(s.reps);
  if (kg != null && kg > 0) {
    b.heaviest = better(b.heaviest, kg);
    if (reps != null && reps > 0) {
      b.mostReps = better(b.mostReps, reps);
      const e1 = estimate1RM(kg, reps);
      if (e1 != null) b.best1rm = better(b.best1rm, e1);
      b.bestSetVolume = better(b.bestSetVolume, Math.round(kg * reps * 100) / 100);
    }
  } else if (reps != null && reps > 0) {
    b.mostReps = better(b.mostReps, reps);
  }
  const dur = num(s.durationSec);
  if (dur != null && dur > 0) b.bestDuration = better(b.bestDuration, dur);
  const dist = num(s.distanceM);
  if (dist != null && dist > 0) b.mostDistance = better(b.mostDistance, dist);
}

/** Aggregate bests per exercise from prior workouts (only completed sets). */
export function computeBests(prior: LooseWorkout[]): Map<string, ExerciseBests> {
  const map = new Map<string, ExerciseBests>();
  for (const w of prior) {
    for (const ex of w.exercises) {
      let b = map.get(ex.exerciseId);
      if (!b) {
        b = empty();
        map.set(ex.exerciseId, b);
      }
      b.sessions += 1;
      const st = w.startTime instanceof Date ? w.startTime : new Date(w.startTime);
      if (!b.lastPerformed || st > b.lastPerformed) b.lastPerformed = st;
      for (const s of ex.sets) {
        if (s.done === false) continue;
        foldSet(b, s);
      }
    }
  }
  return map;
}

const KIND: Array<[MetricKey, PersonalRecord["kind"], string]> = [
  ["heaviest", "heaviest", "kg"],
  ["mostReps", "most_reps", "reps"],
  ["best1rm", "best_1rm", "kg"],
  ["bestSetVolume", "best_set_volume", "kg"],
  ["bestDuration", "best_duration", "s"],
  ["mostDistance", "most_distance", "m"]
];

/** Flag PR sets against prior bests. Returns PR list (also sets set.pr = true). */
export function detectPRs(prior: Map<string, ExerciseBests>, workout: { exercises: LooseExercise[] }): PersonalRecord[] {
  const prs: PersonalRecord[] = [];
  for (const ex of workout.exercises) {
    const live = empty();
    for (const s of ex.sets) {
      if (s.done !== true) continue;
      const before = prior.get(ex.exerciseId) ?? empty();
      const trial = empty();
      foldSet(trial, s);
      let isPR = false;
      for (const [k, kind, unit] of KIND) {
        const v = trial[k];
        if (v == null || v <= 0) continue;
        if (before[k] == null && live[k] == null) continue; // no baseline yet
        const baseline = Math.max(before[k] ?? -Infinity, live[k] ?? -Infinity);
        if (v > baseline) {
          prs.push({ exerciseId: ex.exerciseId, kind, value: v, unit });
          isPR = true;
        }
      }
      if (isPR) s.pr = true;
      foldSet(live, s);
    }
    const p = prior.get(ex.exerciseId) ?? empty();
    for (const k of METRICS) {
      if (live[k] != null) p[k] = better(p[k], live[k] as number);
    }
    prior.set(ex.exerciseId, p);
  }
  return prs;
}

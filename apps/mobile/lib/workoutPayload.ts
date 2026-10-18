// Pure workout-payload builder (no RN imports → unit-testable with tsx).

export interface PayloadSet {
  kg: string;
  reps: string;
  rpe: string;
  done: boolean;
  kind: string;
}

export interface PayloadExercise {
  exerciseId: string;
  notes: string;
  restSec: number | null;
  supersetGroup: string | null;
  sets: PayloadSet[];
}

export function numOrNull(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface WorkoutPayload {
  name: string;
  startTime: string;
  endTime: string;
  description: string;
  isPrivate: boolean;
  exercises: Array<{
    exerciseId: string;
    notes: string;
    restSec: number | null;
    supersetGroup: string | null;
    sets: Array<{
      type: string;
      kg: number | null;
      reps: number | null;
      rpe: number | null;
      durationSec: null;
      distanceM: null;
      done: boolean;
      pr: boolean;
    }>;
  }>;
}

export function buildWorkoutPayload(opts: {
  name: string;
  startTimeMs: number;
  endTimeMs: number;
  exercises: PayloadExercise[];
}): WorkoutPayload {
  return {
    name: opts.name,
    startTime: new Date(opts.startTimeMs).toISOString(),
    endTime: new Date(opts.endTimeMs).toISOString(),
    description: "",
    isPrivate: false,
    exercises: opts.exercises
      .filter((e) => e.sets.length > 0)
      .map((e) => ({
        exerciseId: e.exerciseId,
        notes: e.notes,
        restSec: e.restSec,
        supersetGroup: e.supersetGroup ?? null,
        sets: e.sets.map((x) => {
          const reps = numOrNull(x.reps);
          return {
            type: x.kind,
            kg: numOrNull(x.kg),
            reps: reps != null ? Math.round(reps) : null,
            rpe: numOrNull(x.rpe),
            durationSec: null,
            distanceM: null,
            done: x.done,
            pr: false
          };
        })
      }))
  };
}

export function payloadVolume(p: WorkoutPayload): number {
  return p.exercises.reduce(
    (t, e) =>
      t +
      e.sets.reduce(
        (s, x) => (x.done && x.kg != null && x.reps != null ? s + x.kg * x.reps : s),
        0
      ),
    0
  );
}

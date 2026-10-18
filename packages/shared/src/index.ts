import { z } from "zod";
import { EXERCISE_DATASET } from "./exerciseDataset";

// Back is split three ways: `lats` (pulldown/pull), `upper_back` (scapular/rear delt),
// `lower_back` (lumbar extension, hip hinge). `back` stays as the undifferentiated label
// the seeded compounds use. `obliques` is kept even though the target taxonomy has no
// such value — dropping it from a live enum invalidates stored rows.
export const MuscleGroup = z.enum([
  "chest",
  "upper_back",
  "lower_back",
  "lats",
  "traps",
  "back",
  "shoulders",
  "neck",
  "biceps",
  "triceps",
  "forearms",
  "quadriceps",
  "hip_flexors",
  "hamstrings",
  "glutes",
  "calves",
  "ankles",
  "adductors",
  "abductors",
  "abdominals",
  "core",
  "obliques",
  "full_body",
  "cardio",
  "other"
]);
export type MuscleGroup = z.infer<typeof MuscleGroup>;

export const Equipment = z.enum([
  "barbell",
  "dumbbell",
  "kettlebell",
  "machine",
  "cable",
  "plate",
  "band",
  "suspension",
  "bodyweight",
  "stability_ball",
  "medicine_ball",
  "rope",
  "assisted",
  "sled_machine",
  "other"
]);
export type Equipment = z.infer<typeof Equipment>;

export const ExerciseType = z.enum([
  "reps_only",
  "weight_reps",
  "bodyweight_reps",
  "weighted_bodyweight",
  "assisted_bodyweight",
  "duration",
  "duration_weight",
  "distance_duration",
  "short_distance_weight",
  "floors_duration",
  "steps_duration"
]);
export type ExerciseType = z.infer<typeof ExerciseType>;

export const ExerciseTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  equipment: Equipment.nullable().optional(),
  primaryMuscle: MuscleGroup,
  // Divergence from the target schema, which has no secondary-muscle field. Kept because
  // it is populated on every seeded row and validated on read; removing it would silently
  // drop data already in Mongo (apps/api/src/models.ts) and in the on-device mirror.
  secondaryMuscles: z.array(MuscleGroup).default([]),
  type: ExerciseType,
  isCustom: z.boolean().default(false),
  ownerId: z.string().nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
  // Multilingual instructions keyed by ISO 639-1 code. The exercise-dataset ships ten
  // (en, it, tr, es, ru, zh, hi, pl, ko, fr), each with a prose `text` block and the same
  // content split into ordered `steps`. Optional so records without instructions validate.
  instructions: z
    .record(
      z.string(),
      z.object({ text: z.string().optional(), steps: z.array(z.string()).optional() })
    )
    .optional(),
  // Logical media key only -- the upstream media_id (e.g. "2gPfomN"). Deliberately not a
  // path or URL: the images/GIFs are (c) Gym visual and are never redistributed here, so
  // the copyright notice lives with the media rather than in this catalogue.
  mediaId: z.string().optional(),
  // Upstream body-part category. Kept as its own field rather than merged into
  // primaryMuscle: the source carries both `category` and `body_part`, and they are
  // identical, so bodyPart holds the second spelling.
  category: z.string().optional(),
  bodyPart: z.string().optional()
});
export type ExerciseTemplate = z.infer<typeof ExerciseTemplateSchema>;

export const SetType = z.enum(["normal", "warmup", "drop", "failure"]);
export type SetType = z.infer<typeof SetType>;

export const WorkoutSetSchema = z.object({
  type: SetType.default("normal"),
  kg: z.number().nullable().optional(),
  reps: z.number().nullable().optional(),
  rpe: z.number().min(1).max(10).nullable().optional(),
  durationSec: z.number().nullable().optional(),
  distanceM: z.number().nullable().optional(),
  done: z.boolean().default(false),
  pr: z.boolean().default(false)
});
export type WorkoutSet = z.infer<typeof WorkoutSetSchema>;

export const WorkoutExerciseSchema = z.object({
  exerciseId: z.string(),
  notes: z.string().max(2000).default(""),
  restSec: z.number().int().min(0).max(3600).nullable().optional(),
  supersetGroup: z.string().nullable().optional(),
  sets: z.array(WorkoutSetSchema).min(1).max(50)
});
export type WorkoutExercise = z.infer<typeof WorkoutExerciseSchema>;

export const RoutineSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  folderId: z.string().nullable().optional(),
  exercises: z.array(WorkoutExerciseSchema).min(1).max(60)
});
export type Routine = z.infer<typeof RoutineSchema>;

export const WorkoutSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  routineId: z.string().nullable().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().nullable().optional(),
  exercises: z.array(WorkoutExerciseSchema).min(1).max(60),
  description: z.string().max(5000).default(""),
  isPrivate: z.boolean().default(false)
});
export type Workout = z.infer<typeof WorkoutSchema>;

export const FREE_LIMITS = {
  maxRoutines: 4,
  maxCustomExercises: 7,
  historyDays: 90
} as const;

export const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(80)
});
export type Register = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128)
});
export type Login = z.infer<typeof LoginSchema>;

export const FolderSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80)
});
export type Folder = z.infer<typeof FolderSchema>;

export const RoutineUpdateSchema = RoutineSchema.partial().extend({
  name: z.string().min(1).max(120).optional()
});
export type RoutineUpdate = z.infer<typeof RoutineUpdateSchema>;

export const CustomExerciseCreateSchema = z.object({
  name: z.string().min(1).max(120),
  equipment: Equipment.nullable().optional(),
  primaryMuscle: MuscleGroup,
  secondaryMuscles: z.array(MuscleGroup).default([]),
  type: ExerciseType,
  mediaUrl: z.string().nullable().optional()
});
export type CustomExerciseCreate = z.infer<typeof CustomExerciseCreateSchema>;

export const WorkoutSettingsSchema = z.object({
  units: z.enum(["kg", "lbs"]).default("kg"),
  defaultRestSec: z.number().int().min(0).max(3600).default(90),
  rpeTracking: z.boolean().default(false),
  plateCalculator: z.boolean().default(true),
  plateRacks: z.array(z.number().positive()).default([20, 15, 10, 5, 2.5, 1.25]),
  barWeight: z.number().min(0).max(100).default(20),
  warmupCalculator: z.boolean().default(false),
  warmupSets: z.number().int().min(0).max(10).default(3),
  previousValues: z.enum(["last", "best"]).default("last")
});
export type WorkoutSettings = z.infer<typeof WorkoutSettingsSchema>;

export const DEFAULT_SETTINGS: WorkoutSettings = WorkoutSettingsSchema.parse({});

/** Plates to load per side for a target weight. Returns { plates, remainder }. */
export function plateBreakdown(
  targetKg: number,
  barKg: number,
  racks: number[]
): { plates: number[]; remainder: number } {
  let remaining = Math.max(0, (targetKg - barKg) / 2);
  const plates: number[] = [];
  const sorted = [...racks].sort((a, b) => b - a);
  for (const p of sorted) {
    while (remaining + 1e-9 >= p) {
      plates.push(p);
      remaining = Math.round((remaining - p) * 1000) / 1000;
    }
  }
  return { plates, remainder: Math.round(remaining * 2 * 100) / 100 };
}

/** Warm-up ramp: linear percentages of the working weight across N sets. */
export function warmupRamp(targetKg: number, sets: number): Array<{ pct: number; kg: number; reps: number }> {
  if (targetKg <= 0 || sets <= 0) return [];
  const out: Array<{ pct: number; kg: number; reps: number }> = [];
  for (let i = 1; i <= sets; i++) {
    const pct = 0.4 + (0.5 * i) / (sets + 1);
    const roundedPct = Math.round(pct * 100) / 100;
    out.push({
      pct: roundedPct,
      kg: Math.round(targetKg * roundedPct * 4) / 4,
      reps: Math.max(3, 10 - i * 2)
    });
  }
  return out;
}

export const SET_TYPE_META: Record<SetType, { label: string; short: string; color: string }> = {
  normal: { label: "Normal", short: "N", color: "#9aa0a6" },
  warmup: { label: "Warm-up", short: "W", color: "#ffb340" },
  drop: { label: "Drop set", short: "D", color: "#4da3ff" },
  failure: { label: "Failure", short: "F", color: "#ff5a5a" }
};

export const SUPERSET_COLORS = ["#4da3ff", "#34c759", "#b57bff", "#ffb340", "#ff7ab8", "#4dd6c7"];

export const BodyMeasurementSchema = z.object({
  date: z.string().datetime(),
  weightKg: z.number().positive().max(1000).nullable().optional(),
  waistCm: z.number().positive().max(500).nullable().optional(),
  chestCm: z.number().positive().max(500).nullable().optional(),
  armCm: z.number().positive().max(200).nullable().optional(),
  thighCm: z.number().positive().max(300).nullable().optional(),
  hipCm: z.number().positive().max(500).nullable().optional(),
  bodyFatPct: z.number().min(0).max(100).nullable().optional(),
  note: z.string().max(500).default("")
});
export type BodyMeasurement = z.infer<typeof BodyMeasurementSchema>;

/** Free plan only tracks weight + waist; extra fields need Pro. */
export const PRO_MEASUREMENT_FIELDS = ["chestCm", "armCm", "thighCm", "hipCm", "bodyFatPct"] as const;

export const ProgressPhotoSchema = z.object({
  date: z.string().datetime(),
  url: z.string().url().max(2000),
  kind: z.enum(["front", "side", "back", "other"]).default("other"),
  note: z.string().max(500).default("")
});
export type ProgressPhoto = z.infer<typeof ProgressPhotoSchema>;

// Re-exported last to keep @sculpt/shared one flat surface. ./training and ./exerciseDataset
// are leaves: training holds the PR/1RM maths and exerciseDataset only data, neither imports
// back at runtime, so the compiled output has no require cycle.
export * from "./training";
export * from "./exerciseDataset";

// Validated at module load, not lazily: a malformed curated record must fail the build or the
// dev server on import instead of reaching Mongo or the on-device mirror unvalidated.
ExerciseTemplateSchema.array().parse(EXERCISE_DATASET);

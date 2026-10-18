// Generated exercise catalogue: 1324 entries from the MIT-licensed
// exercise-dataset (E:/dev/Forks/exercise-dataset, data/exercises.json).
//
// MEDIA LICENCE: the upstream images/GIFs are (c) Gym visual and are NOT redistributed.
// This module carries media by LOGICAL KEY only -- `mediaId` is the upstream `media_id`
// (e.g. "2gPfomN"). No filesystem path, URL, `image`, `gif_url` or `attribution` is
// present here; the copyright notice must live with the media, never in this catalogue.
//
// Field mapping: name->name, category->category, body_part->bodyPart, equipment->equipment
// (28 source values), target->primaryMuscle, secondary_muscles + muscle_group->secondaryMuscles.
// The one correction applied after generation is weighted->bodyweight; see the note at the bottom.
// `type` is DERIVED (the source has no type field): assisted->assisted_bodyweight,
// weighted->weighted_bodyweight, cardio->distance_duration (stepmill->steps_duration),
// body weight->reps_only, everything else->weight_reps.
//
// The records live in exerciseDataset.NN.ts chunks because tsc cannot represent a single
// 1324-element object literal (TS2590). Type-only imports keep every chunk a leaf, so the
// compiled output has no require cycle. The whole array is validated against
// ExerciseTemplateSchema at module load, in index.ts.
import type { ExerciseTemplate } from "./index";
import { CHUNK_1 } from "./exerciseDataset.01";
import { CHUNK_2 } from "./exerciseDataset.02";
import { CHUNK_3 } from "./exerciseDataset.03";
import { CHUNK_4 } from "./exerciseDataset.04";
import { CHUNK_5 } from "./exerciseDataset.05";
import { CHUNK_6 } from "./exerciseDataset.06";
import { CHUNK_7 } from "./exerciseDataset.07";

const DATA: ExerciseTemplate[] = [
  ...CHUNK_1,
  ...CHUNK_2,
  ...CHUNK_3,
  ...CHUNK_4,
  ...CHUNK_5,
  ...CHUNK_6,
  ...CHUNK_7
];

/**
 * Upstream ships every name lowercase ("air bike", "3/4 sit-up"). Capitalise the first
 * letter of each word so the catalogue reads as titles in every surface -- picker rows,
 * history, stats -- instead of patching the casing at a dozen call sites. Applied here, at
 * the source, so Mongo, the on-device mirror and the web app all agree.
 * Idempotent: only lowercase letters are touched, so re-running cannot double-capitalise.
 */
export function titleCase(name: string): string {
  return name.replace(/(^|[\s\-/([{])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

// Frozen so callers cannot mutate the shared catalogue in place. Records are frozen too
// (matching the previous catalogue); nested instruction maps are left mutable, as before.
// Validation happens at module load in index.ts, not here.
//
// The upstream mapper filed `equipment: "weighted"` under `plate`, but that value means
// *weighted bodyweight* — weighted bench dip, weighted drop push up, weighted crunch,
// weighted cossack squats. None of them load a plate, so all 36 are corrected here to
// `bodyweight`. shortcut: this rewrites every `plate` unconditionally because `weighted`
// is the only source value that produced one; if real plate exercises are ever generated,
// fix the chunk mapper instead of patching here.
export const EXERCISE_DATASET: readonly ExerciseTemplate[] = Object.freeze(
  DATA.map((e) =>
    Object.freeze({
      ...e,
      name: titleCase(e.name),
      equipment: e.equipment === "plate" ? "bodyweight" : e.equipment
    })
  )
);

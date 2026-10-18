import { Schema, model, type InferSchemaType } from "mongoose";

const WorkoutSetSchema = new Schema(
  {
    type: { type: String, enum: ["normal", "warmup", "drop", "failure"], default: "normal" },
    kg: { type: Number, default: null },
    reps: { type: Number, default: null },
    rpe: { type: Number, default: null },
    durationSec: { type: Number, default: null },
    distanceM: { type: Number, default: null },
    done: { type: Boolean, default: false },
    pr: { type: Boolean, default: false }
  },
  { _id: false }
);

const WorkoutExerciseSchema = new Schema(
  {
    exerciseId: { type: String, required: true, index: true },
    notes: { type: String, default: "" },
    restSec: { type: Number, default: null },
    supersetGroup: { type: String, default: null },
    sets: { type: [WorkoutSetSchema], default: [] }
  },
  { _id: false }
);

const WorkoutSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    routineId: { type: String, default: null },
    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, default: null },
    exercises: { type: [WorkoutExerciseSchema], default: [] },
    description: { type: String, default: "" },
    isPrivate: { type: Boolean, default: false }
  },
  { timestamps: true }
);

WorkoutSchema.index({ userId: 1, startTime: -1 });

export type WorkoutDoc = InferSchemaType<typeof WorkoutSchema>;
export const WorkoutModel = model("Workout", WorkoutSchema);

const ExerciseTemplateSchema = new Schema(
  {
    datasetId: { type: String, default: null, index: true },
    name: { type: String, required: true, index: true },
    category: { type: String, default: null, index: true },
    bodyPart: { type: String, default: null, index: true },
    equipment: { type: String, default: null, index: true },
    primaryMuscle: { type: String, required: true, index: true },
    secondaryMuscles: { type: [String], default: [] },
    type: { type: String, required: true },
    isCustom: { type: Boolean, default: false },
    ownerId: { type: String, default: null, index: true },
    mediaId: { type: String, default: null },
    mediaUrl: { type: String, default: null },
    gifUrl: { type: String, default: null },
    instructions: { type: Schema.Types.Mixed, default: undefined }
  },
  { timestamps: true }
);

ExerciseTemplateSchema.index({ name: "text" });
export const ExerciseTemplateModel = model("ExerciseTemplate", ExerciseTemplateSchema);

const UserSettingsSchema = new Schema(
  {
    units: { type: String, enum: ["kg", "lbs"], default: "kg" },
    defaultRestSec: { type: Number, default: 90 },
    rpeTracking: { type: Boolean, default: false },
    plateCalculator: { type: Boolean, default: true },
    plateRacks: { type: [Number], default: [20, 15, 10, 5, 2.5, 1.25] },
    barWeight: { type: Number, default: 20 },
    warmupCalculator: { type: Boolean, default: false },
    warmupSets: { type: Number, default: 3 },
    previousValues: { type: String, enum: ["last", "best"], default: "last" }
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, default: null },
    name: { type: String, required: true },
    googleSub: { type: String, default: null, index: true },
    appleSub: { type: String, default: null, index: true },
    isPro: { type: Boolean, default: false },
    units: { type: String, enum: ["kg", "lbs"], default: "kg" },
    settings: { type: UserSettingsSchema, default: () => ({}) }
  },
  { timestamps: true }
);

export const UserModel = model("User", UserSchema);

const RoutineFolderSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true }
  },
  { timestamps: true }
);

RoutineFolderSchema.index({ userId: 1, name: 1 }, { unique: true });

export const RoutineFolderModel = model("RoutineFolder", RoutineFolderSchema);

const RoutineSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    folderId: { type: String, default: null, index: true },
    shareSlug: { type: String, required: false, unique: true, sparse: true },
    exercises: { type: [WorkoutExerciseSchema], default: [] }
  },
  { timestamps: true }
);

export const RoutineModel = model("Routine", RoutineSchema);

const BodyMeasurementSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    weightKg: { type: Number, default: null },
    waistCm: { type: Number, default: null },
    chestCm: { type: Number, default: null },
    armCm: { type: Number, default: null },
    thighCm: { type: Number, default: null },
    hipCm: { type: Number, default: null },
    bodyFatPct: { type: Number, default: null },
    note: { type: String, default: "" }
  },
  { timestamps: true }
);

BodyMeasurementSchema.index({ userId: 1, date: -1 });

export const BodyMeasurementModel = model("BodyMeasurement", BodyMeasurementSchema);

const ProgressPhotoSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    url: { type: String, required: true },
    kind: { type: String, enum: ["front", "side", "back", "other"], default: "other" },
    note: { type: String, default: "" }
  },
  { timestamps: true }
);

ProgressPhotoSchema.index({ userId: 1, date: -1 });

export const ProgressPhotoModel = model("ProgressPhoto", ProgressPhotoSchema);

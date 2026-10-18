import { Router } from "express";
import { randomUUID } from "crypto";
import {
  WorkoutSchema,
  RoutineSchema,
  RoutineUpdateSchema,
  RegisterSchema,
  LoginSchema,
  FolderSchema,
  CustomExerciseCreateSchema,
  WorkoutSettingsSchema,
  DEFAULT_SETTINGS,
  BodyMeasurementSchema,
  ProgressPhotoSchema,
  PRO_MEASUREMENT_FIELDS,
  FREE_LIMITS,
  computeBests,
  detectPRs
} from "@sculpt/shared";
import { s3, mediaBucket, publicUrl } from "./storage.js";
import {
  WorkoutModel,
  RoutineModel,
  RoutineFolderModel,
  ExerciseTemplateModel,
  BodyMeasurementModel,
  ProgressPhotoModel,
  UserModel
} from "./models.js";
import {
  hashPassword,
  verifyPassword,
  signAccess,
  signRefresh,
  verifyToken,
  requireAuth,
  verifyGoogleIdToken,
  decodeAppleIdentityToken,
  type AuthedRequest
} from "./auth.js";
import { LIBRARY_PROGRAMS } from "./programs.js";

export const apiRouter = Router();

function uid(req: AuthedRequest): string {
  return req.userId;
}

async function isPro(userId: string): Promise<boolean> {
  if (userId === "demo-user") return false;
  const u = await UserModel.findById(userId).lean();
  return u?.isPro === true;
}

// ---------- Auth ----------
apiRouter.post("/auth/register", async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const email = parsed.data.email.toLowerCase();
  const existing = await UserModel.findOne({ email }).lean();
  if (existing) return res.status(409).json({ error: "Email already registered" });
  const doc = await UserModel.create({
    email,
    name: parsed.data.name,
    passwordHash: await hashPassword(parsed.data.password)
  });
  const id = String(doc._id);
  res.status(201).json({
    user: { id, email, name: doc.name },
    accessToken: signAccess(id),
    refreshToken: signRefresh(id)
  });
});

apiRouter.post("/auth/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = await UserModel.findOne({ email: parsed.data.email.toLowerCase() });
  if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const id = String(user._id);
  res.json({
    user: { id, email: user.email, name: user.name },
    accessToken: signAccess(id),
    refreshToken: signRefresh(id)
  });
});

apiRouter.post("/auth/refresh", async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) return res.status(400).json({ error: "refreshToken required" });
  const userId = verifyToken(refreshToken, "refresh");
  if (!userId) return res.status(401).json({ error: "Invalid refresh token" });
  res.json({ accessToken: signAccess(userId), refreshToken: signRefresh(userId) });
});

apiRouter.post("/auth/google", async (req, res) => {
  const { idToken } = req.body as { idToken?: string };
  if (!idToken) return res.status(400).json({ error: "idToken required" });
  const info = await verifyGoogleIdToken(idToken);
  if (!info) return res.status(401).json({ error: "Invalid Google token" });
  let user = await UserModel.findOne({ googleSub: info.sub });
  if (!user) {
    user = await UserModel.findOne({ email: info.email.toLowerCase() });
    if (user) {
      user.googleSub = info.sub;
      await user.save();
    } else {
      user = await UserModel.create({
        email: info.email.toLowerCase(),
        name: info.name ?? info.email.split("@")[0] ?? "Athlete",
        googleSub: info.sub
      });
    }
  }
  const id = String(user._id);
  res.json({
    user: { id, email: user.email, name: user.name },
    accessToken: signAccess(id),
    refreshToken: signRefresh(id)
  });
});

apiRouter.post("/auth/apple", async (req, res) => {
  const { identityToken, email, name } = req.body as {
    identityToken?: string;
    email?: string;
    name?: string;
  };
  if (!identityToken) return res.status(400).json({ error: "identityToken required" });
  const info = await decodeAppleIdentityToken(identityToken);
  if (!info?.sub) return res.status(401).json({ error: "Invalid Apple token" });
  let user = await UserModel.findOne({ appleSub: info.sub });
  if (!user) {
    const addr = (email ?? info.email ?? "").toLowerCase();
    if (addr) user = await UserModel.findOne({ email: addr });
    if (user) {
      user.appleSub = info.sub;
      await user.save();
    } else if (addr) {
      user = await UserModel.create({
        email: addr,
        name: name ?? addr.split("@")[0] ?? "Athlete",
        appleSub: info.sub
      });
    } else {
      return res.status(400).json({ error: "First Apple sign-in must include email" });
    }
  }
  const id = String(user._id);
  res.json({
    user: { id, email: user.email, name: user.name },
    accessToken: signAccess(id),
    refreshToken: signRefresh(id)
  });
});

apiRouter.get("/auth/me", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  if (userId === "demo-user") return res.json({ user: { id: "demo-user", pro: false } });
  const user = await UserModel.findById(userId).lean();
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    user: { id: String(user._id), email: user.email, name: user.name, pro: user.isPro, units: user.units },
    settings: { ...DEFAULT_SETTINGS, ...(user.settings ?? {}) }
  });
});

// ---------- Health ----------
apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, db: "mongodb" });
});

// ---------- Exercises ----------
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isObjectIdHex(s: string): boolean {
  return /^[a-f0-9]{24}$/i.test(s);
}

apiRouter.get("/exercise-templates", async (req, res) => {
  const {
    muscle,
    equipment,
    type,
    category,
    body_part,
    bodyPart,
    target,
    q,
    ids,
    includeInstructions,
    limit = "2000",
    page = "1"
  } = req.query as Record<string, string>;
  const authHeader = req.headers.authorization;
  let callerId: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    callerId = verifyToken(authHeader.slice(7), "access");
  } else if (process.env.NODE_ENV !== "production" && req.headers["x-user-id"]) {
    callerId = String(req.headers["x-user-id"]);
  }
  const andClauses: Record<string, unknown>[] = [
    callerId
      ? { $or: [{ isCustom: { $ne: true } }, { ownerId: callerId }] }
      : { isCustom: { $ne: true } }
  ];
  if (ids) {
    const list = ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      const objIds = list.filter(isObjectIdHex);
      andClauses.push({
        $or: [
          ...(objIds.length > 0 ? [{ _id: { $in: objIds } }] : []),
          { datasetId: { $in: list } }
        ]
      });
    }
  }
  const muscleFilter = muscle || target;
  if (muscleFilter) andClauses.push({ primaryMuscle: muscleFilter.toLowerCase() });
  if (equipment) andClauses.push({ equipment: equipment.toLowerCase() });
  if (type) andClauses.push({ type: type.toLowerCase() });
  const catFilter = category || body_part || bodyPart;
  if (catFilter) {
    const rx = new RegExp(`^${escapeRegex(catFilter.trim())}$`, "i");
    andClauses.push({ $or: [{ category: rx }, { bodyPart: rx }] });
  }
  if (q && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), "i");
    andClauses.push({
      $or: [{ name: rx }, { primaryMuscle: rx }, { equipment: rx }, { category: rx }]
    });
  }
  const filter = andClauses.length === 1 ? andClauses[0] : { $and: andClauses };
  const lim = Math.min(Math.max(Number(limit) || 2000, 1), 2000);
  const pg = Math.max(Number(page) || 1, 1);
  const projection =
    includeInstructions === "1" || lim <= 50 ? undefined : { instructions: 0 };
  const [items, total] = await Promise.all([
    ExerciseTemplateModel.find(filter, projection)
      .sort({ name: 1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .lean(),
    ExerciseTemplateModel.countDocuments(filter)
  ]);
  res.json({ items, total, page: pg, limit: lim });
});

apiRouter.get("/exercise-templates/:id", async (req, res) => {
  const { id } = req.params;
  const query = isObjectIdHex(id) ? { $or: [{ _id: id }, { datasetId: id }] } : { datasetId: id };
  const doc = await ExerciseTemplateModel.findOne(query).lean();
  if (!doc) return res.status(404).json({ error: "Exercise not found" });
  res.json(doc);
});

// setup.html compatible endpoints (/v1/exercises, /v1/exercises/random, /v1/exercises/:id, /v1/categories, /v1/body-parts, /v1/equipment)
apiRouter.get("/exercises/random", async (_req, res) => {
  const [doc] = await ExerciseTemplateModel.aggregate([{ $match: { isCustom: { $ne: true } } }, { $sample: { size: 1 } }]);
  if (!doc) return res.status(404).json({ error: "Exercise not found" });
  res.json(doc);
});

apiRouter.get("/exercises", async (req, res) => {
  const {
    page = "1",
    limit = "20",
    category,
    body_part,
    equipment,
    muscle_group,
    target,
    q
  } = req.query as Record<string, string>;
  const pg = Number(page);
  const lim = Number(limit);
  if (!Number.isInteger(pg) || pg < 1 || !Number.isInteger(lim) || lim < 1 || lim > 2000) {
    return res.status(400).json({ error: "page and limit must be positive integers" });
  }
  const andClauses: Record<string, unknown>[] = [{ isCustom: { $ne: true } }];
  const cat = category || body_part;
  if (cat) andClauses.push({ category: new RegExp(escapeRegex(cat.trim()), "i") });
  if (equipment) andClauses.push({ equipment: new RegExp(escapeRegex(equipment.trim()), "i") });
  if (target) andClauses.push({ primaryMuscle: new RegExp(escapeRegex(target.trim()), "i") });
  if (muscle_group) {
    const rx = new RegExp(escapeRegex(muscle_group.trim()), "i");
    andClauses.push({ $or: [{ primaryMuscle: rx }, { secondaryMuscles: rx }] });
  }
  if (q && q.trim()) {
    andClauses.push({ name: new RegExp(escapeRegex(q.trim()), "i") });
  }
  const filter = andClauses.length === 1 ? andClauses[0] : { $and: andClauses };
  const [data, total] = await Promise.all([
    ExerciseTemplateModel.find(filter)
      .sort({ datasetId: 1, name: 1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .lean(),
    ExerciseTemplateModel.countDocuments(filter)
  ]);
  res.json({
    data,
    items: data,
    total,
    page: pg,
    limit: lim,
    totalPages: Math.ceil(total / lim)
  });
});

apiRouter.get("/exercises/:id", async (req, res) => {
  const { id } = req.params;
  const query = isObjectIdHex(id) ? { $or: [{ _id: id }, { datasetId: id }] } : { datasetId: id };
  const doc = await ExerciseTemplateModel.findOne(query).lean();
  if (!doc) return res.status(404).json({ error: "Exercise not found" });
  res.json(doc);
});

apiRouter.get("/categories", async (_req, res) => {
  const vals = (await ExerciseTemplateModel.distinct("category", { isCustom: { $ne: true } }))
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .sort();
  res.json(vals);
});

apiRouter.get("/body-parts", async (_req, res) => {
  const vals = (await ExerciseTemplateModel.distinct("bodyPart", { isCustom: { $ne: true } }))
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .sort();
  res.json(vals);
});

apiRouter.get("/equipment", async (_req, res) => {
  const vals = (await ExerciseTemplateModel.distinct("equipment", { isCustom: { $ne: true } }))
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .sort();
  res.json(vals);
});

apiRouter.post("/exercise-templates", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const parsed = CustomExerciseCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (userId !== "demo-user") {
    const count = await ExerciseTemplateModel.countDocuments({ ownerId: userId, isCustom: true });
    if (!(await isPro(userId)) && count >= FREE_LIMITS.maxCustomExercises) {
      return res.status(402).json({ error: "Free limit: 7 custom exercises. Upgrade to Pro." });
    }
  }
  const doc = await ExerciseTemplateModel.create({ ...parsed.data, isCustom: true, ownerId: userId });
  res.status(201).json(doc);
});

apiRouter.patch("/exercise-templates/:id", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const parsed = CustomExerciseCreateSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const doc = await ExerciseTemplateModel.findOneAndUpdate(
    { _id: req.params.id, ownerId: userId, isCustom: true },
    { $set: parsed.data },
    { new: true }
  ).lean();
  if (!doc) return res.status(404).json({ error: "Custom exercise not found" });
  res.json(doc);
});

apiRouter.delete("/exercise-templates/:id", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const r = await ExerciseTemplateModel.deleteOne({
    _id: req.params.id,
    ownerId: userId,
    isCustom: true
  });
  if (!r.deletedCount) return res.status(404).json({ error: "Custom exercise not found" });
  res.json({ ok: true });
});

// ---------- Routine folders ----------
apiRouter.post("/routine-folders", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const parsed = FolderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const doc = await RoutineFolderModel.create({ userId, name: parsed.data.name });
    res.status(201).json(doc);
  } catch {
    res.status(409).json({ error: "Folder name already exists" });
  }
});

apiRouter.get("/routine-folders", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const docs = await RoutineFolderModel.find({ userId }).sort({ name: 1 }).lean();
  res.json({ items: docs });
});

apiRouter.patch("/routine-folders/:id", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const parsed = FolderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const doc = await RoutineFolderModel.findOneAndUpdate(
    { _id: req.params.id, userId },
    { $set: { name: parsed.data.name } },
    { new: true }
  ).lean();
  if (!doc) return res.status(404).json({ error: "Folder not found" });
  res.json(doc);
});

apiRouter.delete("/routine-folders/:id", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const folder = await RoutineFolderModel.findOneAndDelete({ _id: req.params.id, userId }).lean();
  if (!folder) return res.status(404).json({ error: "Folder not found" });
  await RoutineModel.updateMany(
    { userId, folderId: String(folder._id) },
    { $set: { folderId: null } }
  );
  res.json({ ok: true });
});

// ---------- Routines ----------
apiRouter.post("/routines", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const parsed = RoutineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (userId !== "demo-user") {
    const count = await RoutineModel.countDocuments({ userId });
    if (!(await isPro(userId)) && count >= FREE_LIMITS.maxRoutines) {
      return res.status(402).json({ error: "Free limit: 4 routines. Upgrade to Pro." });
    }
  } else {
    const count = await RoutineModel.countDocuments({ userId });
    if (count >= FREE_LIMITS.maxRoutines) {
      return res.status(402).json({ error: "Free limit: 4 routines. Upgrade to Pro." });
    }
  }
  const doc = await RoutineModel.create({ ...parsed.data, userId });
  res.status(201).json(doc);
});

apiRouter.get("/routines", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const { folderId } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { userId };
  if (folderId) filter.folderId = folderId;
  const docs = await RoutineModel.find(filter).sort({ updatedAt: -1 }).lean();
  res.json({ items: docs });
});

apiRouter.get("/routines/:id", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const doc = await RoutineModel.findOne({ _id: req.params.id, userId }).lean();
  if (!doc) return res.status(404).json({ error: "Routine not found" });
  res.json(doc);
});

apiRouter.patch("/routines/:id", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const parsed = RoutineUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const doc = await RoutineModel.findOneAndUpdate(
    { _id: req.params.id, userId },
    { $set: parsed.data },
    { new: true }
  ).lean();
  if (!doc) return res.status(404).json({ error: "Routine not found" });
  res.json(doc);
});

apiRouter.delete("/routines/:id", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const r = await RoutineModel.deleteOne({ _id: req.params.id, userId });
  if (!r.deletedCount) return res.status(404).json({ error: "Routine not found" });
  res.json({ ok: true });
});

apiRouter.post("/routines/:id/share", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const doc = await RoutineModel.findOneAndUpdate(
    { _id: req.params.id, userId },
    { $set: { shareSlug: randomUUID().slice(0, 8) } },
    { new: true }
  ).lean();
  if (!doc) return res.status(404).json({ error: "Routine not found" });
  res.json({ shareSlug: doc.shareSlug });
});

apiRouter.get("/shared/:slug", async (req, res) => {
  const doc = await RoutineModel.findOne({ shareSlug: req.params.slug }).lean();
  if (!doc) return res.status(404).json({ error: "Shared routine not found" });
  const { userId: _u, ...pub } = doc as Record<string, unknown>;
  res.json(pub);
});

// ---------- Program library ----------
apiRouter.get("/programs", (_req, res) => {
  res.json({
    items: LIBRARY_PROGRAMS.map(({ routines, ...p }) => ({
      ...p,
      routineCount: routines.length
    }))
  });
});

apiRouter.get("/programs/:id", (req, res) => {
  const p = LIBRARY_PROGRAMS.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Program not found" });
  res.json(p);
});

apiRouter.post("/programs/:id/clone", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const p = LIBRARY_PROGRAMS.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Program not found" });

  if (userId !== "demo-user") {
    const [count, pro] = await Promise.all([
      RoutineModel.countDocuments({ userId }),
      isPro(userId)
    ]);
    if (!pro && count + p.routines.length > FREE_LIMITS.maxRoutines) {
      return res.status(402).json({
        error: `Free limit: ${FREE_LIMITS.maxRoutines} routines. Upgrading to Pro allows unlimited routines.`
      });
    }
  }

  let folder = await RoutineFolderModel.findOne({ userId, name: p.title });
  if (!folder) {
    folder = await RoutineFolderModel.create({ userId, name: p.title });
  }

  const allNames = Array.from(new Set(p.routines.flatMap((r) => r.exercises.map((e) => e.exercise))));
  const tpls = await ExerciseTemplateModel.find({ name: { $in: allNames } }).lean();
  const tplMap = new Map(tpls.map((t) => [t.name, String(t._id)]));

  const created = [];
  for (const r of p.routines) {
    const exercises = [];
    for (const e of r.exercises) {
      const tplId = tplMap.get(e.exercise);
      if (!tplId) continue;
      const reps = Number.parseInt(e.reps, 10);
      exercises.push({
        exerciseId: tplId,
        notes: "",
        restSec: 90,
        supersetGroup: null,
        sets: Array.from({ length: e.sets }, () => ({
          type: "normal",
          kg: null,
          reps: Number.isNaN(reps) ? null : reps,
          rpe: null,
          durationSec: e.reps.endsWith("s") ? Number.parseInt(e.reps, 10) : null,
          distanceM: null,
          done: false,
          pr: false
        }))
      });
    }
    created.push(
      await RoutineModel.create({
        userId,
        name: r.name,
        folderId: String(folder._id),
        exercises
      })
    );
  }
  res.status(201).json({ folder, routines: created });
});

// ---------- Workouts ----------
apiRouter.post("/workouts", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const parsed = WorkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const ids = parsed.data.exercises.map((e) => e.exerciseId);
  const prior = await WorkoutModel.find({ userId, "exercises.exerciseId": { $in: ids } })
    .sort({ startTime: 1 })
    .lean();
  const bests = computeBests(prior);
  const prs = detectPRs(bests, parsed.data);
  const doc = await WorkoutModel.create({ ...parsed.data, userId });
  res.status(201).json({ workout: doc, prs });
});

apiRouter.get("/workouts", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const { cursor, limit = "20", scope = "mine" } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = scope === "mine" ? { userId } : { isPrivate: false };
  if (cursor) filter.startTime = { $lt: new Date(cursor) };
  const docs = await WorkoutModel.find(filter)
    .sort({ startTime: -1 })
    .limit(Math.min(Number(limit) || 20, 100))
    .lean();
  res.json({ items: docs, nextCursor: docs.at(-1)?.startTime ?? null });
});

// Per-exercise history: recent performances + all-time bests
apiRouter.get("/workouts/exercise/:exerciseId/history", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const all = await WorkoutModel.find({ userId, "exercises.exerciseId": req.params.exerciseId })
    .sort({ startTime: -1 })
    .limit(500)
    .lean();
  const bests = computeBests([...all].reverse());
  const recent = all.slice(0, limit).map((w) => ({
    workoutId: String(w._id),
    name: w.name,
    startTime: w.startTime,
    sets: (w.exercises as unknown as Array<{ exerciseId: string; sets: unknown[] }>).find(
      (e) => e.exerciseId === req.params.exerciseId
    )?.sets
  }));
  res.json({ exerciseId: req.params.exerciseId, bests: bests.get(req.params.exerciseId) ?? null, recent });
});

// ---------- Settings ----------
apiRouter.get("/users/me/settings", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  if (userId === "demo-user") return res.json({ settings: DEFAULT_SETTINGS });
  const user = await UserModel.findById(userId).lean();
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ settings: { ...DEFAULT_SETTINGS, ...(user.settings ?? {}) } });
});

apiRouter.patch("/users/me/settings", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const parsed = WorkoutSettingsSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (userId === "demo-user") return res.json({ settings: { ...DEFAULT_SETTINGS, ...parsed.data } });
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) patch[`settings.${k}`] = v;
  if (parsed.data.units) patch.units = parsed.data.units;
  const user = await UserModel.findByIdAndUpdate(userId, { $set: patch }, { new: true }).lean();
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ settings: { ...DEFAULT_SETTINGS, ...(user.settings ?? {}) } });
});

// ---------- Stats ----------
function windowDays(req: { query: Record<string, string> }, pro: boolean): number {
  const asked = Number(req.query.days) || 30;
  const cap = pro ? 3650 : FREE_LIMITS.historyDays;
  return Math.min(Math.max(asked, 1), cap);
}

async function templateMap(ids?: string[]): Promise<Map<string, { name: string; primaryMuscle: string }>> {
  let filter: Record<string, unknown> = {};
  if (ids && ids.length > 0) {
    const objIds = ids.filter(isObjectIdHex);
    filter = {
      $or: [
        ...(objIds.length > 0 ? [{ _id: { $in: objIds } }] : []),
        { datasetId: { $in: ids } }
      ]
    };
  }
  const docs = await ExerciseTemplateModel.find(filter).lean();
  const m = new Map<string, { name: string; primaryMuscle: string }>();
  for (const d of docs) {
    const entry = { name: d.name, primaryMuscle: d.primaryMuscle };
    m.set(String(d._id), entry);
    if (d.datasetId) m.set(d.datasetId, entry);
  }
  return m;
}

// Muscle distribution: set counts + volume per primary muscle over window
apiRouter.get("/stats/muscles", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const days = windowDays(req as unknown as { query: Record<string, string> }, await isPro(userId));
  const since = new Date(Date.now() - days * 86400_000);
  const workouts = await WorkoutModel.find({ userId, startTime: { $gte: since } }).lean();
  const exIds = Array.from(
    new Set(
      workouts.flatMap((w) =>
        (w.exercises as unknown as Array<{ exerciseId: string }>).map((e) => e.exerciseId)
      )
    )
  );
  const tmap = await templateMap(exIds);
  const byMuscle: Record<string, { sets: number; volume: number }> = {};
  for (const w of workouts) {
    for (const ex of w.exercises as unknown as Array<{
      exerciseId: string;
      sets: Array<{ kg?: number | null; reps?: number | null; done?: boolean }>;
    }>) {
      const muscle = tmap.get(ex.exerciseId)?.primaryMuscle ?? "other";
      const entry = (byMuscle[muscle] ??= { sets: 0, volume: 0 });
      for (const s of ex.sets) {
        if (s.done === false) continue;
        entry.sets += 1;
        if (s.kg != null && s.reps != null) entry.volume += s.kg * s.reps;
      }
    }
  }
  res.json({ days, muscles: byMuscle });
});

// Consistency: per-day counts, streak, totals
apiRouter.get("/stats/consistency", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const days = windowDays(req as unknown as { query: Record<string, string> }, await isPro(userId));
  const since = new Date(Date.now() - days * 86400_000);
  const workouts = await WorkoutModel.find({ userId, startTime: { $gte: since } })
    .sort({ startTime: 1 })
    .limit(2000)
    .lean();
  const perDay: Record<string, number> = {};
  let totalVolume = 0;
  let totalSets = 0;
  for (const w of workouts) {
    const day = new Date(w.startTime).toISOString().slice(0, 10);
    perDay[day] = (perDay[day] ?? 0) + 1;
    for (const ex of w.exercises as unknown as Array<{
      sets: Array<{ kg?: number | null; reps?: number | null; done?: boolean }>;
    }>) {
      for (const s of ex.sets) {
        if (s.done === false) continue;
        totalSets += 1;
        if (s.kg != null && s.reps != null) totalVolume += s.kg * s.reps;
      }
    }
  }
  const dayList = Object.keys(perDay).sort();
  const daySet = new Set(dayList);
  let streak = 0;
  const cursor = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (!daySet.has(iso(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (daySet.has(iso(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  res.json({
    days,
    totalWorkouts: workouts.length,
    totalSets,
    totalVolume: Math.round(totalVolume * 100) / 100,
    streakDays: streak,
    perDay
  });
});

// Main exercises: most-logged with bests
apiRouter.get("/stats/exercises", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const days = windowDays(req as unknown as { query: Record<string, string> }, await isPro(userId));
  const since = new Date(Date.now() - days * 86400_000);
  const workouts = await WorkoutModel.find({ userId, startTime: { $gte: since } })
    .sort({ startTime: 1 })
    .limit(2000)
    .lean();
  const bests = computeBests(workouts);
  const tmap = await templateMap([...bests.keys()]);
  const items = [...bests.entries()]
    .map(([exerciseId, b]) => ({
      exerciseId,
      name: tmap.get(exerciseId)?.name ?? exerciseId,
      sessions: b.sessions,
      lastPerformed: b.lastPerformed,
      bests: { ...b, sessions: undefined, lastPerformed: undefined }
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 50);
  res.json({ days, items });
});

// Monthly report: current month vs previous month
apiRouter.get("/stats/monthly", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const now = new Date();
  const startThis = new Date(now.getFullYear(), now.getMonth(), 1);
  const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const workouts = await WorkoutModel.find({ userId, startTime: { $gte: startPrev } })
    .sort({ startTime: 1 })
    .limit(2000)
    .lean();
  const exIds = Array.from(
    new Set(
      workouts.flatMap((w) =>
        (w.exercises as unknown as Array<{ exerciseId: string }>).map((e) => e.exerciseId)
      )
    )
  );
  const tmap = await templateMap(exIds);
  async function summarizeRange(from: Date, to: Date | null) {
    const list = workouts.filter(
      (w) => w.startTime >= from && (to == null || w.startTime < to)
    );
    let sets = 0;
    let volume = 0;
    const days = new Set<string>();
    const muscles: Record<string, number> = {};
    for (const w of list) {
      days.add(new Date(w.startTime).toISOString().slice(0, 10));
      for (const ex of w.exercises as unknown as Array<{
        exerciseId: string;
        sets: Array<{ kg?: number | null; reps?: number | null; done?: boolean }>;
      }>) {
        const m = tmap.get(ex.exerciseId)?.primaryMuscle ?? "other";
        for (const s of ex.sets) {
          if (s.done === false) continue;
          sets += 1;
          muscles[m] = (muscles[m] ?? 0) + 1;
          if (s.kg != null && s.reps != null) volume += s.kg * s.reps;
        }
      }
    }
    return {
      workouts: list.length,
      sets,
      volume: Math.round(volume * 100) / 100,
      activeDays: days.size,
      topMuscles: Object.entries(muscles)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    };
  }
  res.json({
    thisMonth: await summarizeRange(startThis, null),
    lastMonth: await summarizeRange(startPrev, startThis)
  });
});

// ---------- Body measurements ----------
apiRouter.post("/body-measurements", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const parsed = BodyMeasurementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const pro = await isPro(userId);
  if (!pro && userId !== "demo-user") {
    const extra = PRO_MEASUREMENT_FIELDS.filter((f) => parsed.data[f] != null);
    if (extra.length > 0) {
      return res.status(402).json({ error: `Pro only measurements: ${extra.join(", ")}. Free tracks weight + waist.` });
    }
  }
  const doc = await BodyMeasurementModel.create({ ...parsed.data, userId });
  res.status(201).json(doc);
});

apiRouter.get("/body-measurements", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const docs = await BodyMeasurementModel.find({ userId }).sort({ date: -1 }).limit(limit).lean();
  res.json({ items: docs });
});

apiRouter.delete("/body-measurements/:id", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const r = await BodyMeasurementModel.deleteOne({ _id: req.params.id, userId });
  if (!r.deletedCount) return res.status(404).json({ error: "Measurement not found" });
  res.json({ ok: true });
});

// ---------- Progress photos ----------
apiRouter.post("/progress-photos", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const parsed = ProgressPhotoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const doc = await ProgressPhotoModel.create({ ...parsed.data, userId });
  res.status(201).json(doc);
});

apiRouter.get("/progress-photos", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const docs = await ProgressPhotoModel.find({ userId }).sort({ date: -1 }).limit(limit).lean();
  res.json({ items: docs });
});

apiRouter.delete("/progress-photos/:id", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const r = await ProgressPhotoModel.deleteOne({ _id: req.params.id, userId });
  if (!r.deletedCount) return res.status(404).json({ error: "Photo not found" });
  res.json({ ok: true });
});

// ---------- Media upload (presigned PUT) ----------
apiRouter.post("/uploads/presign", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const { contentType, ext } = req.body as { contentType?: string; ext?: string };
  if (!contentType?.startsWith("image/")) return res.status(400).json({ error: "Only image uploads supported" });
  const safeExt = (ext ?? "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg";
  const key = `photos/${userId}/${randomUUID()}.${safeExt}`;
  try {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const putUrl = await getSignedUrl(
      s3(),
      new PutObjectCommand({ Bucket: mediaBucket, Key: key, ContentType: contentType }),
      { expiresIn: 600 }
    );
    res.json({ key, putUrl, publicUrl: publicUrl(key) });
  } catch {
    res.status(503).json({ error: "Media storage unavailable" });
  }
});

// ---------- Exercise media (MinIO S3 with local dataset fallback) ----------
apiRouter.get("/exercise-media/:kind/:file", async (req, res) => {
  const { kind, file } = req.params;
  if ((kind !== "images" && kind !== "videos") || !/^[0-9]{4}-[a-zA-Z0-9_-]+\.(jpg|gif)$/i.test(file)) {
    return res.status(400).json({ error: "Invalid media path" });
  }
  const contentType = file.toLowerCase().endsWith(".gif") ? "image/gif" : "image/jpeg";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  // 1. Try MinIO bucket
  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const obj = await s3().send(
      new GetObjectCommand({ Bucket: mediaBucket, Key: `exercises/${kind}/${file}` })
    );
    if (obj.Body) {
      const bytes = await obj.Body.transformToByteArray();
      return res.end(Buffer.from(bytes));
    }
  } catch {
    // Fall through to local dataset directory if object not in MinIO yet
  }

  // 2. Fallback to local exercise-dataset clone
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const datasetRoot = process.env.EXERCISE_DATASET_DIR ?? "E:\\dev\\Forks\\exercise-dataset";
    const buf = await readFile(join(datasetRoot, kind, file));
    return res.end(buf);
  } catch {
    return res.status(404).json({ error: "Exercise media not found" });
  }
});

// Offline mirror of the HTTP API (apps/api/src/routes.ts), backed by expo-sqlite.
// Same request/response shapes, same PR maths (computeBests/detectPRs from @sculpt/shared),
// no server and no network. One implicit local user; tokens are opaque placeholders.

import * as SQLite from "expo-sqlite";
import {
  DEFAULT_SETTINGS,
  EXERCISE_DATASET,
  FREE_LIMITS,
  computeBests,
  detectPRs,
  type WorkoutSettings
} from "@sculpt/shared";

type Json = Record<string, unknown>;
type StoredSet = { kg?: number | null; reps?: number | null; done?: boolean };
type StoredExercise = { exerciseId: string; sets: StoredSet[] };
interface StoredWorkout {
  startTime: Date;
  exercises: StoredExercise[];
}

let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (db) return db;
  db = SQLite.openDatabaseSync("sculpt-local.db");
  db.execSync(`
    CREATE TABLE IF NOT EXISTS local_user (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL,
      units TEXT NOT NULL DEFAULT 'kg', settings TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS routine_folders (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, folder_id TEXT, exercises TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, routine_id TEXT, start_time TEXT NOT NULL,
      end_time TEXT, exercises TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      is_private INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS body_measurements (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, weight_kg REAL, waist_cm REAL, chest_cm REAL,
      arm_cm REAL, thigh_cm REAL, hip_cm REAL, body_fat_pct REAL,
      note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
  `);
  return db;
}

const now = () => new Date().toISOString();
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
const day = (t: Date | string) => new Date(t).toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;
const parseExercises = (json: string): StoredExercise[] => {
  const parsed = JSON.parse(json) as StoredExercise[];
  return Array.isArray(parsed) ? parsed : [];
};
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

// ---------- exercise templates (seeded from the shared catalog) ----------
// EXERCISE_CATALOG is a build-time constant baked into the client bundle, so browsing and
// filtering below is pure in-memory work: no DB table, no fetch, no network.

const TEMPLATES = EXERCISE_DATASET.map((e) => ({
  _id: e.id,
  id: e.id,
  datasetId: e.id,
  name: e.name,
  category: e.category ?? null,
  bodyPart: e.bodyPart ?? null,
  equipment: e.equipment ?? null,
  primaryMuscle: e.primaryMuscle,
  secondaryMuscles: [...(e.secondaryMuscles ?? [])],
  type: e.type,
  isCustom: false,
  mediaId: e.mediaId ?? null,
  mediaUrl: e.mediaId ? `/v1/exercise-media/images/${e.id}-${e.mediaId}.jpg` : null,
  gifUrl: e.mediaId ? `/v1/exercise-media/videos/${e.id}-${e.mediaId}.gif` : null,
  instructions: e.instructions
}));
const TEMPLATE_BY_ID = new Map(TEMPLATES.map((t) => [t._id, t]));
const MUSCLE_OF = new Map(TEMPLATES.map((t) => [t._id, t.primaryMuscle]));

// ---------- user ----------

interface UserRow {
  id: string;
  email: string;
  name: string;
  units: string;
  settings: string;
}

const publicUser = (u: UserRow): Json => ({
  id: u.id,
  email: u.email,
  name: u.name,
  pro: false,
  units: u.units
});

const settingsOf = (u: UserRow): WorkoutSettings => ({
  ...DEFAULT_SETTINGS,
  ...(JSON.parse(u.settings) as Partial<WorkoutSettings>)
});

/** The local user is implicit: created on first use, renamed by register/login. */
async function ensureUser(d: SQLite.SQLiteDatabase, body: Json): Promise<UserRow> {
  const rows = await d.getAllAsync<UserRow>("SELECT * FROM local_user LIMIT 1;");
  let u = rows[0];
  if (!u) {
    u = { id: "local-user", email: "local@sculpt.app", name: "Athlete", units: "kg", settings: "{}" };
    await d.runAsync("INSERT INTO local_user (id, email, name, units, settings) VALUES (?, ?, ?, ?, ?);", [
      u.id,
      u.email,
      u.name,
      u.units,
      u.settings
    ]);
  }
  const email = str(body.email).trim() || u.email;
  const name = str(body.name).trim() || (email === u.email ? u.name : email.split("@")[0]);
  if (email !== u.email || name !== u.name) {
    await d.runAsync("UPDATE local_user SET email = ?, name = ?;", [email, name]);
    u = { ...u, email, name };
  }
  return u;
}

// ---------- rows -> API shapes ----------

interface RoutineRow {
  id: string;
  name: string;
  folder_id: string | null;
  exercises: string;
  created_at: string;
  updated_at: string;
}

const routineDoc = (r: RoutineRow): Json => ({
  _id: r.id,
  name: r.name,
  folderId: r.folder_id,
  exercises: parseExercises(r.exercises),
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

interface WorkoutRow {
  id: string;
  name: string;
  routine_id: string | null;
  start_time: string;
  end_time: string | null;
  exercises: string;
  description: string;
  is_private: number;
  created_at: string;
}

const workoutDoc = (w: WorkoutRow): Json => ({
  _id: w.id,
  name: w.name,
  routineId: w.routine_id,
  startTime: w.start_time,
  endTime: w.end_time,
  exercises: parseExercises(w.exercises),
  description: w.description,
  isPrivate: w.is_private === 1,
  createdAt: w.created_at
});

const stored = (w: WorkoutRow): StoredWorkout => ({
  startTime: new Date(w.start_time),
  exercises: parseExercises(w.exercises)
});

interface MeasurementRow {
  id: string;
  date: string;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  hip_cm: number | null;
  body_fat_pct: number | null;
  note: string;
  created_at: string;
}

const measurementDoc = (m: MeasurementRow): Json => ({
  _id: m.id,
  date: m.date,
  weightKg: m.weight_kg,
  waistCm: m.waist_cm,
  chestCm: m.chest_cm,
  armCm: m.arm_cm,
  thighCm: m.thigh_cm,
  hipCm: m.hip_cm,
  bodyFatPct: m.body_fat_pct,
  note: m.note,
  createdAt: m.created_at
});

/** Totals over a workout list, skipping undone sets. */
function tally(ws: StoredWorkout[]): {
  sets: number;
  volume: number;
  byMuscle: Record<string, { sets: number; volume: number }>;
} {
  let sets = 0;
  let volume = 0;
  const byMuscle: Record<string, { sets: number; volume: number }> = {};
  for (const w of ws) {
    for (const ex of w.exercises) {
      const entry = (byMuscle[MUSCLE_OF.get(ex.exerciseId) ?? "other"] ??= { sets: 0, volume: 0 });
      for (const s of ex.sets) {
        if (s.done === false) continue;
        sets += 1;
        entry.sets += 1;
        if (s.kg != null && s.reps != null) {
          volume += s.kg * s.reps;
          entry.volume += s.kg * s.reps;
        }
      }
    }
  }
  return { sets, volume, byMuscle };
}

const inWindow = (q: URLSearchParams) =>
  Math.min(Math.max(Number(q.get("days")) || 30, 1), FREE_LIMITS.historyDays);
const limitOf = (q: URLSearchParams, fallback: number, max: number) =>
  Math.min(Number(q.get("limit")) || fallback, max);

// ---------- router (returns undefined when no route matches) ----------

async function handle(
  d: SQLite.SQLiteDatabase,
  m: string,
  p: string,
  q: URLSearchParams,
  body: Json
): Promise<unknown> {
  // Auth: any email/password is accepted.
  if (m === "POST" && (p === "/v1/auth/register" || p === "/v1/auth/login")) {
    const u = await ensureUser(d, body);
    return { user: publicUser(u), accessToken: `local.${u.id}`, refreshToken: `local.${u.id}.r` };
  }
  if (m === "GET" && p === "/v1/auth/me") {
    const u = await ensureUser(d, {});
    return { user: publicUser(u), settings: settingsOf(u) };
  }

  if (m === "GET" && (p === "/v1/exercise-templates" || p === "/v1/exercises")) {
    // All filters run over the bundled 1,324 TEMPLATES array, matching the server's
    // route contract (apps/api/src/routes.ts) so local mode can't silently ignore them.
    const needle = str(q.get("q")).trim().toLowerCase();
    const muscle = q.get("muscle") ?? q.get("target");
    const equipment = q.get("equipment");
    const category = q.get("category") ?? q.get("body_part") ?? q.get("bodyPart");
    const all = TEMPLATES.filter(
      (t) =>
        (!needle || t.name.toLowerCase().includes(needle)) &&
        (!muscle || t.primaryMuscle === muscle) &&
        (!equipment || t.equipment === equipment) &&
        (!category || t.category?.toLowerCase() === category.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name));
    const limit = limitOf(q, 2000, 2000);
    const page = Math.max(Number(q.get("page")) || 1, 1);
    const items = all.slice((page - 1) * limit, page * limit);
    return { items, data: items, total: all.length, page, limit, totalPages: Math.ceil(all.length / limit) };
  }

  const tplMatch = /^\/v1\/(?:exercise-templates|exercises)\/([^/]+)$/.exec(p);
  if (m === "GET" && tplMatch) {
    const found = TEMPLATE_BY_ID.get(tplMatch[1]);
    if (!found) throw new Error("Exercise not found");
    return found;
  }

  if (m === "GET" && p === "/v1/users/me/settings") {
    return { settings: settingsOf(await ensureUser(d, {})) };
  }
  if (m === "PATCH" && p === "/v1/users/me/settings") {
    const u = await ensureUser(d, {});
    const merged = settingsOf({ ...u, settings: JSON.stringify({ ...JSON.parse(u.settings), ...body }) });
    await d.runAsync("UPDATE local_user SET settings = ?, units = ?;", [JSON.stringify(merged), merged.units]);
    return { settings: merged };
  }

  // Folders
  if (m === "GET" && p === "/v1/routine-folders") {
    const rows = await d.getAllAsync<{ id: string; name: string; created_at: string }>(
      "SELECT id, name, created_at FROM routine_folders ORDER BY name ASC;"
    );
    return { items: rows.map((f) => ({ _id: f.id, name: f.name, createdAt: f.created_at })) };
  }
  if (m === "POST" && p === "/v1/routine-folders") {
    const folder = { id: uid(), name: str(body.name), created_at: now() };
    await d.runAsync("INSERT INTO routine_folders (id, name, created_at) VALUES (?, ?, ?);", [
      folder.id,
      folder.name,
      folder.created_at
    ]);
    return { _id: folder.id, name: folder.name, createdAt: folder.created_at };
  }

  // Routines
  if (p === "/v1/routines") {
    if (m === "GET") {
      const rows = await d.getAllAsync<RoutineRow>("SELECT * FROM routines ORDER BY updated_at DESC;");
      const folderId = q.get("folderId");
      return { items: (folderId ? rows.filter((r) => r.folder_id === folderId) : rows).map(routineDoc) };
    }
    if (m === "POST") {
      const ts = now();
      const row: RoutineRow = {
        id: uid(),
        name: str(body.name, "Routine"),
        folder_id: (body.folderId as string | null) ?? null,
        exercises: JSON.stringify(Array.isArray(body.exercises) ? body.exercises : []),
        created_at: ts,
        updated_at: ts
      };
      await d.runAsync(
        "INSERT INTO routines (id, name, folder_id, exercises, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);",
        [row.id, row.name, row.folder_id, row.exercises, row.created_at, row.updated_at]
      );
      return routineDoc(row);
    }
  }
  const routineId = /^\/v1\/routines\/([^/]+)$/.exec(p)?.[1];
  if (routineId) {
    const rows = await d.getAllAsync<RoutineRow>("SELECT * FROM routines WHERE id = ?;", [routineId]);
    const row = rows[0];
    if (!row) throw new Error("Routine not found");
    if (m === "GET") return routineDoc(row);
    if (m === "DELETE") {
      await d.runAsync("DELETE FROM routines WHERE id = ?;", [routineId]);
      return { ok: true };
    }
    if (m === "PATCH") {
      const next: RoutineRow = {
        ...row,
        name: body.name != null ? str(body.name) : row.name,
        folder_id: "folderId" in body ? ((body.folderId as string | null) ?? null) : row.folder_id,
        exercises: body.exercises != null ? JSON.stringify(body.exercises) : row.exercises,
        updated_at: now()
      };
      await d.runAsync(
        "UPDATE routines SET name = ?, folder_id = ?, exercises = ?, updated_at = ? WHERE id = ?;",
        [next.name, next.folder_id, next.exercises, next.updated_at, routineId]
      );
      return routineDoc(next);
    }
  }

  // Per-exercise history: recent performances + all-time bests
  const historyId = /^\/v1\/workouts\/exercise\/([^/]+)\/history$/.exec(p)?.[1];
  if (m === "GET" && historyId) {
    const rows = (
      await d.getAllAsync<WorkoutRow>(
        "SELECT * FROM workouts WHERE exercises LIKE ? ORDER BY start_time DESC LIMIT 500;",
        [`%"exerciseId":"${historyId}"%`]
      )
    ).filter((w) => stored(w).exercises.some((e) => e.exerciseId === historyId));
    const limit = Math.min(Number(q.get("limit")) || 10, 50);
    return {
      exerciseId: historyId,
      bests: computeBests([...rows].reverse().map(stored)).get(historyId) ?? null,
      recent: rows.slice(0, limit).map((w) => ({
        workoutId: w.id,
        name: w.name,
        startTime: w.start_time,
        sets: stored(w).exercises.find((e) => e.exerciseId === historyId)?.sets
      }))
    };
  }

  // Workouts
  if (p === "/v1/workouts") {
    if (m === "POST") {
      const exercises = Array.isArray(body.exercises) ? (body.exercises as StoredExercise[]) : [];
      const ids = exercises.map((e) => e.exerciseId);
      const prior = (
        await d.getAllAsync<WorkoutRow>("SELECT * FROM workouts ORDER BY start_time ASC;")
      ).filter((w) => stored(w).exercises.some((e) => ids.includes(e.exerciseId)));
      // detectPRs stamps set.pr, so stringify afterwards to persist it (as the server does).
      const prs = detectPRs(computeBests(prior.map(stored)), { exercises });
      const row: WorkoutRow = {
        id: uid(),
        name: str(body.name, "Workout"),
        routine_id: (body.routineId as string | null) ?? null,
        start_time: str(body.startTime, now()),
        end_time: (body.endTime as string | null) ?? null,
        exercises: JSON.stringify(exercises),
        description: str(body.description),
        is_private: body.isPrivate === true ? 1 : 0,
        created_at: now()
      };
      await d.runAsync(
        "INSERT INTO workouts (id, name, routine_id, start_time, end_time, exercises, description, is_private, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);",
        [
          row.id, row.name, row.routine_id, row.start_time, row.end_time,
          row.exercises, row.description, row.is_private, row.created_at
        ]
      );
      return { workout: workoutDoc(row), prs };
    }
    if (m === "GET") {
      const rows = await d.getAllAsync<WorkoutRow>(
        `SELECT * FROM workouts ${q.get("scope") === "mine" ? "" : "WHERE is_private = 0"} ORDER BY start_time DESC LIMIT ?;`,
        [limitOf(q, 20, 100)]
      );
      return { items: rows.map(workoutDoc), nextCursor: rows.at(-1)?.start_time ?? null };
    }
  }

  // Stats
  if (m === "GET" && p === "/v1/stats/muscles") {
    const days = inWindow(q);
    const rows = await d.getAllAsync<WorkoutRow>("SELECT * FROM workouts WHERE start_time >= ?;", [
      new Date(Date.now() - days * 86400_000).toISOString()
    ]);
    return { days, muscles: tally(rows.map(stored)).byMuscle };
  }
  if (m === "GET" && p === "/v1/stats/consistency") {
    const days = inWindow(q);
    const rows = (
      await d.getAllAsync<WorkoutRow>("SELECT * FROM workouts WHERE start_time >= ?;", [
        new Date(Date.now() - days * 86400_000).toISOString()
      ])
    ).map(stored);
    const { sets, volume } = tally(rows);
    const perDay: Record<string, number> = {};
    for (const w of rows) perDay[day(w.startTime)] = (perDay[day(w.startTime)] ?? 0) + 1;
    let streak = 0;
    const cursor = new Date();
    if (!perDay[day(cursor)]) cursor.setDate(cursor.getDate() - 1);
    while (perDay[day(cursor)]) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return {
      days,
      totalWorkouts: rows.length,
      totalSets: sets,
      totalVolume: round2(volume),
      streakDays: streak,
      perDay
    };
  }
  if (m === "GET" && p === "/v1/stats/monthly") {
    const rows = (await d.getAllAsync<WorkoutRow>("SELECT * FROM workouts;")).map(stored);
    const today = new Date();
    const startThis = new Date(today.getFullYear(), today.getMonth(), 1);
    const startPrev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const summarize = (from: Date, to: Date | null): Json => {
      const list = rows.filter((w) => {
        const t = w.startTime.getTime();
        return t >= from.getTime() && (to == null || t < to.getTime());
      });
      const { sets, volume, byMuscle } = tally(list);
      return {
        workouts: list.length,
        sets,
        volume: round2(volume),
        activeDays: new Set(list.map((w) => day(w.startTime))).size,
        topMuscles: Object.entries(byMuscle)
          .map(([muscle, v]) => [muscle, v.sets] as [string, number])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
      };
    };
    return { thisMonth: summarize(startThis, null), lastMonth: summarize(startPrev, startThis) };
  }

  // Body measurements
  if (m === "GET" && p === "/v1/body-measurements") {
    const rows = await d.getAllAsync<MeasurementRow>(
      "SELECT * FROM body_measurements ORDER BY date DESC LIMIT ?;",
      [limitOf(q, 100, 500)]
    );
    return { items: rows.map(measurementDoc) };
  }
  if (m === "POST" && p === "/v1/body-measurements") {
    const row: MeasurementRow = {
      id: uid(),
      date: str(body.date, now()),
      weight_kg: (body.weightKg as number | null) ?? null,
      waist_cm: (body.waistCm as number | null) ?? null,
      chest_cm: (body.chestCm as number | null) ?? null,
      arm_cm: (body.armCm as number | null) ?? null,
      thigh_cm: (body.thighCm as number | null) ?? null,
      hip_cm: (body.hipCm as number | null) ?? null,
      body_fat_pct: (body.bodyFatPct as number | null) ?? null,
      note: str(body.note),
      created_at: now()
    };
    await d.runAsync(
      "INSERT INTO body_measurements (id, date, weight_kg, waist_cm, chest_cm, arm_cm, thigh_cm, hip_cm, body_fat_pct, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      [
        row.id, row.date, row.weight_kg, row.waist_cm, row.chest_cm, row.arm_cm,
        row.thigh_cm, row.hip_cm, row.body_fat_pct, row.note, row.created_at
      ]
    );
    return measurementDoc(row);
  }

  return undefined;
}

/**
 * Thrown when no local route answers a request — a capability gap, not a failure.
 * Callers branch on `instanceof` so rewording the message cannot silently break them.
 */
export class LocalRouteMissingError extends Error {
  readonly method: string;
  readonly path: string;
  constructor(method: string, path: string) {
    super(`localApi: no local route for ${method} ${path}`);
    this.name = "LocalRouteMissingError";
    this.method = method;
    this.path = path;
  }
}

/** Same contract as api<T>() in ./api — resolve method+path against the local database. */
export async function localApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const [p = path, search = ""] = path.split("?");
  const out = await handle(getDb(), method.toUpperCase(), p, new URLSearchParams(search), (body ?? {}) as Json);
  if (out === undefined) throw new LocalRouteMissingError(method, path);
  return out as T;
}

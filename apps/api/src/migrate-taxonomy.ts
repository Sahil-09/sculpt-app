// One-off data migration: MuscleGroup / ExerciseType renames in packages/shared.
// Idempotent: every write is filtered on the OLD value, so a second run matches nothing.
// Refuses to run if the old values appear in any field outside FIELDS below.

import mongoose from "mongoose";

const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/sculpt";
await mongoose.connect(uri);
const database = mongoose.connection.db;
if (!database) throw new Error("no db");

const COLLECTION = "exercisetemplates";
const MUSCLE_RENAMES = { quads: "quadriceps", abs: "abdominals" } as const;
const TYPE_RENAMES = { weight_distance: "short_distance_weight" } as const;
const OLD_VALUES = new Set([...Object.keys(MUSCLE_RENAMES), ...Object.keys(TYPE_RENAMES)]);

const FIELDS = [
  { path: "primaryMuscle", kind: "scalar", renames: MUSCLE_RENAMES },
  { path: "secondaryMuscles", kind: "array", renames: MUSCLE_RENAMES },
  { path: "type", kind: "scalar", renames: TYPE_RENAMES }
] as const;

const ALLOWED_PATHS = new Set(FIELDS.map((f) => (f.kind === "array" ? `${f.path}[*]` : f.path)));

function walk(value: unknown, path: string, out: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${path}[${i}]`, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "_id") continue;
      walk(v, path ? `${path}.${k}` : k, out);
    }
    return;
  }
  if (typeof value === "string" && OLD_VALUES.has(value)) out.push(`${path}=${value}`);
}

async function scanUnrecognised(db: NonNullable<typeof database>): Promise<string[]> {
  const hits: string[] = [];
  for (const c of await db.listCollections().toArray()) {
    const col = db.collection(c.name);
    let doc: Record<string, unknown> | null;
    const cur = col.find({});
    while ((doc = await cur.next())) {
      const found: string[] = [];
      walk(doc, "", found);
      for (const h of found) {
        const field = (h.slice(0, h.indexOf("="))).replace(/\[\d+\]/g, "[*]");
        hits.push(`${c.name}.${field} (${h.slice(h.indexOf("=") + 1)})`);
      }
    }
  }
  return [...new Set(hits)].filter((h) => !ALLOWED_PATHS.has(h.split(" ")[0].split(".")[1] ?? ""));
}

const templates = database.collection(COLLECTION);

async function tally(path: string, keys: string[], kind: "scalar" | "array") {
  const match = { [path]: { $in: keys } };
  const docs = await templates.countDocuments(match);
  // re-match after $unwind: otherwise every element of a matched doc counts, not just the old ones
  const unwind = kind === "array" ? [{ $unwind: `$${path}` }, { $match: match }] : [];
  const rows = await templates
    .aggregate<{ _id: string; n: number }>([
      { $match: match },
      ...unwind,
      { $group: { _id: `$${path}`, n: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])
    .toArray();
  const elements = rows.reduce((a, r) => a + r.n, 0);
  return { docs, elements, detail: rows.map((r) => `${r._id}=${r.n}`).join(" ") || "none" };
}

async function remaining(): Promise<string> {
  const lines: string[] = [];
  for (const f of FIELDS) {
    const t = await tally(f.path, Object.keys(f.renames), f.kind);
    if (t.docs > 0) lines.push(`  ${COLLECTION}.${f.path}: ${t.docs} docs / ${t.elements} values (${t.detail})`);
  }
  return lines.join("\n");
}

const unrecognised = await scanUnrecognised(database);
if (unrecognised.length > 0) {
  console.error("REFUSING TO RUN — old enum values found in fields this script does not migrate:");
  for (const h of unrecognised) console.error(`  ${h}`);
  await mongoose.disconnect();
  process.exit(1);
}

const verifyOnly = process.argv.includes("--verify");

if (verifyOnly) {
  const left = await remaining();
  console.log(left ? `VERIFY FAILED — old values remain:\n${left}` : `VERIFY OK — 0 old values remain in ${COLLECTION}`);
  await mongoose.disconnect();
  process.exit(left ? 1 : 0);
}

console.log(`migrating ${COLLECTION}`);
for (const f of FIELDS) {
  const keys = Object.keys(f.renames);
  const branches = (varName: string) =>
    Object.entries(f.renames).map(([from, to]) => ({ case: { $eq: [varName, from] }, then: to }));
  const switchExpr = (varName: string) => ({ $switch: { branches: branches(varName), default: varName } });
  const pipeline =
    f.kind === "array"
      ? [{ $set: { [f.path]: { $map: { input: { $ifNull: [`$${f.path}`, []] }, as: "m", in: switchExpr("$$m") } } } }]
      : [{ $set: { [f.path]: switchExpr(`$${f.path}`) } }];

  const before = await tally(f.path, keys, f.kind);
  if (before.docs === 0) {
    console.log(`  ${f.path.padEnd(17)} 0 docs / 0 values  (already migrated)`);
    continue;
  }
  const res = await templates.updateMany({ [f.path]: { $in: keys } }, pipeline);
  console.log(
    `  ${f.path.padEnd(17)} ${res.modifiedCount} docs / ${before.elements} values  ` +
      `[${Object.entries(f.renames).map(([a, b]) => `${a}->${b}: ${before.detail.split(" ").find((d) => d.startsWith(`${a}=`))?.slice(a.length + 1) ?? 0}`).join(", ")}]`
  );
}

const left = await remaining();
console.log(left ? `VERIFY FAILED — old values remain:\n${left}` : `VERIFY OK — 0 old values remain in ${COLLECTION}`);
await mongoose.disconnect();
process.exit(left ? 1 : 0);
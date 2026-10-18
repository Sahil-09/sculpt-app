import Link from "next/link";

async function getShared(slug: string) {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const r = await fetch(`${base}/v1/shared/${slug}`, { cache: "no-store" });
  if (!r.ok) return null;
  return (await r.json()) as {
    name: string;
    exercises: Array<{ exerciseId: string; sets: Array<{ kg?: number | null; reps?: number | null }> }>;
  };
}

export default async function SharedPage({ params }: { params: { slug: string } }) {
  const routine = await getShared(params.slug);
  if (!routine)
    return (
      <div>
        <h1>Not found</h1>
        <p className="muted">This shared routine does not exist.</p>
      </div>
    );
  return (
    <div style={{ maxWidth: 720 }}>
      <p className="muted">Shared routine</p>
      <h1 style={{ marginTop: 0 }}>{routine.name}</h1>
      {routine.exercises.map((e, i) => (
        <div key={i} className="card" style={{ marginTop: 8 }}>
          <strong>Lift {i + 1}</strong>
          <p className="muted">
            {e.sets.length} sets ·{" "}
            {e.sets
              .map((s) => `${s.kg ?? "–"} × ${s.reps ?? "–"}`)
              .join(", ")}
          </p>
        </div>
      ))}
      <p style={{ marginTop: 16 }}>
        <Link href="/login" className="btn">
          Sign in to save it
        </Link>
      </p>
    </div>
  );
}

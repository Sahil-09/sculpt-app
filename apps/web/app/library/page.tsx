"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { get, post, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

interface Program {
  id: string;
  title: string;
  level: string;
  goal: string;
  equipment: string[];
  description: string;
  routineCount: number;
}

export default function LibraryPage() {
  const router = useRouter();
  const { ready, user } = useAuth();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
    else if (user)
      get<{ items: Program[] }>("/v1/programs")
        .then((d) => setPrograms(d.items))
        .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"));
  }, [ready, user, router]);

  async function clone(id: string) {
    try {
      await post(`/v1/programs/${id}/clone`, {});
      router.push("/routines");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Clone failed");
    }
  }

  if (!ready || !user) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Program library</h1>
      {error && <p className="error">{error}</p>}
      <div className="grid two">
        {programs.map((p) => (
          <div key={p.id} className="card">
            <h3>{p.title}</h3>
            <p className="muted">
              {p.level} · {p.routineCount} routines · {p.equipment.join(", ")}
            </p>
            <p>{p.description}</p>
            <p className="muted">{p.goal}</p>
            <button onClick={() => clone(p.id)}>Save to my routines</button>
          </div>
        ))}
      </div>
    </div>
  );
}

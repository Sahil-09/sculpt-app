"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../lib/auth";

export default function Home() {
  const router = useRouter();
  const { ready, user } = useAuth();

  useEffect(() => {
    if (ready && user) router.replace("/routines");
  }, [ready, user, router]);

  if (!ready) return <p className="muted">Loading…</p>;
  if (user) return <p className="muted">Loading…</p>;

  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Sculpt</h1>
      <p>Plan routines, track lifts, analyze progress. Log from the mobile app, plan here.</p>
      <div className="row">
        <Link href="/login" className="btn">
          Sign in
        </Link>
      </div>
    </div>
  );
}

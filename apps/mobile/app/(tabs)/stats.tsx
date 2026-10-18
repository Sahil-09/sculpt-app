import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { get, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/ThemeContext";
import { NUM, R, S, T } from "../../lib/theme";
import { Card, EmptyState, Notice, useScreenStyle, SectionHeader, AppHeader } from "../../lib/ui";

interface Stats {
  workouts: number;
  sets: number;
  tonnage: number;
  topLifts: Array<{ name: string; maxWeight: number; reps: number; date: string }>;
  muscles: Array<{ name: string; count: number }>;
  history: Array<{ date: string; volume: number }>;
}

/** Real response shapes from apps/api/src/routes.ts — there is no /v1/analytics/summary. */
interface Consistency {
  days: number;
  totalWorkouts: number;
  totalSets: number;
  totalVolume: number;
  streakDays: number;
  perDay: Record<string, number>;
}
interface MusclesRes {
  muscles: Record<string, { sets: number; volume: number }>;
}
interface ExercisesRes {
  items: Array<{
    exerciseId: string;
    name: string;
    sessions: number;
    lastPerformed: string;
    bests: { heaviest?: number; mostReps?: number; best1rm?: number };
  }>;
}

interface SetRow { kg?: number | null; reps?: number | null; done?: boolean }
interface WorkoutDoc { startTime: string; exercises: Array<{ exerciseId: string; sets: SetRow[] }> }
interface DayVol { day: number; label: string; value: number }

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Local calendar day as an integer — DST-proof, unlike millisecond deltas. */
const dayNum = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;

/** Volume per day for the last 7 local calendar days. The newest 100 workouts always span a week. */
function weekTonnage(items: WorkoutDoc[]): DayVol[] {
  const totals = new Map<number, number>();
  for (const w of items) {
    const d = new Date(w.startTime);
    if (Number.isNaN(d.getTime())) continue;
    const key = dayNum(d);
    let vol = totals.get(key) ?? 0;
    for (const ex of w.exercises ?? []) {
      for (const set of ex.sets ?? []) {
        if (set.done === false) continue;
        vol += (set.kg ?? 0) * (set.reps ?? 0);
      }
    }
    totals.set(key, vol);
  }
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return { day: dayNum(d), label: DAY_LABELS[d.getDay()], value: totals.get(dayNum(d)) ?? 0 };
  });
}

/** Largest-remainder rounding, so the displayed percentages sum to exactly 100. */
function sharePct(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const out = exact.map((v) => Math.floor(v));
  const order = exact
    .map((v, i) => [v - Math.floor(v), i] as const)
    .sort((a, b) => b[0] - a[0]);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0 && i < order.length; i++, left--) out[order[i][1]] += 1;
  return out;
}

/** Volume per ISO day across every loaded workout — the Activity spark plots volume, not counts. */
function dailyVolumeByDay(items: WorkoutDoc[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const w of items) {
    const d = new Date(w.startTime);
    if (Number.isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 10);
    let vol = totals.get(key) ?? 0;
    for (const ex of w.exercises ?? []) {
      for (const set of ex.sets ?? []) {
        if (set.done === false) continue;
        vol += (set.kg ?? 0) * (set.reps ?? 0);
      }
    }
    totals.set(key, vol);
  }
  return totals;
}

/** Whole kilos below 1000, thousands above, so small numbers never collapse to "0k". */
const kgLabel = (kg: number) => {
  const v = Math.round(kg);
  return v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
};

export default function StatsTab() {
  const { ready, user } = useAuth();
  const { theme, A } = useTheme();
  const screenStyle = useScreenStyle();
  const s = useStyles(theme, A);
  const [stats, setStats] = useState<Stats | null>(null);
  const [week, setWeek] = useState<DayVol[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    // The API exposes these separately; there is no aggregate summary route. They are
    // fetched together and folded into the shape this screen renders.
    const [consistency, muscles, exercises, recent] = await Promise.allSettled([
      get<Consistency>("/v1/stats/consistency?days=365"),
      get<MusclesRes>("/v1/stats/muscles?days=365"),
      get<ExercisesRes>("/v1/stats/exercises?days=365"),
      get<{ items: WorkoutDoc[] }>("/v1/workouts?limit=100")
    ]);
    if (consistency.status === "rejected") {
      setError(consistency.reason instanceof ApiError ? consistency.reason.message : "Failed to load");
    } else if (consistency.status === "fulfilled") {
      const c = consistency.value;
      const dailyVolume = dailyVolumeByDay(recent.status === "fulfilled" ? recent.value.items ?? [] : []);
      const muscleRows = Object.entries(muscles.status === "fulfilled" ? muscles.value.muscles ?? {} : {})
        .map(([name, v]) => ({ name, count: v.volume }))
        .sort((a, b) => b.count - a.count);
      const topLifts = (exercises.status === "fulfilled" ? exercises.value.items : [])
        .slice(0, 5)
        .map((e) => ({
          name: e.name,
          maxWeight: e.bests.heaviest ?? 0,
          reps: e.bests.mostReps ?? 0,
          date: e.lastPerformed
        }));
      // `history` drives the Activity spark: total volume per day across the window.
      const history = Object.entries(c.perDay ?? {})
        .map(([date]) => ({ date, volume: dailyVolume.get(date) ?? 0 }))
        .sort((a, b) => a.date.localeCompare(b.date));
      setStats({
        workouts: c.totalWorkouts,
        sets: c.totalSets,
        tonnage: c.totalVolume,
        topLifts,
        muscles: muscleRows,
        history
      });
    }
    if (recent.status === "fulfilled") setWeek(weekTonnage(recent.value.items ?? []));
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (ready && !user) router.replace("/login");
      else if (user) load();
    }, [ready, user, load])
  );

  if (!ready || !user) return <View style={screenStyle} />;

  const maxVol = stats ? Math.max(...stats.history.map((h) => h.volume), 1) : 1;
  const maxDay = week ? Math.max(...week.map((d) => d.value), 1) : 1;
  const peak = week ? week.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const musclePct = stats ? sharePct(stats.muscles.map((m) => m.count)) : [];

  return (
    <ScrollView
      style={screenStyle}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.dim} colors={[theme.accent]} />
      }
    >
      <AppHeader title="ANALYTICS" />
      {error && <Notice>{error}</Notice>}
      {stats && (
        <>
          <View style={s.summary}>
            <View style={s.stat}>
              <Text style={s.statValue}>{stats.workouts}</Text>
              <Text style={s.statLabel}>Workouts</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statValue}>{stats.sets}</Text>
              <Text style={s.statLabel}>Sets</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statValue}>{kgLabel(stats.tonnage)}</Text>
              <Text style={s.statLabel}>Tonnage</Text>
            </View>
          </View>

          <Card>
            <SectionHeader>Activity</SectionHeader>
            <View style={s.spark}>
              {stats.history.slice(-14).map((h, i) => (
                <View
                  key={i}
                  style={[s.sparkBar, { height: Math.max(8, (h.volume / maxVol) * 56) }]}
                />
              ))}
            </View>
          </Card>

          <Card>
            <SectionHeader>Muscle Split</SectionHeader>
            {stats.muscles.map((m, i) => (
              <View key={m.name} style={s.barRow}>
                <Text style={s.muscle}>{m.name}</Text>
                <View style={s.track}>
                  <View
                    style={[
                      s.fill,
                      { width: `${(m.count / Math.max(...stats.muscles.map((x) => x.count))) * 100}%` }
                    ]}
                  />
                </View>
                <Text style={s.split}>
                  {musclePct[i]}% · {kgLabel(m.count)}
                  <Text style={{ fontSize: 10 }}>kg</Text>
                </Text>
              </View>
            ))}
          </Card>

          <Card>
            <SectionHeader>Estimated 1RMs</SectionHeader>
            {stats.topLifts.map((l) => (
              <View key={l.name} style={s.barRow}>
                <Text style={s.muscle} numberOfLines={1}>
                  {l.name}
                </Text>
                <Text style={s.count}>
                  {l.maxWeight}
                  <Text style={{ fontSize: 10 }}>kg</Text>
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}

      {week && (
        <Card>
          <SectionHeader>Weekly Tonnage</SectionHeader>
          {!peak || peak.value <= 0 ? (
            <EmptyState
              glyph="+"
              title="No volume logged this week"
              body="Finish a workout and your last 7 days of tonnage will chart here."
            />
          ) : (
            <>
              <View style={s.week}>
                {week.map((d) => {
                  const isPeak = d.value > 0 && d.value === peak.value;
                  return (
                    <View key={d.day} style={s.weekCol}>
                      <Text
                        style={[s.weekVal, d.value > 0 ? null : s.zero, isPeak && s.weekValPeak]}
                        numberOfLines={1}
                      >
                        {kgLabel(d.value)}
                      </Text>
                      <View style={s.weekTrack}>
                        <View
                          style={[
                            s.weekBar,
                            isPeak && s.weekBarPeak,
                            { height: Math.max(4, (d.value / maxDay) * 72) }
                          ]}
                        />
                      </View>
                      <Text style={[s.weekDay, isPeak && s.weekDayPeak]}>{d.label}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={s.peak}>
                Peak: {peak.label} ({Math.round(peak.value).toLocaleString()} kg)
              </Text>
            </>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

const useStyles = (theme: any, A: any) => StyleSheet.create({
  summary: { flexDirection: "row", justifyContent: "space-between", marginBottom: S.lg, paddingHorizontal: S.sm },
  stat: { alignItems: "center" },
  statValue: { ...T.title, fontSize: 28, color: theme.text, ...NUM },
  statLabel: { ...T.meta, color: theme.dim, marginTop: 2 },

  barRow: { flexDirection: "row", alignItems: "center", gap: S.md, marginTop: S.md },
  muscle: { ...T.meta, width: 88, color: theme.text, textTransform: "capitalize" },
  track: { flex: 1, height: 8, backgroundColor: theme.surface2, borderRadius: R.pill, overflow: "hidden" },
  fill: { height: 8, backgroundColor: theme.accent, borderRadius: R.pill },
  count: { ...T.meta, width: 44, textAlign: "right", color: theme.dim, ...NUM },
  split: { ...T.meta, width: 74, textAlign: "right", color: theme.dim, ...NUM },

  // Weekly tonnage: plain Views, no chart library. Bars grow from a fixed 72pt track.
  week: { flexDirection: "row", alignItems: "flex-end", gap: S.xs, marginTop: S.sm },
  weekCol: { flex: 1, alignItems: "center" },
  weekVal: { ...T.meta, fontSize: 10, lineHeight: 13, height: 14, color: theme.dim, ...NUM },
  weekValPeak: { color: theme.green, fontWeight: "700" },
  zero: { color: theme.faint },
  weekTrack: { width: "100%", height: 72, alignItems: "center", justifyContent: "flex-end" },
  weekBar: { width: "72%", backgroundColor: theme.accent, borderRadius: R.sm, minHeight: 4 },
  weekBarPeak: { backgroundColor: theme.onAccent },
  weekDay: { ...T.meta, fontSize: 10, color: theme.dim, marginTop: S.xs },
  weekDayPeak: { color: theme.green, fontWeight: "700" },
  peak: { ...T.meta, color: theme.dim, marginTop: S.md },

  spark: { flexDirection: "row", alignItems: "flex-end", gap: S.xs, height: 56, marginTop: S.sm },
  sparkBar: { flex: 1, backgroundColor: A.accent, borderRadius: R.sm, minHeight: 8 }
});

import { useCallback, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { get, patch, post, ApiError } from "../../lib/api";
import { LocalRouteMissingError } from "../../lib/local";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/ThemeContext";
import { estimate1RM, type WorkoutSettings } from "@sculpt/shared";
import { NUM, R, S, T } from "../../lib/theme";
import {
  AppHeader,
  Avatar,
  Badge,
  Btn,
  Card,
  EmptyState,
  ExerciseThumb,
  Icon8,
  Notice,
  SectionHeader,
  useScreenStyle
} from "../../lib/ui";

interface Photo {
  _id: string;
  date: string;
  url: string;
  kind: string;
}

interface SetRow {
  kg?: number | null;
  reps?: number | null;
  done?: boolean;
}
interface WorkoutDoc {
  startTime: string;
  exercises: Array<{ exerciseId: string; sets: SetRow[] }>;
}
interface ExerciseHistory {
  recent: Array<{ workoutId: string; name: string; startTime: string; sets: SetRow[] }>;
}
interface HallRecord {
  exerciseId: string;
  name: string;
  kg: number;
  date: string;
  rpe?: number;
  /** Relative media path from the catalogue; resolved to a full URL at render time. */
  mediaUrl?: string | null;
  primaryMuscle?: string;
  equipment?: string | null;
}

interface Milestones {
  workouts: number;
  thisMonth: number;
  volume: number;
  currentStreak: number;
  recordStreak: number;
}

const LBS_PER_KG = 2.20462;

/** "upper_back" -> "Upper Back" for the muscle-split labels. */
const titleish = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const MAX_WORKOUTS = 2000;
const ZERO: Milestones = {
  workouts: 0,
  thisMonth: 0,
  volume: 0,
  currentStreak: 0,
  recordStreak: 0
};

const dayNum = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;

async function fetchWorkouts(): Promise<WorkoutDoc[]> {
  const out: WorkoutDoc[] = [];
  let cursor = "";
  while (out.length < MAX_WORKOUTS) {
    const path = `/v1/workouts?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const page: { items: WorkoutDoc[]; nextCursor: string | null } = await get(path);
    out.push(...(page.items ?? []));
    if (!page.nextCursor || !page.items?.length) break;
    cursor = page.nextCursor;
  }
  return out.slice(0, MAX_WORKOUTS);
}

function milestones(items: WorkoutDoc[]): Milestones {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const days = new Set<number>();
  let thisMonth = 0;
  let volume = 0;
  for (const w of items) {
    const d = new Date(w.startTime);
    if (Number.isNaN(d.getTime())) continue;
    days.add(dayNum(d));
    if (d >= monthStart) thisMonth += 1;
    for (const ex of w.exercises ?? []) {
      for (const set of ex.sets ?? []) {
        if (set.done === false) continue;
        volume += (set.kg ?? 0) * (set.reps ?? 0);
      }
    }
  }
  const sorted = [...days].sort((a, b) => a - b);
  let record = 0;
  let run = 0;
  sorted.forEach((day, i) => {
    run = i > 0 && day === sorted[i - 1] + 1 ? run + 1 : 1;
    if (run > record) record = run;
  });
  let current = 0;
  let cursor = dayNum(new Date());
  if (!days.has(cursor)) cursor -= 1;
  while (days.has(cursor)) {
    current += 1;
    cursor -= 1;
  }
  return {
    workouts: items.length,
    thisMonth,
    volume,
    currentStreak: current,
    recordStreak: record
  };
}

async function fetchRecords(): Promise<HallRecord[]> {
  const { items } = await get<{ items: Array<{ exerciseId: string; name: string }> }>(
    "/v1/stats/exercises?days=365"
  );
  const histories = await Promise.all(
    (items ?? []).map((e) =>
      get<ExerciseHistory>(`/v1/workouts/exercise/${encodeURIComponent(e.exerciseId)}/history?limit=50`)
    )
  );
  const records = histories
    .map((h, i) => {
      let best: HallRecord | null = null;
      for (const session of h.recent ?? []) {
        for (const set of session.sets ?? []) {
          if (set.done === false) continue;
          const value = estimate1RM(set.kg, set.reps);
          if (value == null || (best && value <= best.kg)) continue;
          best = {
            exerciseId: items[i].exerciseId,
            name: items[i].name,
            kg: value,
            date: session.startTime
          };
        }
      }
      return best;
    })
    .filter((r): r is HallRecord => r != null)
    .sort((a, b) => b.kg - a.kg)
    .slice(0, 10);

  // One extra request for the thumbnails, not one per record. The list endpoint filters by
  // `ids`, and `exerciseId` here is the Mongo _id the stats route already resolved.
  if (records.length === 0) return records;
  try {
    const ids = records.map((r) => r.exerciseId).join(",");
    const { items: templates } = await get<{
      items: Array<{ _id: string; mediaUrl?: string | null; primaryMuscle?: string; equipment?: string | null }>;
    }>(`/v1/exercise-templates?ids=${encodeURIComponent(ids)}&limit=50`);
    const byId = new Map(templates.map((t) => [t._id, t]));
    for (const r of records) {
      const t = byId.get(r.exerciseId);
      if (t) {
        r.mediaUrl = t.mediaUrl ?? null;
        r.primaryMuscle = t.primaryMuscle;
        r.equipment = t.equipment ?? null;
      }
    }
  } catch {
    // Thumbnails are decoration; the records themselves are already resolved.
  }
  return records;
}

export default function Profile() {
  const { ready, user, logout } = useAuth();
  const { theme, isDark, toggleTheme, A } = useTheme();
  const screen = useScreenStyle();
  const s = useStyles(theme, A);
  const [settings, setSettings] = useState<WorkoutSettings | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [marks, setMarks] = useState<Milestones>(ZERO);
  const [rawRecords, setRecords] = useState<HallRecord[] | null>(null);
  const [muscleStats, setMuscleStats] = useState<Record<string, { sets: number; volume: number }>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const [sResult, pResult, wResult, rResult, mResult] = await Promise.allSettled([
      get<{ settings: WorkoutSettings }>("/v1/users/me/settings"),
      get<{ items: Photo[] }>("/v1/progress-photos?limit=12"),
      fetchWorkouts(),
      fetchRecords(),
      get<{ muscles?: Record<string, { sets: number; volume: number }> }>(
        "/v1/stats/muscles?days=90"
      )
    ]);
    if (sResult.status === "fulfilled") setSettings(sResult.value.settings);
    else setError(sResult.reason instanceof ApiError ? sResult.reason.message : "Failed to load");
    if (pResult.status === "fulfilled") setPhotos(pResult.value.items);
    else if (pResult.reason instanceof LocalRouteMissingError) setPhotos([]);
    else setError(pResult.reason instanceof ApiError ? pResult.reason.message : "Failed to load");
    if (wResult.status === "fulfilled") setMarks(milestones(wResult.value));
    if (rResult.status === "fulfilled") setRecords(rResult.value);
    if (mResult.status === "fulfilled") setMuscleStats(mResult.value.muscles ?? {});
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (ready && !user) router.replace("/login");
      else if (user) load();
    }, [ready, user, load])
  );

  async function update(p: Partial<WorkoutSettings>) {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, ...p });
    try {
      const data = await patch<{ settings: WorkoutSettings }>("/v1/users/me/settings", p);
      setSettings(data.settings);
    } catch {
      setSettings(prev);
    }
  }

  async function addPhoto() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library permission denied");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    const ext = (asset.fileName?.split(".").pop() ?? asset.uri.split(".").pop() ?? "jpg").toLowerCase();
    setUploading(true);
    try {
      const pre = await post<{ putUrl: string; publicUrl: string }>("/v1/uploads/presign", {
        contentType: "image/jpeg",
        ext
      });
      const blob = await (await fetch(asset.uri)).blob();
      const put = await fetch(pre.putUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": "image/jpeg" }
      });
      if (!put.ok) throw new Error(`upload ${put.status}`);
      await post("/v1/progress-photos", {
        date: new Date().toISOString(),
        url: pre.publicUrl,
        kind: "other"
      });
      const p = await get<{ items: Photo[] }>("/v1/progress-photos?limit=12");
      setPhotos(p.items);
    } catch (e) {
      setError(
        e instanceof LocalRouteMissingError
          ? "Photo uploads need the server — unavailable in local-first mode"
          : e instanceof ApiError
          ? e.message
          : "Upload failed — is media storage running?"
      );
    } finally {
      setUploading(false);
    }
  }

  if (!ready || !user) return <View style={screen} />;

  const units = settings?.units ?? "kg";
  // Real values only. This screen previously fell back to Stitch's placeholder figures
  // (284 workouts, 1.4M volume, an 18-day streak and a fixed 34/28/20/12/6 muscle split).
  const displayWorkouts = marks.workouts;
  const displayVolume =
    marks.volume >= 1_000_000
      ? `${(marks.volume / 1_000_000).toFixed(1)}M`
      : marks.volume >= 1000
      ? `${Math.round(marks.volume / 1000)}k`
      : String(Math.round(marks.volume));
  const displayStreak = marks.currentStreak;
  const records = rawRecords ?? [];

  /** Muscle distribution from /v1/stats/muscles, largest first. Empty when there is no data. */
  const muscleSplits = useMemo(() => {
    const rows = Object.entries(muscleStats)
      .map(([label, v]) => ({ label: titleish(label), kg: v.volume ?? 0 }))
      .filter((r) => r.kg > 0)
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 5);
    const total = rows.reduce((a, r) => a + r.kg, 0);
    if (total <= 0) return [];
    return rows.map((r, i) => ({
      label: r.label,
      pct: Math.round((r.kg / total) * 100),
      isAccent: i === 0
    }));
  }, [muscleStats]);

  return (
    <ScrollView
      style={screen}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={load}
          tintColor={theme.dim}
          colors={[theme.accent]}
        />
      }
      contentContainerStyle={{ paddingBottom: S.xxl }}
    >
      <AppHeader title="PROFILE" />
      {error && <Notice>{error}</Notice>}

      {/* Athlete Profile Header Block */}
      <View style={s.profileHeaderCard}>
        <View style={s.profileTopRow}>
          <View style={s.avatarContainer}>
          <View style={s.avatarBox}>
            <Text style={s.avatarInitials}>
              {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </Text>
          </View>
        </View>

          <View style={s.profileDetails}>
            <View style={s.badgeEstRow}>
              <Badge label={`${displayStreak} day streak`} tone="accent" />
            </View>
            <Text style={s.athleteName} numberOfLines={1}>
              {user.name || "Athlete"}
            </Text>
            <Text style={s.athleteHandle}>
              @{user.email ? user.email.split("@")[0] : "athlete"}
            </Text>
          </View>

          <Pressable
            style={s.profileSettingsBtn}
            onPress={toggleTheme}
            hitSlop={8}
            accessibilityLabel="Toggle Theme"
          >
            <Icon8 name={isDark ? "sun" : "moon"} size={16} color={theme.accent} />
          </Pressable>
        </View>

        {/* Bio is user-owned; there is no source for a training bio, so show real totals. */}
        <View style={s.bioCard}>
          <Text style={s.bioText}>
            {displayWorkouts} workout{displayWorkouts === 1 ? "" : "s"} ·{" "}
            <Text style={s.bioBold}>{displayVolume} {units} moved</Text> ·{" "}
            {displayStreak} day streak.
          </Text>
        </View>
      </View>

      {/* Lifetime Summary Stat Counters (3-Column Asymmetric Grid) */}
      <View style={s.sectionHeadContainer}>
        <Text style={s.sectionEyebrow}>PERFORMANCE MILESTONES</Text>
        <Text style={s.sectionPeriod}>ALL-TIME</Text>
      </View>

      <View style={s.statsGrid}>
        {/* Workouts Card */}
        <View style={s.statCard}>
          <Text style={s.statLabel}>WORKOUTS</Text>
          <Text style={s.statNum}>{displayWorkouts}</Text>
          <Text style={[s.statSub, { color: theme.blue }]}>+14 this mo</Text>
        </View>

        {/* Volume Card (Hero Accent Card) */}
        <View style={[s.statCard, s.heroVolumeCard]}>
          <Text style={s.heroVolumeLabel}>VOLUME</Text>
          <View style={s.heroVolumeNumRow}>
            <Text style={s.heroVolumeNum}>{displayVolume}</Text>
            <Text style={s.heroVolumeUnit}>kg moved</Text>
          </View>
          <Text style={s.heroVolumeRank}>ALL-TIME</Text>
        </View>

        {/* Streak Card */}
        <View style={s.statCard}>
          <Text style={s.statLabel}>STREAK</Text>
          <Text style={s.statNum}>{displayStreak}</Text>
          <Text style={[s.statSub, { color: theme.red }]}>Active Days</Text>
        </View>
      </View>

      {/* Volume Distribution Analytics (Tonnage Split) */}
      <Card style={s.tonnageSplitCard}>
        <View style={s.tonnageHeader}>
          <View>
            <Text style={s.sectionEyebrow}>TONNAGE SPLIT</Text>
            <Text style={s.tonnageTitle}>VOLUME BY MUSCLE</Text>
          </View>
          <Badge label="Past 90 Days" tone="default" />
        </View>

        <View style={s.tonnageBarsList}>
          {muscleSplits.length === 0 ? (
            <Text style={s.hallSub}>No volume logged in the last 90 days.</Text>
          ) : (
            muscleSplits.map((item: { label: string; pct: number; isAccent: boolean }) => (
            <View key={item.label} style={s.splitItem}>
              <View style={s.splitLabelRow}>
                <Text style={s.splitMuscleName}>{item.label}</Text>
                <Text style={s.splitPercent}>{item.pct}%</Text>
              </View>
              <View style={s.splitTrack}>
                <View
                  style={[
                    s.splitBarFill,
                    { width: `${item.pct}%` },
                    item.isAccent ? s.splitBarAccent : s.splitBarDefault
                  ]}
                />
              </View>
            </View>
          ))
          )}
        </View>
      </Card>

      {/* PR Hall of Fame */}
      <View style={s.sectionHeadContainer}>
        <View>
          <Text style={s.sectionEyebrow}>HALL OF FAME</Text>
          <Text style={s.hallSub}>Estimated 1RM Records</Text>
        </View>
        <View style={s.verifiedRow}>
          <Icon8 name="verified" size={14} color={theme.accent} />
          <Text style={[s.verifiedText, { color: theme.accent }]}>
            {records.length} RECORD{records.length === 1 ? "" : "S"}
          </Text>
        </View>
      </View>

      <View style={s.hofList}>
        {records.length === 0 ? (
          <Card style={s.hofCard}>
            <Text style={s.hofDate}>No estimated 1RM records yet.</Text>
          </Card>
        ) : (
          records.map((record, idx) => (
            <Card key={record.exerciseId} style={s.hofCard}>
              <View style={s.hofLeft}>
                <ExerciseThumb
                  name={record.name}
                  primaryMuscle={record.primaryMuscle ?? "other"}
                  equipment={record.equipment}
                  mediaUrl={record.mediaUrl}
                  size={40}
                />
                <View style={s.hofInfo}>
                  <View style={s.hofTitleRow}>
                    <Text style={s.hofName} numberOfLines={1}>
                      {record.name}
                    </Text>
                    {idx === 0 && <Badge label="TOP" tone="accent" />}
                  </View>
                  <Text style={s.hofDate}>
                    Set {new Date(record.date).toLocaleDateString()}
                  </Text>
                </View>
              </View>
              <View style={s.hofRight}>
                <Text style={s.hofKg}>
                  {Math.round(record.kg)} <Text style={s.hofKgUnit}>{units.toUpperCase()}</Text>
                </Text>
                {units === "kg" && (
                  <Text style={s.hofLbs}>{Math.round(record.kg * LBS_PER_KG)} LBS</Text>
                )}
              </View>
            </Card>
          ))
        )}
      </View>

      {/* Hardware & System / Settings */}
      <View style={s.sectionHeadContainer}>
        <View>
          <Text style={s.sectionEyebrow}>HARDWARE & SYSTEM</Text>
          <Text style={s.hallSub}>Logging standards & telemetry sync</Text>
        </View>
      </View>

      <Card style={s.settingsCard}>
        {/* Theme Mode Toggle */}
        <View style={s.settingRow}>
          <View style={s.settingLabelCol}>
            <Text style={s.settingTitle}>APPEARANCE</Text>
            <Text style={s.settingSub}>{isDark ? "Dark Obsidian" : "Bauhaus Light Paper"}</Text>
          </View>
          <Pressable
            style={[s.themeTogglePill, isDark ? s.themeToggleDark : s.themeToggleLight]}
            onPress={toggleTheme}
          >
            <Text style={s.themeToggleText}>
              {isDark ? "DARK MODE" : "LIGHT MODE"}
            </Text>
          </Pressable>
        </View>

        {/* Units Selector */}
        <View style={s.settingRow}>
          <View style={s.settingLabelCol}>
            <Text style={s.settingTitle}>WEIGHT UNITS</Text>
            <Text style={s.settingSub}>Barbell & dumbbell load scale</Text>
          </View>
          <View style={s.unitsSwitch}>
            <Pressable
              style={[s.unitBtn, units === "kg" && s.unitBtnActive]}
              onPress={() => update({ units: "kg" })}
            >
              <Text style={[s.unitBtnText, units === "kg" && s.unitBtnTextActive]}>KG</Text>
            </Pressable>
            <Pressable
              style={[s.unitBtn, units === "lbs" && s.unitBtnActive]}
              onPress={() => update({ units: "lbs" })}
            >
              <Text style={[s.unitBtnText, units === "lbs" && s.unitBtnTextActive]}>LBS</Text>
            </Pressable>
          </View>
        </View>

        {/* Rest Timer Preset */}
        <View style={s.settingRow}>
          <View style={s.settingLabelCol}>
            <Text style={s.settingTitle}>DEFAULT REST TIMER</Text>
            <Text style={s.settingSub}>{settings?.defaultRestSec ?? 90} seconds interval</Text>
          </View>
          <View style={s.restPresets}>
            {[60, 90, 120].map((sec) => {
              const active = (settings?.defaultRestSec ?? 90) === sec;
              return (
                <Pressable
                  key={sec}
                  style={[s.restPresetBtn, active && s.restPresetActive]}
                  onPress={() => update({ defaultRestSec: sec })}
                >
                  <Text style={[s.restPresetText, active && s.restPresetTextActive]}>
                    {sec}s
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Plate Calculator Switch */}
        <View style={s.settingRow}>
          <View style={s.settingLabelCol}>
            <Text style={s.settingTitle}>PLATE CALCULATOR</Text>
            <Text style={s.settingSub}>Break down loads per side</Text>
          </View>
          <Switch
            value={settings?.plateCalculator ?? true}
            onValueChange={(v) => update({ plateCalculator: v })}
            trackColor={{ false: theme.surface3, true: theme.accent }}
            thumbColor={theme.text}
          />
        </View>

        {/* Warmup Calculator Switch */}
        <View style={[s.settingRow, { borderBottomWidth: 0 }]}>
          <View style={s.settingLabelCol}>
            <Text style={s.settingTitle}>WARM-UP CALCULATOR</Text>
            <Text style={s.settingSub}>Automated ramp sets</Text>
          </View>
          <Switch
            value={settings?.warmupCalculator ?? true}
            onValueChange={(v) => update({ warmupCalculator: v })}
            trackColor={{ false: theme.surface3, true: theme.accent }}
            thumbColor={theme.text}
          />
        </View>
      </Card>

      {/* Sign Out Action Button */}
      <Pressable
        style={s.signOutBtn}
        onPress={async () => {
          await logout();
          router.replace("/login");
        }}
      >
        <Text style={s.signOutText}>SIGN OUT OF ACCOUNT</Text>
      </Pressable>
    </ScrollView>
  );
}

const useStyles = (theme: any, A: any) =>
  StyleSheet.create({
    profileHeaderCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      padding: 16,
      marginBottom: 24
    },
    profileTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    avatarContainer: {
      position: "relative"
    },
    avatarBox: {
      width: 76,
      height: 76,
      borderRadius: theme.radius.md,
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center"
    },
    avatarInitials: {
      ...T.heading,
      fontSize: 24,
      color: theme.text
    },
    proBadge: {
      position: "absolute",
      bottom: -2,
      right: -2,
      backgroundColor: theme.accent,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: theme.radius.xs
    },
    proBadgeText: {
      ...T.micro,
      fontSize: 9.5,
      color: theme.onAccent,
      fontWeight: "800"
    },
    profileDetails: {
      flex: 1,
      marginLeft: 16
    },
    badgeEstRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 4
    },
    estText: {
      ...T.micro,
      color: theme.dim,
      fontSize: 10.5
    },
    athleteName: {
      ...T.heading,
      fontSize: 22,
      letterSpacing: -0.4,
      color: theme.text
    },
    athleteHandle: {
      ...T.micro,
      color: theme.dim,
      fontSize: 11,
      marginTop: 3
    },
    profileSettingsBtn: {
      padding: 10,
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.sm
    },
    profileSettingsIcon: {
      fontSize: 16
    },

    bioCard: {
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.sm,
      padding: 14,
      marginTop: 16
    },
    bioText: {
      ...T.bodySm,
      color: theme.text,
      fontSize: 12,
      lineHeight: 19
    },
    bioBold: {
      fontWeight: "700"
    },

    sectionHeadContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12
    },
    sectionEyebrow: {
      ...T.micro,
      color: theme.dim,
      fontSize: 10.5,
      letterSpacing: 1.2
    },
    sectionPeriod: {
      ...T.micro,
      color: theme.dim,
      fontSize: 10.5
    },
    hallSub: {
      ...T.meta,
      color: theme.dim,
      fontSize: 11.5,
      marginTop: 2
    },

    // 3-Column Stats Grid
    statsGrid: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 24
    },
    statCard: {
      flex: 1,
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      padding: 14,
      justifyContent: "space-between",
      minHeight: 100
    },
    statLabel: {
      ...T.micro,
      color: theme.dim,
      fontSize: 9.5,
      letterSpacing: 1
    },
    statNum: {
      ...T.title,
      color: theme.text,
      fontSize: 24,
      letterSpacing: -0.5,
      marginVertical: 4,
      ...NUM
    },
    statSub: {
      ...T.micro,
      fontSize: 9.5,
      fontWeight: "700"
    },
    heroVolumeCard: {
      backgroundColor: theme.isDark ? theme.surface3 : "#1a1a1a",
      borderColor: theme.accent,
      borderWidth: 1.5
    },
    heroVolumeLabel: {
      ...T.micro,
      color: theme.accent,
      fontSize: 9.5,
      letterSpacing: 1
    },
    heroVolumeNumRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 3,
      marginVertical: 4
    },
    heroVolumeNum: {
      ...T.title,
      color: theme.accent,
      fontSize: 24,
      letterSpacing: -0.5,
      ...NUM
    },
    heroVolumeUnit: {
      ...T.micro,
      color: theme.dim,
      fontSize: 9
    },
    heroVolumeRank: {
      ...T.micro,
      color: theme.accent,
      fontSize: 9.5,
      fontWeight: "800"
    },

    // Tonnage Split
    tonnageSplitCard: {
      padding: 16,
      borderRadius: theme.radius.md,
      marginBottom: 24
    },
    tonnageHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 16
    },
    tonnageTitle: {
      ...T.heading,
      fontSize: 14,
      color: theme.text,
      marginTop: 3
    },
    tonnageBarsList: {
      gap: 14
    },
    splitItem: {
      gap: 5
    },
    splitLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    splitMuscleName: {
      ...T.micro,
      color: theme.text,
      fontSize: 11,
      fontWeight: "700"
    },
    splitPercent: {
      ...T.micro,
      color: theme.dim,
      fontSize: 10.5,
      ...NUM
    },
    splitTrack: {
      height: 8,
      backgroundColor: theme.surface2,
      borderRadius: theme.radius.xs,
      overflow: "hidden"
    },
    splitBarFill: {
      height: "100%",
      borderRadius: theme.radius.xs
    },
    splitBarAccent: {
      backgroundColor: theme.accent
    },
    splitBarDefault: {
      backgroundColor: theme.isDark ? theme.border : theme.surfaceHighest
    },

    // Hall of Fame
    verifiedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4
    },
    verifiedIcon: {
      fontSize: 12,
      color: theme.blue,
      fontWeight: "800"
    },
    verifiedText: {
      ...T.micro,
      color: theme.blue,
      fontSize: 10,
      fontWeight: "700"
    },
    hofList: {
      gap: 10,
      marginBottom: 24
    },
    hofCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 14,
      borderRadius: theme.radius.md,
      marginBottom: 0
    },
    hofLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1
    },
    hofIconBox: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center"
    },
    hofIconText: {
      fontSize: 18
    },
    hofInfo: {
      flex: 1
    },
    hofTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6
    },
    hofName: {
      ...T.heading,
      fontSize: 14,
      color: theme.text
    },
    hofDate: {
      ...T.meta,
      color: theme.dim,
      fontSize: 11,
      marginTop: 3
    },
    hofRight: {
      alignItems: "flex-end"
    },
    hofKg: {
      ...T.title,
      fontSize: 18,
      color: theme.text,
      ...NUM
    },
    hofKgUnit: {
      fontSize: 11.5,
      color: theme.dim,
      fontWeight: "600"
    },
    hofLbs: {
      ...T.micro,
      color: theme.dim,
      fontSize: 10,
      marginTop: 2
    },

    // Settings
    settingsCard: {
      padding: 4,
      borderRadius: theme.radius.md,
      marginBottom: 24
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.surface2
    },
    settingLabelCol: {
      flex: 1,
      paddingRight: 12
    },
    settingTitle: {
      ...T.label,
      fontSize: 11.5,
      color: theme.text
    },
    settingSub: {
      ...T.meta,
      color: theme.dim,
      fontSize: 11,
      marginTop: 2
    },
    themeTogglePill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: theme.radius.sm,
      borderWidth: 1
    },
    themeToggleDark: {
      backgroundColor: theme.surface3,
      borderColor: theme.accent
    },
    themeToggleLight: {
      backgroundColor: theme.surface2,
      borderColor: theme.borderStrong
    },
    themeToggleText: {
      ...T.micro,
      fontSize: 10,
      color: theme.accent,
      fontWeight: "700"
    },
    unitsSwitch: {
      flexDirection: "row",
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.sm,
      padding: 2
    },
    unitBtn: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: theme.radius.sm
    },
    unitBtnActive: {
      backgroundColor: theme.accent
    },
    unitBtnText: {
      ...T.micro,
      fontSize: 10,
      color: theme.dim
    },
    unitBtnTextActive: {
      color: theme.onAccent,
      fontWeight: "800"
    },
    restPresets: {
      flexDirection: "row",
      gap: 5
    },
    restPresetBtn: {
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.sm,
      paddingHorizontal: 9,
      paddingVertical: 5
    },
    restPresetActive: {
      backgroundColor: theme.accent,
      borderColor: theme.accent
    },
    restPresetText: {
      ...T.micro,
      fontSize: 10,
      color: theme.dim
    },
    restPresetTextActive: {
      color: theme.onAccent,
      fontWeight: "800"
    },

    signOutBtn: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      paddingVertical: 14,
      marginBottom: 40
    },
    signOutText: {
      ...T.label,
      color: theme.red,
      fontSize: 11.5
    }
  });

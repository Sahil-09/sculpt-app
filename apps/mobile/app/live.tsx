import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { get, post, resolveMediaUrl, ApiError } from "../lib/api";
import { queueWorkout, useOffline } from "../lib/offline";
import { buildWorkoutPayload } from "../lib/workoutPayload";
import { useTheme } from "../lib/ThemeContext";
import type { PersonalRecord, SetType, WorkoutSettings } from "@sculpt/shared";
import { SET_TYPE_META, SUPERSET_COLORS, plateBreakdown, warmupRamp } from "@sculpt/shared";
import { NUM, R, S, T } from "../lib/theme";
import {
  AppHeader,
  Badge,
  Btn,
  Card,
  EmptyState,
  ExerciseThumb,
  Field,
  Icon8,
  IconBtn,
  Notice,
  Pill,
  PulseDot,
  useScreenStyle,
  SectionHeader
} from "../lib/ui";
import { fmtClock, fmtVolume, prLabel } from "../lib/format";
import {
  useWorkoutSession,
  type LiveExercise,
  type LiveSet
} from "../lib/workoutSession";

let seq = 1;
const nid = () => `local-${seq++}-${Date.now()}`;

/** WorkoutSettings carries no plate-increment field, so steppers jump by the standard 2.5. */
const KG_STEP = 2.5;

interface InstructionEntry {
  text?: string;
  steps?: string[];
}
interface Template {
  _id: string;
  datasetId?: string | null;
  name: string;
  primaryMuscle: string;
  secondaryMuscles?: string[];
  category?: string | null;
  equipment?: string | null;
  mediaUrl?: string | null;
  gifUrl?: string | null;
  instructions?: Record<string, InstructionEntry>;
  isCustom?: boolean;
}
interface Summary {
  name: string;
  durationSec: number;
  volume: number;
  sets: number;
  prs: PersonalRecord[];
  queued: boolean;
}

const numOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export default function Live() {
  const { mode, routineId } = useLocalSearchParams<{ mode?: string; routineId?: string }>();
  const { refresh: refreshOffline } = useOffline();
  const { theme, A } = useTheme();
  const screenStyle = useScreenStyle();
  const s = useStyles(theme, A);
  // The draft lives in a provider above the router, so backing out of this screen keeps the
  // workout. Elapsed is derived from startedAt, so it keeps counting while unmounted.
  const session = useWorkoutSession();
  const name = session.draft?.name ?? "Workout";
  const exercises = session.draft?.exercises ?? [];
  const elapsed = session.elapsedSec;
  const setName = session.setName;
  const setExercises = session.setExercises;
  const [settings, setSettings] = useState<WorkoutSettings | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);
  const [equipFilter, setEquipFilter] = useState<string | null>(null);
  const [whichFilter, setWhichFilter] = useState<"equip" | "muscle" | null>(null);
  const [detailFor, setDetailFor] = useState<Template | null>(null);
  const [detailLang, setDetailLang] = useState<string>("en");
  const [detailGifErr, setDetailGifErr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const nameMap = useRef(new Map<string, string>());

  const loadHistory = useCallback(
    async (exerciseId: string): Promise<{ prev: string | null; prevSets: Array<{ kg: number; reps: number }> }> => {
      try {
        const h = await get<{
          recent: Array<{
            sets?: Array<{ kg?: number | null; reps?: number | null; type?: string | null }>;
          }>;
        }>(`/v1/workouts/exercise/${exerciseId}/history?limit=1`);
        const sets = h.recent[0]?.sets ?? [];
        const working = sets.filter((x) => x.kg != null && x.reps != null && x.type !== "warmup");
        const prevSets = working.map((x) => ({ kg: x.kg as number, reps: x.reps as number }));
        const logged = sets.filter((x) => x.kg != null || x.reps != null);
        const pick =
          (working.length ? working.reduce((a, b) => ((b.kg ?? 0) > (a.kg ?? 0) ? b : a)) : null) ??
          logged[logged.length - 1] ??
          null;
        if (!pick) return { prev: null, prevSets };
        if (pick.kg != null && pick.reps != null) return { prev: `${pick.kg} × ${pick.reps}`, prevSets };
        if (pick.reps != null) return { prev: `${pick.reps} reps`, prevSets };
        return { prev: null, prevSets };
      } catch {
        return { prev: null, prevSets: [] };
      }
    },
    []
  );

  const addExercise = useCallback(
    async (tpl: Template, seedSets?: Array<{ kg: number | null; reps: number | null }>) => {
      const hist = await loadHistory(tpl._id);
      const mk = (kg: string, reps: string): LiveSet => ({ key: nid(), kg, reps, rpe: "", done: false, kind: "normal" });
      setExercises((prevEx) => [
        ...prevEx,
        {
          key: nid(),
          exerciseId: tpl._id,
          name: tpl.name,
          primaryMuscle: tpl.primaryMuscle,
          secondaryMuscles: tpl.secondaryMuscles ?? [],
          equipment: tpl.equipment ?? null,
          mediaUrl: tpl.mediaUrl ?? null,
          notes: "",
          restSec: null,
          supersetGroup: null,
          prev: hist.prev,
          prevSets: hist.prevSets,
          sets:
            seedSets?.map((s) => mk(s.kg != null ? String(s.kg) : "", s.reps != null ? String(s.reps) : "")) ??
            [mk("", "")]
        }
      ]);
    },
    [loadHistory]
  );

  async function createExercise() {
    const tpl: Template = {
      _id: nid(),
      name: query.trim() || "Custom exercise",
      primaryMuscle: "other",
      equipment: null,
      isCustom: true
    };
    setTemplates((p) => [tpl, ...p]);
    closePicker();
    await addExercise(tpl);
  }

  /** Close the picker and reset its transient filters so reopening starts clean. */
  function closePicker() {
    setPickerOpen(false);
    setQuery("");
    setMuscleFilter(null);
    setEquipFilter(null);
    setWhichFilter(null);
  }

  /** Open the Exercise Detail modal and lazy-fetch full multilingual instructions if omitted from list. */
  const openDetail = useCallback(async (tpl: Template) => {
    setDetailGifErr(false);
    setDetailFor(tpl);
    if (!tpl.instructions && !tpl.isCustom) {
      try {
        const full = await get<Template>(`/v1/exercise-templates/${encodeURIComponent(tpl.datasetId || tpl._id)}`);
        setDetailFor((cur) => (cur && cur._id === tpl._id ? { ...tpl, ...full, _id: tpl._id } : cur));
      } catch {
        // Keep partial template info if offline/unavailable
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : "Failed to start");
      const [st, tpl] = await Promise.allSettled([
        get<{ settings: WorkoutSettings }>("/v1/users/me/settings"),
        get<{ items: Template[] }>("/v1/exercise-templates?limit=2000")
      ]);
      if (st.status === "fulfilled") setSettings(st.value.settings);
      else fail(st.reason);
      let items: Template[] = [];
      if (tpl.status === "fulfilled") {
        items = tpl.value.items;
        setTemplates(items);
        for (const x of items) nameMap.current.set(x._id, x.name);
      } else fail(tpl.reason);

      // Resume an interrupted session untouched. Only a genuinely fresh start seeds one.
      if (session.draft) return;

      if (mode === "routine" && routineId) {
        try {
          const r = await get<{
            name: string;
            exercises: Array<{ exerciseId: string; restSec?: number | null; sets: Array<{ kg?: number | null; reps?: number | null }> }>;
          }>(`/v1/routines/${routineId}`);
          session.start(r.name, []);
          for (const e of r.exercises) {
            const t = items.find((x) => x._id === e.exerciseId);
            if (!t) continue;
            await addExercise(t, e.sets.map((x) => ({ kg: x.kg ?? null, reps: x.reps ?? null })));
          }
        } catch (e) {
          fail(e);
        }
      } else {
        session.start(`Workout ${new Date().toLocaleDateString()}`, []);
      }
    })();
  }, [mode, routineId, addExercise]);

  useEffect(() => {
    if (restLeft == null) return;
    if (restLeft <= 0) {
      setRestLeft(null);
      return;
    }
    const t = setTimeout(() => setRestLeft((v) => (v == null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [restLeft]);

  const muscleOptions = useMemo(
    () => [...new Set(templates.map((t) => t.primaryMuscle))].sort(),
    [templates]
  );
  const equipOptions = useMemo(
    () => [...new Set(templates.map((t) => t.equipment).filter((e): e is string => !!e))].sort(),
    [templates]
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter(
      (t) =>
        (!muscleFilter || t.primaryMuscle === muscleFilter) &&
        (!equipFilter || t.equipment === equipFilter) &&
        (!q || t.name.toLowerCase().includes(q))
    );
  }, [templates, query, muscleFilter, equipFilter]);

  function patchSet(exKey: string, setKey: string, p: Partial<LiveSet>) {
    setExercises((prev) =>
      prev.map((e) => (e.key === exKey ? { ...e, sets: e.sets.map((x) => (x.key === setKey ? { ...x, ...p } : x)) } : e))
    );
  }

  /** Nudge a kg/reps cell through the same patchSet path as typing, so validation and parsing hold. */
  function bump(exKey: string, x: LiveSet, field: "kg" | "reps", dir: 1 | -1) {
    const step = field === "reps" ? 1 : KG_STEP;
    const next = Math.max(0, Math.round(((numOrNull(x[field]) ?? 0) + dir * step) * 10) / 10);
    patchSet(exKey, x.key, field === "kg" ? { kg: String(next) } : { reps: String(next) });
  }

  function patchExercise(exKey: string, p: Partial<LiveExercise>) {
    setExercises((prev) => prev.map((e) => (e.key === exKey ? { ...e, ...p } : e)));
  }

  function toggleDone(ex: LiveExercise, st: LiveSet) {
    const done = !st.done;
    patchSet(ex.key, st.key, { done });
    if (done) {
      const rest = ex.restSec ?? settings?.defaultRestSec ?? 0;
      if (rest > 0) setRestLeft(rest);
    }
  }

  function addSet(exKey: string) {
    setExercises((prev) =>
      prev.map((e) =>
        e.key === exKey
          ? { ...e, sets: [...e.sets, { key: nid(), kg: "", reps: "", rpe: "", done: false, kind: "normal" as SetType }] }
          : e
      )
    );
  }

  const KIND_ORDER: SetType[] = ["normal", "warmup", "drop", "failure"];

  function cycleKind(exKey: string, setKey: string) {
    setExercises((prev) =>
      prev.map((e) =>
        e.key === exKey
          ? {
              ...e,
              sets: e.sets.map((x) =>
                x.key === setKey
                  ? { ...x, kind: KIND_ORDER[(KIND_ORDER.indexOf(x.kind) + 1) % KIND_ORDER.length] }
                  : x
              )
            }
          : e
      )
    );
  }

  const REST_PRESETS: Array<number | null> = [60, 90, 120, 180, 240, null];

  function cycleRest(exKey: string) {
    const ex = exercises.find((e) => e.key === exKey);
    if (!ex) return;
    const cur = ex.restSec ?? settings?.defaultRestSec ?? 90;
    patchExercise(exKey, { restSec: REST_PRESETS[(REST_PRESETS.indexOf(cur) + 1) % REST_PRESETS.length] });
  }

  function toggleSuperset(exKey: string) {
    setExercises((prev) => {
      const i = prev.findIndex((e) => e.key === exKey);
      if (i < 0) return prev;
      const next = [...prev];
      if (next[i].supersetGroup) {
        next[i] = { ...next[i], supersetGroup: null };
        return next;
      }
      if (i === 0) return prev;
      const group = prev[i - 1].supersetGroup ?? prev[i - 1].key;
      next[i] = { ...next[i], supersetGroup: group };
      if (!prev[i - 1].supersetGroup) next[i - 1] = { ...next[i - 1], supersetGroup: group };
      return next;
    });
  }

  function addWarmupSets(exKey: string) {
    const ex = exercises.find((e) => e.key === exKey);
    const target = Math.max(
      0,
      ...(ex?.sets.map((x) => Number(x.kg)).filter((n) => Number.isFinite(n)) ?? [])
    );
    const n = settings?.warmupSets ?? 3;
    if (!ex || target <= 0 || n <= 0) return;
    const ramp = warmupRamp(target, n);
    setExercises((prev) =>
      prev.map((e) =>
        e.key === exKey
          ? {
              ...e,
              sets: [
                ...ramp.map((r) => ({
                  key: nid(),
                  kg: String(r.kg),
                  reps: String(r.reps),
                  rpe: "",
                  done: false,
                  kind: "warmup" as SetType
                })),
                ...e.sets
              ]
            }
          : e
      )
    );
  }

  function removeSet(exKey: string, setKey: string) {
    setExercises((prev) =>
      prev.map((e) => (e.key === exKey ? { ...e, sets: e.sets.filter((x) => x.key !== setKey) } : e))
    );
  }

  const volume = useMemo(
    () =>
      exercises.reduce(
        (t, e) =>
          t +
          e.sets.reduce((s, x) => {
            const kg = numOrNull(x.kg);
            const reps = numOrNull(x.reps);
            return x.done && kg != null && reps != null ? s + kg * reps : s;
          }, 0),
        0
      ),
    [exercises]
  );
  const doneCount = useMemo(() => exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0), [exercises]);

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const end = new Date();
      const startedAt = session.draft?.startedAt ?? end.getTime();
      const payload = buildWorkoutPayload({
        name,
        startTimeMs: startedAt,
        endTimeMs: end.getTime(),
        exercises
      });
      const base = {
        name,
        durationSec: Math.floor((end.getTime() - startedAt) / 1000),
        volume,
        sets: doneCount
      };
      try {
        const res = await post<{ prs: PersonalRecord }>("/v1/workouts", payload);
        const data = res as unknown as { workout: { name: string }; prs: PersonalRecord[] };
        // Only once the save is durable — clearing before would discard the draft on failure.
        session.clear();
        setSummary({ ...base, name: data.workout.name, prs: data.prs ?? [], queued: false });
      } catch (e) {
        if (e instanceof ApiError) throw e;
        await queueWorkout(payload);
        await refreshOffline();
        session.clear();
        setSummary({ ...base, prs: [], queued: true });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const groupColor = useMemo(() => {
    const order: string[] = [];
    for (const e of exercises) {
      if (e.supersetGroup && !order.includes(e.supersetGroup)) order.push(e.supersetGroup);
    }
    const m = new Map<string, string>();
    order.forEach((g, i) => m.set(g, SUPERSET_COLORS[i % SUPERSET_COLORS.length]));
    return m;
  }, [exercises]);

  const [plateFor, setPlateFor] = useState<LiveExercise | null>(null);
  const plateInfo = useMemo(() => {
    if (!plateFor) return null;
    const target = Math.max(
      0,
      ...plateFor.sets.map((x) => Number(x.kg)).filter((n) => Number.isFinite(n) && n > 0)
    );
    if (target <= 0) return { target: 0, plates: [] as number[], remainder: 0 };
    const { plates, remainder } = plateBreakdown(target, settings?.barWeight ?? 20, settings?.plateRacks ?? [20, 15, 10, 5, 2.5, 1.25]);
    return { target, plates, remainder };
  }, [plateFor, settings]);

  /** Compact −/+ button flanking the kg and reps inputs. */
  function StepBtn({ glyph, onPress }: { glyph: string; onPress: () => void }) {
    return (
      <TouchableOpacity style={s.step} onPress={onPress} hitSlop={8} accessibilityRole="button">
        <Text style={s.stepText}>{glyph}</Text>
      </TouchableOpacity>
    );
  }

  if (summary) {
    return (
      <View style={[screenStyle, s.summaryWrap]}>
        <View style={s.summaryHead}>
          <Text style={s.summaryTitle}>{summary.queued ? "Queued offline" : `Saved: ${summary.name}`}</Text>
          <Text style={s.meta}>
            {fmtClock(summary.durationSec)} · {summary.sets} sets ·{" "}
            {fmtVolume(summary.volume, settings?.units ?? "kg")}
          </Text>
        </View>
        {summary.queued && (
          <Notice tone="info" style={s.summaryNotice}>
            No connection — stored on this device and will sync automatically.
          </Notice>
        )}
        {summary.prs.length > 0 && (
          <Card tone="good">
            <SectionHeader>Personal records ({summary.prs.length})</SectionHeader>
            {summary.prs.map((p, i) => (
              <View key={i} style={s.prRow}>
                <Text style={s.pr}>{prLabel(p.kind)}</Text>
                <Text style={s.prValue}>
                  {p.value}
                  {p.unit} · {nameMap.current.get(p.exerciseId) ?? "lift"}
                </Text>
              </View>
            ))}
          </Card>
        )}
        <View style={{ flex: 1 }} />
        <Btn label="Done" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={screenStyle}>
      <AppHeader title="TRAINING" />

      {/* Top Session Meta Bar matching Stitch */}
      <View style={s.topMetaBar}>
        <View style={s.topMetaLeft}>
          <View style={s.liveTagRow}>
            <PulseDot color={theme.red} />
            <Text style={s.liveTagText}>LIVE WORKOUT</Text>
          </View>
          <Field
            style={s.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Workout Title"
          />
        </View>

        <View style={s.topMetaRight}>
          <View style={s.timerBox}>
            <Icon8 name="timer" size={13} color={theme.accent} />
            <Text style={s.timerText}>{fmtClock(elapsed)}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              s.finishTopBtn,
              pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
              (saving || exercises.length === 0) && { opacity: 0.4 }
            ]}
            disabled={saving || exercises.length === 0}
            onPress={finish}
          >
            <Text style={s.finishTopText}>{saving ? "SAVING…" : "FINISH"}</Text>
            <Icon8 name="check" size={13} color="#ffffff" />
          </Pressable>
        </View>
      </View>

      {/* Dynamic Rest Timer Widget */}
      {restLeft != null && (
        <View style={s.restWidget}>
          <View style={s.restWidgetLeft}>
            <View style={s.restIconBox}>
              <Icon8 name="hourglass" size={20} color={theme.accent} />
            </View>
            <View>
              <Text style={s.restWidgetLabel}>REST PERIOD</Text>
              <View style={s.restWidgetTimeRow}>
                <Text style={s.restWidgetClock}>{fmtClock(restLeft)}</Text>
                <Text style={s.restWidgetRemaining}>REMAINING</Text>
              </View>
            </View>
          </View>
          <View style={s.restWidgetRight}>
            <Pressable
              style={s.restAddBtn}
              onPress={() => setRestLeft((v) => (v ?? 0) + 30)}
            >
              <Text style={s.restAddText}>+30s</Text>
            </Pressable>
            <Pressable
              style={s.restSkipBtn}
              onPress={() => setRestLeft(null)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Text style={s.restSkipText}>SKIP</Text>
                <Icon8 name="fastForward" size={12} color={theme.onAccent} />
              </View>
            </Pressable>
          </View>
        </View>
      )}

      {error && <Notice>{error}</Notice>}

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: S.xxl }}
      >
        {exercises.length === 0 && (
          <EmptyState
            glyph="+"
            title="No exercises yet"
            body="Add the first lift to start recording sets, reps and volume."
          />
        )}

        {exercises.map((e, ei) => {
          const band = e.supersetGroup ? groupColor.get(e.supersetGroup) : undefined;
          return (
            <View
              key={e.key}
              style={[
                s.exerciseCard,
                band && { borderLeftWidth: 4, borderLeftColor: band }
              ]}
            >
              {/* Exercise Header */}
              <View style={s.exCardHead}>
                <View style={{ flex: 1 }}>
                  <View style={s.exTagsRow}>
                    <Badge
                      label={[e.primaryMuscle, ...e.secondaryMuscles].join(" / ").toUpperCase()}
                      tone="default"
                    />
                    {e.prev && (
                      <Badge
                        label={`PR: ${e.prev}`}
                        tone="blue"
                      />
                    )}
                    {band && (
                      <Badge
                        label={`Superset ${ei + 1}`}
                        tone="accent"
                      />
                    )}
                  </View>
                  <Text style={s.exCardTitle}>{e.name.toUpperCase()}</Text>
                </View>

                <View style={s.exCardActions}>
                  <IconBtn
                    glyph="ⓘ"
                    tone="accent"
                    onPress={() => {
                      const found = templates.find((x) => x._id === e.exerciseId) ?? {
                        _id: e.exerciseId,
                        name: e.name,
                        primaryMuscle: e.primaryMuscle,
                        equipment: e.equipment,
                        mediaUrl: e.mediaUrl
                      };
                      openDetail(found);
                    }}
                  />
                  <IconBtn
                    glyph="✕"
                    tone="danger"
                    onPress={() => setExercises((p) => p.filter((x) => x.key !== e.key))}
                  />
                </View>
              </View>

              {/* Sets Table Grid */}
              <View style={s.tableContainer}>
                <View style={s.tableHeaderRow}>
                  <Text style={s.thSet}>SET</Text>
                  <Text style={s.thPrev}>PREV</Text>
                  <Text style={s.thKg}>KG</Text>
                  <Text style={s.thReps}>REPS</Text>
                  <Text style={s.thDone}>DONE</Text>
                </View>

                {e.sets.map((x, i) => {
                  const meta = SET_TYPE_META[x.kind];
                  const p = e.prevSets[i];
                  return (
                    <View
                      key={x.key}
                      style={[s.setRow, x.done && s.setRowDone]}
                    >
                      <Pressable
                        style={[s.kindChip, { borderColor: meta.color }]}
                        onPress={() => cycleKind(e.key, x.key)}
                      >
                        <Text style={[s.kindChipText, { color: meta.color }]}>
                          {meta.short}{i + 1}
                        </Text>
                      </Pressable>

                      <Text style={s.prevText} numberOfLines={1}>
                        {p ? `${p.kg} × ${p.reps}` : "—"}
                      </Text>

                      {/* KG Stepper */}
                      <View style={s.stepper}>
                        <StepBtn glyph="−" onPress={() => bump(e.key, x, "kg", -1)} />
                        <Field
                          inset
                          style={s.cell}
                          value={x.kg}
                          onChangeText={(v) => patchSet(e.key, x.key, { kg: v })}
                          keyboardType="decimal-pad"
                          placeholder="–"
                        />
                        <StepBtn glyph="+" onPress={() => bump(e.key, x, "kg", 1)} />
                      </View>

                      {/* Reps Stepper */}
                      <View style={s.stepper}>
                        <StepBtn glyph="−" onPress={() => bump(e.key, x, "reps", -1)} />
                        <Field
                          inset
                          style={s.cell}
                          value={x.reps}
                          onChangeText={(v) => patchSet(e.key, x.key, { reps: v })}
                          keyboardType="number-pad"
                          placeholder="–"
                        />
                        <StepBtn glyph="+" onPress={() => bump(e.key, x, "reps", 1)} />
                      </View>

                      {/* Done Toggle Squircle */}
                      <Pressable
                        style={[
                          s.doneCheckBtn,
                          x.done ? s.doneCheckBtnActive : s.doneCheckBtnPending
                        ]}
                        onPress={() => toggleDone(e, x)}
                      >
                        <Icon8
                          name="check"
                          size={14}
                          color={x.done ? theme.onAccent : theme.faint}
                        />
                      </Pressable>
                    </View>
                  );
                })}
              </View>

              {/* Set Notes Field */}
              <Field
                inset
                multiline
                maxLength={2000}
                style={s.notesInput}
                value={e.notes}
                onChangeText={(v) => patchExercise(e.key, { notes: v })}
                placeholder="Add cue, bench angle (e.g. 30 deg), or feeling..."
              />

              {/* Auxiliary Tools Row */}
              <View style={s.auxToolsRow}>
                <Pill
                  on={!!e.supersetGroup}
                  disabled={ei === 0 && !e.supersetGroup}
                  onPress={() => toggleSuperset(e.key)}
                >
                  {e.supersetGroup ? "Unlink" : "Superset ↑"}
                </Pill>
                <Pill on={e.restSec != null} onPress={() => cycleRest(e.key)}>
                  Rest {e.restSec ?? settings?.defaultRestSec ?? 90}s
                </Pill>
                {settings?.plateCalculator !== false && (
                  <Pill onPress={() => setPlateFor(e)}>Plates</Pill>
                )}
                {settings?.warmupCalculator !== false && (
                  <Pill onPress={() => addWarmupSets(e.key)}>Warm-up</Pill>
                )}
              </View>

              {/* Add Set Button */}
              <Pressable
                style={({ pressed }) => [s.addSetBtn, pressed && { opacity: 0.8 }]}
                onPress={() => addSet(e.key)}
              >
                <Text style={s.addSetText}>+ ADD SET</Text>
              </Pressable>
            </View>
          );
        })}

        {/* Bottom Action Buttons */}
        <View style={s.bottomDock}>
          <Pressable
            style={({ pressed }) => [s.addExerciseDockBtn, pressed && { opacity: 0.85 }]}
            onPress={() => setPickerOpen(true)}
          >
            <Icon8 name="add" size={16} color={theme.accent} />
            <Text style={s.addExerciseDockText}>ADD EXERCISE</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.logNoteDockBtn, pressed && { opacity: 0.85 }]}
            onPress={() => {
              if (exercises.length > 0) {
                patchExercise(exercises[0].key, {
                  notes: exercises[0].notes ? `${exercises[0].notes}\n[Note]` : "[Note]"
                });
              }
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon8 name="note" size={15} color={theme.dim} />
              <Text style={s.logNoteDockText}>LOG NOTE</Text>
            </View>
          </Pressable>
        </View>

        <Pressable
          style={s.discardBtn}
          onPress={() => router.back()}
        >
          <Text style={s.discardText}>DISCARD WORKOUT</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={closePicker}>
        <View style={s.modal}>
          <View style={s.modalHead}>
            <TouchableOpacity onPress={closePicker} hitSlop={8}>
              <Text style={s.modalLink}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>Add Exercise</Text>
            <TouchableOpacity onPress={createExercise} hitSlop={8}>
              <Text style={s.modalLink}>Create</Text>
            </TouchableOpacity>
          </View>
          <Field
            style={s.search}
            placeholder="🔍  Search exercise"
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          <View style={s.filterRow}>
            <Pill
              on={equipFilter != null}
              style={s.filterBtn}
              onPress={() => setWhichFilter((w) => (w === "equip" ? null : "equip"))}
            >
              {equipFilter ?? "All Equipment"}
            </Pill>
            <Pill
              on={muscleFilter != null}
              style={s.filterBtn}
              onPress={() => setWhichFilter((w) => (w === "muscle" ? null : "muscle"))}
            >
              {muscleFilter ?? "All Muscles"}
            </Pill>
          </View>
          {whichFilter === "muscle" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
              {muscleOptions.map((m) => (
                <Pill key={m} on={muscleFilter === m} onPress={() => setMuscleFilter((v) => (v === m ? null : m))}>
                  {m}
                </Pill>
              ))}
            </ScrollView>
          )}
          {whichFilter === "equip" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
              {equipOptions.map((eq) => (
                <Pill key={eq} on={equipFilter === eq} onPress={() => setEquipFilter((v) => (v === eq ? null : eq))}>
                  {eq}
                </Pill>
              ))}
            </ScrollView>
          )}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: S.lg }} showsVerticalScrollIndicator={false}>
            {!query && !muscleFilter && !equipFilter && <SectionHeader style={s.sectionHead}>Recent Exercises</SectionHeader>}
            {visible.length === 0 && (
              <EmptyState
                glyph="+"
                title="No matches"
                body="Clear a filter or search for something else."
              />
            )}
            {visible.slice(0, 50).map((t) => (
              <TouchableOpacity
                key={t._id}
                style={s.result}
                activeOpacity={0.6}
                onPress={() => {
                  const found = templates.find((x) => x._id === t._id) ?? t;
                  addExercise(found);
                  closePicker();
                }}
              >
                <ExerciseThumb
                  name={t.name}
                  primaryMuscle={t.primaryMuscle}
                  equipment={t.equipment}
                  mediaUrl={t.mediaUrl}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.exName}>{t.name}</Text>
                  <Text style={s.meta}>
                    {t.primaryMuscle}
                    {t.equipment ? ` · ${t.equipment}` : ""}
                  </Text>
                </View>
                {t.isCustom && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>Custom</Text>
                  </View>
                )}
                <IconBtn
                  glyph="ⓘ"
                  tone="dim"
                  onPress={() => openDetail(t)}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Btn label="Close" variant="secondary" onPress={closePicker} />
        </View>
      </Modal>

      {plateFor && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPlateFor(null)}>
          <View style={s.plateWrap}>
            <Card style={s.plateBox}>
              <SectionHeader>
                Load {plateInfo?.target ?? 0} {settings?.units ?? "kg"}
              </SectionHeader>
              <Text style={s.meta}>Bar {settings?.barWeight ?? 20} · per side:</Text>
              <Text style={s.plateList}>
                {plateInfo && plateInfo.plates.length > 0 ? plateInfo.plates.join(" + ") : "— just the bar —"}
              </Text>
              {plateInfo && plateInfo.remainder > 0 && (
                <Text style={s.plateWarn}>Unmatched: {plateInfo.remainder} {settings?.units ?? "kg"} (use small plates)</Text>
              )}
              <Btn label="Close" variant="secondary" style={s.plateClose} onPress={() => setPlateFor(null)} />
            </Card>
          </View>
        </Modal>
      )}

      {detailFor && (
        <Modal visible animationType="slide" onRequestClose={() => setDetailFor(null)}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <TouchableOpacity onPress={() => setDetailFor(null)} hitSlop={8}>
                <Text style={s.modalLink}>Close</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle} numberOfLines={1}>
                Exercise Detail
              </Text>
              <View style={{ width: 44 }} />
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: S.xl }} showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: "center", marginBottom: S.lg }}>
                {(() => {
                  const gifUri = resolveMediaUrl(detailFor.gifUrl ?? detailFor.mediaUrl);
                  return gifUri && !detailGifErr ? (
                    <Image
                      source={{ uri: gifUri }}
                      style={{
                        width: 180,
                        height: 180,
                        borderRadius: R.lg,
                        backgroundColor: "#fff",
                        borderWidth: 1,
                        borderColor: theme.border
                      }}
                      resizeMode="contain"
                      onError={() => setDetailGifErr(true)}
                    />
                  ) : (
                    <ExerciseThumb
                      name={detailFor.name}
                      primaryMuscle={detailFor.primaryMuscle}
                      equipment={detailFor.equipment}
                      mediaUrl={detailFor.mediaUrl}
                      size={96}
                    />
                  );
                })()}
              </View>
              <Text style={[s.clock, { fontSize: 22, marginBottom: S.xs }]}>{detailFor.name}</Text>
              <Text style={[s.meta, { marginBottom: S.md }]}>
                Target: {detailFor.primaryMuscle}
                {detailFor.equipment ? ` · Equipment: ${detailFor.equipment}` : ""}
                {detailFor.category ? ` · Category: ${detailFor.category}` : ""}
              </Text>
              {detailFor.secondaryMuscles && detailFor.secondaryMuscles.length > 0 && (
                <Text style={[s.meta, { marginBottom: S.md }]}>
                  Secondary: {detailFor.secondaryMuscles.join(", ")}
                </Text>
              )}
              {detailFor.instructions && (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
                    {(["en", "es", "fr", "it", "tr", "ru", "zh", "hi", "pl", "ko"] as const).map((lang) => (
                      <Pill
                        key={lang}
                        on={detailLang === lang}
                        onPress={() => setDetailLang(lang)}
                      >
                        {lang.toUpperCase()}
                      </Pill>
                    ))}
                  </ScrollView>
                  <Card style={{ marginTop: S.sm }}>
                    <SectionHeader>Instructions ({detailLang.toUpperCase()})</SectionHeader>
                    {(detailFor.instructions[detailLang]?.steps ?? detailFor.instructions.en?.steps ?? []).map(
                      (step, idx) => (
                        <View key={idx} style={{ flexDirection: "row", gap: S.sm, marginTop: S.sm }}>
                          <Text style={[s.prev, { width: 22 }]}>{idx + 1}.</Text>
                          <Text style={[s.exName, { flex: 1, fontWeight: "400", fontSize: 14, lineHeight: 20 }]}>
                            {step}
                          </Text>
                        </View>
                      )
                    )}
                    {!(detailFor.instructions[detailLang]?.steps?.length) &&
                      detailFor.instructions[detailLang]?.text && (
                        <Text style={[s.meta, { marginTop: S.sm, lineHeight: 20 }]}>
                          {detailFor.instructions[detailLang]?.text}
                        </Text>
                      )}
                  </Card>
                </>
              )}
            </ScrollView>
          </View>
        </Modal>
      )}

    </View>
  );
}

const useStyles = (theme: any, A: any) => StyleSheet.create({
  // Top Session Meta Bar
  topMetaBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.surface2,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 16
  },
  topMetaLeft: {
    flex: 1,
    marginRight: 12
  },
  liveTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 3
  },
  liveTagText: {
    ...T.micro,
    color: theme.red,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2
  },
  nameInput: {
    ...T.heading,
    fontSize: 14,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    minHeight: 28,
    paddingVertical: 0,
    paddingHorizontal: 0,
    color: theme.text,
    backgroundColor: "transparent",
    borderWidth: 0
  },
  topMetaRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  timerBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  timerIcon: {
    fontSize: 12
  },
  timerText: {
    ...T.micro,
    fontSize: 12,
    color: theme.text,
    ...NUM
  },
  finishTopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.red,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  finishTopText: {
    ...T.label,
    color: "#ffffff",
    fontSize: 11
  },
  finishTopIcon: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff"
  },

  // Dynamic Rest Timer Widget
  restWidget: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.isDark ? theme.card : "#1a1a1a",
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  restWidgetLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  restIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.isDark ? theme.surface3 : "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center"
  },
  restIconText: {
    fontSize: 18
  },
  restWidgetLabel: {
    ...T.micro,
    color: theme.isDark ? theme.dim : "#a1a1aa",
    fontSize: 10,
    letterSpacing: 1.2
  },
  restWidgetTimeRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
    marginTop: 2
  },
  restWidgetClock: {
    ...T.title,
    fontSize: 20,
    color: theme.accent,
    ...NUM
  },
  restWidgetRemaining: {
    ...T.micro,
    color: theme.isDark ? theme.dim : "#a1a1aa",
    fontSize: 9.5
  },
  restWidgetRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  restAddBtn: {
    backgroundColor: theme.isDark ? theme.surface3 : "rgba(255,255,255,0.15)",
    borderRadius: 4,
    borderColor: theme.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  restAddText: {
    ...T.label,
    fontSize: 11,
    color: theme.isDark ? theme.text : "#ffffff"
  },
  restSkipBtn: {
    backgroundColor: theme.accent,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  restSkipText: {
    ...T.label,
    fontSize: 11,
    color: theme.onAccent
  },

  // Exercise Card
  exerciseCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1
  },
  exCardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12
  },
  exTagsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
    flexWrap: "wrap"
  },
  exCardTitle: {
    ...T.heading,
    fontSize: 16,
    letterSpacing: -0.2,
    color: theme.text
  },
  exCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },

  // Table Grid
  tableContainer: {
    marginTop: 4
  },
  tableHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    marginBottom: 6
  },
  thSet: { width: 40, textAlign: "left", ...T.micro, color: theme.dim, fontSize: 10, letterSpacing: 0.8 },
  thPrev: { width: 65, textAlign: "left", ...T.micro, color: theme.dim, fontSize: 10, letterSpacing: 0.8 },
  thKg: { flex: 1, textAlign: "center", ...T.micro, color: theme.dim, fontSize: 10, letterSpacing: 0.8 },
  thReps: { flex: 1, textAlign: "center", ...T.micro, color: theme.dim, fontSize: 10, letterSpacing: 0.8 },
  thDone: { width: 40, textAlign: "right", ...T.micro, color: theme.dim, fontSize: 10, letterSpacing: 0.8 },

  setRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface2,
    marginBottom: 6
  },
  setRowDone: {
    backgroundColor: theme.isDark ? "rgba(250, 204, 21, 0.08)" : "rgba(255, 204, 0, 0.12)",
    borderColor: theme.accent
  },
  prevText: {
    width: 65,
    ...T.meta,
    fontSize: 11,
    color: theme.dim,
    ...NUM
  },
  stepper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 2,
    marginHorizontal: 3
  },
  step: {
    width: 22,
    height: 30,
    alignItems: "center",
    justifyContent: "center"
  },
  stepText: {
    ...T.heading,
    fontSize: 14,
    lineHeight: 16,
    color: theme.dim
  },
  cell: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    fontSize: 13,
    fontFamily: "SpaceGrotesk_700Bold",
    paddingHorizontal: 2,
    paddingVertical: 2,
    minHeight: 28,
    backgroundColor: "transparent",
    color: theme.text,
    borderWidth: 0,
    ...NUM
  },
  doneCheckBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto"
  },
  doneCheckBtnPending: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1
  },
  doneCheckBtnActive: {
    backgroundColor: theme.accent
  },
  doneCheckIcon: {
    fontSize: 14,
    fontWeight: "800"
  },
  doneCheckIconPending: {
    color: theme.faint
  },
  doneCheckIconActive: {
    color: theme.onAccent
  },

  notesInput: {
    backgroundColor: theme.surface2,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
    minHeight: 38,
    fontSize: 12
  },
  auxToolsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10
  },
  addSetBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface2,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 10,
    marginTop: 12
  },
  addSetText: {
    ...T.label,
    color: theme.text,
    fontSize: 11.5
  },

  // Bottom dock
  bottomDock: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16
  },
  addExerciseDockBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.surface2,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14
  },
  addExerciseDockIcon: {
    fontSize: 16,
    color: theme.accent,
    fontWeight: "800"
  },
  addExerciseDockText: {
    ...T.label,
    color: theme.text,
    fontSize: 12
  },
  logNoteDockBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface2,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14
  },
  logNoteDockText: {
    ...T.label,
    color: theme.dim,
    fontSize: 11.5
  },
  discardBtn: {
    alignItems: "center",
    paddingVertical: 20
  },
  discardText: {
    ...T.label,
    color: theme.red,
    fontSize: 11
  },
  kindChip: {
    width: 32,
    height: 24,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4
  },
  kindChipText: {
    fontSize: 9.5,
    fontWeight: "800" as const
  },
  clock: { ...T.title, fontSize: 24, color: theme.text, ...NUM },
  meta: { ...T.meta, color: theme.dim, ...NUM },
  exName: { ...T.heading, color: theme.text },
  prev: { ...T.meta, color: theme.accent, marginTop: 2, ...NUM },

  modal: { flex: 1, backgroundColor: theme.bg, padding: S.lg, paddingTop: 48 },
  modalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: S.lg
  },
  modalLink: { ...T.body, color: theme.accent, fontWeight: "700" },
  modalTitle: { ...T.heading, fontSize: 17, color: theme.text },
  search: { marginBottom: S.md },
  filterRow: { flexDirection: "row", gap: S.sm, marginBottom: S.md },
  filterBtn: { flex: 1 },
  chipRow: { flexGrow: 0, flexShrink: 0, marginBottom: S.sm },
  sectionHead: { marginBottom: S.xs },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    paddingVertical: S.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border
  },
  badge: {
    borderColor: theme.accent,
    borderWidth: 1,
    borderRadius: R.pill,
    paddingVertical: 2,
    paddingHorizontal: S.sm
  },
  badgeText: { ...T.micro, color: theme.accent, letterSpacing: 0.4 },

  plateWrap: { flex: 1, backgroundColor: A.scrim, justifyContent: "center", padding: S.xl },
  plateBox: { padding: S.xl },
  plateList: { ...T.heading, fontSize: 20, color: theme.text, marginTop: S.md, ...NUM },
  plateWarn: { ...T.meta, color: theme.red, marginTop: S.xs },
  plateClose: { marginTop: S.lg },

  restOverlay: {
    position: "absolute",
    left: S.xl,
    right: S.xl,
    bottom: 40,
    backgroundColor: theme.surface2,
    borderColor: theme.accent,
    borderWidth: 1,
    borderRadius: R.xl,
    padding: S.xl,
    alignItems: "center"
  },
  restClock: { ...T.title, fontSize: 44, color: theme.text, ...NUM },
  restRow: { flexDirection: "row", gap: S.md, marginTop: S.md, alignSelf: "stretch" },
  restBtn: { flex: 1 },

  summaryWrap: { paddingBottom: S.lg },
  summaryHead: { marginBottom: S.lg },
  summaryTitle: { ...T.title, fontSize: 24, color: theme.text },
  summaryNotice: { flexDirection: "column", alignItems: "flex-start" },
  prRow: { paddingVertical: S.sm, borderTopWidth: 1, borderTopColor: theme.border },
  pr: { ...T.body, color: theme.text, fontWeight: "700" },
  prValue: { ...T.meta, color: theme.dim, ...NUM }
});

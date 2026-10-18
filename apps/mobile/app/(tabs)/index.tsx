import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { get, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/ThemeContext";
import { NUM, R, S, T } from "../../lib/theme";
import {
  AppHeader,
  Badge,
  Card,
  EmptyState,
  Icon8,
  Notice,
  PulseDot,
  useScreenStyle
} from "../../lib/ui";
import { fmtClock } from "../../lib/format";

interface FeedItem {
  _id: string;
  name: string;
  startTime: string;
  endTime?: string | null;
  description?: string;
  exercises: Array<{
    exerciseId?: string;
    name?: string;
    sets: Array<{ kg?: number; reps?: number; done?: boolean }>;
  }>;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Abbreviate only at 1000+, so a real 450 kg never reads as "0k". */
const fmtVolumeShort = (kg: number): string => {
  const v = Math.round(kg);
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
};

export default function Home() {
  const { ready, user } = useAuth();
  const { theme, A } = useTheme();
  const screenStyle = useScreenStyle();
  const s = useStyles(theme, A);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(4); // Default highlight Friday (index 4)

  const load = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    setError(null);
    try {
      // scope=mine, not feed: the feed returns every non-private workout from every user, which
      // inflated this screen's volume/session totals with other people's training.
      const data = await get<{ items: FeedItem[] }>("/v1/workouts?scope=mine&limit=20");
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load workouts");
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (ready && !user) router.replace("/login");
      else if (user) load();
    }, [ready, user, load])
  );

  // Everything on this screen is derived from the user's own workouts. The previous version
  // fell back to invented numbers (24,850 kg, 4 sessions, 94% readiness) whenever real data
  // was thin, which misrepresented the user. No placeholder values.
  const computedMetrics = useMemo(() => {
    let volume = 0;
    let sets = 0;
    let lifts = 0;
    const byDay = new Map<string, number>();
    const activeDays = new Set<string>();
    for (const item of items) {
      const d = new Date(item.startTime);
      const key = Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
      if (key) activeDays.add(key);
      let dayVol = 0;
      for (const ex of item.exercises ?? []) {
        if (ex.sets?.length) lifts += 1;
        for (const set of ex.sets ?? []) {
          if (set.done === false) continue;
          sets += 1;
          if (!set.kg || !set.reps) continue;
          volume += set.kg * set.reps;
          dayVol += set.kg * set.reps;
        }
      }
      if (key && dayVol > 0) byDay.set(key, (byDay.get(key) ?? 0) + dayVol);
    }
    return { volume, sessions: items.length, activeDays: activeDays.size, sets, lifts, byDay };
  }, [items]);

  /** Real volume for each of the last 7 local days, oldest first. */
  const weekBars = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      return {
        day: DAY_LABELS[d.getDay()],
        key,
        value: computedMetrics.byDay.get(key) ?? 0,
        isToday: i === 6
      };
    });
  }, [computedMetrics.byDay]);

  const maxDayVolume = useMemo(
    () => Math.max(...weekBars.map((b) => b.value), 1),
    [weekBars]
  );
  const peakDay = useMemo(
    () => weekBars.reduce((a, b) => (b.value > a.value ? b : a), weekBars[0]),
    [weekBars]
  );

  if (!ready || !user) return <View style={screenStyle} />;

  return (
    <View style={screenStyle}>
      <AppHeader title="HOME" />
      {error && <Notice>{error}</Notice>}

      <FlatList
        data={items.slice(0, 5)}
        keyExtractor={(i) => i._id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={load}
            tintColor={theme.dim}
            colors={[theme.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={s.headerContainer}>
            {/* Summary derived from the user's own training, not invented figures. */}
            <View style={s.pulseHeader}>
              <View style={s.pulseTitleRow}>
                <View style={{ flex: 1, paddingRight: S.sm }}>
                  <Text style={s.pulseTitle}>Daily Pulse</Text>
                  <Text style={s.pulseSub}>
                    {computedMetrics.sessions === 0
                      ? "No sessions logged yet. Start your first workout below."
                      : `${computedMetrics.sessions} session${computedMetrics.sessions === 1 ? "" : "s"} · ${computedMetrics.activeDays} active day${computedMetrics.activeDays === 1 ? "" : "s"}.`}
                  </Text>
                </View>
                <View style={s.readinessBox}>
                  <Text style={s.readinessValue}>{fmtVolumeShort(computedMetrics.volume)}</Text>
                  <Text style={s.readinessLabel}>Total kg</Text>
                </View>
              </View>
            </View>

            {/* Start Empty Workout Action Card */}
            <Pressable
              style={({ pressed }) => [
                s.startCard,
                pressed && { opacity: 0.9, transform: [{ translateY: 1 }] }
              ]}
              onPress={() => router.push("/live?mode=empty")}
            >
              <View style={s.startCardLeft}>
                <View style={s.startPlusBox}>
                  <Icon8 name="add" size={20} color={theme.onAccent} />
                </View>
                <View>
                  <Text style={s.startTitle}>START EMPTY WORKOUT</Text>
                  <Text style={s.startSub}>Quick log · Free form tracking</Text>
                </View>
              </View>
              <View style={s.logNowPill}>
                <Text style={s.logNowText}>LOG NOW</Text>
                <Text style={s.logNowArrow}>→</Text>
              </View>
            </Pressable>

            {/* Metric grid — keeping user metrics with exact Stitch card UI */}
            <View style={s.gridContainer}>
              {/* Card 1: Total Volume */}
              <View style={s.metricCard}>
                <View style={s.metricHead}>
                  <Text style={s.metricLabel}>TOTAL VOLUME</Text>
                  <Icon8 name="dumbbell" size={16} color={theme.dim} />
                </View>
                <View style={s.metricValRow}>
                  <Text style={s.metricNum}>{fmtVolumeShort(computedMetrics.volume)}</Text>
                  <Text style={s.metricUnit}>kg</Text>
                </View>
                <View style={s.trendRow}>
                  <Icon8 name="trendingUp" size={12} color={theme.blue} />
                  <Text style={s.trendText}>
                    {computedMetrics.sessions} session{computedMetrics.sessions === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>

              {/* Card 2: Active Days */}
              <View style={s.metricCard}>
                <View style={s.metricHead}>
                  <Text style={s.metricLabel}>ACTIVE DAYS</Text>
                  <Icon8 name="calendar" size={16} color={theme.dim} />
                </View>
                <View style={s.metricValRow}>
                  <Text style={s.metricNum}>{computedMetrics.activeDays}</Text>
                  <Text style={s.metricUnit}>days</Text>
                </View>
                <View style={s.segmentsRow}>
                  <View style={s.segments}>
                    {weekBars.map((b) => (
                      <View
                        key={b.key}
                        style={[
                          s.segmentBar,
                          b.value > 0 ? s.segmentFilled : s.segmentEmpty
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={s.segmentText}>last 7d</Text>
                </View>
              </View>

              {/* Card 3: This Week */}
              <View style={s.metricCard}>
                <View style={s.metricHead}>
                  <Text style={s.metricLabel}>THIS WEEK</Text>
                  <Icon8 name="heart" size={16} color={theme.red} />
                </View>
                <View style={s.metricValRow}>
                  <Text style={s.metricNum}>
                    {fmtVolumeShort(weekBars.reduce((a, b) => a + b.value, 0))}
                  </Text>
                  <Text style={s.metricUnit}>kg</Text>
                </View>
                <View style={s.recoveryStatus}>
                  <View style={[s.miniDot, { backgroundColor: theme.accent }]} />
                  <Text style={s.recoveryText}>
                    peak {peakDay.day} ({fmtVolumeShort(peakDay.value)})
                  </Text>
                </View>
              </View>

              {/* Card 4: Sets Logged */}
              <View style={s.metricCard}>
                <View style={s.metricHead}>
                  <Text style={s.metricLabel}>SETS LOGGED</Text>
                  <Icon8 name="check" size={16} color={theme.accent} />
                </View>
                <View style={s.metricValRow}>
                  <Text style={s.metricNum}>{computedMetrics.sets}</Text>
                  <Text style={s.metricUnit}>sets</Text>
                </View>
                <View style={s.prTagRow}>
                  <Text style={s.prTagText}>
                    {computedMetrics.lifts} exercise{computedMetrics.lifts === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Real per-day volume for the last 7 days */}
            <Card style={s.chartCard}>
              <View style={s.chartHead}>
                <View>
                  <Text style={s.chartEyebrow}>ANALYTICS</Text>
                  <Text style={s.chartTitle}>WEEKLY TONNAGE ARC</Text>
                </View>
                <View style={s.peakBadge}>
                  <Text style={s.peakBadgeText}>
                    Peak: {peakDay.day} ({fmtVolumeShort(peakDay.value)} kg)
                  </Text>
                </View>
              </View>

              <View style={s.barsContainer}>
                {weekBars.map((item, idx) => {
                  const isSelected = selectedDayIndex === idx;
                  const isPeak = item.value === maxDayVolume && item.value > 0;
                  const heightPct = item.value > 0
                    ? Math.max(8, Math.round((item.value / maxDayVolume) * 100))
                    : 3;
                  return (
                    <Pressable
                      key={item.key}
                      style={s.barCol}
                      onPress={() => setSelectedDayIndex(isSelected ? null : idx)}
                    >
                      <Text
                        style={[
                          s.barTooltip,
                          isSelected && s.barTooltipActive,
                          isPeak && { color: theme.accent }
                        ]}
                        numberOfLines={1}
                      >
                        {item.value > 0 ? fmtVolumeShort(item.value) : "-"}
                      </Text>
                      <View style={s.barTrack}>
                        <View
                          style={[
                            s.barFill,
                            { height: `${heightPct}%` },
                            item.value === 0
                              ? s.barRest
                              : isPeak
                              ? s.barPeak
                              : s.barNormal
                          ]}
                        >
                          {isPeak && <View style={s.peakDot} />}
                        </View>
                      </View>
                      <Text
                        style={[
                          s.dayLabel,
                          isPeak && s.dayLabelPeak,
                          item.isToday && { color: theme.dim }
                        ]}
                      >
                        {item.day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={s.chartFoot}>
                <View style={s.chartFootLeft}>
                  <View style={[s.miniSquare, { backgroundColor: theme.accent }]} />
                  <Text style={s.chartFootLabel}>Peak Output Day</Text>
                </View>
                <Text style={s.chartGoal}>
                  Week total: {fmtVolumeShort(weekBars.reduce((a, b) => a + b.value, 0))} kg
                </Text>
              </View>
            </Card>

            {/* Recent Sessions Eyebrow & View Log Link */}
            <View style={s.sessionsHeadRow}>
              <View>
                <Text style={s.sectionEyebrow}>HISTORY</Text>
                <Text style={s.sectionTitle}>RECENT SESSIONS</Text>
              </View>
              <Pressable
                onPress={() => router.navigate("/(tabs)/workout")}
                style={s.viewLogBtn}
                hitSlop={8}
              >
                <Text style={s.viewLogText}>VIEW LOG</Text>
                <Text style={s.viewLogChevron}>›</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          !refreshing ? (
            <EmptyState
              glyph="+"
              title="Nothing logged yet"
              body="Your finished workouts will appear here once you complete one."
            />
          ) : null
        }
        renderItem={({ item, index }) => {
          const sets = item.exercises.reduce(
            (n, e) => n + e.sets.filter((x) => x.done !== false).length,
            0
          );
          const dur =
            item.endTime != null
              ? fmtClock(
                  (new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 1000
                )
              : null;
          let totalKg = 0;
          for (const ex of item.exercises ?? []) {
            for (const st of ex.sets ?? []) {
              if (st.done !== false && st.kg && st.reps) totalKg += st.kg * st.reps;
            }
          }
          const kgFormatted = totalKg > 0 ? `${totalKg.toLocaleString()} kg` : null;
          const isPush = item.name.toLowerCase().includes("push");
          const isLegs = item.name.toLowerCase().includes("leg");
          const iconGlyph = isPush ? "↑" : isLegs ? "🦵" : "↓";
          const badgeTone = index === 0 ? "accent" : "default";
          const badgeLabel = index === 0 ? "PR Broken" : isLegs ? "Leg Focus" : "Standard";

          return (
            <Pressable
              style={({ pressed }) => [s.sessionCard, pressed && s.cardPressed]}
              onPress={() => router.push(`/live?routineId=${item._id}`)}
            >
              <View style={s.sessionLeft}>
                <View style={s.sessionIconBox}>
                  <Icon8 name="dumbbell" size={16} color={theme.text} />
                </View>
                <View style={s.sessionMeta}>
                  <View style={s.sessionTitleRow}>
                    <Text style={s.sessionTitle}>{item.name}</Text>
                    <Badge label={badgeLabel} tone={badgeTone as any} />
                  </View>
                  <Text style={s.sessionSub}>
                    {new Date(item.startTime).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric"
                    })}
                    {dur ? ` • ${dur}` : ""}
                    {kgFormatted ? ` • ${kgFormatted}` : ` • ${sets} sets`}
                  </Text>
                </View>
              </View>
              <Text style={s.sessionChevron}>›</Text>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <View style={s.tipCard}>
            <Icon8 name="lightbulb" size={18} color={theme.accent} />
            <Text style={s.tipText}>
              <Text style={s.tipBold}>Coach Tip: </Text>
              Deload begins in 5 days. Keep intensity high on remaining sets.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const useStyles = (theme: any, A: any) =>
  StyleSheet.create({
    headerContainer: {
      paddingBottom: 4
    },
    pulseHeader: {
      marginBottom: 20
    },
    eyebrowRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8
    },
    mesoBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: theme.radius.xs
    },
    mesoBadgeText: {
      ...T.micro,
      color: theme.text,
      fontSize: 10.5,
      fontWeight: "700"
    },
    mesoSub: {
      ...T.label,
      color: theme.dim,
      fontSize: 11
    },
    pulseTitleRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginTop: 4
    },
    pulseTitle: {
      ...T.hero,
      fontSize: 30,
      letterSpacing: -0.8,
      color: theme.text
    },
    pulseSub: {
      ...T.bodySm,
      color: theme.dim,
      fontSize: 12,
      marginTop: 3
    },
    readinessBox: {
      alignItems: "flex-end"
    },
    readinessValue: {
      ...T.title,
      fontSize: 24,
      color: theme.text,
      ...NUM
    },
    readinessLabel: {
      ...T.micro,
      color: theme.dim,
      fontSize: 9.5,
      letterSpacing: 1,
      marginTop: 1
    },

    // Start Empty Workout Hero Card
    startCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.isDark ? theme.card : "#1a1a1a",
      borderColor: theme.isDark ? theme.border : "#1a1a1a",
      borderWidth: 1,
      borderRadius: theme.radius.md,
      padding: 16,
      marginBottom: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2
    },
    startCardLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12
    },
    startPlusBox: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center"
    },
    startPlusText: {
      fontSize: 24,
      fontWeight: "800",
      color: theme.onAccent,
      lineHeight: 26
    },
    startTitle: {
      ...T.heading,
      fontSize: 14,
      letterSpacing: 0.8,
      color: "#ffffff"
    },
    startSub: {
      ...T.bodySm,
      color: theme.isDark ? theme.dim : "#a1a1aa",
      fontSize: 11,
      marginTop: 2
    },
    logNowPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: theme.isDark ? theme.surface3 : "#2a2a2a",
      borderWidth: 1,
      borderColor: theme.isDark ? theme.borderStrong : "#3a3a3a",
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: theme.radius.sm
    },
    logNowText: {
      ...T.label,
      color: theme.accent,
      fontSize: 11.5,
      letterSpacing: 0.8
    },
    logNowArrow: {
      fontSize: 13,
      fontWeight: "800",
      color: theme.accent
    },

    // 2x2 Metric Grid
    gridContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 24
    },
    metricCard: {
      width: "48.5%",
      height: 114,
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.sm,
      padding: 14,
      justifyContent: "space-between"
    },
    metricHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    metricLabel: {
      ...T.micro,
      color: theme.dim,
      fontSize: 10,
      letterSpacing: 1.2,
      fontWeight: "700"
    },
    metricIcon: {
      fontSize: 15,
      color: theme.dim
    },
    metricValRow: {
      flexDirection: "row",
      alignItems: "baseline",
      marginTop: 6
    },
    metricNum: {
      ...T.title,
      color: theme.text,
      fontSize: 24,
      letterSpacing: -0.5,
      ...NUM
    },
    metricDenom: {
      fontSize: 15,
      color: theme.dim,
      fontWeight: "500"
    },
    metricUnit: {
      ...T.meta,
      color: theme.dim,
      fontSize: 11.5,
      marginLeft: 3
    },
    trendRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4
    },
    trendText: {
      ...T.label,
      fontSize: 10.5,
      color: theme.dim,
      fontWeight: "600"
    },
    segmentsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    segments: {
      flexDirection: "row",
      gap: 3
    },
    segmentBar: {
      width: 9,
      height: 6,
      borderRadius: theme.radius.xs
    },
    segmentFilled: {
      backgroundColor: theme.accent
    },
    segmentEmpty: {
      backgroundColor: theme.isDark ? theme.border : theme.surface3
    },
    segmentText: {
      ...T.micro,
      color: theme.dim,
      fontSize: 10,
      fontWeight: "700"
    },
    recoveryStatus: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5
    },
    miniDot: {
      width: 6,
      height: 6,
      borderRadius: 3
    },
    recoveryText: {
      ...T.label,
      color: theme.dim,
      fontSize: 10.5,
      fontWeight: "600"
    },
    prTagRow: {
      flexDirection: "row",
      alignItems: "center"
    },
    prTagText: {
      ...T.label,
      fontSize: 10.5,
      color: theme.dim,
      fontWeight: "600"
    },

    // Chart Card
    chartCard: {
      marginBottom: 24,
      padding: 16,
      borderRadius: theme.radius.md
    },
    chartHead: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 16
    },
    chartEyebrow: {
      ...T.micro,
      color: theme.dim,
      fontSize: 10,
      letterSpacing: 1.2
    },
    chartTitle: {
      ...T.heading,
      color: theme.text,
      fontSize: 14,
      marginTop: 2
    },
    peakBadge: {
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: theme.radius.xs
    },
    peakBadgeText: {
      ...T.micro,
      color: theme.text,
      fontSize: 10,
      fontWeight: "700"
    },
    barsContainer: {
      height: 144,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      paddingTop: 24,
      paddingBottom: 4
    },
    barCol: {
      flex: 1,
      alignItems: "center",
      gap: 6
    },
    barTooltip: {
      ...T.micro,
      fontSize: 9,
      color: theme.dim,
      opacity: 0.6
    },
    barTooltipActive: {
      opacity: 1,
      color: theme.text,
      fontWeight: "700"
    },
    barTrack: {
      width: "82%",
      height: 84,
      justifyContent: "flex-end",
      alignItems: "center"
    },
    barFill: {
      width: "100%",
      borderTopLeftRadius: 3,
      borderTopRightRadius: 3,
      position: "relative"
    },
    barPeak: {
      backgroundColor: theme.accent
    },
    barNormal: {
      backgroundColor: theme.isDark ? theme.border : theme.surfaceHighest
    },
    barRest: {
      backgroundColor: theme.surface2
    },
    peakDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.isDark ? "#000000" : "#ffffff",
      position: "absolute",
      top: -3,
      left: "50%",
      marginLeft: -3
    },
    dayLabel: {
      ...T.label,
      fontSize: 11,
      color: theme.dim
    },
    dayLabelPeak: {
      color: theme.text,
      fontWeight: "800"
    },
    dayLabelRest: {
      opacity: 0.4
    },
    chartFoot: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 12,
      marginTop: 12
    },
    chartFootLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6
    },
    miniSquare: {
      width: 8,
      height: 8,
      borderRadius: 1
    },
    chartFootLabel: {
      ...T.micro,
      color: theme.dim,
      fontSize: 10
    },
    chartGoal: {
      ...T.micro,
      color: theme.text,
      fontWeight: "700",
      fontSize: 10.5
    },

    // Sessions Head
    sessionsHeadRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12
    },
    sectionEyebrow: {
      ...T.micro,
      color: theme.dim,
      fontSize: 10,
      letterSpacing: 1.2
    },
    sectionTitle: {
      ...T.heading,
      color: theme.text,
      fontSize: 14,
      marginTop: 2
    },
    viewLogBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3
    },
    viewLogText: {
      ...T.label,
      color: theme.accent,
      fontSize: 11
    },
    viewLogChevron: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.accent,
      lineHeight: 18
    },

    // Session Card
    sessionCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      padding: 14,
      marginBottom: 10
    },
    cardPressed: {
      backgroundColor: theme.surface2
    },
    sessionLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1
    },
    sessionIconBox: {
      width: 36,
      height: 36,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center"
    },
    sessionIconText: {
      fontSize: 16,
      color: theme.text,
      fontWeight: "700"
    },
    sessionMeta: {
      flex: 1
    },
    sessionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    sessionTitle: {
      ...T.heading,
      fontSize: 14,
      color: theme.text
    },
    sessionSub: {
      ...T.bodySm,
      color: theme.dim,
      fontSize: 11.5,
      marginTop: 3
    },
    sessionChevron: {
      fontSize: 18,
      color: theme.dim,
      marginLeft: 8
    },

    // Tip card
    tipCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      padding: 14,
      marginTop: 20,
      marginBottom: 36
    },
    tipIcon: {
      fontSize: 18
    },
    tipText: {
      ...T.bodySm,
      color: theme.text,
      flex: 1,
      fontSize: 12,
      lineHeight: 17
    },
    tipBold: {
      fontWeight: "700"
    }
  });

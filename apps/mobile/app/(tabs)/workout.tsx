import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { get, post, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useOffline } from "../../lib/offline";
import { useTheme } from "../../lib/ThemeContext";
import { NUM, R, S, T } from "../../lib/theme";
import {
  AppHeader,
  Badge,
  Btn,
  Card,
  EmptyState,
  Icon8,
  Notice,
  Pill,
  useScreenStyle
} from "../../lib/ui";

interface Routine {
  _id: string;
  name: string;
  folderId?: string | null;
  exercises: Array<{ exerciseId: string; sets: unknown[] }>;
}

export default function WorkoutTab() {
  const { ready, user } = useAuth();
  const { online, pending, syncing, syncNow, refresh: refreshOffline } = useOffline();
  const { theme, A } = useTheme();
  const screenStyle = useScreenStyle();
  const s = useStyles(theme, A);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const data = await get<{ items: Routine[] }>("/v1/routines");
      setRoutines(data.items ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load routines");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (ready && !user) router.replace("/login");
      else if (user) {
        load();
        refreshOffline();
      }
    }, [ready, user, load, refreshOffline])
  );

  async function seedStarter() {
    setError(null);
    try {
      await post("/v1/programs/starting-strength-5x5/clone", {});
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load starter");
    }
  }

  if (!ready || !user) return <View style={screenStyle} />;

  return (
    <View style={screenStyle}>
      <AppHeader title="TRAINING" />
      {error && <Notice>{error}</Notice>}
      {!online && <Notice tone="info">Offline — new workouts will be queued on this device.</Notice>}
      {pending > 0 && (
        <Notice
          tone="info"
          action={
            <Btn
              label={syncing ? "Syncing…" : "Sync now"}
              variant="secondary"
              size="sm"
              disabled={syncing || !online}
              onPress={syncNow}
            />
          }
        >
          {pending} workout{pending === 1 ? "" : "s"} waiting to sync
        </Notice>
      )}

      <FlatList
        data={routines}
        keyExtractor={(r) => r._id}
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
            {/* Quick Start Empty Workout CTA */}
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

            {/* Routines Section Header */}
            <View style={s.routinesHeadRow}>
              <View>
                <Text style={s.sectionEyebrow}>TEMPLATES</Text>
                <Text style={s.sectionTitle}>MY ROUTINES ({routines.length})</Text>
              </View>
              <Pill onPress={() => router.push("/routine")} style={s.newRoutinePill}>
                + New Routine
              </Pill>
            </View>
          </View>
        }
        ListEmptyComponent={
          !refreshing ? (
            <EmptyState
              glyph="+"
              title="No routines yet"
              body="Build your own, or start from a proven program."
              action={
                <Btn
                  label="Load starter program"
                  variant="primary"
                  onPress={seedStarter}
                  style={s.emptyAction}
                />
              }
            />
          ) : null
        }
        renderItem={({ item }) => {
          const setsCount = item.exercises.reduce((n, e) => n + e.sets.length, 0);
          return (
            <Card style={s.routineCard}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <View style={s.titleRow}>
                    <Text style={s.routineTitle}>{item.name}</Text>
                    {item.folderId ? (
                      <Badge label="Folder" tone="default" />
                    ) : (
                      <Badge label="Active" tone="accent" />
                    )}
                  </View>
                  <Text style={s.routineMeta}>
                    {item.exercises.length} lifts • {setsCount} sets
                  </Text>
                </View>
              </View>

              <View style={s.btnRow}>
                <Pressable
                  style={({ pressed }) => [s.startBtn, pressed && s.btnPressed]}
                  onPress={() => router.push(`/live?mode=routine&routineId=${item._id}`)}
                >
                  <Text style={s.startBtnText}>START ROUTINE</Text>
                  <Text style={s.startBtnArrow}>→</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.editBtn, pressed && s.btnPressed]}
                  onPress={() => router.push(`/routine?routineId=${item._id}`)}
                >
                  <Text style={s.editBtnText}>Edit</Text>
                </Pressable>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

const useStyles = (theme: any, A: any) =>
  StyleSheet.create({
    headerContainer: {
      paddingBottom: 4
    },
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

    routinesHeadRow: {
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
    sectionTitle: {
      ...T.heading,
      color: theme.text,
      fontSize: 14,
      marginTop: 2
    },
    newRoutinePill: {
      minHeight: 30
    },

    routineCard: {
      padding: 16,
      borderRadius: theme.radius.md,
      marginBottom: 14
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between"
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    routineTitle: {
      ...T.heading,
      fontSize: 15,
      color: theme.text
    },
    routineMeta: {
      ...T.meta,
      color: theme.dim,
      marginTop: 4,
      ...NUM
    },

    btnRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 16
    },
    startBtn: {
      flex: 3,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: theme.accent,
      borderRadius: theme.radius.sm,
      paddingVertical: 11,
      paddingHorizontal: 16
    },
    startBtnText: {
      ...T.label,
      color: theme.onAccent,
      fontSize: 11.5
    },
    startBtnArrow: {
      fontSize: 14,
      fontWeight: "800",
      color: theme.onAccent
    },
    editBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.sm,
      paddingVertical: 11
    },
    editBtnText: {
      ...T.meta,
      color: theme.text,
      fontWeight: "600"
    },
    btnPressed: {
      opacity: 0.8
    },
    emptyAction: {
      marginTop: 8
    }
  });

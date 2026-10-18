import type { ColorValue } from "react-native";
import { View } from "react-native";
import { router, Tabs, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../lib/ThemeContext";
import { ActiveWorkoutBanner } from "../../lib/workoutSession";
import { Icon8 } from "../../lib/ui";

function HomeIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
  return <Icon8 name="home" filled={focused} size={20} color={color as string} />;
}

function WorkoutIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
  return <Icon8 name="dumbbell" filled={focused} size={20} color={color as string} />;
}

function RoutinesIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
  return <Icon8 name="folder" filled={focused} size={20} color={color as string} />;
}

function StatsIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
  return <Icon8 name="trophy" filled={focused} size={20} color={color as string} />;
}

function ProfileIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
  return <Icon8 name="user" filled={focused} size={20} color={color as string} />;
}

export default function TabLayout() {
  const { theme } = useTheme();
  const pathname = usePathname();
  // Profile is a full-screen settings view; the sticky bar is suppressed there only.
  const hideBanner = pathname.endsWith("/profile");

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ActiveWorkoutBanner hidden={hideBanner} onOpen={() => router.push("/live")} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.bg,
            borderTopColor: theme.border,
            borderTopWidth: 1,
            height: 62,
            paddingBottom: 8,
            paddingTop: 4
          },
          tabBarActiveTintColor: theme.accent,
          tabBarInactiveTintColor: theme.dim,
          tabBarLabelStyle: {
            fontFamily: "SpaceGrotesk_700Bold",
            fontSize: 10,
            letterSpacing: 0.8,
            textTransform: "uppercase"
          }
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: HomeIcon }} />
        <Tabs.Screen name="workout" options={{ title: "Training", tabBarIcon: WorkoutIcon }} />
        <Tabs.Screen name="library" options={{ title: "Routines", tabBarIcon: RoutinesIcon }} />
        <Tabs.Screen name="stats" options={{ title: "Stats", tabBarIcon: StatsIcon }} />
        <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ProfileIcon }} />
      </Tabs>
    </View>
  );
}
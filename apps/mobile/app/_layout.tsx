import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  SpaceGrotesk_700Bold,
  SpaceGrotesk_600SemiBold
} from "@expo-google-fonts/space-grotesk";
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium
} from "@expo-google-fonts/hanken-grotesk";
import {
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold
} from "@expo-google-fonts/jetbrains-mono";
import { useEffect } from "react";
import { AuthProvider } from "../lib/auth";
import { OfflineProvider } from "../lib/offline";
import { WorkoutSessionProvider } from "../lib/workoutSession";
import { ThemeProvider, useTheme } from "../lib/ThemeContext";

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { theme, isDark } = useTheme();
  const [loaded, error] = useFonts({
    SpaceGrotesk_700Bold,
    SpaceGrotesk_600SemiBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerShadowVisible: false,
          headerTintColor: theme.text,
          headerTitleStyle: { fontSize: 16, fontWeight: "700" },
          contentStyle: { backgroundColor: theme.bg }
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "Sign in" }} />
        <Stack.Screen name="live" options={{ headerShown: false }} />
        <Stack.Screen name="routine" options={{ title: "Routine" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      {/* Above the router so an in-progress workout survives navigating away from it. */}
      <WorkoutSessionProvider>
        <OfflineProvider>
          <ThemeProvider>
            <RootStack />
          </ThemeProvider>
        </OfflineProvider>
      </WorkoutSessionProvider>
    </AuthProvider>
  );
}

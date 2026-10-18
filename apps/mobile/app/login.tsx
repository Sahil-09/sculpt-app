import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { useTheme } from "../lib/ThemeContext";
import { S, T } from "../lib/theme";
import { Btn, Card, Field, Notice, SectionHeader } from "../lib/ui";

export default function Login() {
  const { login, register } = useAuth();
  const { theme } = useTheme();
  const s = useStyles(theme);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, name.trim() || "Athlete");
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.wrap}>
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.brand}>
          <Text style={s.title}>Sculpt</Text>
          <Text style={s.sub}>Log lifts, track progress.</Text>
        </View>

        <Card style={s.card}>
          <SectionHeader>{mode === "login" ? "Sign in" : "Create account"}</SectionHeader>
          {mode === "register" && (
            <Field
              style={s.field}
              placeholder="Name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          )}
          <Field
            style={s.field}
            placeholder="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Field
            style={s.field}
            placeholder="Password (8+ chars)"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </Card>

        {error && <Notice>{error}</Notice>}

        <Btn label={busy ? "…" : mode === "login" ? "Sign in" : "Create account"} disabled={busy} onPress={submit} />
        <Btn
          label={mode === "login" ? "New here? Create account" : "Have an account? Sign in"}
          variant="ghost"
          style={s.switch}
          onPress={() => setMode(mode === "login" ? "register" : "login")}
        />
      </ScrollView>
    </View>
  );
}

const useStyles = (theme: any) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: S.xl, paddingVertical: S.xl },
  brand: { marginBottom: S.xl },
  title: { ...T.title, color: theme.text },
  sub: { ...T.meta, color: theme.dim, marginTop: S.xs },
  card: { paddingVertical: S.lg },
  field: { marginBottom: S.sm },
  switch: { marginTop: S.xs }
});

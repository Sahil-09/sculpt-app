import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP_DIR = join(import.meta.dirname, "..", "app");
const HOOK = /\buse(State|Effect|Memo|Callback|Ref|Reducer|Context|LayoutEffect|ImperativeHandle|InsertionEffect|SyncExternalStore|Transition|Id)\s*\(/;

/** Every screen, including expo-router route groups like `(tabs)/`, which a plain
 * readdirSync of app/ misses entirely. */
function screens(dir: string): Array<{ path: string; label: string }> {
  const out: Array<{ path: string; label: string }> = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...screens(full));
    else if (entry.endsWith(".tsx")) out.push({ path: full, label: relative(APP_DIR, full) });
  }
  return out;
}

/**
 * Finds `return` statements that belong to a component body (not to a nested callback),
 * with their line index. Brace stack marks each open block as a function boundary, so
 * `return` inside a useCallback/useEffect arrow is correctly ignored.
 */
export function hooksAfterReturns(src: string): string[] {
  const lines = src.split(/\r?\n/);
  // One entry per open brace. isFn: the block is a function body. isRoot: it is the body of
  // a React component (named with a capital), which is the only place a hook may live.
  const stack: Array<{ isFn: boolean; isRoot: boolean }> = [];
  const offenders: string[] = [];
  let lastReturn = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\/\/.*$/, "");
    // A return/hook is the component's own only when we are in a component body and every
    // block opened since is a plain block (if/for), not a nested function.
    const own = stack.length > 0 && stack[0].isRoot && !stack.slice(1).some((b) => b.isFn);

    if (own && /^\s*return\b/.test(line)) lastReturn = i;
    if (own && HOOK.test(line) && lastReturn >= 0 && i > lastReturn) {
      offenders.push(
        `${line.trim().slice(0, 40)} declared at line ${i + 1}, after return at ${lastReturn + 1}`
      );
    }

    for (let c = 0; c < line.length; c++) {
      if (line[c] === "{") {
        // `head` is everything on this line before the brace. When it is blank the brace
        // continues a signature from an earlier line, so fall back to that line's tail.
        const head = line.slice(0, c);
        let sig = head;
        if (!sig.trim()) {
          for (let p = i - 1; p >= 0; p--) {
            if (lines[p].trim()) {
              sig = lines[p];
              break;
            }
          }
        }
        stack.push({
          isFn: /function\s*[\w]*\s*\(/.test(sig) || /=>\s*$/.test(sig),
          isRoot: /\bfunction\s+[A-Z]\w*/.test(sig) || /\b[A-Z]\w*\s*=\s*\([^)]*\)\s*=>\s*$/.test(sig)
        });
      } else if (line[c] === "}") {
        stack.pop();
      }
    }
  }
  return offenders;
}

test("detector ignores hooks in module-level helpers, not components", () => {
  const src = `
const numOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  return Number.isFinite(Number(s)) ? Number(s) : null;
};

export default function Live() {
  const [n, setN] = useState(0);
  const v = numOrNull("1");
  return v + n;
}
`;
  assert.deepEqual(hooksAfterReturns(src), [], "helper returns must not count as the component's");
});

test("detector flags a hook declared after an early return", () => {
  const buggy = `
export default function Live() {
  const [summary, setSummary] = useState(null);
  if (summary) {
    return null;
  }
  const groupColor = useMemo(() => 1, []);
  return groupColor;
}
`;
  assert.equal(hooksAfterReturns(buggy).length, 1);
});

test("detector accepts the same code with the hook hoisted", () => {
  const fixed = `
export default function Live() {
  const [summary, setSummary] = useState(null);
  const groupColor = useMemo(() => 1, []);
  if (summary) {
    return null;
  }
  return groupColor;
}
`;
  assert.deepEqual(hooksAfterReturns(fixed), []);
});

test("detector ignores returns inside nested callbacks", () => {
  const src = `
export default function Live() {
  const load = useCallback(async () => {
    try { return await get("/x"); } catch { return null; }
  }, []);
  const value = useMemo(() => 1, []);
  if (!value) return null;
  return load;
}
`;
  assert.deepEqual(hooksAfterReturns(src), []);
});

test("no screen returns before its last hook", () => {
  const files = screens(APP_DIR);
  assert.ok(files.length > 0, "no screens found");
  const problems: string[] = [];
  for (const f of files) {
    const found = hooksAfterReturns(readFileSync(f.path, "utf8"));
    for (const p of found) problems.push(`${f.label}: ${p}`);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});
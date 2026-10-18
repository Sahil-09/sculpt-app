import test from "node:test";
import assert from "node:assert/strict";
import { ExerciseTemplateSchema, EXERCISE_DATASET } from "./index.js";

const LANGS = ["en", "it", "tr", "es", "ru", "zh", "hi", "pl", "ko", "fr"] as const;

test("generated catalogue is complete, frozen and schema-valid", () => {
  assert.equal(EXERCISE_DATASET.length, 1324);
  assert.ok(Object.isFrozen(EXERCISE_DATASET));
  assert.ok(EXERCISE_DATASET.every(Object.isFrozen));

  // parse() throws on the first bad record, so reaching the asserts means all 1324 validated.
  assert.equal(ExerciseTemplateSchema.array().parse(EXERCISE_DATASET).length, 1324);

  const ids = new Set(EXERCISE_DATASET.map((e) => e.id));
  assert.equal(ids.size, EXERCISE_DATASET.length, "ids must be unique");

  // Every entry is system seed content, so none may claim to be user-owned.
  assert.ok(EXERCISE_DATASET.every((e) => e.isCustom === false));
});

test("generated catalogue carries media by logical key only", () => {
  // Regression guard: media is (c) Gym visual and is never redistributed. Only the logical
  // media_id may appear -- never a path, URL or attribution notice.
  for (const e of EXERCISE_DATASET) {
    assert.equal(typeof e.mediaId, "string", `${e.name} is missing mediaId`);
    assert.ok(e.mediaId && e.mediaId.length > 0, `${e.name} has an empty mediaId`);
    assert.equal(e.mediaUrl ?? null, null, `${e.name} has a mediaUrl`);
  }
  const blob = JSON.stringify(EXERCISE_DATASET);
  assert.ok(!blob.includes("http"), "no URL scheme anywhere in the catalogue");
  for (const bad of ["images/", "videos/", ".gif", ".jpg", ".jpeg", ".png", "attribution", "gymvisual"]) {
    assert.ok(!blob.includes(bad), `catalogue must not contain ${bad}`);
  }
});

test("upstream `weighted` is bodyweight, never a plate", () => {
  const by = (eq: string) => EXERCISE_DATASET.filter((e) => e.equipment === eq).length;
  assert.equal(by("bodyweight"), 361, "325 upstream `body weight` + 36 upstream `weighted`");
  assert.equal(by("plate"), 0, "`weighted` records are weighted dips/push-ups, not plate loading");
});

test("every record ships instructions in all ten languages", () => {
  for (const e of EXERCISE_DATASET) {
    assert.ok(e.instructions, `${e.name} has no instructions`);
    const ins = e.instructions as Record<string, { text?: string; steps?: string[] }>;
    for (const lang of LANGS) {
      const entry = ins[lang];
      assert.ok(entry, `${e.name} is missing ${lang}`);
      assert.equal(typeof entry.text, "string", `${e.name}.${lang}.text`);
      assert.ok(entry.text && entry.text.length > 0, `${e.name}.${lang}.text is empty`);
      assert.ok(Array.isArray(entry.steps) && entry.steps!.length > 0, `${e.name}.${lang}.steps`);
    }
  }
});

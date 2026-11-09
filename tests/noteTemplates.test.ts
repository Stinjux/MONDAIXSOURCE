import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TEMPLATES, cleanTags, countTags, parseTemplates, tagGroup } from "../src/lib/noteTemplates";

test("modèles de notes : relecture tolérante et nettoyage", () => {
  assert.deepEqual(parseTemplates(null), DEFAULT_TEMPLATES);
  const t = parseTemplates({ positive: ["  Bon ROI ", "bon roi", "", 3, "Rotation rapide"], negative: "x" });
  assert.deepEqual(t.positive, ["Bon ROI", "Rotation rapide"]);
  assert.deepEqual(t.negative, DEFAULT_TEMPLATES.negative);
  assert.deepEqual(cleanTags(["Faible volume", "faible volume", "Bon ROI"]), ["Faible volume", "Bon ROI"]);
  assert.equal(tagGroup("faible volume", DEFAULT_TEMPLATES), "negative");
  assert.equal(tagGroup("Motif libre", DEFAULT_TEMPLATES), null);
});

test("modèles de notes : comptage des motifs", () => {
  assert.deepEqual(countTags([{ tags: ["Faible volume", "ROI trop bas"] }, { tags: ["ROI trop bas"] }, { tags: [] }]), [
    { tag: "ROI trop bas", count: 2 },
    { tag: "Faible volume", count: 1 },
  ]);
});

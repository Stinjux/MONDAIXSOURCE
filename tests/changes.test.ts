import test from "node:test";
import assert from "node:assert/strict";
import { describeChange } from "../src/lib/changes";

test("journal : seuls les champs modifiés, en clair", () => {
  const lines = describeChange(
    { reviewStatus: "TO_REVIEW", reviewNotes: null, verifiedSalePrice: null, restriction: "UNKNOWN", reviewChecklist: {} },
    { reviewStatus: "VALIDATED", reviewNotes: "Acheter 10 unités chez Walmart", verifiedSalePrice: 39.99, restriction: "UNKNOWN", reviewChecklist: { amazonPrice: true } },
  );
  assert.deepEqual(lines, [
    "Statut : À revoir → Revu et validé",
    "Notes : « Acheter 10 unités chez Walmart »",
    "Prix Amazon vérifié : — → 39,99 $",
    "Checklist : 0/6 → 1/6",
  ]);
});

test("journal : entrée vide ou inconnue sans erreur", () => {
  assert.deepEqual(describeChange(null, null), []);
  assert.deepEqual(describeChange({}, { other: 1 }), []);
  assert.deepEqual(describeChange({ reviewNotes: "x" }, { reviewNotes: "" }), ["Notes effacées"]);
  assert.deepEqual(describeChange({ reviewChecklist: null }, { reviewChecklist: {} }), []);
});

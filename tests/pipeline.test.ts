import test from "node:test";
import assert from "node:assert/strict";
import { STAGES, STAGE_INFO, STAGE_STATUS, stageFromSlug, stageOf } from "../src/lib/pipeline";

const lead = (o: Partial<Parameters<typeof stageOf>[0]> = {}) => ({ reviewStatus: "TO_REVIEW", purchased: false, unavailable: false, fresh: "FRESH" as const, ...o });

test("pipeline : étape de chaque lead", () => {
  assert.equal(stageOf(lead()), "NEW");
  assert.equal(stageOf(lead({ reviewStatus: "IN_PROGRESS" })), "ANALYSIS");
  assert.equal(stageOf(lead({ reviewStatus: "VALIDATED" })), "READY");
  assert.equal(stageOf(lead({ reviewStatus: "VALIDATED", fresh: "SOON" })), "READY");
  assert.equal(stageOf(lead({ reviewStatus: "VALIDATED", fresh: "STALE" })), "RECONFIRM");
  assert.equal(stageOf(lead({ fresh: "STALE" })), "RECONFIRM");
  assert.equal(stageOf(lead({ reviewStatus: "FOLLOW_UP", fresh: "STALE" })), "WATCH");
  assert.equal(stageOf(lead({ reviewStatus: "VALIDATED", unavailable: true })), "WATCH");
  assert.equal(stageOf(lead({ reviewStatus: "REJECTED", fresh: "STALE" })), "REJECTED");
  assert.equal(stageOf(lead({ reviewStatus: "VALIDATED", purchased: true, fresh: "STALE" })), "BOUGHT");
});

test("pipeline : adresses des colonnes, anciennes adresses comprises", () => {
  assert.equal(stageFromSlug("a-reconfirmer"), "RECONFIRM");
  assert.equal(stageFromSlug("achat"), "READY");
  assert.equal(stageFromSlug("a-definir"), "NEW");
  assert.equal(stageFromSlug("inconnu"), null);
});

test("pipeline : déposer un lead à jour dans une colonne l'y place bien", () => {
  for (const [stage, status] of Object.entries(STAGE_STATUS)) assert.equal(stageOf(lead({ reviewStatus: status })), stage);
  for (const s of STAGES) assert.equal(stageFromSlug(STAGE_INFO[s].slug), s);
});

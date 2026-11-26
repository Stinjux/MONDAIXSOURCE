import test from "node:test";
import assert from "node:assert/strict";
import { keepaLeadState } from "../src/lib/keepaLog";

test("journal Keepa : état du lead et résultat de sa dernière analyse", () => {
  const now = new Date("2026-11-23T22:00:00Z"); // 17 h au Québec
  const morning = "2026-11-23T14:00:00.000Z"; // 9 h aujourd'hui
  const yesterday = "2026-11-22T20:00:00.000Z";
  assert.deepEqual(keepaLeadState({ keepaCheckedAt: morning, lastSnapshotAt: morning, active: true }, now), { state: "TODAY", result: "DATA" });
  assert.deepEqual(keepaLeadState({ keepaCheckedAt: morning, lastSnapshotAt: yesterday, active: true }, now), { state: "TODAY", result: "NO_DATA" });
  assert.deepEqual(keepaLeadState({ keepaCheckedAt: yesterday, lastSnapshotAt: yesterday, active: true }, now), { state: "PENDING", result: "DATA" });
  assert.deepEqual(keepaLeadState({ keepaCheckedAt: null, lastSnapshotAt: null, active: true }, now), { state: "NEVER", result: null });
  assert.deepEqual(keepaLeadState({ keepaCheckedAt: yesterday, lastSnapshotAt: null, active: false }, now), { state: "OUT", result: "NO_DATA" });
  // Rejeté : analysé une fois par semaine
  assert.equal(keepaLeadState({ keepaCheckedAt: yesterday, lastSnapshotAt: yesterday, active: true, rejected: true }, now).state, "WEEKLY");
  assert.equal(keepaLeadState({ keepaCheckedAt: "2026-11-15T20:00:00.000Z", lastSnapshotAt: null, active: true, rejected: true }, now).state, "PENDING");
  assert.equal(keepaLeadState({ keepaCheckedAt: null, lastSnapshotAt: null, active: true, rejected: true }, now).state, "NEVER");
  // 1 h du matin au Québec, le 23 : déjà « aujourd'hui »
  assert.equal(keepaLeadState({ keepaCheckedAt: "2026-11-23T06:00:00.000Z", lastSnapshotAt: null, active: true }, now).state, "TODAY");
});

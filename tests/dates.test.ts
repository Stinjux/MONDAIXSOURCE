import test from "node:test";
import assert from "node:assert/strict";
import { daysLeftInWeek, isWeekKey, parseSheetDate, recentWeekKeys, weekBounds, weekBoundsFromKey, weekKey } from "../src/lib/dates";

const NOW = new Date("2026-10-14T16:00:00Z"); // mercredi 14 oct. 2026, 12:00 HAE

test("semaine du lundi au dimanche, heure du Québec", () => {
  assert.equal(weekKey(NOW), "2026-10-12");
  const b = weekBounds(NOW);
  assert.equal(b.start.toISOString(), "2026-10-12T04:00:00.000Z"); // lundi 00:00 HAE (UTC-4)
  assert.equal(b.end.toISOString(), "2026-10-19T04:00:00.000Z");
  assert.equal(b.lastDay, "2026-10-18");
});

test("dimanche soir au Québec = encore la même semaine (bug UTC corrigé)", () => {
  // Dimanche 18 oct. 23:30 HAE = lundi 19 oct. 03:30 UTC
  assert.equal(weekKey(new Date("2026-10-19T03:30:00Z")), "2026-10-12");
  // Lundi 19 oct. 00:00 HAE pile = nouvelle semaine
  assert.equal(weekKey(new Date("2026-10-19T04:00:00Z")), "2026-10-19");
});

test("changement d'heure (novembre : HAE -> HNE)", () => {
  // Le 1er nov. 2026 (dimanche) on recule d'une heure. La semaine du 2 nov. commence à 05:00 UTC.
  const b = weekBoundsFromKey("2026-11-02");
  assert.equal(b.start.toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(weekBoundsFromKey("2026-10-26").end.toISOString(), "2026-11-02T05:00:00.000Z");
  // Changement de mars : la semaine du 9 mars 2026 commence à 04:00 UTC (HAE)
  assert.equal(weekBoundsFromKey("2026-03-09").start.toISOString(), "2026-03-09T04:00:00.000Z");
});

test("semaines récentes et jours restants", () => {
  assert.deepEqual(recentWeekKeys(NOW, 3), ["2026-09-28", "2026-10-05", "2026-10-12"]);
  assert.equal(daysLeftInWeek(NOW), 5); // mercredi -> mer, jeu, ven, sam, dim
  assert.equal(daysLeftInWeek(new Date("2026-10-18T20:00:00Z")), 1); // dimanche
  assert.ok(isWeekKey("2026-10-12"));
  assert.ok(!isWeekKey("2026-10-13"));
  assert.ok(!isWeekKey("2026-02-30"));
});

test("dates de Google Sheets", () => {
  const iso = parseSheetDate("2026-10-13", { now: NOW })!;
  assert.equal(iso.toISOString(), "2026-10-13T16:00:00.000Z"); // midi heure du Québec
  assert.equal(parseSheetDate("2026-10-13 08:15", { now: NOW })!.toISOString(), "2026-10-13T12:15:00.000Z");
  assert.equal(weekKey(parseSheetDate("10/13/2026", { now: NOW })!), "2026-10-12");
  assert.equal(parseSheetDate("13/10/2026", { now: NOW })!.toISOString(), iso.toISOString()); // jour > 12 => JJ/MM
  assert.equal(parseSheetDate("03/04/2026", { now: NOW, order: "DMY" })!.toISOString().slice(0, 10), "2026-04-03");
  assert.equal(parseSheetDate("03/04/2026", { now: NOW, order: "MDY" })!.toISOString().slice(0, 10), "2026-03-04");
  assert.equal(parseSheetDate("13 oct. 2026", { now: NOW })!.toISOString(), iso.toISOString());
  assert.equal(parseSheetDate("Oct 13, 2026", { now: NOW })!.toISOString(), iso.toISOString());
  assert.equal(parseSheetDate("13 octobre 2026", { now: NOW })!.toISOString(), iso.toISOString());
  assert.equal(parseSheetDate("46308", { now: NOW })!.toISOString(), iso.toISOString()); // numéro de série Sheets
  assert.equal(parseSheetDate("10/13/2026 5:30 PM", { now: NOW })!.toISOString(), "2026-10-13T21:30:00.000Z");
});

test("dates refusées : vides, invalides, futures", () => {
  assert.equal(parseSheetDate("", { now: NOW }), null);
  assert.equal(parseSheetDate("hier", { now: NOW }), null);
  assert.equal(parseSheetDate("2026-02-30", { now: NOW }), null);
  assert.equal(parseSheetDate("2027-01-01", { now: NOW }), null);
  // Aujourd'hui sans heure (midi) alors qu'il est 9 h : ramené à maintenant, pas refusé
  const morning = new Date("2026-10-14T13:00:00Z");
  assert.equal(parseSheetDate("2026-10-14", { now: morning })!.toISOString(), morning.toISOString());
});

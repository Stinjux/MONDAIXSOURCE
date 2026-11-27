import test from "node:test";
import assert from "node:assert/strict";
import { bucketFor, buyStatus, type BuyVoteView } from "../src/lib/buyApproval";

const v = (user: "owner" | "partner", vote: "BUY" | "NO" | "NONE", at: string, quantity: number | null = null): BuyVoteView => ({ user, vote, quantity, note: null, at: `2026-11-${at}` });
const two = { partnerEnabled: true };

test("achat à deux : approuvé seulement quand les deux disent Acheter", () => {
  assert.equal(buyStatus([], two).state, "NONE");
  const proposed = buyStatus([v("owner", "BUY", "10T10", 6)], two);
  assert.deepEqual([proposed.state, proposed.waitingFor, proposed.quantity], ["PROPOSED", "partner", 6]);
  assert.equal(bucketFor(proposed, "owner"), "WAITING");
  assert.equal(bucketFor(proposed, "partner"), "TO_APPROVE");
  const approved = buyStatus([v("owner", "BUY", "10T10", 6), v("partner", "BUY", "11T09", 4)], two);
  assert.deepEqual([approved.state, approved.waitingFor, approved.quantity], ["APPROVED", null, 4]); // quantité la plus récente
  assert.equal(bucketFor(approved, "owner"), "APPROVED");
});

test("achat à deux : désaccord → à discuter ; on change d'avis ; refus", () => {
  const discuss = buyStatus([v("owner", "BUY", "10T10"), v("partner", "NO", "11T09")], two);
  assert.equal(discuss.state, "DISCUSS");
  assert.equal(bucketFor(discuss, "partner"), "DISCUSS");
  // Le partenaire change d'avis : sa décision la plus récente fait foi
  assert.equal(buyStatus([v("owner", "BUY", "10T10"), v("partner", "NO", "11T09"), v("partner", "BUY", "12T09")], two).state, "APPROVED");
  assert.equal(buyStatus([v("owner", "NO", "10T10")], two).state, "DECLINED");
  assert.equal(buyStatus([v("owner", "NO", "10T10"), v("partner", "NO", "11T10")], two).state, "DECLINED");
  // Décision retirée (annuler) : comme si ce compte n'avait rien décidé
  assert.equal(buyStatus([v("owner", "BUY", "10T10"), v("owner", "NONE", "10T11")], two).state, "NONE");
  const back = buyStatus([v("owner", "BUY", "10T10"), v("partner", "BUY", "11T10"), v("partner", "NONE", "11T11")], two);
  assert.deepEqual([back.state, back.waitingFor], ["PROPOSED", "partner"]);
});

test("achat à deux : un nouvel achat repart de zéro ; un seul compte = décision du propriétaire", () => {
  const votes = [v("owner", "BUY", "02T10"), v("partner", "BUY", "03T10")];
  assert.equal(buyStatus(votes, { ...two, since: "2026-11-05T00" }).state, "NONE"); // achat confirmé le 5 : votes antérieurs ignorés
  const solo = { partnerEnabled: false };
  assert.equal(buyStatus([v("owner", "BUY", "10T10")], solo).state, "APPROVED");
  assert.equal(buyStatus([v("partner", "BUY", "10T10")], solo).state, "NONE"); // compte partenaire retiré : ses votes ne comptent plus
});

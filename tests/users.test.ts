import test from "node:test";
import assert from "node:assert/strict";
import { actorKey, buildProfiles, initials } from "../src/lib/users";

test("comptes : Justin (propriétaire) et Hamza (partenaire) par défaut, noms modifiables", () => {
  const d = buildProfiles();
  assert.deepEqual([d.owner.name, d.owner.initials, d.partner.name, d.partner.initials], ["Justin", "J", "Hamza", "H"]);
  const c = buildProfiles({ owner: "Justin Talbot", partner: "  " });
  assert.deepEqual([c.owner.initials, c.partner.name], ["JT", "Hamza"]); // nom vide : défaut
  assert.equal(initials("Marc-André Roy"), "MA");
});

test("comptes : historique d'avant les comptes attribué au propriétaire", () => {
  assert.equal(actorKey("admin"), "owner");
  assert.equal(actorKey("owner"), "owner");
  assert.equal(actorKey("partner"), "partner");
  assert.equal(actorKey(null), null);
  assert.equal(actorKey("cli"), null);
});

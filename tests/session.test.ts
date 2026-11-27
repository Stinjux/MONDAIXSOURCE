import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { checkPassword, createSessionValue, partnerEnabled, sessionUser } from "../src/lib/session";

const withEnv = (env: Record<string, string | undefined>, fn: () => void) => {
  const saved = { ...process.env };
  try {
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    fn();
  } finally {
    process.env = saved;
  }
};
const NOW = Date.UTC(2026, 10, 16);

test("comptes : le mot de passe désigne le compte", () => {
  withEnv({ ADMIN_PASSWORD: "admin-secret-123", PARTNER_PASSWORD: "partner-secret-456" }, () => {
    assert.equal(checkPassword("admin-secret-123"), "owner");
    assert.equal(checkPassword(" partner-secret-456 "), "partner");
    assert.equal(checkPassword("autre"), null);
    assert.equal(partnerEnabled(), true);
  });
  // Sans PARTNER_PASSWORD (ou identique à ADMIN_PASSWORD) : un seul compte
  withEnv({ ADMIN_PASSWORD: "admin-secret-123", PARTNER_PASSWORD: undefined }, () => assert.equal(partnerEnabled(), false));
  withEnv({ ADMIN_PASSWORD: "same", PARTNER_PASSWORD: "same" }, () => {
    assert.equal(partnerEnabled(), false);
    assert.equal(checkPassword("same"), "owner");
  });
});

test("session : nomme le compte, refuse falsification et expiration", () => {
  withEnv({ ADMIN_PASSWORD: "admin-secret-123", PARTNER_PASSWORD: "partner-secret-456" }, () => {
    const owner = createSessionValue("owner", NOW)!;
    const partner = createSessionValue("partner", NOW)!;
    assert.equal(sessionUser(owner, NOW + 1000), "owner");
    assert.equal(sessionUser(partner, NOW + 1000), "partner");
    // Changer le nom du compte dans le cookie invalide la signature
    assert.equal(sessionUser(owner.replace(".owner.", ".partner."), NOW), null);
    assert.equal(sessionUser(partner.replace(".partner.", ".owner."), NOW), null);
    assert.equal(sessionUser(owner, NOW + 31 * 86_400_000), null); // expirée après 30 jours
    assert.equal(sessionUser("n'importe.quoi", NOW), null);
    assert.equal(sessionUser(undefined, NOW), null);
    // Ancien cookie (avant les comptes) : session du propriétaire, toujours valide
    const exp = String(NOW + 86_400_000);
    const legacy = `${exp}.${createHmac("sha256", "mondaix-session:admin-secret-123").update(exp).digest("base64url")}`;
    assert.equal(sessionUser(legacy, NOW), "owner");
  });
  // Changer PARTNER_PASSWORD déconnecte le partenaire, pas le propriétaire
  let owner = "", partner = "";
  withEnv({ ADMIN_PASSWORD: "admin-secret-123", PARTNER_PASSWORD: "partner-secret-456" }, () => {
    owner = createSessionValue("owner", NOW)!;
    partner = createSessionValue("partner", NOW)!;
  });
  withEnv({ ADMIN_PASSWORD: "admin-secret-123", PARTNER_PASSWORD: "nouveau-mot-de-passe" }, () => {
    assert.equal(sessionUser(owner, NOW), "owner");
    assert.equal(sessionUser(partner, NOW), null);
  });
  // Compte partenaire retiré : sa session ne vaut plus rien
  withEnv({ ADMIN_PASSWORD: "admin-secret-123", PARTNER_PASSWORD: undefined }, () => assert.equal(sessionUser(partner, NOW), null));
});

// Formatage (fr-CA, CAD). Utilisable côté serveur et navigateur.
const cadFormat = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });
const numFormat = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 1 });

export const cad = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : cadFormat.format(v));
export const pct = (v: number | null | undefined, digits = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(digits).replace(".", ",")} %`);
export const num = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : numFormat.format(v));
export const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

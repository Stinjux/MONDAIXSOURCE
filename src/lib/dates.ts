// Dates et semaines dans le fuseau du Québec (America/Toronto : même heure que Montréal / Québec).
// Une semaine va du lundi 00:00 au dimanche 23:59:59, heure locale.

export const TIME_ZONE = "America/Toronto";
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

export function zonedParts(date: Date): ZonedParts {
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

/** Décalage (ms) entre l'heure locale du Québec et UTC à un instant donné. */
function offsetMs(date: Date): number {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convertit une heure locale du Québec en instant UTC (gère les changements d'heure). */
export function zonedTimeToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = guess - offsetMs(new Date(guess));
  const corrected = guess - offsetMs(new Date(utc));
  if (corrected !== utc) utc = corrected;
  return new Date(utc);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Date locale (Québec) au format AAAA-MM-JJ. */
export function localDateKey(date: Date): string {
  const p = zonedParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Lundi (AAAA-MM-JJ, heure du Québec) de la semaine contenant `date`. */
export function weekKey(date: Date): string {
  const p = zonedParts(date);
  const sinceMonday = (p.weekday + 6) % 7;
  return addDaysToKey(`${p.year}-${pad(p.month)}-${pad(p.day)}`, -sinceMonday);
}

export function isWeekKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDay() === 1;
}

export type WeekBounds = { key: string; start: Date; end: Date; lastDay: string };

/** Bornes d'une semaine : [lundi 00:00, lundi suivant 00:00[ en heure du Québec. */
export function weekBoundsFromKey(key: string): WeekBounds {
  const [y, m, d] = key.split("-").map(Number);
  const next = addDaysToKey(key, 7).split("-").map(Number);
  return {
    key,
    start: zonedTimeToUtc(y, m, d),
    end: zonedTimeToUtc(next[0], next[1], next[2]),
    lastDay: addDaysToKey(key, 6),
  };
}

export function weekBounds(date: Date): WeekBounds {
  return weekBoundsFromKey(weekKey(date));
}

/** Liste des `count` dernières semaines, la plus ancienne en premier, se terminant par la semaine de `date`. */
export function recentWeekKeys(date: Date, count: number): string[] {
  const current = weekKey(date);
  return Array.from({ length: count }, (_, i) => addDaysToKey(current, -7 * (count - 1 - i)));
}

/** Jours restants dans la semaine en cours, aujourd'hui inclus (dimanche = 1). */
export function daysLeftInWeek(date: Date): number {
  const p = zonedParts(date);
  return 7 - ((p.weekday + 6) % 7);
}

/** Jour de la semaine local (0 = lundi … 6 = dimanche). */
export function localWeekdayIndex(date: Date): number {
  return (zonedParts(date).weekday + 6) % 7;
}

// ---------------------------------------------------------------------------
// Lecture des dates saisies dans les Google Sheets
// ---------------------------------------------------------------------------

export type DateOrder = "MDY" | "DMY";

const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, janvier: 1, january: 1,
  feb: 2, fev: 2, fevr: 2, fevrier: 2, february: 2,
  mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, avril: 4, april: 4,
  may: 5, mai: 5,
  jun: 6, juin: 6, june: 6,
  jul: 7, juil: 7, juillet: 7, july: 7,
  aug: 8, aou: 8, aout: 8, august: 8,
  sep: 9, sept: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dec: 12, decembre: 12, december: 12,
};

function validDate(y: number, m: number, d: number): boolean {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Interprète une date de Google Sheets (heure du Québec).
 * Formats acceptés : AAAA-MM-JJ[ HH:MM[:SS]], JJ/MM/AAAA ou MM/JJ/AAAA (selon `order` si ambigu),
 * noms de mois FR/EN ("13 oct. 2026", "Oct 13, 2026") et numéros de série Sheets.
 * Une date sans heure est placée à midi. Retourne null si la date est invalide ou dans le futur.
 */
export function parseSheetDate(input: string | undefined | null, opts: { order?: DateOrder; now?: Date } = {}): Date | null {
  const text = (input ?? "").trim();
  if (!text) return null;
  const now = opts.now ?? new Date();
  const order = opts.order ?? "MDY";
  let y = 0, m = 0, d = 0, hh = 12, mm = 0, ss = 0;
  let match: RegExpMatchArray | null;

  const time = (h?: string, min?: string, s?: string, ampm?: string) => {
    if (h === undefined) return;
    hh = Number(h) % 24;
    mm = Number(min ?? 0);
    ss = Number(s ?? 0);
    if (ampm) {
      const pm = /p/i.test(ampm);
      hh = (hh % 12) + (pm ? 12 : 0);
    }
  };
  const TIME = String.raw`(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?)?`;

  if ((match = text.match(new RegExp(String.raw`^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})` + TIME + String.raw`(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$`, "i")))) {
    if (/(Z|[+-]\d{2}:?\d{2})$/.test(text) && /T/.test(text)) {
      const iso = new Date(text);
      return Number.isNaN(iso.getTime()) || iso.getTime() > now.getTime() + DAY_MS ? null : iso;
    }
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    time(match[4], match[5], match[6], match[7]);
  } else if ((match = text.match(new RegExp(String.raw`^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})` + TIME + "$", "i")))) {
    const a = Number(match[1]), b = Number(match[2]);
    y = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    if (a > 12) [d, m] = [a, b];
    else if (b > 12) [m, d] = [a, b];
    else if (order === "DMY") [d, m] = [a, b];
    else [m, d] = [a, b];
    time(match[4], match[5], match[6], match[7]);
  } else if (/^\d{5}(\.\d+)?$/.test(text)) {
    // Numéro de série Google Sheets (jours depuis le 1899-12-30)
    const serial = Number(text);
    if (serial < 36526 || serial > 73051) return null;
    const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * DAY_MS);
    [y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
    const frac = serial - Math.floor(serial);
    if (frac > 0) {
      const secs = Math.round(frac * 86400);
      [hh, mm, ss] = [Math.floor(secs / 3600), Math.floor((secs % 3600) / 60), secs % 60];
    }
  } else {
    const clean = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const word = clean.match(/[a-z]{3,}/g)?.find((w) => MONTHS[w] || MONTHS[w.slice(0, 4)] || MONTHS[w.slice(0, 3)]);
    const year = clean.match(/\b(20\d{2})\b/);
    const dayNum = clean.replace(/\b20\d{2}\b/, "").match(/\b(\d{1,2})(?:er|st|nd|rd|th)?\b/);
    if (!word || !year || !dayNum) return null;
    m = MONTHS[word] ?? MONTHS[word.slice(0, 4)] ?? MONTHS[word.slice(0, 3)];
    y = Number(year[1]);
    d = Number(dayNum[1]);
    const t = clean.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/);
    if (t) time(t[1], t[2], t[3], t[4]);
  }

  if (!validDate(y, m, d) || hh > 23 || mm > 59 || ss > 59) return null;
  const result = zonedTimeToUtc(y, m, d, hh, mm, ss);
  // Une date du jour sans heure (midi) ne doit pas être dans le futur.
  if (result.getTime() > now.getTime()) {
    if (localDateKey(result) === localDateKey(now)) return now;
    return null;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

const dayFormat = new Intl.DateTimeFormat("fr-CA", { timeZone: TIME_ZONE, day: "numeric", month: "short" });
const dateFormat = new Intl.DateTimeFormat("fr-CA", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("fr-CA", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const toDate = (v: Date | string) => (typeof v === "string" ? new Date(v) : v);
export const formatDate = (v: Date | string | null | undefined) => (v ? dateFormat.format(toDate(v)) : "—");
export const formatDateTime = (v: Date | string | null | undefined) => (v ? dateTimeFormat.format(toDate(v)) : "—");

/** "12 – 18 oct." à partir d'une clé de semaine. */
export function formatWeekRange(key: string): string {
  const { start } = weekBoundsFromKey(key);
  const last = weekBoundsFromKey(key).end.getTime() - 1;
  return `${dayFormat.format(start)} – ${dayFormat.format(new Date(last))}`;
}

export function formatWeekShort(key: string): string {
  return dayFormat.format(weekBoundsFromKey(key).start);
}

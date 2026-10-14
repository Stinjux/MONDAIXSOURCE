// Rappel hebdomadaire de la Weekly Review. Envoi optionnel vers un webhook (Slack, Discord, ntfy…)
// configuré dans REMINDER_WEBHOOK_URL. Sans webhook, le contenu est seulement retourné / affiché.
import { prisma } from "./prisma";
import { config } from "./config";
import { formatWeekRange, weekKey } from "./dates";

export async function buildReminder(now = new Date()) {
  const week = weekKey(now);
  const [found, pendingThisWeek, overdue] = await Promise.all([
    prisma.product.count({ where: { countsTowardGoal: true, goalWeek: week } }),
    prisma.product.count({ where: { countsTowardGoal: true, goalWeek: week, reviewStatus: { in: ["TO_REVIEW", "IN_PROGRESS"] } } }),
    prisma.product.count({ where: { countsTowardGoal: true, goalWeek: { lt: week }, reviewStatus: { in: ["TO_REVIEW", "IN_PROGRESS"] } } }),
  ]);
  const goal = config.weeklyGoal;
  const text = [
    `📋 Weekly Review MONDAIX — semaine du ${formatWeekRange(week)}`,
    `• Leads uniques trouvés : ${found} / ${goal} (${Math.round((found / goal) * 100)} %)`,
    `• À revoir cette semaine : ${pendingThisWeek}`,
    overdue ? `• En retard (semaines précédentes) : ${overdue}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { week, found, goal, pendingThisWeek, overdue, text };
}

export async function sendReminder(now = new Date()) {
  const reminder = await buildReminder(now);
  const url = process.env.REMINDER_WEBHOOK_URL?.trim();
  if (!url) return { ...reminder, sent: false, reason: "REMINDER_WEBHOOK_URL non configuré" };
  const isNtfy = /ntfy\./i.test(url);
  const res = await fetch(url, {
    method: "POST",
    headers: isNtfy ? { "Content-Type": "text/plain", Title: "MONDAIX Weekly Review" } : { "Content-Type": "application/json" },
    // "text" pour Slack, "content" pour Discord
    body: isNtfy ? reminder.text : JSON.stringify({ text: reminder.text, content: reminder.text }),
  });
  if (!res.ok) throw new Error(`Webhook : réponse ${res.status}`);
  return { ...reminder, sent: true };
}

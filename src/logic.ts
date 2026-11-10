export const MEALS = ['breakfast', 'brunch', 'lunch', 'dinner', 'snacks'] as const;
export type Meal = (typeof MEALS)[number];

export interface Entry {
  id: number;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  meal: Meal;
  kcal: number;
  note?: string;
}

/** A daily budget that applies from `from` (YYYY-MM-DD) until the next budget starts. */
export interface Budget {
  from: string;
  kcal: number;
}

/** A frequently eaten item that can be logged with one tap. */
export interface Favorite {
  id: number;
  name: string;
  kcal: number;
}

export const DEFAULT_BUDGET = 2094;
/** Start date of the seed budget: earlier than any real day. */
export const EPOCH = '0000-01-01';

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Budget in force on the given day: the latest one that started on or before it. */
export function budgetFor(date: string, budgets: Budget[]): number {
  let best: Budget | undefined;
  for (const b of budgets) {
    if (b.from <= date && (!best || b.from > best.from)) best = b;
  }
  return best ? best.kcal : DEFAULT_BUDGET;
}

export function totalsByDate(entries: Entry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const e of entries) totals.set(e.date, (totals.get(e.date) ?? 0) + e.kcal);
  return totals;
}

/**
 * Average daily deficit (budget − eaten) over the 7 calendar days before `today`.
 * Days with no entries are skipped. A surplus counts as a negative deficit.
 */
export function avgDeficit(
  entries: Entry[],
  budgets: Budget[],
  today: string,
): { avg: number | null; days: number } {
  const totals = totalsByDate(entries);
  let sum = 0;
  let days = 0;
  for (let i = 1; i <= 7; i++) {
    const date = addDays(today, -i);
    const eaten = totals.get(date);
    if (eaten === undefined) continue;
    sum += budgetFor(date, budgets) - eaten;
    days++;
  }
  return { avg: days ? Math.round(sum / days) : null, days };
}

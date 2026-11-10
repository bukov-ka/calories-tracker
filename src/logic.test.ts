import { describe, expect, it } from 'vitest';
import { addDays, avgDeficit, budgetFor, EPOCH, type Budget, type Entry } from './logic';

const budgets: Budget[] = [
  { from: EPOCH, kcal: 2000 },
  { from: '2026-11-05', kcal: 1800 },
];

let id = 0;
const e = (date: string, kcal: number): Entry => ({ id: ++id, date, meal: 'lunch', kcal });

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('budgetFor', () => {
  it('uses the budget in force on that day', () => {
    expect(budgetFor('2026-11-04', budgets)).toBe(2000);
    expect(budgetFor('2026-11-05', budgets)).toBe(1800);
    expect(budgetFor('2026-12-01', budgets)).toBe(1800);
  });
});

describe('avgDeficit', () => {
  it('returns null when there are no logged days', () => {
    expect(avgDeficit([], budgets, '2026-11-10')).toEqual({ avg: null, days: 0 });
  });

  it('ignores today, days older than 7, and empty days', () => {
    const entries = [
      e('2026-11-10', 5000), // today: ignored
      e('2026-11-09', 1500), // 1800 - 1500 = 300
      e('2026-11-09', 100), //  same day -> 200 total deficit
      e('2026-11-04', 2300), // 2000 - 2300 = -300 (old budget, surplus)
      e('2026-11-03', 1000), // exactly 7 days back: 2000 - 1000 = 1000
      e('2026-11-02', 100), //  8 days back: ignored
    ];
    // (200 - 300 + 1000) / 3 = 300
    expect(avgDeficit(entries, budgets, '2026-11-10')).toEqual({ avg: 300, days: 3 });
  });
});

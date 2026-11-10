import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { deleteEntry, loadAll, replaceAll, saveBudget, saveEntry, type Data } from './db';
import {
  addDays,
  avgDeficit,
  budgetFor,
  dateKey,
  MEALS,
  parseKey,
  totalsByDate,
  type Entry,
  type Meal,
} from './logic';

type Tab = 'day' | 'history' | 'settings';
interface Draft {
  id?: number;
  meal: Meal;
  kcal: string;
  note: string;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function dayTitle(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  return parseKey(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function App() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [today, setToday] = useState(() => dateKey(new Date()));
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<Tab>('day');
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    loadAll().then(setData, (e) => setError(String(e)));
  }, []);

  // Roll over to the new day when the app is reopened after midnight.
  const current = useRef({ today, date });
  current.current = { today, date };
  useEffect(() => {
    const check = () => {
      const now = dateKey(new Date());
      const { today, date } = current.current;
      if (now === today) return;
      if (date === today) setDate(now);
      setToday(now);
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  if (error) return <p class="pad">Could not open storage: {error}</p>;
  if (!data) return null;

  const run = (p: Promise<unknown>) => p.catch((e) => alert(`Something went wrong: ${e}`));

  const submitDraft = async () => {
    if (!draft) return;
    const kcal = Math.round(Number(draft.kcal));
    if (!(kcal > 0)) return;
    const note = draft.note.trim();
    const saved = await saveEntry({
      ...(draft.id !== undefined ? { id: draft.id } : {}),
      date,
      meal: draft.meal,
      kcal,
      ...(note ? { note } : {}),
    });
    setData({ ...data, entries: [...data.entries.filter((e) => e.id !== saved.id), saved] });
    setDraft(null);
  };

  const removeDraft = async () => {
    if (draft?.id === undefined) return;
    await deleteEntry(draft.id);
    setData({ ...data, entries: data.entries.filter((e) => e.id !== draft.id) });
    setDraft(null);
  };

  return (
    <>
      <main>
        {tab === 'day' && (
          <DayView
            data={data}
            date={date}
            today={today}
            setDate={setDate}
            onAdd={(meal) => setDraft({ meal, kcal: '', note: '' })}
            onEdit={(e) => setDraft({ id: e.id, meal: e.meal, kcal: String(e.kcal), note: e.note ?? '' })}
          />
        )}
        {tab === 'history' && (
          <HistoryView
            data={data}
            today={today}
            onOpen={(d) => {
              setDate(d);
              setTab('day');
            }}
          />
        )}
        {tab === 'settings' && <SettingsView data={data} today={today} setData={setData} run={run} />}
      </main>

      <nav>
        {(['day', 'history', 'settings'] as const).map((t) => (
          <button key={t} class={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'day' ? 'Day' : cap(t)}
          </button>
        ))}
      </nav>

      {draft && (
        <EntryDialog
          draft={draft}
          setDraft={setDraft}
          onSave={() => run(submitDraft())}
          onDelete={() => run(removeDraft())}
        />
      )}
    </>
  );
}

function DayView(props: {
  data: Data;
  date: string;
  today: string;
  setDate: (d: string) => void;
  onAdd: (meal: Meal) => void;
  onEdit: (e: Entry) => void;
}) {
  const { data, date, today } = props;
  const entries = data.entries.filter((e) => e.date === date).sort((a, b) => a.id - b.id);
  const eaten = entries.reduce((s, e) => s + e.kcal, 0);
  const budget = budgetFor(date, data.budgets);
  const left = budget - eaten;
  const avg = useMemo(() => avgDeficit(data.entries, data.budgets, today), [data, today]);

  return (
    <>
      <header class="daynav">
        <button aria-label="Previous day" onClick={() => props.setDate(addDays(date, -1))}>
          ‹
        </button>
        <h1>{dayTitle(date, today)}</h1>
        <button aria-label="Next day" disabled={date >= today} onClick={() => props.setDate(addDays(date, 1))}>
          ›
        </button>
      </header>

      <section class="card summary">
        <div class="big">
          {eaten} <span>/ {budget} kcal</span>
        </div>
        <div class="bar">
          <div class={left < 0 ? 'over' : ''} style={{ width: `${Math.min(100, (eaten / budget) * 100)}%` }} />
        </div>
        <div class={left < 0 ? 'bad' : 'good'}>{left >= 0 ? `${left} kcal left` : `${-left} kcal over budget`}</div>
      </section>

      <section class="card avg">
        <div class="label">Average deficit, last 7 days</div>
        {avg.avg === null ? (
          <div class="muted">No logged days yet</div>
        ) : (
          <div>
            <strong class={avg.avg < 0 ? 'bad' : 'good'}>
              {avg.avg >= 0 ? `${avg.avg} kcal/day` : `${-avg.avg} kcal/day surplus`}
            </strong>{' '}
            <span class="muted">· {avg.days} of 7 days logged</span>
          </div>
        )}
      </section>

      {MEALS.map((meal) => {
        const list = entries.filter((e) => e.meal === meal);
        return (
          <section class="card meal" key={meal}>
            <div class="mealhead">
              <h2>{cap(meal)}</h2>
              <span class="muted">{list.length ? list.reduce((s, e) => s + e.kcal, 0) : ''}</span>
              <button class="add" aria-label={`Add to ${meal}`} onClick={() => props.onAdd(meal)}>
                +
              </button>
            </div>
            {list.map((e) => (
              <button class="entry" key={e.id} onClick={() => props.onEdit(e)}>
                <span class={e.note ? '' : 'muted'}>{e.note || 'No note'}</span>
                <span>{e.kcal}</span>
              </button>
            ))}
          </section>
        );
      })}
    </>
  );
}

function HistoryView(props: { data: Data; today: string; onOpen: (date: string) => void }) {
  const { data } = props;
  const days = [...totalsByDate(data.entries)].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return (
    <>
      <header class="daynav">
        <h1>History</h1>
      </header>
      {days.length === 0 && <p class="pad muted">Nothing logged yet.</p>}
      <section class="card list">
        {days.map(([date, eaten]) => {
          const diff = budgetFor(date, data.budgets) - eaten;
          return (
            <button class="entry" key={date} onClick={() => props.onOpen(date)}>
              <span>{dayTitle(date, props.today)}</span>
              <span>
                {eaten} <small class={diff < 0 ? 'bad' : 'good'}>{diff >= 0 ? `−${diff}` : `+${-diff}`}</small>
              </span>
            </button>
          );
        })}
      </section>
      {days.length > 0 && <p class="pad muted small">Green: deficit vs. that day's budget. Red: surplus.</p>}
    </>
  );
}

function SettingsView(props: {
  data: Data;
  today: string;
  setData: (d: Data) => void;
  run: (p: Promise<unknown>) => void;
}) {
  const { data, today } = props;
  const currentBudget = budgetFor(today, data.budgets);
  const [budget, setBudget] = useState(String(currentBudget));
  const fileInput = useRef<HTMLInputElement>(null);
  const kcal = Math.round(Number(budget));
  const canSave = kcal > 0 && kcal !== currentBudget;

  const applyBudget = async () => {
    const b = { from: today, kcal };
    await saveBudget(b);
    props.setData({ ...data, budgets: [...data.budgets.filter((x) => x.from !== today), b] });
  };

  const exportData = () => {
    const payload = { app: 'calories-tracker', version: 1, exportedAt: new Date().toISOString(), ...data };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `calories-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importData = async (file: File) => {
    const parsed = parseImport(await file.text());
    if (!parsed) {
      alert('This file is not a Calories Tracker export.');
      return;
    }
    const ok = confirm(
      `Replace all current data (${data.entries.length} entries) with ${parsed.entries.length} entries from the file?`,
    );
    if (!ok) return;
    await replaceAll(parsed);
    props.setData(parsed);
    setBudget(String(budgetFor(today, parsed.budgets)));
  };

  return (
    <>
      <header class="daynav">
        <h1>Settings</h1>
      </header>

      <section class="card">
        <h2>Daily budget</h2>
        <form
          class="row"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (canSave) props.run(applyBudget());
          }}
        >
          <input
            type="number"
            inputMode="numeric"
            min="1"
            aria-label="Daily budget, kcal"
            value={budget}
            onInput={(ev) => setBudget(ev.currentTarget.value)}
          />
          <button class="primary" disabled={!canSave}>
            Save
          </button>
        </form>
        <p class="muted small">A new budget applies from today. Earlier days keep the budget they had.</p>
      </section>

      <section class="card">
        <h2>Backup</h2>
        <div class="row">
          <button onClick={exportData}>Export to file</button>
          <button onClick={() => fileInput.current?.click()}>Import from file</button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(ev) => {
            const file = ev.currentTarget.files?.[0];
            ev.currentTarget.value = '';
            if (file) props.run(importData(file));
          }}
        />
        <p class="muted small">
          Data is stored only on this device ({data.entries.length} entries). Import replaces everything.
        </p>
      </section>
    </>
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseImport(text: string): Data | null {
  try {
    const raw = JSON.parse(text);
    if (!Array.isArray(raw?.entries) || !Array.isArray(raw?.budgets) || raw.budgets.length === 0) return null;
    const entries: Entry[] = raw.entries.map((e: any, i: number) => {
      if (!DATE_RE.test(e.date) || !MEALS.includes(e.meal) || !(Number(e.kcal) > 0)) throw new Error('bad entry');
      return {
        id: i + 1,
        date: e.date,
        meal: e.meal,
        kcal: Math.round(Number(e.kcal)),
        ...(typeof e.note === 'string' && e.note ? { note: e.note } : {}),
      };
    });
    const budgets = raw.budgets.map((b: any) => {
      if (!DATE_RE.test(b.from) || !(Number(b.kcal) > 0)) throw new Error('bad budget');
      return { from: b.from, kcal: Math.round(Number(b.kcal)) };
    });
    return { entries, budgets };
  } catch {
    return null;
  }
}

function EntryDialog(props: {
  draft: Draft;
  setDraft: (d: Draft | null) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const { draft, setDraft } = props;
  const kcalInput = useRef<HTMLInputElement>(null);
  useEffect(() => kcalInput.current?.focus(), []);
  const valid = Math.round(Number(draft.kcal)) > 0;

  return (
    <div class="overlay" onClick={(ev) => ev.target === ev.currentTarget && setDraft(null)}>
      <form
        class="sheet"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (valid) props.onSave();
        }}
      >
        <h2>{draft.id === undefined ? 'Add entry' : 'Edit entry'}</h2>
        <div class="chips">
          {MEALS.map((m) => (
            <button
              type="button"
              key={m}
              class={draft.meal === m ? 'active' : ''}
              onClick={() => setDraft({ ...draft, meal: m })}
            >
              {cap(m)}
            </button>
          ))}
        </div>
        <input
          ref={kcalInput}
          type="number"
          inputMode="numeric"
          min="1"
          placeholder="kcal"
          aria-label="Calories"
          value={draft.kcal}
          onInput={(ev) => setDraft({ ...draft, kcal: ev.currentTarget.value })}
        />
        <input
          type="text"
          placeholder="Note (optional)"
          aria-label="Note"
          maxLength={80}
          value={draft.note}
          onInput={(ev) => setDraft({ ...draft, note: ev.currentTarget.value })}
        />
        <div class="row">
          {draft.id !== undefined && (
            <button type="button" class="danger" onClick={props.onDelete}>
              Delete
            </button>
          )}
          <span class="grow" />
          <button type="button" onClick={() => setDraft(null)}>
            Cancel
          </button>
          <button class="primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

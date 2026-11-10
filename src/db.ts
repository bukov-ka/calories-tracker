import { DEFAULT_BUDGET, EPOCH, type Budget, type Entry } from './logic';

export interface Data {
  entries: Entry[];
  budgets: Budget[];
}

const DB_NAME = 'calories-tracker';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
      r.result.createObjectStore('budgets', { keyPath: 'from' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
}

export async function loadAll(): Promise<Data> {
  const db = await open();
  const tx = db.transaction(['entries', 'budgets'], 'readwrite');
  const entries = (await req(tx.objectStore('entries').getAll())) as Entry[];
  let budgets = (await req(tx.objectStore('budgets').getAll())) as Budget[];
  if (budgets.length === 0) {
    budgets = [{ from: EPOCH, kcal: DEFAULT_BUDGET }];
    tx.objectStore('budgets').put(budgets[0]);
  }
  await done(tx);
  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.().catch(() => {});
  return { entries, budgets };
}

export async function saveEntry(entry: Omit<Entry, 'id'> & { id?: number }): Promise<Entry> {
  const db = await open();
  const tx = db.transaction('entries', 'readwrite');
  const id = (await req(tx.objectStore('entries').put(entry))) as number;
  await done(tx);
  return { ...entry, id };
}

export async function deleteEntry(id: number): Promise<void> {
  const db = await open();
  const tx = db.transaction('entries', 'readwrite');
  tx.objectStore('entries').delete(id);
  await done(tx);
}

export async function saveBudget(budget: Budget): Promise<void> {
  const db = await open();
  const tx = db.transaction('budgets', 'readwrite');
  tx.objectStore('budgets').put(budget);
  await done(tx);
}

/** Replaces everything in the database (used by import). */
export async function replaceAll(data: Data): Promise<void> {
  const db = await open();
  const tx = db.transaction(['entries', 'budgets'], 'readwrite');
  const entries = tx.objectStore('entries');
  const budgets = tx.objectStore('budgets');
  entries.clear();
  budgets.clear();
  for (const e of data.entries) entries.put(e);
  for (const b of data.budgets) budgets.put(b);
  await done(tx);
}

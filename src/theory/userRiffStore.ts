import type { GenreId } from "./genres";
import type { ScaleId } from "./scales";

const DB_NAME = "music-mind-user-riffs";
const STORE = "riffs";
const DB_VERSION = 1;

export interface UserRiff {
  id: string;
  name: string;
  genre: GenreId;
  scaleId: ScaleId;
  /** Absolute MIDI pitches in Guided order. */
  midis: number[];
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function newUserRiffId(): string {
  const tail = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `user-${tail}`;
}

export async function listUserRiffs(genre?: GenreId): Promise<UserRiff[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      let rows = (req.result as UserRiff[]).slice();
      if (genre) rows = rows.filter((r) => r.genre === genre);
      rows.sort((a, b) => b.createdAt - a.createdAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error ?? new Error("listUserRiffs failed"));
  });
}

export async function getUserRiff(id: string): Promise<UserRiff | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as UserRiff | undefined);
    req.onerror = () => reject(req.error ?? new Error("getUserRiff failed"));
  });
}

export async function saveUserRiff(riff: UserRiff): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(riff);
  await txDone(tx);
}

export async function deleteUserRiff(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
}

export function isUserRiffId(id: string): boolean {
  return id.startsWith("user-");
}

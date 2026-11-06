import type { WriteClip } from "./clipModel";
import { normalizeCaptureEvents } from "./quantize";

const DB_NAME = "music-mind-clips";
const STORE = "clips";
const DB_VERSION = 1;

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

function normalizeClip(raw: WriteClip): WriteClip {
  return {
    ...raw,
    events: normalizeCaptureEvents(raw.events ?? []),
    trimStartSec: raw.trimStartSec ?? 0,
    trimEndSec: raw.trimEndSec ?? 0,
  };
}

export async function listClips(): Promise<WriteClip[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result as WriteClip[]).map(normalizeClip);
      rows.sort((a, b) => b.createdAt - a.createdAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error ?? new Error("listClips failed"));
  });
}

export async function getClip(id: string): Promise<WriteClip | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => {
      const row = req.result as WriteClip | undefined;
      resolve(row ? normalizeClip(row) : undefined);
    };
    req.onerror = () => reject(req.error ?? new Error("getClip failed"));
  });
}

export async function saveClip(clip: WriteClip): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(normalizeClip(clip));
  await txDone(tx);
}

export async function deleteClip(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
}

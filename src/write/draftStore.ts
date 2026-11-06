import JSZip from "jszip";
import type { WriteComplexity, WriteDocument } from "./document";
import type { SongSection } from "./document";
import { fromMusicXml } from "./fromMusicXml";
import { toMusicXml } from "./toMusicXml";

const DB_NAME = "music-mind-drafts";
const STORE = "drafts";
const DB_VERSION = 1;

export interface WriteDraftRecord {
  id: string;
  title: string;
  updatedAt: number;
  musicXml: string;
  writeMode: WriteComplexity;
  songForm?: SongSection[];
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

export async function listDrafts(): Promise<WriteDraftRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result as WriteDraftRecord[]).slice();
      rows.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error ?? new Error("listDrafts failed"));
  });
}

export async function getDraft(id: string): Promise<WriteDraftRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as WriteDraftRecord | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("getDraft failed"));
  });
}

export async function saveDraft(record: WriteDraftRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(record);
  await txDone(tx);
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
}

export function documentToDraft(
  doc: WriteDocument,
  id: string | null,
): WriteDraftRecord {
  return {
    id: id ?? crypto.randomUUID(),
    title: doc.title || "Untitled",
    updatedAt: Date.now(),
    musicXml: toMusicXml(doc),
    writeMode: doc.writeMode,
    songForm: doc.sections.length ? doc.sections : undefined,
  };
}

export function draftToDocument(record: WriteDraftRecord): WriteDocument {
  const doc = fromMusicXml(record.musicXml, record.title);
  doc.writeMode = record.writeMode;
  if (record.songForm?.length) {
    doc.sections = record.songForm;
    for (const sec of doc.sections) {
      const m = doc.measures[sec.startMeasure];
      if (m && !m.rehearsal) m.rehearsal = sec.label;
    }
  }
  return doc;
}

export async function downloadMusicXml(doc: WriteDocument, asMxl = false) {
  const xml = toMusicXml(doc);
  const base = (doc.title || "untitled").replace(/[^\w-]+/g, "_");
  if (!asMxl) {
    const blob = new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" });
    triggerDownload(blob, `${base}.musicxml`);
    return;
  }
  const zip = new JSZip();
  zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>
  </rootfiles>
</container>`);
  zip.file("score.musicxml", xml);
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `${base}.mxl`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

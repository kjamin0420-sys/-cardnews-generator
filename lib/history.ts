// 생성 기록을 브라우저에 로컬 저장 (IndexedDB).
// 배경 이미지가 장당 1MB 안팎이라 localStorage(5~10MB)로는 부족 → IndexedDB 사용.
//
// 목록용 meta 스토어와 본문용 decks 스토어를 나눠, 목록을 열 때
// 무거운 이미지까지 전부 읽지 않도록 한다.

import type { Deck } from "./slide-types";

const DB_NAME = "cardcraft";
const VERSION = 1;
const META = "meta";
const DECKS = "decks";
const MAX_ENTRIES = 20; // 오래된 것부터 자동 정리

export interface HistoryMeta {
  id: string;
  createdAt: number;
  topic: string;
  slideCount: number;
  thumb?: string; // 200px 축소 썸네일
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(DECKS)) {
        db.createObjectStore(DECKS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => IDBRequest<T> | void
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let out: T | undefined;
    const req = run(t);
    if (req) req.onsuccess = () => (out = req.result);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
}

/** 커버 이미지를 200px로 줄여 목록용 썸네일 생성 */
async function makeThumb(dataUrl?: string): Promise<string | undefined> {
  if (!dataUrl) return undefined;
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const size = 200;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, size, size);
    return c.toDataURL("image/jpeg", 0.7);
  } catch {
    return undefined;
  }
}

export async function saveDeck(id: string, deck: Deck): Promise<void> {
  const db = await openDB();
  const cover = deck.slides.find((s) => s.kind === "cover")?.bgImage;
  const meta: HistoryMeta = {
    id,
    createdAt: Date.now(),
    topic: deck.topic || "제목 없음",
    slideCount: deck.slides.length,
    thumb: await makeThumb(cover),
  };
  await tx(db, [META, DECKS], "readwrite", (t) => {
    t.objectStore(META).put(meta);
    t.objectStore(DECKS).put({ id, deck });
  });
  await prune(db);
  db.close();
}

export async function listHistory(): Promise<HistoryMeta[]> {
  const db = await openDB();
  const all = (await tx<HistoryMeta[]>(db, [META], "readonly", (t) =>
    t.objectStore(META).getAll()
  )) as HistoryMeta[] | undefined;
  db.close();
  return (all ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadDeck(id: string): Promise<Deck | null> {
  const db = await openDB();
  const row = (await tx<{ id: string; deck: Deck }>(db, [DECKS], "readonly", (t) =>
    t.objectStore(DECKS).get(id)
  )) as { id: string; deck: Deck } | undefined;
  db.close();
  return row?.deck ?? null;
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await openDB();
  await tx(db, [META, DECKS], "readwrite", (t) => {
    t.objectStore(META).delete(id);
    t.objectStore(DECKS).delete(id);
  });
  db.close();
}

/** 오래된 기록 자동 정리 (용량 보호) */
async function prune(db: IDBDatabase): Promise<void> {
  const all = (await tx<HistoryMeta[]>(db, [META], "readonly", (t) =>
    t.objectStore(META).getAll()
  )) as HistoryMeta[] | undefined;
  if (!all || all.length <= MAX_ENTRIES) return;
  const old = all.sort((a, b) => b.createdAt - a.createdAt).slice(MAX_ENTRIES);
  await tx(db, [META, DECKS], "readwrite", (t) => {
    for (const m of old) {
      t.objectStore(META).delete(m.id);
      t.objectStore(DECKS).delete(m.id);
    }
  });
}

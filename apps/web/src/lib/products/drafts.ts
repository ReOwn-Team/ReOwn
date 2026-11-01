import type { ListingDraft } from "@/mocks/data";
export type SavedDraft = ListingDraft & { requestId?: string };
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("reown-listing-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readDraft(key: string): Promise<SavedDraft | undefined> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("drafts").objectStore("drafts").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function writeDraft(key: string, value: SavedDraft | null) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      if (value) tx.objectStore("drafts").put(value, key);
      else tx.objectStore("drafts").delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

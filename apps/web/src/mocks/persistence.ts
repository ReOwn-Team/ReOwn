import type { Address, Listing, ListingDraft, MockOrder } from "./data";

export type DemoState = {
  saved: string[];
  viewed: string[];
  addresses: Address[];
  orders: MockOrder[];
  listings: Listing[];
  sales: MockOrder[];
  draft: ListingDraft;
  editDrafts: Record<string, ListingDraft>;
};
const DATABASE = "reown-demo-v2";
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readDemo(): Promise<DemoState | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("state")
        .objectStore("state")
        .get("current");
      request.onsuccess = () => {
        const stored = request.result;
        if (!stored) {
          resolve(undefined);
          return;
        }
        const { user: legacyUser, ...marketplace } = stored;
        void legacyUser;
        resolve(marketplace);
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function writeDemo(state: DemoState) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("state", "readwrite");
      transaction.objectStore("state").put(state, "current");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

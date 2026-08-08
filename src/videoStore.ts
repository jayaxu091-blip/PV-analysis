import { videoDbName, videoStoreName } from "./utils";

type SavedVideo = {
  id: string;
  name: string;
  type: string;
  blob: Blob;
};

function openVideoDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(videoDbName, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(videoStoreName)) {
        db.createObjectStore(videoStoreName, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveVideo(id: string, file: File | Blob) {
  const db = await openVideoDb();
  const name = file instanceof File ? file.name : "vault-video";
  const type = file.type || "video/mp4";

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(videoStoreName, "readwrite");
    transaction.objectStore(videoStoreName).put({ id, name, type, blob: file });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getVideo(id: string) {
  const db = await openVideoDb();
  return new Promise<SavedVideo | undefined>((resolve, reject) => {
    const transaction = db.transaction(videoStoreName, "readonly");
    const request = transaction.objectStore(videoStoreName).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearSavedVideos() {
  const db = await openVideoDb();
  const transaction = db.transaction(videoStoreName, "readwrite");
  transaction.objectStore(videoStoreName).clear();
}

export async function deleteSavedVideo(id: string | null) {
  if (!id) return;
  const db = await openVideoDb();
  const transaction = db.transaction(videoStoreName, "readwrite");
  transaction.objectStore(videoStoreName).delete(id);
}

export function openDatabase() {
  return new Promise((resolve, reject) => {
    // バージョン3に固定し、onupgradeneeded で handles ストアを確実に作成する
    const request = indexedDB.open("webmmd-assets-db", 3);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("handles")) {
        db.createObjectStore("handles");
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function saveDirectoryHandle(handle) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("handles", "readwrite");
    const store = transaction.objectStore("handles");
    const request = store.put(handle, "assets-folder");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getDirectoryHandle() {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("handles", "readonly");
      const store = transaction.objectStore("handles");
      const request = store.get("assets-folder");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("IndexedDB get error:", e);
    return null;
  }
}

export async function clearDirectoryHandle() {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("handles", "readwrite");
      const store = transaction.objectStore("handles");
      const request = store.delete("assets-folder");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("IndexedDB delete error:", e);
  }
}

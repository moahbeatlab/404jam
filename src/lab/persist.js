/* the last project is kept in this browser (IndexedDB), so a reload or a closed tab does not lose it */
const DB = "404jam-lab", STORE = "project";
function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function save(zip, name) {
  try {
    const db = await open();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ zip, name, at: Date.now() }, "last");
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
    return true;
  } catch (e) { return false; }
}
async function load() {
  try {
    const db = await open();
    const v = await new Promise((res, rej) => {
      const r = db.transaction(STORE).objectStore(STORE).get("last");
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    db.close();
    return v || null;
  } catch (e) { return null; }
}
async function clear() {
  try {
    const db = await open();
    await new Promise((res) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete("last"); tx.oncomplete = res; tx.onerror = res; });
    db.close();
  } catch (e) { /* nothing to clear */ }
}
export { save, load, clear };

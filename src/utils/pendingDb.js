// IndexedDB Manager สำหรับจัดเก็บคิวใบงาน Pending อย่างถาวร
// ข้อมูลจะไม่หายเมื่อรีเฟรชหน้าเว็บหรือปิดเบราว์เซอร์

const DB_NAME = 'JWD_Container_V3_DB';
const DB_VERSION = 1;
const STORE_PENDING = 'pending_job_sheets';

// เปิด / สร้างฐานข้อมูล IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        const store = db.createObjectStore(STORE_PENDING, { keyPath: 'file_hash' });
        store.createIndex('created_at', 'created_at', { unique: false });
        store.createIndex('name', 'name', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ดึงรายการใบงาน Pending ทั้งหมด
export async function getAllPendingFromDB() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING, 'readonly');
      const store = tx.objectStore(STORE_PENDING);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result || [];
        // สร้าง Object URL จาก Blob เพื่อให้แสดงผลรูปได้ทันที
        const mapped = items.map((item, idx) => ({
          ...item,
          id: idx,
          url: item.blob ? URL.createObjectURL(item.blob) : item.dataUrl || null
        }));
        resolve(mapped);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB getAll error:", err);
    return [];
  }
}

// บันทึกหรือเพิ่มรายการใบงานใหม่ลงใน IndexedDB (ข้ามตัวที่ซ้ำ)
export async function savePendingToDB(newItems) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING, 'readwrite');
      const store = tx.objectStore(STORE_PENDING);

      newItems.forEach(item => {
        // เก็บเฉพาะข้อมูลและ Blob (ไม่เก็บ Object URL ชั่วคราว)
        const record = {
          file_hash: item.file_hash,
          name: item.name,
          relativePath: item.relativePath,
          folderName: item.folderName,
          truckGuess: item.truckGuess,
          batchGuess: item.batchGuess,
          blob: item.file || item.blob,
          created_at: item.created_at || new Date().toISOString()
        };
        store.put(record);
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("IndexedDB save error:", err);
    return false;
  }
}

// ลบใบงานที่บันทึกเสร็จแล้วออกจาก IndexedDB
export async function deletePendingFromDB(fileHash) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING, 'readwrite');
      const store = tx.objectStore(STORE_PENDING);
      const request = store.delete(fileHash);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB delete error:", err);
    return false;
  }
}

// ล้างใบงาน Pending ทั้งหมดใน IndexedDB
export async function clearAllPendingFromDB() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING, 'readwrite');
      const store = tx.objectStore(STORE_PENDING);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB clear error:", err);
    return false;
  }
}

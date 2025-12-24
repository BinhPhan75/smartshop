
import { createClient } from '@supabase/supabase-js';
import { Product, Sale } from "./types";

const SUPABASE_URL = 'https://vwyultlxbpbgxonymfur.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MwmsVX5A_W_-8CayIzfYZw_0VCOp0e8';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DB_NAME = "SmartShopDB_V4";
const STORE_PRODUCTS = "products";
const STORE_SALES = "sales";
const DB_VERSION = 1;

// --- INDEXEDDB CORE ---
export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) db.createObjectStore(STORE_PRODUCTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_SALES)) db.createObjectStore(STORE_SALES, { keyPath: "id" });
    };
    request.onsuccess = (event: any) => resolve(event.target.result);
    request.onerror = (event: any) => reject(event.target.error);
  });
};

// --- SYNC HELPERS ---
const tryCloudSync = async (table: string, data: any[]) => {
  try {
    if (data.length === 0) return;
    const { error } = await supabase.from(table).upsert(data, { onConflict: 'id' });
    if (error) {
       // Nếu lỗi do thiếu bảng, chỉ log nhẹ để không làm phiền người dùng
       if (error.code === 'PGRST116' || error.message.includes('cache')) {
         console.warn(`Cloud Sync: Table '${table}' not found. Using local storage only.`);
       } else {
         console.error(`Cloud Sync Error (${table}):`, error.message);
       }
    }
  } catch (e) {
    // Silent catch to prevent app crash
  }
};

// --- API IMPLEMENTATION ---

export const saveProductsToDB = async (products: Product[]) => {
  // 1. Save Local
  const db = await initDB();
  const tx = db.transaction(STORE_PRODUCTS, "readwrite");
  const store = tx.objectStore(STORE_PRODUCTS);
  await new Promise((resolve) => {
    store.clear();
    products.forEach(p => store.put(p));
    tx.oncomplete = resolve;
  });

  // 2. Background Cloud Sync
  tryCloudSync('products', products);
};

export const saveSaleToDB = async (sale: Sale) => {
  // 1. Save Local
  const db = await initDB();
  const tx = db.transaction(STORE_SALES, "readwrite");
  const store = tx.objectStore(STORE_SALES);
  store.add(sale);
  
  // 2. Cloud Sync single item
  tryCloudSync('sales', [sale]);
};

export const saveAllSalesToDB = async (sales: Sale[]) => {
  const db = await initDB();
  const tx = db.transaction(STORE_SALES, "readwrite");
  const store = tx.objectStore(STORE_SALES);
  await new Promise((resolve) => {
    store.clear();
    sales.forEach(s => store.put(s));
    tx.oncomplete = resolve;
  });

  tryCloudSync('sales', sales);
};

export const getProductsFromDB = async (): Promise<Product[]> => {
  try {
    // Thử lấy từ Cloud trước
    const { data, error } = await supabase.from('products').select('*').order('createdAt', { ascending: false });
    if (!error && data) {
       // Cập nhật ngược lại vào Local nếu có data từ Cloud
       const db = await initDB();
       const tx = db.transaction(STORE_PRODUCTS, "readwrite");
       data.forEach(p => tx.objectStore(STORE_PRODUCTS).put(p));
       return data;
    }
  } catch (e) {}

  // Fallback về Local
  const db = await initDB();
  const tx = db.transaction(STORE_PRODUCTS, "readonly");
  const request = tx.objectStore(STORE_PRODUCTS).getAll();
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result || []);
  });
};

export const getSalesFromDB = async (): Promise<Sale[]> => {
  try {
    const { data, error } = await supabase.from('sales').select('*').order('timestamp', { ascending: false });
    if (!error && data) return data;
  } catch (e) {}

  const db = await initDB();
  const tx = db.transaction(STORE_SALES, "readonly");
  const request = tx.objectStore(STORE_SALES).getAll();
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result || []);
  });
};

export const exportBackup = async () => {
  const products = await getProductsFromDB();
  const sales = await getSalesFromDB();
  const data = { version: "4.5-hybrid", timestamp: Date.now(), products, sales };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `SmartShop_Backup_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

export const calculateStorageSize = (data: any): { text: string, bytes: number } => {
  const size = new Blob([JSON.stringify(data)]).size;
  let text = size < 1024 ? size + " B" : size < 1024 * 1024 ? (size / 1024).toFixed(2) + " KB" : (size / (1024 * 1024)).toFixed(2) + " MB";
  return { text, bytes: size };
};

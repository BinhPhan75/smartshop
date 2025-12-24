
import { createClient } from '@supabase/supabase-js';
import { Product, Sale } from "./types";

const SUPABASE_URL = 'https://vwyultlxbpbgxonymfur.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MwmsVX5A_W_-8CayIzfYZw_0VCOp0e8';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DB_NAME = "SmartShopDB_V4";
const STORE_PRODUCTS = "products";
const STORE_SALES = "sales";
const DB_VERSION = 1;

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

const tryCloudSync = async (table: string, data: any[]) => {
  if (!navigator.onLine) return;
  try {
    if (!data || data.length === 0) return;
    const { error } = await supabase.from(table).upsert(data, { onConflict: 'id' });
    if (error) console.debug(`Cloud Sync (${table}): Connection bypassed.`);
  } catch (e) {}
};

export const saveProductsToDB = async (products: Product[]) => {
  const db = await initDB();
  const tx = db.transaction(STORE_PRODUCTS, "readwrite");
  const store = tx.objectStore(STORE_PRODUCTS);
  await new Promise((resolve) => {
    store.clear();
    products.forEach(p => store.put(p));
    tx.oncomplete = resolve;
  });
  tryCloudSync('products', products);
};

export const saveSaleToDB = async (sale: Sale) => {
  const db = await initDB();
  const tx = db.transaction(STORE_SALES, "readwrite");
  const store = tx.objectStore(STORE_SALES);
  store.add(sale);
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
  const db = await initDB();
  const tx = db.transaction(STORE_PRODUCTS, "readonly");
  const request = tx.objectStore(STORE_PRODUCTS).getAll();
  const localData: Product[] = await new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result || []);
  });
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase.from('products').select('*').order('createdAt', { ascending: false });
      if (!error && data && data.length > 0) return data;
    } catch (e) {}
  }
  return localData;
};

export const getSalesFromDB = async (): Promise<Sale[]> => {
  const db = await initDB();
  const tx = db.transaction(STORE_SALES, "readonly");
  const request = tx.objectStore(STORE_SALES).getAll();
  const localSales: Sale[] = await new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result || []);
  });
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase.from('sales').select('*').order('timestamp', { ascending: false });
      if (!error && data && data.length > 0) return data;
    } catch (e) {}
  }
  return localSales;
};

export const exportBackup = async () => {
  const products = await getProductsFromDB();
  const sales = await getSalesFromDB();
  const data = { version: "4.5", timestamp: Date.now(), products, sales };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `SmartShop_Backup_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
};

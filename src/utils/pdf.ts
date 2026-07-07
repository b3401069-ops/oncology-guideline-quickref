import { db } from '@/db/database';
import { v4 as uuid } from 'uuid';

/**
 * Store a PDF file in IndexedDB and return the storage key
 */
export async function storePdfFile(file: File): Promise<string> {
  const key = `pdf-${uuid()}`;
  const arrayBuffer = await file.arrayBuffer();

  // Store in a separate IndexedDB store for large files
  const pdfDbRequest = indexedDB.open('OncologyPdfStorage', 1);

  return new Promise((resolve, reject) => {
    pdfDbRequest.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('pdfs')) {
        db.createObjectStore('pdfs');
      }
    };

    pdfDbRequest.onsuccess = (event) => {
      const pdfDb = (event.target as IDBOpenDBRequest).result;
      const tx = pdfDb.transaction('pdfs', 'readwrite');
      const store = tx.objectStore('pdfs');
      store.put(arrayBuffer, key);

      tx.oncomplete = () => {
        pdfDb.close();
        resolve(key);
      };
      tx.onerror = () => {
        pdfDb.close();
        reject(new Error('無法儲存 PDF'));
      };
    };

    pdfDbRequest.onerror = () => reject(new Error('無法開啟 PDF 資料庫'));
  });
}

/**
 * Retrieve a PDF file from IndexedDB as a Blob
 */
export async function getPdfFile(storageKey: string): Promise<Blob | null> {
  const pdfDbRequest = indexedDB.open('OncologyPdfStorage', 1);

  return new Promise((resolve, reject) => {
    pdfDbRequest.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('pdfs')) {
        db.createObjectStore('pdfs');
      }
    };

    pdfDbRequest.onsuccess = (event) => {
      const pdfDb = (event.target as IDBOpenDBRequest).result;
      const tx = pdfDb.transaction('pdfs', 'readonly');
      const store = tx.objectStore('pdfs');
      const request = store.get(storageKey);

      request.onsuccess = () => {
        pdfDb.close();
        if (request.result) {
          resolve(new Blob([request.result], { type: 'application/pdf' }));
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        pdfDb.close();
        reject(new Error('無法讀取 PDF'));
      };
    };

    pdfDbRequest.onerror = () => reject(new Error('無法開啟 PDF 資料庫'));
  });
}

/**
 * Delete a PDF file from IndexedDB
 */
export async function deletePdfFile(storageKey: string): Promise<void> {
  const pdfDbRequest = indexedDB.open('OncologyPdfStorage', 1);

  return new Promise((resolve, reject) => {
    pdfDbRequest.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('pdfs')) {
        db.createObjectStore('pdfs');
      }
    };

    pdfDbRequest.onsuccess = (event) => {
      const pdfDb = (event.target as IDBOpenDBRequest).result;
      const tx = pdfDb.transaction('pdfs', 'readwrite');
      const store = tx.objectStore('pdfs');
      store.delete(storageKey);

      tx.oncomplete = () => {
        pdfDb.close();
        resolve();
      };
      tx.onerror = () => {
        pdfDb.close();
        reject(new Error('無法刪除 PDF'));
      };
    };

    pdfDbRequest.onerror = () => reject(new Error('無法開啟 PDF 資料庫'));
  });
}

/**
 * Open a PDF in a new tab for viewing
 */
export async function openPdfInNewTab(storageKey: string): Promise<void> {
  const blob = await getPdfFile(storageKey);
  if (!blob) {
    throw new Error('找不到 PDF 檔案');
  }
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Don't revoke immediately since the new tab needs it
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { exportBackup, downloadBackup, importBackup, getDatabaseSize } from '@/utils/backup';
import { db } from '@/db/database';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [dbSize, setDbSize] = useState('計算中...');
  const [importing, setImporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    getDatabaseSize().then(setDbSize);
  }, []);

  const handleExport = async () => {
    try {
      const data = await exportBackup();
      downloadBackup(data);
      toast.success('備份已匯出');
    } catch (e: any) {
      toast.error(e.message || '匯出失敗');
    }
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      if (!confirm('匯入備份將覆蓋現有資料，確定繼續？')) return;

      setImporting(true);
      try {
        await importBackup(file);
        toast.success('備份已匯入');
        navigate('/');
        window.location.reload();
      } catch (e: any) {
        toast.error(e.message || '匯入失敗');
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  const handleClearData = async () => {
    try {
      await db.cancerCards.clear();
      await db.documents.clear();
      await db.checklists.clear();
      await db.precisionFields.clear();
      await db.nhiNotes.clear();

      // Clear PDF storage
      const pdfDbRequest = indexedDB.deleteDatabase('OncologyPdfStorage');
      await new Promise<void>((resolve) => {
        pdfDbRequest.onsuccess = () => resolve();
        pdfDbRequest.onerror = () => resolve();
      });

      toast.success('資料已清除');
      setShowClearConfirm(false);
      window.location.reload();
    } catch (e: any) {
      toast.error(e.message || '清除失敗');
    }
  };

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">設定</h1>
      </div>

      {/* Backup & Restore */}
      <div className="card mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">💾 備份與還原</h2>
        <div className="space-y-3">
          <button onClick={handleExport} className="btn-primary w-full">
            匯出備份 JSON
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="btn-secondary w-full"
          >
            {importing ? '匯入中...' : '匯入備份 JSON'}
          </button>
          <p className="text-xs text-gray-400">
            備份包含癌別卡、checklist、精準欄位、健保提醒與 PDF 元資料。PDF 檔案本體不含在備份中。
          </p>
        </div>
      </div>

      {/* Database info */}
      <div className="card mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">📊 資料庫資訊</h2>
        <p className="text-sm text-gray-600">目前使用空間：{dbSize}</p>
      </div>

      {/* Clear data */}
      <div className="card mb-4 border-red-200">
        <h2 className="font-semibold text-red-800 mb-3">⚠️ 清除資料</h2>
        {!showClearConfirm ? (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="btn-danger w-full"
          >
            清除本機所有資料
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-red-700">
              確定要清除所有資料？此操作無法復原！
            </p>
            <div className="flex gap-2">
              <button onClick={handleClearData} className="btn-danger flex-1">
                確定清除
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="btn-secondary flex-1"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {/* About */}
      <div className="card mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">ℹ️ 關於</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p>App 版本：1.0.0</p>
          <p>名稱：腫瘤指引快速查</p>
          <p>用途：個人本機腫瘤指引查閱與防漏工具</p>
        </div>
      </div>

      {/* Usage boundary */}
      <div className="card mb-4 border-amber-200 bg-amber-50">
        <h2 className="font-semibold text-amber-800 mb-3">⚠️ 使用邊界提醒</h2>
        <ul className="space-y-2 text-sm text-amber-700">
          <li>• 本 App 不是院級醫療資訊系統</li>
          <li>• 不串接病人資料、不自動下載指引</li>
          <li>• 不輸出「最終治療建議」</li>
          <li>• 不上傳資料到雲端</li>
          <li>• 本 App 僅供個人查閱參考使用</li>
          <li>• 所有資料儲存於本機瀏覽器中</li>
        </ul>
      </div>

      {/* Dev info */}
      <div className="text-center text-xs text-gray-400 mt-8 mb-4">
        <p>腫瘤指引快速查 v1.0.0</p>
        <p className="mt-1">React + TypeScript + Vite + Dexie.js</p>
      </div>
    </div>
  );
}

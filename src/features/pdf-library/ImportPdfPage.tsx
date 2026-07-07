import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCancerCards, useDocuments } from '@/db/hooks';
import { db } from '@/db/database';
import { storePdfFile } from '@/utils/pdf';
import { v4 as uuid } from 'uuid';
import toast from 'react-hot-toast';

export default function ImportPdfPage() {
  const { docId } = useParams<{ docId?: string }>();
  const cancerCards = useCancerCards();
  const documents = useDocuments();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingDoc = documents.find((d) => d.id === docId);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(existingDoc?.title || '');
  const [source, setSource] = useState(existingDoc?.source || '');
  const [version, setVersion] = useState(existingDoc?.version || '');
  const [selectedCancerIds, setSelectedCancerIds] = useState<string[]>(
    existingDoc?.cancerIds || []
  );
  const [setAsCurrent, setSetAsCurrent] = useState(true);
  const [notes, setNotes] = useState(existingDoc?.notes || '');
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.type !== 'application/pdf') {
        toast.error('請選擇 PDF 檔案');
        return;
      }
      setFile(f);
      if (!title) {
        // Try to extract name from filename
        const name = f.name.replace(/\.pdf$/i, '').replace(/_/g, ' ');
        setTitle(name);
      }
    }
  };

  const toggleCancer = (id: string) => {
    setSelectedCancerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !existingDoc) {
      toast.error('請選擇 PDF 檔案');
      return;
    }
    if (!title.trim()) {
      toast.error('請填寫指引名稱');
      return;
    }

    setSubmitting(true);
    try {
      let storageKey = existingDoc?.storageKey || '';

      if (file) {
        // Delete old file if replacing
        if (existingDoc?.storageKey) {
          const { deletePdfFile } = await import('@/utils/pdf');
          await deletePdfFile(existingDoc.storageKey);
        }
        storageKey = await storePdfFile(file);
      }

      const docData = {
        title: title.trim(),
        source: source.trim(),
        version: version.trim(),
        cancerIds: selectedCancerIds,
        fileName: file?.name || existingDoc?.fileName || '',
        storageKey,
        pageCount: 0,
        importedAt: new Date().toISOString().split('T')[0],
        current: setAsCurrent,
        archived: false,
        notes: notes.trim(),
      };

      if (existingDoc) {
        await db.documents.update(existingDoc.id, docData);
      } else {
        await db.documents.add({ id: uuid(), ...docData });
      }

      // Update cancer card documentIds
      for (const cancerId of selectedCancerIds) {
        const card = await db.cancerCards.get(cancerId);
        if (card) {
          const docIdToUse = existingDoc?.id || docData.id;
          if (!card.documentIds.includes(docIdToUse)) {
            await db.cancerCards.update(cancerId, {
              documentIds: [...card.documentIds, docIdToUse],
              updatedAt: new Date().toISOString().split('T')[0],
            });
          }
        }
      }

      // If set as current, archive others for same cancers
      if (setAsCurrent) {
        for (const cancerId of selectedCancerIds) {
          const related = await db.documents
            .where('cancerIds')
            .equals(cancerId)
            .toArray();
          for (const r of related) {
            if (r.id !== (existingDoc?.id || docData.id) && r.current) {
              await db.documents.update(r.id, { current: false, archived: true });
            }
          }
        }
      }

      toast.success(existingDoc ? '已更新文件' : '已匯入 PDF');
      navigate('/pdf-library');
    } catch (e: any) {
      toast.error(e.message || '匯入失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="mb-6">
        <button onClick={() => navigate('/pdf-library')} className="btn-ghost mb-2 -ml-2">
          ← 返回
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {existingDoc ? '編輯文件' : '匯入 PDF'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* File picker */}
        <div>
          <label className="label-text">選擇 PDF</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary w-full text-left flex items-center gap-3"
          >
            <span className="text-2xl">📄</span>
            <div className="flex-1 min-w-0">
              {file ? (
                <span className="text-sm text-gray-700 truncate block">{file.name}</span>
              ) : (
                <span className="text-sm text-gray-400">點擊選擇 PDF 檔案</span>
              )}
            </div>
          </button>
        </div>

        {/* Title */}
        <div>
          <label className="label-text">指引名稱 *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：NCCN Biliary Tract Cancers"
            className="input-field"
            required
          />
        </div>

        {/* Source */}
        <div>
          <label className="label-text">來源</label>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="例如：NCCN、ESMO、台灣癌症醫學會"
            className="input-field"
          />
        </div>

        {/* Version */}
        <div>
          <label className="label-text">版本</label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="例如：2026.V2"
            className="input-field"
          />
        </div>

        {/* Cancer selection */}
        <div>
          <label className="label-text">對應癌別（可多選）</label>
          <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-xl p-2 space-y-1">
            {cancerCards.map((card) => (
              <label
                key={card.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedCancerIds.includes(card.id)}
                  onChange={() => toggleCancer(card.id)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">{card.zhName}</span>
                <span className="text-xs text-gray-400">{card.enName}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Set as current */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={setAsCurrent}
            onChange={(e) => setSetAsCurrent(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">設為目前版本</span>
        </label>

        {/* Notes */}
        <div>
          <label className="label-text">備註</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="可選填備註..."
            rows={3}
            className="input-field resize-none"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full"
        >
          {submitting ? '處理中...' : existingDoc ? '更新' : '匯入'}
        </button>
      </form>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocuments, useCancerCards } from '@/db/hooks';
import { db } from '@/db/database';
import { openPdfInNewTab, deletePdfFile } from '@/utils/pdf';
import toast from 'react-hot-toast';
import type { GuidelineDocument } from '@/models/types';

export default function PdfLibraryPage() {
  const documents = useDocuments();
  const cancerCards = useCancerCards();
  const navigate = useNavigate();
  const [filterSource, setFilterSource] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const sources = useMemo(() => {
    const set = new Set(documents.map((d) => d.source));
    return Array.from(set).filter(Boolean).sort();
  }, [documents]);

  const filtered = useMemo(() => {
    let docs = documents;
    if (filterSource) {
      docs = docs.filter((d) => d.source === filterSource);
    }
    if (!showArchived) {
      docs = docs.filter((d) => !d.archived);
    }
    return docs.sort((a, b) => {
      if (a.current && !b.current) return -1;
      if (!a.current && b.current) return 1;
      return b.importedAt.localeCompare(a.importedAt);
    });
  }, [documents, filterSource, showArchived]);

  const cancerNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    cancerCards.forEach((c) => {
      map[c.id] = c.zhName;
    });
    return map;
  }, [cancerCards]);

  const handleOpen = async (doc: GuidelineDocument) => {
    try {
      await openPdfInNewTab(doc.storageKey);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleSetCurrent = async (doc: GuidelineDocument) => {
    // Archive other docs for same cancers
    for (const cancerId of doc.cancerIds) {
      const related = await db.documents
        .where('cancerIds')
        .equals(cancerId)
        .toArray();
      for (const r of related) {
        if (r.id !== doc.id && r.current) {
          await db.documents.update(r.id, { current: false, archived: true });
        }
      }
    }
    await db.documents.update(doc.id, { current: true, archived: false });
    toast.success('已設為目前版本');
  };

  const handleArchive = async (doc: GuidelineDocument) => {
    await db.documents.update(doc.id, { archived: true, current: false });
    toast.success('已封存');
  };

  const handleDelete = async (doc: GuidelineDocument) => {
    if (!confirm(`確定刪除「${doc.title} (${doc.version})」？`)) return;
    try {
      await deletePdfFile(doc.storageKey);
      await db.documents.delete(doc.id);
      toast.success('已刪除');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">PDF 文件庫</h1>
        <button
          onClick={() => navigate('/pdf-library/import')}
          className="btn-primary text-sm px-4 py-2"
        >
          + 匯入
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        <button
          onClick={() => setFilterSource('')}
          className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
            !filterSource ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          全部
        </button>
        {sources.map((source) => (
          <button
            key={source}
            onClick={() => setFilterSource(source)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              filterSource === source ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {source}
          </button>
        ))}
      </div>

      {/* Archive toggle */}
      <label className="flex items-center gap-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
          className="rounded border-gray-300"
        />
        <span className="text-sm text-gray-600">顯示封存版本</span>
      </label>

      {/* Document list */}
      {filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">尚無 PDF 文件</p>
          <button
            onClick={() => navigate('/pdf-library/import')}
            className="btn-primary"
          >
            匯入第一份 PDF
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((doc) => (
            <div key={doc.id} className="card">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 truncate">{doc.title}</p>
                    {doc.current && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        目前版本
                      </span>
                    )}
                    {doc.archived && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        已封存
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {doc.source} · {doc.version}
                  </p>
                </div>
              </div>

              {/* Cancer tags */}
              {doc.cancerIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {doc.cancerIds.map((cid) => (
                    <span key={cid} className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded">
                      {cancerNameMap[cid] || cid}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleOpen(doc)}
                  className="btn-ghost text-sm flex-1"
                >
                  開啟
                </button>
                {!doc.current && !doc.archived && (
                  <button
                    onClick={() => handleSetCurrent(doc)}
                    className="btn-ghost text-sm text-green-600"
                  >
                    設為目前
                  </button>
                )}
                {!doc.archived && (
                  <button
                    onClick={() => handleArchive(doc)}
                    className="btn-ghost text-sm text-gray-500"
                  >
                    封存
                  </button>
                )}
                <button
                  onClick={() => handleDelete(doc)}
                  className="btn-ghost text-sm text-red-500"
                >
                  刪除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

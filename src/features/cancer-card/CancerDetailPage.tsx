import { useParams, useNavigate } from 'react-router-dom';
import { useCancerCard, useDocumentsForCancer, useChecklists, useNhiNotes } from '@/db/hooks';
import { db } from '@/db/database';
import { openPdfInNewTab } from '@/utils/pdf';
import toast from 'react-hot-toast';

export default function CancerDetailPage() {
  const { cancerId } = useParams<{ cancerId: string }>();
  const card = useCancerCard(cancerId);
  const documents = useDocumentsForCancer(cancerId);
  const checklists = useChecklists(cancerId);
  const nhiNotes = useNhiNotes(cancerId);
  const navigate = useNavigate();

  if (!card) {
    return (
      <div className="page-container">
        <div className="card text-center py-12">
          <p className="text-gray-500">找不到此癌別</p>
          <button onClick={() => navigate('/')} className="btn-primary mt-4">
            返回搜尋
          </button>
        </div>
      </div>
    );
  }

  // Update last used
  if (cancerId) {
    db.cancerCards.update(cancerId, { lastUsedAt: new Date().toISOString() });
  }

  const currentDocs = documents.filter((d) => d.current && !d.archived);
  const archivedDocs = documents.filter((d) => d.archived);

  const statusColor =
    card.reviewStatus === '已維護'
      ? 'bg-green-100 text-green-700 border-green-200'
      : card.reviewStatus === '部分維護'
      ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
      : 'bg-gray-100 text-gray-500 border-gray-200';

  const handleOpenPdf = async (storageKey: string) => {
    try {
      await openPdfInNewTab(storageKey);
    } catch (e: any) {
      toast.error(e.message || '無法開啟 PDF');
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => navigate('/')} className="btn-ghost mb-2 -ml-2">
          ← 返回
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{card.zhName}</h1>
            <p className="text-sm text-gray-500">{card.enName}</p>
            {card.synonyms.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                同義詞：{card.synonyms.join('、')}
              </p>
            )}
          </div>
          <span className={`text-xs px-3 py-1 rounded-full border ${statusColor}`}>
            {card.reviewStatus}
          </span>
        </div>
      </div>

      {/* Quick Reference Button */}
      <button
        onClick={() => navigate(`/cancer/${cancerId}/quickref`)}
        className="btn-primary w-full mb-4"
      >
        📋 快速參考
      </button>

      {/* Guideline Documents */}
      <div className="card mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">📄 應查指引</h2>
        {card.primaryGuideline ? (
          <p className="text-sm text-gray-700 mb-2">{card.primaryGuideline}</p>
        ) : (
          <p className="text-sm text-gray-400 mb-2">尚未設定主要指引</p>
        )}
        {card.secondaryGuidelines.length > 0 && (
          <div className="text-sm text-gray-500">
            <p className="mb-1">其他指引：</p>
            <ul className="list-disc list-inside space-y-1">
              {card.secondaryGuidelines.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-700 mb-2">本機 PDF：</p>
          {currentDocs.length === 0 ? (
            <p className="text-sm text-gray-400">尚未匯入</p>
          ) : (
            <div className="space-y-2">
              {currentDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between bg-green-50 rounded-lg p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-800 truncate">{doc.title}</p>
                    <p className="text-xs text-green-600">
                      {doc.source} · {doc.version}
                    </p>
                  </div>
                  <button
                    onClick={() => handleOpenPdf(doc.storageKey)}
                    className="btn-ghost text-green-700 text-sm ml-2 shrink-0"
                  >
                    開啟
                  </button>
                </div>
              ))}
            </div>
          )}
          {archivedDocs.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-gray-400 cursor-pointer">
                封存版本 ({archivedDocs.length})
              </summary>
              <div className="space-y-1 mt-2">
                {archivedDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-500 truncate">{doc.title} ({doc.version})</p>
                    <button
                      onClick={() => handleOpenPdf(doc.storageKey)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      開啟
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      {/* Must Read Sections */}
      <div className="card mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">📖 必查章節</h2>
        {card.mustReadSections.length === 0 ? (
          <p className="text-sm text-gray-400">尚未設定章節清單</p>
        ) : (
          <ul className="space-y-2">
            {card.mustReadSections.map((section, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-primary-500 mt-0.5">•</span>
                <span className="text-sm text-gray-700">{section}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Checklist */}
      <div className="card mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">✅ 不要漏</h2>
        {checklists.length === 0 ? (
          <p className="text-sm text-gray-400">尚未建立 checklist</p>
        ) : (
          <div className="space-y-2">
            {checklists.map((item) => (
              <div key={item.id} className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">⚠</span>
                <div>
                  <p className="text-sm text-gray-700">{item.label}</p>
                  <p className="text-xs text-gray-400">
                    {item.category} · {item.importance}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NHI Notes */}
      <div className="card mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">🏥 健保提醒</h2>
        {nhiNotes.length === 0 ? (
          <p className="text-sm text-gray-400">尚未設定健保提醒</p>
        ) : (
          <div className="space-y-2">
            {nhiNotes.map((note) => (
              <div key={note.id} className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm font-medium text-blue-800">{note.label}</p>
                <p className="text-sm text-blue-700 mt-1">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 mt-6">
        <button
          onClick={() => navigate(`/cancer/${cancerId}/edit`)}
          className="btn-secondary w-full"
        >
          ✏️ 編輯此癌別
        </button>
        <button
          onClick={() => navigate(`/cancer/${cancerId}/checklist`)}
          className="btn-ghost w-full"
        >
          編輯 Checklist
        </button>
        <button
          onClick={() => navigate(`/cancer/${cancerId}/precision`)}
          className="btn-ghost w-full"
        >
          編輯精準欄位
        </button>
        <button
          onClick={() => navigate(`/cancer/${cancerId}/nhi`)}
          className="btn-ghost w-full"
        >
          編輯健保提醒
        </button>
      </div>
    </div>
  );
}

import { useParams, useNavigate } from 'react-router-dom';
import { useCancerCard, useDocumentsForCancer, useChecklists, usePrecisionFields, useNhiNotes } from '@/db/hooks';
import { openPdfInNewTab } from '@/utils/pdf';
import toast from 'react-hot-toast';

export default function QuickReferencePage() {
  const { cancerId } = useParams<{ cancerId: string }>();
  const card = useCancerCard(cancerId);
  const documents = useDocumentsForCancer(cancerId);
  const checklists = useChecklists(cancerId);
  const precisionFields = usePrecisionFields(cancerId);
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

  const currentDocs = documents.filter((d) => d.current && !d.archived);
  const hasDocs = currentDocs.length > 0;
  const isEmpty = card.reviewStatus === '待維護';

  const handleOpenPdf = async (storageKey: string) => {
    try {
      await openPdfInNewTab(storageKey);
    } catch (e: any) {
      toast.error(e.message || '無法開啟 PDF');
    }
  };

  // Determine what's missing
  const missingItems: string[] = [];
  if (!card.primaryGuideline) missingItems.push('尚未設定主要指引');
  if (card.mustReadSections.length === 0) missingItems.push('尚未設定必查章節');
  if (checklists.length === 0) missingItems.push('尚未建立 checklist');
  if (precisionFields.length === 0) missingItems.push('尚未設定精準化欄位');

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => navigate(`/cancer/${cancerId}`)} className="btn-ghost mb-2 -ml-2">
          ← 返回
        </button>
        <h1 className="text-2xl font-bold text-gray-900">快速參考</h1>
        <p className="text-sm text-gray-500">{card.zhName} · {card.enName}</p>
      </div>

      {isEmpty && (
        <div className="card mb-4 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            ⚠️ 此癌別資料待維護，以下資訊可能不完整
          </p>
        </div>
      )}

      {/* 應查指引 */}
      <div className="card mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">📄 應查指引</h2>
        {card.primaryGuideline ? (
          <div>
            <p className="text-sm text-gray-700 mb-1">{card.primaryGuideline}</p>
            {card.secondaryGuidelines.length > 0 && (
              <div className="text-sm text-gray-500">
                {card.secondaryGuidelines.map((g, i) => (
                  <p key={i}>{g}</p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">尚未設定</p>
        )}
      </div>

      {/* 本機 PDF 狀態 */}
      <div className="card mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">💾 本機 PDF 狀態</h2>
        {hasDocs ? (
          <div className="space-y-2">
            {currentDocs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between bg-green-50 rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium text-green-800">
                    ✅ 已匯入 {doc.version}
                  </p>
                  <p className="text-xs text-green-600">{doc.title}</p>
                </div>
                <button
                  onClick={() => handleOpenPdf(doc.storageKey)}
                  className="text-sm text-green-700 font-medium hover:underline"
                >
                  一鍵開啟
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-500">❌ 尚未匯入</p>
            <button
              onClick={() => navigate('/pdf-library/import')}
              className="text-sm text-primary-600 mt-1 hover:underline"
            >
              前往匯入 →
            </button>
          </div>
        )}
      </div>

      {/* 必查章節 */}
      <div className="card mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">📖 必查章節</h2>
        {card.mustReadSections.length > 0 ? (
          <ul className="space-y-2">
            {card.mustReadSections.map((section, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-primary-500 mt-0.5">•</span>
                <span className="text-sm text-gray-700">{section}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">尚未設定</p>
        )}
      </div>

      {/* 不要漏 */}
      <div className="card mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">✅ 不要漏</h2>
        {checklists.length > 0 ? (
          <div className="space-y-2">
            {checklists.map((item) => (
              <div key={item.id} className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">⚠</span>
                <span className="text-sm text-gray-700">{item.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">尚未建立</p>
        )}
      </div>

      {/* 健保提醒 */}
      {nhiNotes.length > 0 && (
        <div className="card mb-4">
          <h2 className="font-semibold text-gray-800 mb-3">🏥 健保提醒</h2>
          <div className="space-y-2">
            {nhiNotes.map((note) => (
              <div key={note.id} className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-blue-800">{note.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 目前資訊不足 */}
      {missingItems.length > 0 && (
        <div className="card mb-4 border-orange-200 bg-orange-50">
          <h2 className="font-semibold text-orange-800 mb-3">⚠️ 目前資訊不足</h2>
          <ul className="space-y-1">
            {missingItems.map((item, i) => (
              <li key={i} className="text-sm text-orange-700 flex items-start gap-2">
                <span>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 下一步 */}
      <div className="card mb-4 border-primary-200 bg-primary-50">
        <h2 className="font-semibold text-primary-800 mb-3">👉 下一步</h2>
        <ul className="space-y-2">
          {hasDocs ? (
            <li className="text-sm text-primary-700">
              ✅ 已有本機指引，可直接開啟查閱
            </li>
          ) : (
            <li className="text-sm text-primary-700">
              • 先匯入本機 PDF 指引
            </li>
          )}
          {card.mustReadSections.length > 0 && (
            <li className="text-sm text-primary-700">
              • 依必查章節逐項確認
            </li>
          )}
          {precisionFields.length > 0 && (
            <li className="text-sm text-primary-700">
              • 若要更精準，補充精準化欄位資訊
            </li>
          )}
          {checklists.length > 0 && (
            <li className="text-sm text-primary-700">
              • 依不要漏 checklist 逐項確認
            </li>
          )}
          {!hasDocs && card.mustReadSections.length === 0 && (
            <li className="text-sm text-primary-700">
              • 編輯此癌別，補充指引資訊與必查章節
            </li>
          )}
        </ul>
      </div>

      {/* 來源與版本 */}
      <div className="text-xs text-gray-400 text-center mt-4 mb-8">
        <p>來源：{card.primaryGuideline || '待維護'}</p>
        <p>更新日期：{card.updatedAt}</p>
        <p className="mt-2">此為快速參考，非最終治療建議</p>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCancerCards } from '@/db/hooks';
import { searchCancerCards } from '@/utils/search';
import type { CancerRouteCard } from '@/models/types';

export default function HomePage() {
  const [query, setQuery] = useState('');
  const cancerCards = useCancerCards();
  const navigate = useNavigate();

  const filteredCards = useMemo(
    () => searchCancerCards(cancerCards, query),
    [cancerCards, query]
  );

  const pendingCount = cancerCards.filter((c) => c.reviewStatus === '待維護').length;

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, CancerRouteCard[]> = {};
    filteredCards.forEach((card) => {
      if (!groups[card.category]) groups[card.category] = [];
      groups[card.category].push(card);
    });
    return groups;
  }, [filteredCards]);

  const categories = Object.keys(grouped);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">腫瘤指引快速查</h1>
        <p className="text-sm text-gray-500 mt-1">個人本機指引查閱與防漏工具</p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
            🔍
          </span>
          <input
            type="text"
            placeholder="搜尋癌別、英文名或同義詞..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-field pl-12"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      {pendingCount > 0 && (
        <div className="card mb-4 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            ⚠️ 有 <strong>{pendingCount}</strong> 個癌別待維護
          </p>
        </div>
      )}

      {/* Results */}
      {query.trim() ? (
        <div>
          <p className="text-sm text-gray-500 mb-3">
            找到 {filteredCards.length} 個結果
          </p>
          {filteredCards.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-500">找不到符合的癌別</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCards.map((card) => (
                <CancerCardItem key={card.id} card={card} onClick={() => navigate(`/cancer/${card.id}`)} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Quick links */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => navigate('/pdf-library')}
              className="card flex flex-col items-center justify-center py-6 hover:bg-gray-50 transition-colors"
            >
              <span className="text-3xl mb-2">📄</span>
              <span className="text-sm font-medium text-gray-700">PDF 文件庫</span>
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="card flex flex-col items-center justify-center py-6 hover:bg-gray-50 transition-colors"
            >
              <span className="text-3xl mb-2">⚙️</span>
              <span className="text-sm font-medium text-gray-700">設定</span>
            </button>
          </div>

          {/* Category list */}
          {categories.map((category) => (
            <div key={category} className="mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
                {category}
              </h2>
              <div className="space-y-2">
                {grouped[category].map((card) => (
                  <CancerCardItem key={card.id} card={card} onClick={() => navigate(`/cancer/${card.id}`)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CancerCardItem({ card, onClick }: { card: CancerRouteCard; onClick: () => void }) {
  const statusColor =
    card.reviewStatus === '已維護'
      ? 'bg-green-100 text-green-700'
      : card.reviewStatus === '部分維護'
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-gray-100 text-gray-500';

  const hasDocs = card.documentIds.length > 0;

  return (
    <button
      onClick={onClick}
      className="card w-full text-left flex items-center justify-between hover:bg-gray-50 transition-colors active:scale-[0.98]"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-gray-900 truncate">{card.zhName}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor}`}>
            {card.reviewStatus}
          </span>
        </div>
        <p className="text-xs text-gray-400 truncate">{card.enName}</p>
      </div>
      <div className="flex items-center gap-2 ml-3">
        {hasDocs && <span className="text-green-500 text-sm">✓ PDF</span>}
        <span className="text-gray-300">›</span>
      </div>
    </button>
  );
}

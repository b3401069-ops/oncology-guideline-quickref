import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCancerCard } from '@/db/hooks';
import { db } from '@/db/database';
import toast from 'react-hot-toast';

export default function EditCancerPage() {
  const { cancerId } = useParams<{ cancerId: string }>();
  const card = useCancerCard(cancerId);
  const navigate = useNavigate();

  const [zhName, setZhName] = useState('');
  const [enName, setEnName] = useState('');
  const [synonyms, setSynonyms] = useState('');
  const [primaryGuideline, setPrimaryGuideline] = useState('');
  const [secondaryGuidelines, setSecondaryGuidelines] = useState('');
  const [mustReadSections, setMustReadSections] = useState('');
  const [externalLinks, setExternalLinks] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'已維護' | '待維護' | '部分維護'>('待維護');

  useEffect(() => {
    if (card) {
      setZhName(card.zhName);
      setEnName(card.enName);
      setSynonyms(card.synonyms.join('、'));
      setPrimaryGuideline(card.primaryGuideline);
      setSecondaryGuidelines(card.secondaryGuidelines.join('\n'));
      setMustReadSections(card.mustReadSections.join('\n'));
      setExternalLinks(
        card.externalLinks.map((l) => `${l.label}|${l.url}`).join('\n')
      );
      setReviewStatus(card.reviewStatus);
    }
  }, [card]);

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

  const handleSave = async () => {
    try {
      const externalLinksParsed = externalLinks
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => {
          const [label, url] = l.split('|');
          return { label: label?.trim() || '', url: url?.trim() || '' };
        })
        .filter((l) => l.label && l.url);

      await db.cancerCards.update(cancerId!, {
        zhName: zhName.trim(),
        enName: enName.trim(),
        synonyms: synonyms
          .split(/[、,]/)
          .map((s) => s.trim())
          .filter(Boolean),
        primaryGuideline: primaryGuideline.trim(),
        secondaryGuidelines: secondaryGuidelines
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        mustReadSections: mustReadSections
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        externalLinks: externalLinksParsed,
        reviewStatus,
        updatedAt: new Date().toISOString().split('T')[0],
      });

      toast.success('已儲存');
      navigate(`/cancer/${cancerId}`);
    } catch (e: any) {
      toast.error(e.message || '儲存失敗');
    }
  };

  return (
    <div className="page-container">
      <div className="mb-6">
        <button onClick={() => navigate(`/cancer/${cancerId}`)} className="btn-ghost mb-2 -ml-2">
          ← 返回
        </button>
        <h1 className="text-2xl font-bold text-gray-900">編輯癌別</h1>
        <p className="text-sm text-gray-500">{card.zhName}</p>
      </div>

      <div className="space-y-5">
        {/* Basic info */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-3">基本資料</h2>
          <div className="space-y-4">
            <div>
              <label className="label-text">中文名稱</label>
              <input
                type="text"
                value={zhName}
                onChange={(e) => setZhName(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-text">英文名稱</label>
              <input
                type="text"
                value={enName}
                onChange={(e) => setEnName(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-text">同義詞（用「、」分隔）</label>
              <input
                type="text"
                value={synonyms}
                onChange={(e) => setSynonyms(e.target.value)}
                placeholder="例如：cholangiocarcinoma、gallbladder cancer"
                className="input-field"
              />
            </div>
            <div>
              <label className="label-text">審核狀態</label>
              <select
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value as any)}
                className="input-field"
              >
                <option value="待維護">待維護</option>
                <option value="部分維護">部分維護</option>
                <option value="已維護">已維護</option>
              </select>
            </div>
          </div>
        </div>

        {/* Guidelines */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-3">指引路由</h2>
          <div className="space-y-4">
            <div>
              <label className="label-text">主要指引</label>
              <input
                type="text"
                value={primaryGuideline}
                onChange={(e) => setPrimaryGuideline(e.target.value)}
                placeholder="例如：NCCN Biliary Tract Cancers"
                className="input-field"
              />
            </div>
            <div>
              <label className="label-text">其他指引（每行一筆）</label>
              <textarea
                value={secondaryGuidelines}
                onChange={(e) => setSecondaryGuidelines(e.target.value)}
                placeholder="ESMO biliary tract cancer guidance"
                rows={3}
                className="input-field resize-none"
              />
            </div>
          </div>
        </div>

        {/* Must read sections */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-3">必查章節（每行一筆）</h2>
          <textarea
            value={mustReadSections}
            onChange={(e) => setMustReadSections(e.target.value)}
            placeholder={'初始評估\n分期與可切除性\n生物標記\n不可切除或轉移性疾病治療'}
            rows={6}
            className="input-field resize-none"
          />
        </div>

        {/* External links */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-3">外部連結</h2>
          <textarea
            value={externalLinks}
            onChange={(e) => setExternalLinks(e.target.value)}
            placeholder={'NCCN指南|https://www.nccn.org\nESMO指南|https://www.esmo.org'}
            rows={4}
            className="input-field resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">格式：標題|網址，每行一筆</p>
        </div>

        {/* Save */}
        <button onClick={handleSave} className="btn-primary w-full">
          儲存
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCancerCard, useChecklists } from '@/db/hooks';
import { db } from '@/db/database';
import { v4 as uuid } from 'uuid';
import toast from 'react-hot-toast';
import type { ChecklistItem } from '@/models/types';

export default function ChecklistEditPage() {
  const { cancerId } = useParams<{ cancerId: string }>();
  const card = useCancerCard(cancerId);
  const checklists = useChecklists(cancerId);
  const navigate = useNavigate();

  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null);
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('檢測');
  const [importance, setImportance] = useState<'必查' | '建議' | '參考'>('必查');

  if (!card) {
    return (
      <div className="page-container">
        <div className="card text-center py-12">
          <p className="text-gray-500">找不到此癌別</p>
          <button onClick={() => navigate('/')} className="btn-primary mt-4">返回搜尋</button>
        </div>
      </div>
    );
  }

  const resetForm = () => {
    setLabel('');
    setCategory('檢測');
    setImportance('必查');
    setEditItem(null);
    setShowAdd(false);
  };

  const handleSave = async () => {
    if (!label.trim()) {
      toast.error('請填寫項目名稱');
      return;
    }

    const data = {
      cancerId: cancerId!,
      label: label.trim(),
      category,
      importance,
      sourceType: '個人備註' as const,
      sourceDocumentId: '',
      updatedAt: new Date().toISOString().split('T')[0],
    };

    try {
      if (editItem) {
        await db.checklists.update(editItem.id, data);
        toast.success('已更新');
      } else {
        await db.checklists.add({ id: uuid(), ...data });
        toast.success('已新增');
      }
      resetForm();
    } catch (e: any) {
      toast.error(e.message || '儲存失敗');
    }
  };

  const handleEdit = (item: ChecklistItem) => {
    setEditItem(item);
    setLabel(item.label);
    setCategory(item.category);
    setImportance(item.importance);
    setShowAdd(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除此項目？')) return;
    await db.checklists.delete(id);
    toast.success('已刪除');
  };

  return (
    <div className="page-container">
      <div className="mb-6">
        <button onClick={() => navigate(`/cancer/${cancerId}`)} className="btn-ghost mb-2 -ml-2">
          ← 返回
        </button>
        <h1 className="text-2xl font-bold text-gray-900">不要漏 Checklist</h1>
        <p className="text-sm text-gray-500">{card.zhName}</p>
      </div>

      {/* Add button */}
      {!showAdd && (
        <button onClick={() => setShowAdd(true)} className="btn-primary w-full mb-4">
          + 新增項目
        </button>
      )}

      {/* Add/Edit form */}
      {showAdd && (
        <div className="card mb-4">
          <h2 className="font-semibold text-gray-800 mb-3">
            {editItem ? '編輯項目' : '新增項目'}
          </h2>
          <div className="space-y-3">
            <div>
              <label className="label-text">項目名稱</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例如：確認生物標記狀態"
                className="input-field"
              />
            </div>
            <div>
              <label className="label-text">分類</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input-field"
              >
                <option value="檢測">檢測</option>
                <option value="評估">評估</option>
                <option value="處置">處置</option>
                <option value="確認">確認</option>
                <option value="其他">其他</option>
              </select>
            </div>
            <div>
              <label className="label-text">重要性</label>
              <select
                value={importance}
                onChange={(e) => setImportance(e.target.value as any)}
                className="input-field"
              >
                <option value="必查">必查</option>
                <option value="建議">建議</option>
                <option value="參考">參考</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} className="btn-primary flex-1">
                儲存
              </button>
              <button onClick={resetForm} className="btn-secondary flex-1">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {checklists.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-400">尚未新增任何項目</p>
        </div>
      ) : (
        <div className="space-y-2">
          {checklists.map((item) => (
            <div key={item.id} className="card flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="font-medium text-gray-900">{item.label}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {item.category}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      item.importance === '必查'
                        ? 'bg-red-100 text-red-700'
                        : item.importance === '建議'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {item.importance}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleEdit(item)}
                  className="btn-ghost text-sm px-2"
                >
                  編輯
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="btn-ghost text-sm text-red-500 px-2"
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

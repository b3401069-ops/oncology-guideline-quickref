import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCancerCard, usePrecisionFields } from '@/db/hooks';
import { db } from '@/db/database';
import { v4 as uuid } from 'uuid';
import toast from 'react-hot-toast';
import type { PrecisionField } from '@/models/types';

export default function PrecisionFieldEditPage() {
  const { cancerId } = useParams<{ cancerId: string }>();
  const card = useCancerCard(cancerId);
  const precisionFields = usePrecisionFields(cancerId);
  const navigate = useNavigate();

  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<PrecisionField | null>(null);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<'single_select' | 'multi_select' | 'text' | 'number'>('single_select');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);

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
    setType('single_select');
    setOptions('');
    setRequired(false);
    setEditItem(null);
    setShowAdd(false);
  };

  const handleSave = async () => {
    if (!label.trim()) {
      toast.error('請填寫欄位名稱');
      return;
    }

    const optionsList = options
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean);

    const data = {
      cancerId: cancerId!,
      label: label.trim(),
      type,
      required,
      options: type === 'text' || type === 'number' ? [] : optionsList,
    };

    try {
      if (editItem) {
        await db.precisionFields.update(editItem.id, data);
        toast.success('已更新');
      } else {
        await db.precisionFields.add({ id: uuid(), ...data });
        toast.success('已新增');
      }
      resetForm();
    } catch (e: any) {
      toast.error(e.message || '儲存失敗');
    }
  };

  const handleEdit = (item: PrecisionField) => {
    setEditItem(item);
    setLabel(item.label);
    setType(item.type);
    setOptions(item.options.join('\n'));
    setRequired(item.required);
    setShowAdd(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除此欄位？')) return;
    await db.precisionFields.delete(id);
    toast.success('已刪除');
  };

  return (
    <div className="page-container">
      <div className="mb-6">
        <button onClick={() => navigate(`/cancer/${cancerId}`)} className="btn-ghost mb-2 -ml-2">
          ← 返回
        </button>
        <h1 className="text-2xl font-bold text-gray-900">精準化欄位</h1>
        <p className="text-sm text-gray-500">{card.zhName}</p>
      </div>

      {/* Add button */}
      {!showAdd && (
        <button onClick={() => setShowAdd(true)} className="btn-primary w-full mb-4">
          + 新增欄位
        </button>
      )}

      {/* Add/Edit form */}
      {showAdd && (
        <div className="card mb-4">
          <h2 className="font-semibold text-gray-800 mb-3">
            {editItem ? '編輯欄位' : '新增欄位'}
          </h2>
          <div className="space-y-3">
            <div>
              <label className="label-text">欄位名稱</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例如：疾病狀態"
                className="input-field"
              />
            </div>
            <div>
              <label className="label-text">欄位類型</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="input-field"
              >
                <option value="single_select">單選</option>
                <option value="multi_select">多選</option>
                <option value="text">文字</option>
                <option value="number">數字</option>
              </select>
            </div>
            {(type === 'single_select' || type === 'multi_select') && (
              <div>
                <label className="label-text">選項（每行一筆）</label>
                <textarea
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                  placeholder={'新診斷\n復發\n轉移\n不可切除\n不確定'}
                  rows={5}
                  className="input-field resize-none"
                />
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">必填</span>
            </label>
            <p className="text-xs text-gray-400">
              所有欄位皆可留白，留白時不阻擋快速參考輸出
            </p>
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
      {precisionFields.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-400">尚未新增任何欄位</p>
        </div>
      ) : (
        <div className="space-y-2">
          {precisionFields.map((item) => (
            <div key={item.id} className="card flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="font-medium text-gray-900">{item.label}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                    {item.type === 'single_select'
                      ? '單選'
                      : item.type === 'multi_select'
                      ? '多選'
                      : item.type === 'text'
                      ? '文字'
                      : '數字'}
                  </span>
                  {item.required && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                      必填
                    </span>
                  )}
                </div>
                {item.options.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    選項：{item.options.join('、')}
                  </p>
                )}
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

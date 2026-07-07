import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCancerCard, useNhiNotes } from '@/db/hooks';
import { db } from '@/db/database';
import { v4 as uuid } from 'uuid';
import toast from 'react-hot-toast';
import type { NhiNote } from '@/models/types';

export default function NhiNoteEditPage() {
  const { cancerId } = useParams<{ cancerId: string }>();
  const card = useCancerCard(cancerId);
  const nhiNotes = useNhiNotes(cancerId);
  const navigate = useNavigate();

  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<NhiNote | null>(null);
  const [label, setLabel] = useState('');
  const [content, setContent] = useState('');

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
    setContent('');
    setEditItem(null);
    setShowAdd(false);
  };

  const handleSave = async () => {
    if (!label.trim() || !content.trim()) {
      toast.error('請填寫完整資訊');
      return;
    }

    const data = {
      cancerId: cancerId!,
      label: label.trim(),
      content: content.trim(),
      sourceDocumentId: '',
      updatedAt: new Date().toISOString().split('T')[0],
    };

    try {
      if (editItem) {
        await db.nhiNotes.update(editItem.id, data);
        toast.success('已更新');
      } else {
        await db.nhiNotes.add({ id: uuid(), ...data });
        toast.success('已新增');
      }
      resetForm();
    } catch (e: any) {
      toast.error(e.message || '儲存失敗');
    }
  };

  const handleEdit = (item: NhiNote) => {
    setEditItem(item);
    setLabel(item.label);
    setContent(item.content);
    setShowAdd(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除此提醒？')) return;
    await db.nhiNotes.delete(id);
    toast.success('已刪除');
  };

  return (
    <div className="page-container">
      <div className="mb-6">
        <button onClick={() => navigate(`/cancer/${cancerId}`)} className="btn-ghost mb-2 -ml-2">
          ← 返回
        </button>
        <h1 className="text-2xl font-bold text-gray-900">健保提醒</h1>
        <p className="text-sm text-gray-500">{card.zhName}</p>
      </div>

      {/* Add button */}
      {!showAdd && (
        <button onClick={() => setShowAdd(true)} className="btn-primary w-full mb-4">
          + 新增提醒
        </button>
      )}

      {/* Add/Edit form */}
      {showAdd && (
        <div className="card mb-4">
          <h2 className="font-semibold text-gray-800 mb-3">
            {editItem ? '編輯提醒' : '新增提醒'}
          </h2>
          <div className="space-y-3">
            <div>
              <label className="label-text">提醒標題</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例如：健保可近性提醒"
                className="input-field"
              />
            </div>
            <div>
              <label className="label-text">提醒內容</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="例如：需查健保癌藥給付規定"
                rows={4}
                className="input-field resize-none"
              />
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
      {nhiNotes.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-400">尚未新增任何提醒</p>
        </div>
      ) : (
        <div className="space-y-2">
          {nhiNotes.map((item) => (
            <div key={item.id} className="card flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="font-medium text-gray-900">{item.label}</p>
                <p className="text-sm text-gray-600 mt-1">{item.content}</p>
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

import { db } from '@/db/database';

export interface BackupData {
  version: 1;
  exportedAt: string;
  cancerCards: any[];
  documents: any[];
  checklists: any[];
  precisionFields: any[];
  nhiNotes: any[];
}

export async function exportBackup(): Promise<BackupData> {
  const [cancerCards, documents, checklists, precisionFields, nhiNotes] = await Promise.all([
    db.cancerCards.toArray(),
    db.documents.toArray(),
    db.checklists.toArray(),
    db.precisionFields.toArray(),
    db.nhiNotes.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    cancerCards,
    documents: documents.map((d) => {
      // Exclude the actual PDF blob from the backup
      const { storageKey, ...rest } = d as any;
      return { ...rest, storageKey: null };
    }),
    checklists,
    precisionFields,
    nhiNotes,
  };
}

export function downloadBackup(data: BackupData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `oncology-guideline-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importBackup(file: File): Promise<void> {
  const text = await file.text();
  const data: BackupData = JSON.parse(text);

  if (data.version !== 1) {
    throw new Error('備份格式不相容');
  }

  await db.transaction(
    'rw',
    [db.cancerCards, db.documents, db.checklists, db.precisionFields, db.nhiNotes],
    async () => {
      // Clear existing data
      await db.cancerCards.clear();
      await db.documents.clear();
      await db.checklists.clear();
      await db.precisionFields.clear();
      await db.nhiNotes.clear();

      // Import data
      if (data.cancerCards?.length) await db.cancerCards.bulkAdd(data.cancerCards);
      if (data.documents?.length) await db.documents.bulkAdd(data.documents);
      if (data.checklists?.length) await db.checklists.bulkAdd(data.checklists);
      if (data.precisionFields?.length) await db.precisionFields.bulkAdd(data.precisionFields);
      if (data.nhiNotes?.length) await db.nhiNotes.bulkAdd(data.nhiNotes);
    }
  );
}

export async function getDatabaseSize(): Promise<string> {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    const usageMB = ((estimate.usage || 0) / 1024 / 1024).toFixed(2);
    return `${usageMB} MB`;
  }
  return '無法計算';
}

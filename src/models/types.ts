/** 癌別路由卡 */
export interface CancerRouteCard {
  id: string;
  category: string;
  zhName: string;
  enName: string;
  synonyms: string[];
  primaryGuideline: string;
  secondaryGuidelines: string[];
  documentIds: string[];
  mustReadSections: string[];
  checklistIds: string[];
  precisionFieldIds: string[];
  nhiNoteIds: string[];
  externalLinks: { label: string; url: string }[];
  reviewStatus: '已維護' | '待維護' | '部分維護';
  lastUsedAt?: string;
  updatedAt: string;
}

/** 指引文件 */
export interface GuidelineDocument {
  id: string;
  title: string;
  source: string;
  version: string;
  cancerIds: string[];
  fileName: string;
  storageKey: string;
  pageCount: number;
  importedAt: string;
  current: boolean;
  archived: boolean;
  notes: string;
}

/** Checklist 項目 */
export interface ChecklistItem {
  id: string;
  cancerId: string;
  category: string;
  label: string;
  importance: '必查' | '建議' | '參考';
  sourceType: '本機指引' | '健保資料' | '個人備註';
  sourceDocumentId: string;
  updatedAt: string;
}

/** 精準化欄位 */
export interface PrecisionField {
  id: string;
  cancerId: string;
  label: string;
  type: 'single_select' | 'multi_select' | 'text' | 'number';
  required: boolean;
  options: string[];
}

/** 健保提醒 */
export interface NhiNote {
  id: string;
  cancerId: string;
  label: string;
  content: string;
  sourceDocumentId: string;
  updatedAt: string;
}

/** 精準化欄位值 */
export interface PrecisionFieldValue {
  fieldId: string;
  value: string | string[];
}

/** 使用者設定 */
export interface AppSettings {
  lastBackupAt?: string;
  showDevTools: boolean;
}

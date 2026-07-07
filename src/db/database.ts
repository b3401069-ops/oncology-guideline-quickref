import Dexie, { type EntityTable } from 'dexie';
import type {
  CancerRouteCard,
  GuidelineDocument,
  ChecklistItem,
  PrecisionField,
  NhiNote,
} from '@/models/types';

const db = new Dexie('OncologyGuidelineDB') as Dexie & {
  cancerCards: EntityTable<CancerRouteCard, 'id'>;
  documents: EntityTable<GuidelineDocument, 'id'>;
  checklists: EntityTable<ChecklistItem, 'id'>;
  precisionFields: EntityTable<PrecisionField, 'id'>;
  nhiNotes: EntityTable<NhiNote, 'id'>;
};

db.version(1).stores({
  cancerCards: 'id, category, zhName, enName, reviewStatus, *synonyms',
  documents: 'id, title, source, *cancerIds, current, archived',
  checklists: 'id, cancerId, category, importance',
  precisionFields: 'id, cancerId, type',
  nhiNotes: 'id, cancerId',
});

export { db };

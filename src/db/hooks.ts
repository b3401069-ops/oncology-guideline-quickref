import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './database';
import type { CancerRouteCard, GuidelineDocument, ChecklistItem, PrecisionField, NhiNote } from '@/models/types';

export function useCancerCards() {
  return useLiveQuery(() => db.cancerCards.toArray()) ?? [];
}

export function useCancerCard(id: string | undefined) {
  return useLiveQuery(() => (id ? db.cancerCards.get(id) : undefined), [id]);
}

export function useDocuments() {
  return useLiveQuery(() => db.documents.toArray()) ?? [];
}

export function useDocumentsForCancer(cancerId: string | undefined) {
  return useLiveQuery(
    () => (cancerId ? db.documents.where('cancerIds').equals(cancerId).toArray() : []),
    [cancerId]
  ) ?? [];
}

export function useChecklists(cancerId: string | undefined) {
  return useLiveQuery(
    () => (cancerId ? db.checklists.where('cancerId').equals(cancerId).toArray() : []),
    [cancerId]
  ) ?? [];
}

export function usePrecisionFields(cancerId: string | undefined) {
  return useLiveQuery(
    () => (cancerId ? db.precisionFields.where('cancerId').equals(cancerId).toArray() : []),
    [cancerId]
  ) ?? [];
}

export function useNhiNotes(cancerId: string | undefined) {
  return useLiveQuery(
    () => (cancerId ? db.nhiNotes.where('cancerId').equals(cancerId).toArray() : []),
    [cancerId]
  ) ?? [];
}

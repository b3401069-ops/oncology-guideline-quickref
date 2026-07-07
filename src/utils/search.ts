import type { CancerRouteCard } from '@/models/types';

export function searchCancerCards(
  cards: CancerRouteCard[],
  query: string
): CancerRouteCard[] {
  if (!query.trim()) return cards;
  
  const q = query.toLowerCase().trim();
  
  return cards.filter((card) => {
    // Match Chinese name
    if (card.zhName.toLowerCase().includes(q)) return true;
    // Match English name
    if (card.enName.toLowerCase().includes(q)) return true;
    // Match ID
    if (card.id.toLowerCase().includes(q)) return true;
    // Match synonyms
    if (card.synonyms.some((s) => s.toLowerCase().includes(q))) return true;
    // Match category
    if (card.category.toLowerCase().includes(q)) return true;
    return false;
  });
}

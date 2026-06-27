import { Deal } from '@/types/crm';

export interface CompanyDealsSummary {
  totalDeals: number;
  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  abandonedDeals: number;
  openValue: number;
  wonValue: number;
  sortedDeals: Deal[];
}

function getDealFreshnessTimestamp(deal: Deal) {
  return new Date(deal.updatedAt || deal.createdAt).getTime();
}

export function buildCompanyDealsSummary(deals: Deal[]): CompanyDealsSummary {
  const sortedDeals = [...deals].sort(
    (left, right) => getDealFreshnessTimestamp(right) - getDealFreshnessTimestamp(left)
  );

  return {
    totalDeals: deals.length,
    openDeals: deals.filter((deal) => deal.status === 'open').length,
    wonDeals: deals.filter((deal) => deal.status === 'won').length,
    lostDeals: deals.filter((deal) => deal.status === 'lost').length,
    abandonedDeals: deals.filter((deal) => deal.status === 'abandoned').length,
    openValue: deals
      .filter((deal) => deal.status === 'open')
      .reduce((total, deal) => total + deal.value, 0),
    wonValue: deals
      .filter((deal) => deal.status === 'won')
      .reduce((total, deal) => total + deal.value, 0),
    sortedDeals,
  };
}

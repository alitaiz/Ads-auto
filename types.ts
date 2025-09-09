// types.ts

export type Profile = {
  profileId: number;
  countryCode: string;
};

export type Portfolio = {
  portfolioId: number;
  name: string;
  state: 'enabled' | 'archived';
};

export type CampaignState = 'enabled' | 'paused' | 'archived';

export type Campaign = {
    campaignId: number;
    name: string;
    campaignType: string;
    targetingType: string;
    state: CampaignState;
    dailyBudget: number;
    startDate: string;
    endDate: string | null;
    bidding: any;
    portfolioId: number | null;
};

export type CampaignStreamMetrics = {
    campaignId: number;
    impressions: number;
    clicks: number;
    spend: number;
    orders: number;
    sales: number;
};

export type CampaignWithMetrics = Campaign & CampaignStreamMetrics & {
    acos: number;
    roas: number;
    cpc: number;
    ctr: number;
};

export type SummaryMetricsData = {
    spend: number;
    sales: number;
    orders: number;
    clicks: number;
    impressions: number;
    acos: number;
    roas: number;
    cpc: number;
    ctr: number;
};

export type AdGroup = {
    adGroupId: number;
    name: string;
    campaignId: number;
    defaultBid: number;
    state: 'enabled' | 'paused' | 'archived';
};

export type Keyword = {
    keywordId: number;
    adGroupId: number;
    campaignId: number;
    keywordText: string;
    matchType: 'broad' | 'phrase' | 'exact' | 'unknown';
    state: 'enabled' | 'paused' | 'archived';
    bid?: number;
};

export type PortfolioMetrics = {
    impressions: number;
    clicks: number;
    spend: number;
    sales: number;
    orders: number;
    acos: number;
    roas: number;
    cpc: number;
    ctr: number;
    campaignCount: number;
};

export type PortfolioWithMetrics = Portfolio & PortfolioMetrics;

// For SPSearchTermsView.tsx
export interface SearchTermData {
    report_date: string;
    campaign_name: string;
    campaign_id: number;
    ad_group_name: string;
    ad_group_id: number;
    customer_search_term: string;
    impressions: number;
    clicks: number;
    spend: number;
    seven_day_total_sales: number;
    seven_day_total_orders: number;
    seven_day_acos: number;
    seven_day_roas: number;
    seven_day_total_units: number;
    asin: string | null;
}

export interface SearchTermFilterOptions {
    asins: string[];
    campaignNames: string[];
}

// For SalesAndTrafficView.tsx
export interface SalesAndTrafficData {
    parentAsin: string;
    childAsin: string;
    sku: string;
    unitsOrdered: number;
    orderedProductSales: number;
    sessions: number;
    pageViews: number;
    unitSessionPercentage: number;
    totalOrderItems: number;
}

export interface SPFilterOptions {
    asins: string[];
    dates: string[];
}

// For DataCacheContext.tsx
export interface AppDataCache {
    ppcManagement: {
        campaigns: Campaign[];
        performanceMetrics: Record<number, CampaignStreamMetrics>;
        profileId: string | null;
        dateRange: { start: Date; end: Date } | null;
    };
    spSearchTerms: {
        data: SearchTermData[];
        filters: { asin: string; campaignName: string; date: string } | null;
    };
    salesAndTraffic: {
        data: SalesAndTrafficData[];
        filters: { asin: string; date: string } | null;
    };
}

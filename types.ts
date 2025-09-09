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

export type KeywordPerformanceMetrics = {
    impressions: number;
    clicks: number;
    spend: number;
    orders: number;
    sales: number;
    acos: number;
    cpc: number;
    ctr: number;
};

export type KeywordWithMetrics = Keyword & {
    performance?: KeywordPerformanceMetrics;
};

export interface SearchTermPerformanceData {
    customerSearchTerm: string;
    impressions: number;
    clicks: number;
    spend: number;
    sevenDayTotalOrders: number;
    sevenDayTotalSales: number;
    sevenDayAcos: number;
}

// Fix: Add missing types for SPSearchTermsView
export interface SearchTermData {
    customerSearchTerm: string;
    campaignName: string;
    adGroupName: string;
    impressions: number;
    clicks: number;
    spend: number;
    sevenDayTotalSales: number;
    sevenDayTotalOrders: number;
    sevenDayAcos: number;
    sevenDayRoas: number;
}

export interface SearchTermFilterOptions {
    asins: string[];
    campaignNames: string[];
}

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
    // Fix: Add spSearchTerms to the cache definition
    spSearchTerms: {
        data: SearchTermData[];
        filters: {
            asin: string;
            campaignName: string;
            startDate: string;
            endDate: string;
        } | null;
    };
    salesAndTraffic: {
        data: SalesAndTrafficData[];
        filters: { asin: string; date: string } | null;
    };
}

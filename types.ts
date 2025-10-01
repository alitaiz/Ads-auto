// types.ts

export interface Profile {
  profileId: string;
  countryCode: string;
  name?: string; // Profiles from /v2/profiles might have more fields
}

export type CampaignState = 'enabled' | 'paused' | 'archived';

export interface Campaign {
  campaignId: number;
  name: string;
  campaignType: 'sponsoredProducts' | 'sponsoredBrands' | 'sponsoredDisplay';
  targetingType: 'auto' | 'manual';
  state: CampaignState;
  dailyBudget: number;
  startDate: string;
  endDate: string | null;
  bidding?: any; // Bidding strategy can be complex
}

export interface AdGroup {
  adGroupId: number;
  name: string;
  campaignId: number;
  defaultBid: number;
  state: 'enabled' | 'paused' | 'archived';
}

export interface Keyword {
  keywordId: number;
  adGroupId: number;
  campaignId: number;
  keywordText: string;
  matchType: 'broad' | 'phrase' | 'exact';
  state: 'enabled' | 'paused' | 'archived';
  bid?: number;
}

export interface CampaignStreamMetrics {
    campaignId: number;
    impressions: number;
    clicks: number;
    adjustedSpend: number; // Net spend after adjustments
    orders: number;
    sales: number;
}

// Combined type for campaign data and its performance metrics
export interface CampaignWithMetrics extends Campaign {
    impressions?: number;
    clicks?: number;
    adjustedSpend?: number;
    sales?: number;
    orders?: number;
    acos?: number;
    roas?: number;
    cpc?: number;
    ctr?: number;
    cvr?: number;
}

export interface SummaryMetricsData {
    clicks: number;
    adjustedSpend: number;
    orders: number;
    sales: number;
    acos: number;
    roas: number;
    cpc: number;
    ctr: number;
    impressions: number;
}

export interface AutomationRuleCondition {
    metric: 'spend' | 'sales' | 'acos' | 'orders' | 'clicks' | 'impressions' | 'roas' | 'budgetUtilization';
    timeWindow: number | 'TODAY';
    operator: '>' | '<' | '=';
    value: number;
}

export interface AutomationRuleAction {
    type: 'adjustBidPercent' | 'increaseBidPercent' | 'decreaseBidPercent' | 'increaseBidAmount' | 'decreaseBidAmount' | 'negateSearchTerm' | 'increaseBudgetPercent' | 'setBudgetAmount' | 'CREATE_NEW_CAMPAIGN' | 'ADD_TO_EXISTING_CAMPAIGN';
    value?: number;
    matchType?: 'NEGATIVE_EXACT' | 'NEGATIVE_PHRASE' | 'EXACT' | 'PHRASE';
    minBid?: number;
    maxBid?: number;
    // For Search Term Harvesting
    newCampaignBudget?: number;
    targetCampaignId?: string | number;
    targetAdGroupId?: string | number;
    bidOption?: {
        type: 'CPC_MULTIPLIER' | 'CUSTOM_BID';
        value: number;
    };
    autoNegate?: boolean;
}

// The structure of a single IF/THEN block within a rule.
export interface AutomationConditionGroup {
    conditions: AutomationRuleCondition[];
    action: AutomationRuleAction;
}

export interface AutomationRule {
    id: number;
    name: string;
    rule_type: 'BID_ADJUSTMENT' | 'SEARCH_TERM_AUTOMATION' | 'BUDGET_ACCELERATION' | 'CAMPAIGN_SCHEDULING' | 'PRICE_ADJUSTMENT' | 'SEARCH_TERM_HARVESTING';
    ad_type?: 'SP' | 'SB' | 'SD';
    config: {
        // A rule is composed of one or more condition groups.
        // They are evaluated in order ("first match wins").
        conditionGroups?: AutomationConditionGroup[];
        // Dynamic frequency configuration
        frequency: {
            unit: 'minutes' | 'hours' | 'days';
            value: number;
            startTime?: string; // e.g., "01:00" for 1 AM
        };
        // NEW: Cooldown configuration to prevent rapid-fire actions on the same entity.
        cooldown?: {
            unit: 'minutes' | 'hours' | 'days';
            value: number;
        };
        // For CAMPAIGN_SCHEDULING
        pauseTime?: string; // "HH:MM" format
        activeTime?: string; // "HH:MM" format
        timezone?: string;   // IANA timezone name e.g., 'America/Phoenix'
        conditions?: {
            impressions: { operator: '>', value: number };
            acos: { operator: '>', value: number };
        };
         // For PRICE_ADJUSTMENT
        skus?: string[];
        priceStep?: number;
        priceLimit?: number;
        runAtTime?: string; // "HH:MM" format, optional
    };
    scope: {
        campaignIds?: (number | string)[];
    };
    is_active: boolean;
    last_run_at?: string | null;
    profile_id: string;
}

export interface MetricFilters {
  adjustedSpend: { min?: number; max?: number };
  sales: { min?: number; max?: number };
  orders: { min?: number; max?: number };
  impressions: { min?: number; max?: number };
  clicks: { min?: number; max?: number };
  acos: { min?: number; max?: number };
  roas: { min?: number; max?: number };
}


// --- New Types for Report Views ---

export interface SalesAndTrafficData {
    parentAsin: string;
    childAsin: string;
    sku: string | null;
    // Sales Metrics
    unitsOrdered?: number;
    orderedProductSales?: number;
    totalOrderItems?: number;
    averageSalesPerOrderItem?: number;
    // B2B Sales Metrics
    unitsOrderedB2B?: number;
    orderedProductSalesB2B?: number;
    totalOrderItemsB2B?: number;
    averageSalesPerOrderItemB2B?: number;
    // Traffic Metrics
    sessions?: number;
    pageViews?: number;
    buyBoxPercentage?: number;
    unitSessionPercentage?: number;
    sessionPercentage?: number;
    pageViewsPercentage?: number;
    // B2B Traffic Metrics
    sessionsB2B?: number;
    pageViewsB2B?: number;
    buyBoxPercentageB2B?: number;
    unitSessionPercentageB2B?: number;
    sessionPercentageB2B?: number;
    pageViewsPercentageB2B?: number;
    // Detailed Traffic Breakdowns
    browserSessions?: number;
    mobileAppSessions?: number;
    browserPageViews?: number;
    mobileAppPageViews?: number;
    browserSessionPercentage?: number;
    mobileAppSessionPercentage?: number;
    browserPageViewsPercentage?: number;
    mobileAppPageViewsPercentage?: number;
    // B2B Detailed Traffic Breakdowns
    browserSessionsB2B?: number;
    mobileAppSessionsB2B?: number;
    browserPageViewsB2B?: number;
    mobileAppPageViewsB2B?: number;
    browserSessionPercentageB2B?: number;
    mobileAppSessionPercentageB2B?: number;
    browserPageViewsPercentageB2B?: number;
    mobileAppPageViewsPercentageB2B?: number;
}

export interface SPSearchTermReportData {
    campaignName: string;
    campaignId: number;
    adGroupName: string;
    adGroupId: number;
    customerSearchTerm: string;
    impressions: number;
    clicks: number;
    costPerClick: number;
    spend: number;
    sevenDayTotalSales: number;
    sevenDayAcos: number;
    asin: string | null;
    targeting: string;
    matchType: string;
    sevenDayRoas: number;
    sevenDayTotalOrders: number;
    sevenDayTotalUnits: number;
}

export interface SPFilterOptions {
    asins: string[];
    dates: string[];
}

// --- Types for Data Caching ---

export interface PPCManagementCache {
  campaigns: Campaign[];
  performanceMetrics: Record<number, CampaignStreamMetrics>;
  profileId: string | null;
  dateRange: { start: Date; end: Date } | null;
}

export interface SPSearchTermsCache {
    data: SPSearchTermReportData[];
    filters: {
        asin: string;
        startDate: string;
        endDate: string;
    } | null;
}

export interface SalesAndTrafficCache {
    data: SalesAndTrafficData[];
    filters: {
        asin: string;
        date: string;
    } | null;
}

export interface ChatMessage {
    id: number;
    sender: 'user' | 'ai';
    text: string;
}

export interface LoadedDataInfo {
    data: any[] | null;
    dateRange: {
        startDate: string;
        endDate: string;
    } | null;
}

export interface AICopilotCache {
    productInfo: {
        asin: string;
        salePrice: string;
        cost: string;
        fbaFee: string;
        referralFeePercent: string;
    };
    dateRange: {
        startDate: string;
        endDate: string;
    };
    loadedData: {
        searchTermData: LoadedDataInfo;
        streamData: LoadedDataInfo;
        salesTrafficData: LoadedDataInfo;
        searchQueryPerformanceData: LoadedDataInfo;
    };
    chat: {
        conversationId: string | null;
        messages: ChatMessage[];
        systemInstruction: string;
    };
}


export interface AppDataCache {
    ppcManagement: PPCManagementCache;
    spSearchTerms: SPSearchTermsCache;
    salesAndTraffic: SalesAndTrafficCache;
    aiCopilot: AICopilotCache;
}

// --- New types for Search Query Performance View ---

export interface PerformanceChartConfig {
    type: 'performance';
    asin: string;
    searchQuery: string;
    metricId: string;
    metricLabel: string;
    metricFormat: 'number' | 'percent' | 'price';
}

export type AppChartConfig = PerformanceChartConfig;

export interface QueryPerformanceData {
    searchQuery: string;
    searchQueryScore: number;
    searchQueryVolume: number;
    impressions: { totalCount: number; asinCount: number; asinShare: number; };
    clicks: { clickRate: number; totalCount: number; asinCount: number; asinShare: number; totalMedianPrice: string; asinMedianPrice: string; sameDayShippingCount: number; oneDayShippingCount: number; twoDayShippingCount: number; };
    cartAdds: { cartAddRate: number; totalCount: number; asinCount: number; asinShare: number; totalMedianPrice: string; asinMedianPrice: string; sameDayShippingCount: number; oneDayShippingCount: number; twoDayShippingCount: number; };
    purchases: { purchaseRate: number; totalCount: number; asinCount: number; asinShare: number; totalMedianPrice: string; asinMedianPrice: string; sameDayShippingCount: number; oneDayShippingCount: number; twoDayShippingCount: number; };
    hasSPData?: boolean;
}

export interface PerformanceFilterOptions {
    asins: string[];
    weeks: { value: string; label: string }[];
}

export interface ProductDetails {
    asin: string;
    title?: string;
    price?: string;
    imageUrl?: string;
    bulletPoints?: string[];
    error?: string;
    rank?: string;
}

// --- New type for Listings View ---
export interface ProductListing {
    id: number;
    asin: string;
    sku: string;
    title: string;
}
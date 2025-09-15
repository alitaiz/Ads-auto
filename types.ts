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
  campaignType: 'sponsoredProducts'; // Assuming only SP for now
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
    spend: number;
    orders: number;
    sales: number;
}

// Combined type for campaign data and its performance metrics
export interface CampaignWithMetrics extends Campaign {
    impressions?: number;
    clicks?: number;
    spend?: number;
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
    spend: number;
    orders: number;
    sales: number;
    acos: number;
    roas: number;
    cpc: number;
    ctr: number;
    impressions: number;
}

export interface AutomationRuleCondition {
    metric: 'spend' | 'sales' | 'acos' | 'orders' | 'clicks' | 'impressions';
    timeWindow: number;
    operator: '>' | '<' | '=';
    value: number;
}

export interface AutomationRuleAction {
    type: 'adjustBidPercent' | 'negateSearchTerm';
    value?: number;
    matchType?: 'NEGATIVE_EXACT' | 'NEGATIVE_PHRASE';
    minBid?: number;
    maxBid?: number;
}

// The structure of a single IF/THEN block within a rule.
export interface AutomationConditionGroup {
    conditions: AutomationRuleCondition[];
    action: AutomationRuleAction;
}

export interface AutomationRule {
    id: number;
    name: string;
    rule_type: 'BID_ADJUSTMENT' | 'SEARCH_TERM_AUTOMATION' | 'CAMPAIGN_SCHEDULING';
    config: {
        // For BID_ADJUSTMENT and SEARCH_TERM_AUTOMATION
        conditionGroups?: AutomationConditionGroup[];
        frequency?: {
            unit: 'minutes' | 'hours' | 'days';
            value: number;
        };
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
        }
    };
    scope: {
        campaignIds?: (number | string)[];
    };
    is_active: boolean;
    last_run_at?: string | null;
    profile_id: string;
}


// --- New Types for Report Views ---

export interface SalesAndTrafficData {
    parentAsin: string;
    childAsin: string;
    sku: string | null;
    unitsOrdered?: number;
    orderedProductSales?: number;
    sessions?: number;
    pageViews?: number;
    featuredOfferPercentage?: number;
    unitSessionPercentage?: number;
    totalOrderItems?: number;
    averageSalesPerOrderItem?: number;
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


export interface AppDataCache {
    ppcManagement: PPCManagementCache;
    spSearchTerms: SPSearchTermsCache;
    salesAndTraffic: SalesAndTrafficCache;
}
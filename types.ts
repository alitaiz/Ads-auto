// types.ts

export type EntityState = 'enabled' | 'paused' | 'archived' | 'ended' | 'pendingReview';

export interface Profile {
    profileId: number;
    profileType: string;
    accountInfo: {
        marketplaceStringId: string;
        id: string;
        type: string;
        name: string;
    };
    countryCode: string;
    timezone: string;
}

export interface Campaign {
    campaignId: number;
    name: string;
    campaignType: string; // e.g., 'sponsoredProducts'
    targetingType: string; // e.g., 'auto', 'manual'
    state: EntityState;
    dailyBudget: number;
    startDate: string;
    endDate?: string | null;
    bidding?: any;
    // Performance metrics can be added here later
    impressions?: number;
    clicks?: number;
    spend?: number;
    orders?: number;
    sales?: number;
}

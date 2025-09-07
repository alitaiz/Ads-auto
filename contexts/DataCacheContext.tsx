import React, { createContext, useState, ReactNode } from 'react';
import { AppDataCache } from '../types';

// Helper to get the initial date range for the PPC cache
const getInitialPpcDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

const initialCacheState: AppDataCache = {
    ppcManagement: {
        campaigns: [],
        performanceMetrics: {},
        profileId: null,
        dateRange: getInitialPpcDateRange(),
    },
    spSearchTerms: {
        data: [],
        filters: null,
    },
    salesAndTraffic: {
        data: [],
        filters: null,
    },
};

interface DataCacheContextType {
    cache: AppDataCache;
    setCache: React.Dispatch<React.SetStateAction<AppDataCache>>;
}

export const DataCacheContext = createContext<DataCacheContextType>({
    cache: initialCacheState,
    setCache: () => {},
});

export function DataCacheProvider({ children }: { children: ReactNode }) {
    const [cache, setCache] = useState<AppDataCache>(initialCacheState);

    return (
        <DataCacheContext.Provider value={{ cache, setCache }}>
            {children}
        </DataCacheContext.Provider>
    );
}

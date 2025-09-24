import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { Keyword } from '../types';
import { formatPrice } from '../utils';

// Re-using styles for consistency
const styles: { [key: string]: React.CSSProperties } = {
    container: {
        padding: '20px',
        maxWidth: '1200px',
        margin: '0 auto',
    },
     header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
    },
    title: {
        fontSize: '1.75rem',
        margin: 0,
    },
    breadcrumb: {
        marginBottom: '20px',
        fontSize: '1rem',
    },
    link: {
        textDecoration: 'none',
        color: 'var(--primary-color)',
        fontWeight: 500,
    },
    tableContainer: {
        backgroundColor: 'var(--card-background-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        overflowX: 'auto',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    th: {
        padding: '12px 15px',
        textAlign: 'left',
        borderBottom: '2px solid var(--border-color)',
        backgroundColor: '#f8f9fa',
        fontWeight: 600,
    },
    td: {
        padding: '12px 15px',
        borderBottom: '1px solid var(--border-color)',
    },
    input: {
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        width: '100px'
    },
    loader: {
        textAlign: 'center',
        padding: '50px',
        fontSize: '1.2rem',
    },
    error: {
        color: 'var(--danger-color)',
        padding: '20px',
        backgroundColor: '#fdd',
        borderRadius: 'var(--border-radius)',
    },
};

export function KeywordView() {
    const { adGroupId } = useParams<{ adGroupId: string }>();
    const location = useLocation();
    
    const [keywords, setKeywords] = useState<Keyword[]>([]);
    const [adGroupName, setAdGroupName] = useState(location.state?.adGroupName || `Ad Group ${adGroupId}`);
    const [campaignName, setCampaignName] = useState(location.state?.campaignName || '...');
    const [campaignId, setCampaignId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // State for inline bid editing
    const [editingKeyword, setEditingKeyword] = useState<{ id: number; field: 'bid' } | null>(null);
    const [tempBidValue, setTempBidValue] = useState('');

    const fetchKeywords = useCallback(async () => {
        if (!adGroupId) return;
        setLoading(true);
        setError(null);
        try {
            const profileId = localStorage.getItem('selectedProfileId');
            if (!profileId) throw new Error("Profile ID not found.");

            const response = await fetch(`/api/amazon/adgroups/${adGroupId}/keywords`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileId }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch keywords.');
            }
            const data = await response.json();
            setKeywords(data.keywords);
            setCampaignId(data.campaignId || null);
            
            // Set names from router state if available, otherwise use API response as fallback
            if(location.state?.adGroupName) setAdGroupName(location.state.adGroupName);
            else if (data.adGroupName) setAdGroupName(data.adGroupName);
            
             if(location.state?.campaignName) setCampaignName(location.state.campaignName);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setLoading(false);
        }
    }, [adGroupId, location.state]);

    useEffect(() => {
        fetchKeywords();
    }, [fetchKeywords]);
    
    const handleUpdateKeyword = async (keywordId: number, updatePayload: Partial<Pick<Keyword, 'state' | 'bid'>>) => {
        const originalKeywords = [...keywords];
        setKeywords(prev => prev.map(k => k.keywordId === keywordId ? { ...k, ...updatePayload } : k));

        try {
            const profileId = localStorage.getItem('selectedProfileId');
            const response = await fetch('/api/amazon/keywords', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileId, updates: [{ keywordId, ...updatePayload }] }),
            });

            if (!response.ok) throw new Error('Failed to update keyword.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Update failed.');
            setKeywords(originalKeywords); // Revert on failure
        } finally {
            if (editingKeyword?.id === keywordId) {
                setEditingKeyword(null);
            }
        }
    };
    
    const handleBidClick = (keyword: Keyword) => {
        setEditingKeyword({ id: keyword.keywordId, field: 'bid' });
        setTempBidValue(keyword.bid?.toString() ?? '');
    };
    
    const handleBidUpdate = (keywordId: number) => {
        const newBid = parseFloat(tempBidValue);
        if (!isNaN(newBid) && newBid > 0) {
            handleUpdateKeyword(keywordId, { bid: newBid });
        } else {
            setEditingKeyword(null);
        }
    };
    
    const handleBidKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, keywordId: number) => {
        if (e.key === 'Enter') handleBidUpdate(keywordId);
        else if (e.key === 'Escape') setEditingKeyword(null);
    };

    return (
        <div style={styles.container}>
            <div style={styles.breadcrumb}>
                <Link to="/campaigns" style={styles.link}>Campaigns</Link>
                {campaignId && (
                     <>
                        {' > '}
                        <Link to={`/campaigns/${campaignId}/adgroups`} state={{ campaignName: campaignName }} style={styles.link}>{campaignName}</Link>
                     </>
                )}
                 {' > '}
                <span>{adGroupName}</span>
            </div>
            <header style={styles.header}>
                <h1 style={styles.title}>Keywords</h1>
            </header>

            {error && <div style={styles.error} role="alert">{error}</div>}

            <div style={styles.tableContainer}>
                {loading ? (
                    <div style={styles.loader}>Loading keywords...</div>
                ) : (
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>Keyword</th>
                                <th style={styles.th}>Match Type</th>
                                <th style={styles.th}>Status</th>
                                <th style={styles.th}>Bid</th>
                            </tr>
                        </thead>
                        <tbody>
                             {keywords.length > 0 ? keywords.map(kw => (
                                <tr key={kw.keywordId}>
                                    <td style={styles.td}>{kw.keywordText}</td>
                                    <td style={{...styles.td, textTransform: 'capitalize'}}>{kw.matchType}</td>
                                    <td style={{...styles.td, textTransform: 'capitalize'}}>{kw.state}</td>
                                    <td style={{...styles.td, cursor: 'pointer'}} onClick={() => editingKeyword?.id !== kw.keywordId && handleBidClick(kw)}>
                                        {editingKeyword?.id === kw.keywordId ? (
                                            <input
                                                type="number"
                                                value={tempBidValue}
                                                onChange={(e) => setTempBidValue(e.target.value)}
                                                onBlur={() => handleBidUpdate(kw.keywordId)}
                                                onKeyDown={(e) => handleBidKeyDown(e, kw.keywordId)}
                                                autoFocus
                                                style={styles.input}
                                            />
                                        ) : (
                                            kw.bid ? formatPrice(kw.bid) : 'Ad group default'
                                        )}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} style={{...styles.td, textAlign: 'center'}}>
                                        No keywords found in this ad group.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
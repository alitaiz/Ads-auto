import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AdGroup } from '../types';
import { formatPrice } from '../utils';

// Re-using some styles from PPCManagementView for consistency
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

export function AdGroupView() {
    const { campaignId } = useParams<{ campaignId: string }>();
    const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
    const [campaignName, setCampaignName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!campaignId) return;

        const fetchAdGroups = async () => {
            setLoading(true);
            setError(null);
            try {
                // We need the profileId for the API call. We can store it in sessionStorage or localStorage
                // when it's selected in the main view, or pass it via state. For simplicity, we assume it's stored.
                const profileId = sessionStorage.getItem('selectedProfileId');
                if (!profileId) {
                    throw new Error("Profile ID not found. Please select a profile on the main page first.");
                }

                const response = await fetch(`/api/amazon/campaigns/${campaignId}/adgroups`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profileId }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to fetch ad groups.');
                }
                const data = await response.json();
                setAdGroups(data.adGroups);
                // Assuming the campaign name is passed back for context
                setCampaignName(data.campaignName || `Campaign ${campaignId}`);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setLoading(false);
            }
        };

        fetchAdGroups();
    }, [campaignId]);
    
    // Store selectedProfileId in sessionStorage when it changes on the main view
    // This is a simplified way to pass state between views without a complex state manager
    // In PPCManagementView, add:
    // useEffect(() => {
    //   if (selectedProfileId) {
    //     sessionStorage.setItem('selectedProfileId', selectedProfileId);
    //   }
    // }, [selectedProfileId]);

    return (
        <div style={styles.container}>
            <div style={styles.breadcrumb}>
                <Link to="/campaigns" style={styles.link}>Campaigns</Link>
                {' > '}
                <span>{loading ? '...' : campaignName}</span>
            </div>
            <header style={styles.header}>
                <h1 style={styles.title}>Ad Groups</h1>
            </header>

            {error && <div style={styles.error} role="alert">{error}</div>}

            <div style={styles.tableContainer}>
                {loading ? (
                    <div style={styles.loader}>Loading ad groups...</div>
                ) : (
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>Ad Group Name</th>
                                <th style={styles.th}>Status</th>
                                <th style={styles.th}>Default Bid</th>
                            </tr>
                        </thead>
                        <tbody>
                            {adGroups.length > 0 ? adGroups.map(ag => (
                                <tr key={ag.adGroupId}>
                                    <td style={styles.td}>
                                        <Link to={`/adgroups/${ag.adGroupId}/keywords`} style={styles.link}>
                                            {ag.name}
                                        </Link>
                                    </td>
                                    <td style={{...styles.td, textTransform: 'capitalize'}}>{ag.state}</td>
                                    <td style={styles.td}>{formatPrice(ag.defaultBid)}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={3} style={{...styles.td, textAlign: 'center'}}>
                                        No ad groups found in this campaign.
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
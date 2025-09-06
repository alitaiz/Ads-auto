import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Campaign, Profile, EntityState } from '../types';
import { formatNumber, formatPrice } from '../utils';

// --- Helper Components & Functions (self-contained for simplicity) ---

const styles: { [key: string]: React.CSSProperties } = {
    viewContainer: { padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' },
    title: { margin: 0, fontSize: '1.75rem' },
    card: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '1rem', display: 'flex', alignItems: 'center' },
    input: { padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', minWidth: '200px' },
    select: { padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', minWidth: '150px' },
    primaryButton: { backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', padding: '0.6rem 1rem', borderRadius: 'var(--border-radius)', cursor: 'pointer', fontWeight: 'bold' },
    secondaryButton: { backgroundColor: '#fff', color: 'var(--text-color)', border: '1px solid var(--border-color)', padding: '0.5rem 1rem', borderRadius: 'var(--border-radius)', cursor: 'pointer' },
    tableContainer: { overflowX: 'auto', width: '100%' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid var(--border-color)', fontWeight: 'bold' },
    td: { padding: '0.75rem', borderBottom: '1px solid var(--border-color)' },
    message: { textAlign: 'center', padding: '2rem', color: '#666' },
    error: { color: 'var(--danger-color)', backgroundColor: 'rgba(217, 83, 79, 0.1)', border: '1px solid var(--danger-color)', borderRadius: 'var(--border-radius)' },
    notification: { position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', padding: '1rem 2rem', borderRadius: 'var(--border-radius)', color: '#fff', zIndex: 1000 },
};

const StatusToggle = ({ campaign, onUpdate }: { campaign: Campaign; onUpdate: (update: Partial<Campaign>) => void; }) => {
    const handleToggle = () => {
        const newState: EntityState = campaign.state === 'enabled' ? 'paused' : 'enabled';
        onUpdate({ state: newState });
    };
    return (
        <div onClick={handleToggle} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <div style={{ width: '2rem', height: '1rem', backgroundColor: campaign.state === 'enabled' ? 'var(--success-color)' : '#ccc', borderRadius: '0.5rem', position: 'relative', transition: 'background-color 0.2s' }}>
                <div style={{ width: '0.8rem', height: '0.8rem', backgroundColor: '#fff', borderRadius: '50%', position: 'absolute', top: '0.1rem', left: campaign.state === 'enabled' ? '1.1rem' : '0.1rem', transition: 'left 0.2s' }}></div>
            </div>
            <span style={{ textTransform: 'capitalize' }}>{campaign.state}</span>
        </div>
    );
};

const EditableBudget = ({ campaign, onUpdate }: { campaign: Campaign; onUpdate: (update: Partial<Campaign>) => void; }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [budgetValue, setBudgetValue] = useState(campaign.dailyBudget);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const newBudget = parseFloat(budgetValue.toString());
            if (!isNaN(newBudget) && newBudget > 0) {
                onUpdate({ dailyBudget: newBudget });
                setIsEditing(false);
            }
        } else if (e.key === 'Escape') {
            setBudgetValue(campaign.dailyBudget);
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <input
                type="number"
                style={{ ...styles.input, width: '100px', padding: '0.2rem' }}
                value={budgetValue}
                onChange={(e) => setBudgetValue(Number(e.target.value))}
                onBlur={() => setIsEditing(false)}
                onKeyDown={handleKeyDown}
                autoFocus
            />
        );
    }

    return (
        <span onClick={() => setIsEditing(true)} style={{ cursor: 'pointer' }}>
            {formatPrice(campaign.dailyBudget)}
        </span>
    );
};

// --- Main View Component ---

export function PPCManagementView() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string>('');
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState<{ profiles: boolean; campaigns: boolean }>({ profiles: true, campaigns: false });
    const [error, setError] = useState<string | null>(null);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // --- API Functions ---
    const API_BASE_URL = '/api/amazon';

    const showNotification = (message: string, type: 'success' | 'error' | 'info', duration = 3000) => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), duration);
    };

    const fetchProfiles = useCallback(async () => {
        setLoading(prev => ({ ...prev, profiles: true }));
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/profiles`);
            if (!response.ok) {
                 try {
                    const errorData = await response.json();
                    const specificMessage = errorData.details?.message || errorData.message || 'Server returned an error.';
                    throw new Error(`Failed to fetch profiles: ${specificMessage}`);
                } catch (jsonError) {
                    throw new Error(`Failed to fetch profiles. Server responded with status: ${response.status} ${response.statusText}`);
                }
            }
            const data: Profile[] = await response.json();
            setProfiles(data);
            if (data.length > 0) {
                setSelectedProfileId(data[0].profileId.toString());
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred while fetching profiles.');
            setProfiles([]); // Clear profiles on error
        } finally {
            setLoading(prev => ({ ...prev, profiles: false }));
        }
    }, []);

    const fetchCampaigns = useCallback(async (profileId: string) => {
        if (!profileId) return;
        setLoading(prev => ({ ...prev, campaigns: true }));
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/campaigns/list`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileId, stateFilter: ['enabled', 'paused'] }),
            });
            if (!response.ok) {
                try {
                    const errorData = await response.json();
                    const specificMessage = errorData.details?.message || errorData.message || 'Server returned an error.';
                    throw new Error(`Failed to fetch campaigns: ${specificMessage}`);
                } catch (jsonError) {
                     throw new Error(`Failed to fetch campaigns. Server responded with status: ${response.status} ${response.statusText}`);
                }
            }
            const data = await response.json();
            setCampaigns(data.campaigns || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred while fetching campaigns.');
            setCampaigns([]);
        } finally {
            setLoading(prev => ({ ...prev, campaigns: false }));
        }
    }, []);

    const handleUpdateCampaign = useCallback(async (campaignId: number, updateData: Partial<Campaign>) => {
        showNotification('Updating campaign...', 'info', 10000);

        // Optimistic UI update
        const originalCampaigns = campaigns;
        setCampaigns(prev => prev.map(c => c.campaignId === campaignId ? { ...c, ...updateData } : c));

        try {
            const response = await fetch(`${API_BASE_URL}/campaigns`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profileId: selectedProfileId,
                    updates: [{ campaignId, ...updateData }],
                }),
            });

            if (!response.ok) throw new Error('Update failed on the server.');
            
            const result = await response.json();
            if (result.campaigns?.[0]?.code !== 'SUCCESS') {
                throw new Error(result.campaigns?.[0]?.description || 'Amazon API rejected the update.');
            }
            showNotification('Campaign updated successfully!', 'success');
        } catch (error) {
            showNotification(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            // Revert UI on failure
            setCampaigns(originalCampaigns);
        }
    }, [selectedProfileId, campaigns]);

    // --- Effects ---
    useEffect(() => {
        fetchProfiles();
    }, [fetchProfiles]);

    useEffect(() => {
        if (selectedProfileId) { // Only fetch campaigns if a profile is selected
            fetchCampaigns(selectedProfileId);
        }
    }, [selectedProfileId, fetchCampaigns]);
    
    // --- Memos & Render Logic ---
    const filteredCampaigns = useMemo(() => {
        return campaigns.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [campaigns, searchTerm]);

    const renderTableBody = () => {
        if (loading.campaigns) return <tr><td colSpan={5} style={styles.message}>Loading campaigns...</td></tr>;
        if (error && campaigns.length === 0) return <tr><td colSpan={5} style={{...styles.message, ...styles.error}}>{error}</td></tr>;
        if (campaigns.length > 0 && filteredCampaigns.length === 0) return <tr><td colSpan={5} style={styles.message}>No campaigns match your search.</td></tr>;
        if (filteredCampaigns.length === 0) return <tr><td colSpan={5} style={styles.message}>No campaigns found for this profile.</td></tr>;

        return filteredCampaigns.map(campaign => (
            <tr key={campaign.campaignId}>
                <td style={styles.td}>
                    <Link to={`/campaigns/${campaign.campaignId}/adgroups`}>{campaign.name}</Link>
                </td>
                <td style={styles.td}>
                    <StatusToggle campaign={campaign} onUpdate={(update) => handleUpdateCampaign(campaign.campaignId, update)} />
                </td>
                <td style={styles.td}>{campaign.targetingType}</td>
                <td style={styles.td}>
                    <EditableBudget campaign={campaign} onUpdate={(update) => handleUpdateCampaign(campaign.campaignId, update)} />
                </td>
                <td style={styles.td}>{campaign.startDate}</td>
            </tr>
        ));
    };
    
    const renderContent = () => {
        if (loading.profiles) {
            return <div style={{...styles.card, ...styles.message}}>Loading profiles...</div>
        }
        if (error && profiles.length === 0) {
            return <div style={{...styles.card, ...styles.error, ...styles.message, textAlign: 'left', display: 'block' }}>
                <p style={{fontWeight: 'bold'}}>Failed to load profiles</p>
                <p>Could not connect to the Amazon Ads API. This is usually due to incorrect credentials in the backend's <code>.env</code> file.</p>
                <p><strong>Error details:</strong> {error}</p>
                <p>Please check your <code>ADS_API_CLIENT_ID</code>, <code>ADS_API_CLIENT_SECRET</code>, and <code>ADS_API_REFRESH_TOKEN</code> on the server and then refresh this page.</p>
             </div>
        }
        
        return (
            <>
                <section style={{...styles.card, flexWrap: 'nowrap', justifyContent: 'space-between'}}>
                     <input
                        type="search"
                        placeholder="Find a campaign by name..."
                        style={styles.input}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        disabled={!selectedProfileId || campaigns.length === 0}
                    />
                     <button onClick={() => fetchCampaigns(selectedProfileId)} style={styles.secondaryButton} disabled={loading.campaigns || !selectedProfileId}>
                        {loading.campaigns ? 'Refreshing...' : 'Refresh'}
                     </button>
                </section>

                <main style={{...styles.card, padding: 0}}>
                    <div style={styles.tableContainer}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>Campaign</th>
                                    <th style={styles.th}>Status</th>
                                    <th style={styles.th}>Targeting</th>
                                    <th style={styles.th}>Daily Budget</th>
                                    <th style={styles.th}>Start Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {renderTableBody()}
                            </tbody>
                        </table>
                    </div>
                </main>
            </>
        );
    }

    return (
        <div style={styles.viewContainer}>
            {notification && (
                <div style={{...styles.notification, backgroundColor: notification.type === 'success' ? 'var(--success-color)' : notification.type === 'error' ? 'var(--danger-color)' : '#333'}}>
                    {notification.message}
                </div>
            )}
            
            <header style={styles.header}>
                <h1 style={styles.title}>Campaign Management</h1>
                <select
                    style={styles.select}
                    value={selectedProfileId}
                    onChange={e => setSelectedProfileId(e.target.value)}
                    disabled={profiles.length === 0 || loading.profiles}
                >
                    {profiles.length > 0 ? (
                        profiles.map(p => <option key={p.profileId} value={p.profileId}>{p.accountInfo.name} ({p.countryCode})</option>)
                    ) : (
                        <option>No profiles found</option>
                    )}
                </select>
            </header>
            
            {renderContent()}

        </div>
    );
}
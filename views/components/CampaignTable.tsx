import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CampaignWithMetrics, CampaignState } from '../../types';
import { formatPrice, formatNumber } from '../../utils';

const styles: { [key: string]: React.CSSProperties } = {
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
        cursor: 'pointer',
    },
    td: {
        padding: '12px 15px',
        borderBottom: '1px solid var(--border-color)',
    },
    link: {
        textDecoration: 'none',
        color: 'var(--primary-color)',
        fontWeight: 500,
    },
    input: {
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        width: '100px',
    },
    select: {
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
    },
    capitalize: {
        textTransform: 'capitalize',
    }
};

interface CampaignTableProps {
    campaigns: CampaignWithMetrics[];
    onUpdateCampaign: (campaignId: number, update: { state?: CampaignState; budget?: { amount: number } }) => void;
}

export function CampaignTable({ campaigns, onUpdateCampaign }: CampaignTableProps) {
    const [editingCell, setEditingCell] = useState<{ id: number; field: 'state' | 'budget' } | null>(null);
    const [tempValue, setTempValue] = useState<string | number>('');

    const handleCellClick = (campaign: CampaignWithMetrics, field: 'state' | 'budget') => {
        setEditingCell({ id: campaign.campaignId, field });
        if (field === 'state') {
            setTempValue(campaign.state);
        } else if (field === 'budget') {
            setTempValue(campaign.dailyBudget);
        }
    };

    const handleUpdate = (campaignId: number) => {
        if (!editingCell) return;

        if (editingCell.field === 'state') {
            onUpdateCampaign(campaignId, { state: tempValue as CampaignState });
        } else if (editingCell.field === 'budget') {
            const newBudget = parseFloat(tempValue as string);
            if (!isNaN(newBudget) && newBudget > 0) {
                onUpdateCampaign(campaignId, { budget: { amount: newBudget } });
            }
        }
        setEditingCell(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent, campaignId: number) => {
        if (e.key === 'Enter') {
            handleUpdate(campaignId);
        } else if (e.key === 'Escape') {
            setEditingCell(null);
        }
    };

    const formatPercent = (value?: number) => (value ? `${(value * 100).toFixed(2)}%` : '0.00%');
    const formatRoAS = (value?: number) => (value ? `${value.toFixed(2)}` : '0.00');
    
    return (
        <div style={styles.tableContainer}>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>Campaign Name</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Daily Budget</th>
                        <th style={styles.th}>Spend</th>
                        <th style={styles.th}>Sales</th>
                        <th style={styles.th}>Orders</th>
                        <th style={styles.th}>Impressions</th>
                        <th style={styles.th}>Clicks</th>
                        <th style={styles.th}>ACoS</th>
                        <th style={styles.th}>RoAS</th>
                    </tr>
                </thead>
                <tbody>
                    {campaigns.map(campaign => (
                        <tr key={campaign.campaignId}>
                            <td style={styles.td}>
                                <Link to={`/campaigns/${campaign.campaignId}/adgroups`} style={styles.link}>
                                    {campaign.name}
                                </Link>
                            </td>
                            <td style={{ ...styles.td, cursor: 'pointer' }} onClick={() => handleCellClick(campaign, 'state')}>
                                {editingCell?.id === campaign.campaignId && editingCell.field === 'state' ? (
                                    <select
                                        style={styles.select}
                                        value={tempValue}
                                        onChange={(e) => setTempValue(e.target.value)}
                                        onBlur={() => handleUpdate(campaign.campaignId)}
                                        onKeyDown={(e) => handleKeyDown(e, campaign.campaignId)}
                                        autoFocus
                                    >
                                        <option value="enabled">Enabled</option>
                                        <option value="paused">Paused</option>
                                        <option value="archived">Archived</option>
                                    </select>
                                ) : (
                                    <span style={styles.capitalize}>{campaign.state}</span>
                                )}
                            </td>
                            <td style={{ ...styles.td, cursor: 'pointer' }} onClick={() => handleCellClick(campaign, 'budget')}>
                                {editingCell?.id === campaign.campaignId && editingCell.field === 'budget' ? (
                                    <input
                                        type="number"
                                        style={styles.input}
                                        value={tempValue}
                                        onChange={(e) => setTempValue(e.target.value)}
                                        onBlur={() => handleUpdate(campaign.campaignId)}
                                        onKeyDown={(e) => handleKeyDown(e, campaign.campaignId)}
                                        autoFocus
                                    />
                                ) : (
                                    formatPrice(campaign.dailyBudget)
                                )}
                            </td>
                            <td style={styles.td}>{formatPrice(campaign.spend)}</td>
                            <td style={styles.td}>{formatPrice(campaign.sales)}</td>
                            <td style={styles.td}>{formatNumber(campaign.orders)}</td>
                            <td style={styles.td}>{formatNumber(campaign.impressions)}</td>
                            <td style={styles.td}>{formatNumber(campaign.clicks)}</td>
                            <td style={styles.td}>{formatPercent(campaign.acos)}</td>
                            <td style={styles.td}>{formatRoAS(campaign.roas)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// backend/services/automation/utils.js
import pool from '../../db.js';

/**
 * Logs an action taken by the rules engine to the database.
 * @param {object} rule - The rule object that was processed.
 * @param {string} status - 'SUCCESS', 'FAILURE', 'NO_ACTION'.
 * @param {string} summary - A brief summary of the action.
 * @param {object} details - A JSON object with detailed information.
 */
export const logAction = async (rule, status, summary, details = {}) => {
  try {
    const replacer = (key, value) => (typeof value === 'bigint' ? value.toString() : value);
    const detailsJson = JSON.stringify(details, replacer);

    await pool.query(
      `INSERT INTO automation_logs (rule_id, status, summary, details) VALUES ($1, $2, $3, $4)`,
      [rule.id, status, summary, detailsJson]
    );
    console.log(`[RulesEngine] Logged action for rule "${rule.name}": ${summary}`);
  } catch (e) {
    console.error(`[RulesEngine] FATAL: Could not write to automation_logs table for rule ${rule.id}.`, e);
  }
};

/**
 * A robust way to get "today's date string" in a specific timezone.
 * @param {string} timeZone - The IANA timezone string (e.g., 'America/Los_Angeles').
 * @returns {string} The local date string in YYYY-MM-DD format.
 */
export const getLocalDateString = (timeZone) => {
    const today = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone,
    });
    return formatter.format(today);
};

/**
 * Calculates aggregated metrics from a list of daily data points for a specific lookback period.
 * @param {Array<object>} dailyData - Array of { date, spend, sales, clicks, orders, impressions }.
 * @param {number | 'TODAY'} lookbackDays - The number of days to look back.
 * @param {Date} referenceDate - The end date for the lookback window (inclusive).
 * @returns {object} An object with aggregated metrics.
 */
export const calculateMetricsForWindow = (dailyData, lookbackDays, referenceDate) => {
    if (lookbackDays === 'TODAY') {
        lookbackDays = 1;
    }
    const endDate = new Date(referenceDate);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (lookbackDays - 1));

    const filteredData = dailyData.filter(d => d.date >= startDate && d.date <= endDate);

    const totals = filteredData.reduce((acc, day) => {
        acc.spend += day.spend;
        acc.sales += day.sales;
        acc.clicks += day.clicks;
        acc.orders += day.orders;
        acc.impressions += day.impressions;
        return acc;
    }, { spend: 0, sales: 0, clicks: 0, orders: 0, impressions: 0 });

    if (totals.sales > 0) {
        totals.acos = totals.spend / totals.sales;
    } else {
        totals.acos = (totals.spend > 0) ? Infinity : 0;
    }

    if (totals.spend > 0) {
        totals.roas = totals.sales / totals.spend;
    } else {
        totals.roas = (totals.sales > 0) ? Infinity : 0;
    }

    return totals;
};

/**
 * Checks if a metric value satisfies a given condition.
 * @param {number} metricValue - The calculated value of the metric.
 * @param {'>' | '<' | '='} operator - The comparison operator.
 * @param {number} conditionValue - The value from the rule condition.
 * @returns {boolean} - True if the condition is met.
 */
export const checkCondition = (metricValue, operator, conditionValue) => {
    switch (operator) {
        case '>': return metricValue > conditionValue;
        case '<': return metricValue < conditionValue;
        case '=': return metricValue === conditionValue;
        default: return false;
    }
};

/**
 * Determines if a rule is due to be run based on its frequency and last run time.
 * @param {object} rule - The rule object from the database.
 * @returns {boolean} - True if the rule is due.
 */
export const isRuleDue = (rule) => {
    const now = new Date();
    const lastRun = rule.last_run_at ? new Date(rule.last_run_at) : null;
    const frequency = rule.config.frequency;

    if (!frequency || !frequency.unit || !frequency.value) {
        console.warn(`[RulesEngine] Rule ${rule.id} has invalid frequency config.`);
        return false;
    }

    if (frequency.unit === 'minutes' || frequency.unit === 'hours') {
        if (!lastRun) return true;
        const diffMs = now.getTime() - lastRun.getTime();
        let requiredMs = 0;
        if (frequency.unit === 'minutes') requiredMs = frequency.value * 60 * 1000;
        else requiredMs = frequency.value * 60 * 60 * 1000;
        return diffMs >= requiredMs;
    }

    if (frequency.unit === 'days') {
        if (!frequency.startTime) {
            if (!lastRun) return true;
            const diffMs = now.getTime() - lastRun.getTime();
            const requiredMs = frequency.value * 24 * 60 * 60 * 1000;
            return diffMs >= requiredMs;
        }

        const timeZone = 'America/Phoenix';
        const nowInTz = new Date(now.toLocaleString('en-US', { timeZone }));
        const [startHour, startMinute] = frequency.startTime.split(':').map(Number);
        
        const isPastScheduledTimeToday = (nowInTz.getHours() > startHour) || 
                                       (nowInTz.getHours() === startHour && nowInTz.getMinutes() >= startMinute);

        if (!isPastScheduledTimeToday) return false;
        if (!lastRun) return true;

        const lastRunInTz = new Date(lastRun.toLocaleString('en-US', { timeZone }));
        const startOfTodayInTz = new Date(nowInTz);
        startOfTodayInTz.setHours(0, 0, 0, 0);
        
        const startOfLastRunDayInTz = new Date(lastRunInTz);
        startOfLastRunDayInTz.setHours(0, 0, 0, 0);

        const diffTime = startOfTodayInTz.getTime() - startOfLastRunDayInTz.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        return diffDays >= frequency.value;
    }

    return false;
};

// backend/services/rulesEngine.js
import cron from 'node-cron';
import { checkAndRunDueRules, resetBudgets } from './automation/ruleProcessor.js';
import pool from '../db.js';

// Define a constant for Amazon's reporting timezone to ensure consistency.
const REPORTING_TIMEZONE = 'America/Los_Angeles';
let mainTask = null;
let resetTask = null;

export const startRulesEngine = () => {
    if (mainTask) {
        console.warn('[RulesEngine] Engine is already running. Skipping new start.');
        return;
    }
    console.log('[RulesEngine] 🚀 Starting the automation rules engine...');
    // Run every minute to check for due rules
    mainTask = cron.schedule('* * * * *', checkAndRunDueRules, {
        scheduled: true,
        timezone: "UTC"
    });
    // Schedule the daily budget reset
    resetTask = cron.schedule('55 23 * * *', resetBudgets, {
        scheduled: true,
        timezone: REPORTING_TIMEZONE
    });
};

export const stopRulesEngine = () => {
    if (mainTask) {
        console.log('[RulesEngine] 🛑 Stopping the automation rules engine.');
        mainTask.stop();
        mainTask = null;
    }
    if (resetTask) {
        console.log('[RulesEngine] 🛑 Stopping the budget reset task.');
        resetTask.stop();
        resetTask = null;
    }
};

// Graceful shutdown
process.on('SIGINT', () => {
  stopRulesEngine();
  pool.end(() => {
    console.log('[RulesEngine] PostgreSQL pool has been closed.');
    process.exit(0);
  });
});
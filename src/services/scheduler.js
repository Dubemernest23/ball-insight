const cron = require('node-cron');
const refreshService = require('./refreshService');

/**
 * Scheduler
 * Wires up the cron job that keeps match data and standings fresh.
 *
 * Schedule: every 12 hours at 03:00 and 15:00 server time.
 * These off-peak times avoid hammering the API during match hours.
 *
 * To use:
 *   const scheduler = require('./scheduler');
 *   scheduler.start();        // call once in your server entry point (app.js / index.js)
 *   scheduler.stop();         // graceful shutdown
 *   scheduler.runNow();       // trigger a manual refresh any time
 */

class Scheduler {
  constructor() {
    this.job = null;
    this.isRunning = false;
  }

  /**
   * Start the scheduled cron job.
   * Runs at 03:00 and 15:00 every day (every 12 hours).
   */
  start() {
    if (this.job) {
      console.log('⚠️  [Scheduler] Already started — skipping');
      return;
    }

    // Cron syntax: minute hour * * *
    // '0 3,15 * * *' → runs at 03:00 and 15:00 daily
    this.job = cron.schedule('0 3,15 * * *', async () => {
      if (this.isRunning) {
        console.log('⏭️  [Scheduler] Previous refresh still running — skipping this tick');
        return;
      }

      this.isRunning = true;
      try {
        await refreshService.runFullRefresh();
      } catch (err) {
        console.error('❌ [Scheduler] Unhandled error during refresh:', err.message);
      } finally {
        this.isRunning = false;
      }
    }, {
      timezone: 'UTC'  // always UTC so it's predictable regardless of server location
    });

    console.log('✅ [Scheduler] Cron job started — refreshes at 03:00 UTC and 15:00 UTC daily');
    this._scheduleNextLog();
  }

  /**
   * Stop the cron job (e.g. on graceful server shutdown).
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('🛑 [Scheduler] Cron job stopped');
    }
  }

  /**
   * Manually trigger a full refresh outside of the schedule.
   * Useful for: admin endpoints, post-deploy hooks, or testing.
   */
  async runNow() {
    if (this.isRunning) {
      console.log('⏭️  [Scheduler] Refresh already in progress');
      return;
    }

    console.log('▶️  [Scheduler] Manual refresh triggered');
    this.isRunning = true;
    try {
      await refreshService.runFullRefresh();
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Log upcoming scheduled times on startup so you can verify it's wired up.
   */
  _scheduleNextLog() {
    const now   = new Date();
    const next1 = new Date(now);
    const next2 = new Date(now);

    next1.setUTCHours(3, 0, 0, 0);
    next2.setUTCHours(15, 0, 0, 0);

    if (next1 <= now) next1.setUTCDate(next1.getUTCDate() + 1);
    if (next2 <= now) next2.setUTCDate(next2.getUTCDate() + 1);

    const soonest = next1 < next2 ? next1 : next2;
    const diffMs  = soonest - now;
    const diffHrs = (diffMs / 1000 / 60 / 60).toFixed(1);

    console.log(`🕐 [Scheduler] Next refresh in ~${diffHrs} hours (${soonest.toISOString()})`);
  }
}

module.exports = new Scheduler();

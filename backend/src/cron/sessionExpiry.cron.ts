import cron from 'node-cron';
import pool from '../config/database';

/**
 * Initializes the session expiry cron job.
 * Runs every 5 minutes -> check for active sessions where expiry_time < now
 * Updates them to 'expired'.
 */
export const runSessionExpiryCheck = async () => {
    const client = await pool.connect();
    try {
        console.log('Running session expiry check...');

        const query = `
            UPDATE sessions
            SET status = 'expired'
            WHERE status = 'active' AND expiry_time < NOW()
            RETURNING id;
        `;

        const result = await client.query(query);

        if (result.rowCount && result.rowCount > 0) {
            console.log(`Expired ${result.rowCount} session(s). IDs: ${result.rows.map(row => row.id).join(', ')}`);
        } else {
            console.log('No active sessions found needing expiry.');
        }

    } catch (error) {
        console.error('Error running session expiry cron job:', error);
    } finally {
        client.release();
    }
};

export const initSessionExpiryCron = () => {
    // Schedule task to run every 5 minutes
    cron.schedule('*/5 * * * *', runSessionExpiryCheck);

    console.log('Session expiry cron job initialized (runs every 5 minutes).');
};

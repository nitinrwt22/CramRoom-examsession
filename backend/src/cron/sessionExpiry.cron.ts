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
        const query = `
            UPDATE sessions
            SET status = 'expired'
            WHERE status = 'active' AND expiry_time < NOW()
            RETURNING id;
        `;

        await client.query(query);

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

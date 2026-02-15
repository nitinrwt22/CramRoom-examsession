import pool from '../src/config/database';

async function checkDb() {
    try {
        const client = await pool.connect();

        console.log('--- Sessions ---');
        const sessions = await client.query('SELECT id, subject, host_id, status FROM sessions');
        console.table(sessions.rows);

        console.log('\n--- Participants ---');
        const participants = await client.query('SELECT session_id, user_id FROM participants');
        console.table(participants.rows);

        client.release();
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkDb();

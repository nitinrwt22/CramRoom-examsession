import pool from '../src/config/database';

async function debugSession7() {
    try {
        const client = await pool.connect();

        console.log('--- Debugging Session 7, User 12 ---');

        // 1. Check Session directly
        const session = await client.query('SELECT * FROM sessions WHERE id = 7');
        console.log('Session 7:', session.rows.length ? 'Found' : 'Not Found');
        if (session.rows.length) console.log(session.rows[0]);

        // 2. Check Participant directly
        const participant = await client.query('SELECT * FROM participants WHERE session_id = 7 AND user_id = 12');
        console.log('Participant (7, 12):', participant.rows.length ? 'Found' : 'Not Found');
        if (participant.rows.length) console.log(participant.rows[0]);

        // 3. Run the exact query from getSessionDetails
        const joinQuery = `
            SELECT 
                s.id,
                s.subject,
                s.status,
                s.exam_date,
                s.expiry_time,
                s.host_id,
                s.created_at
            FROM sessions s
            JOIN participants p ON s.id = p.session_id
            WHERE s.id = $1 AND p.user_id = $2;
        `;
        const joinResult = await client.query(joinQuery, [7, 6]);
        console.log('Join Query Result Rows (User 6):', joinResult.rowCount);
        if (joinResult.rowCount && joinResult.rowCount > 0) {
            console.log(joinResult.rows[0]);
        } else {
            console.log('User 6 is NOT a participant of Session 7 (or session 7 does not exist)');
        }

        // 4. Test service function directly
        console.log('--- Testing getSessionDetails service for User 6 ---');
        const { getSessionDetails } = require('../src/services/session.service');
        try {
            const serviceResult = await getSessionDetails(7, 6);
            console.log('Service Result:', serviceResult ? 'Success' : 'Failed');
        } catch (e: any) {
            console.error('Service threw error:', e.message);
        }

        client.release();
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

debugSession7();

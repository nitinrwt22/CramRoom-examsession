
import pool from './config/database';
import { runSessionExpiryCheck } from './cron/sessionExpiry.cron';
import * as sessionService from './services/session.service';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const runIntegrationTest = async () => {
    const client = await pool.connect();
    try {
        console.log('--- Starting Integration Test ---');

        // 1. Setup Host
        let hostId = 1;
        const userCheck = await client.query('SELECT id FROM users LIMIT 1');
        if (userCheck.rows.length === 0) {
            const newUser = await client.query("INSERT INTO users (name, email, password) VALUES ('Test Host', 'test@host.com', 'hashedpassword') RETURNING id");
            hostId = newUser.rows[0].id;
        } else {
            hostId = userCheck.rows[0].id;
        }

        // 2. Setup Participant (user to join)
        let participantId = 2;
        const pCheck = await client.query('SELECT id FROM users WHERE id != $1 LIMIT 1', [hostId]);
        if (pCheck.rows.length === 0) {
            const newP = await client.query("INSERT INTO users (name, email, password) VALUES ('Participant', 'part@test.com', 'hashedpassword') RETURNING id");
            participantId = newP.rows[0].id;
        } else {
            participantId = pCheck.rows[0].id;
        }

        // 3. Create active session expiring in the past (to simulate cron trigger condition)
        // We use past expiry to force cron to act immediately when run
        const insertQuery = `
            INSERT INTO sessions (subject, exam_date, expiry_time, host_id, status)
            VALUES ($1, NOW(), NOW() - interval '1 minute', $2, 'active')
            RETURNING id;
        `;
        const insertResult = await client.query(insertQuery, ['Integration Test Session', hostId]);
        const sessionId = insertResult.rows[0].id;
        console.log(`Created session ${sessionId} (expired 1 min ago, status active).`);

        // 4. Try to join BEFORE cron runs (should fail due to time check, OR if logic checks status only, might succeed if time check wasn't there. 
        // But logic checks time also.
        // Let's rely on the Cron Test mostly.

        // 5. Run Cron Logic
        console.log('Running cron logic manually...');
        await runSessionExpiryCheck();

        // 6. Verify Status
        const statusCheck = await client.query('SELECT status FROM sessions WHERE id = $1', [sessionId]);
        if (statusCheck.rows[0].status === 'expired') {
            console.log('SUCCESS: Session status updated to expired.');
        } else {
            console.error(`FAILURE: Session status is ${statusCheck.rows[0].status}`);
        }

        // 7. Try Join
        console.log('Attempting to join expired session...');
        try {
            await sessionService.joinSession(sessionId, participantId);
            console.error('FAILURE: Join succeeded but should have failed.');
        } catch (error: any) {
            console.log(`SUCCESS: Join failed as expected. Error: ${error.message}`);
            if (error.message === 'Session has expired' || error.message === 'Session is not active') {
                console.log('Error message matches expected validation.');
            }
        }

        // Cleanup
        await client.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
        console.log('Cleanup complete.');

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        client.release();
        process.exit(0);
    }
};

runIntegrationTest();

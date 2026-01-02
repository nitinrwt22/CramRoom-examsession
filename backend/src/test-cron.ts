
import pool from './config/database';

const runVerification = async () => {
    const client = await pool.connect();
    try {
        console.log('Seeding test data...');
        // 1. Create a dummy host (if needed, but assuming user 1 exists or flexible)
        // Let's first check if user 1 exists, if not create one
        let hostId = 1;
        const userCheck = await client.query('SELECT id FROM users LIMIT 1');
        if (userCheck.rows.length === 0) {
            const newUser = await client.query("INSERT INTO users (name, email, password) VALUES ('Test Host', 'test@host.com', 'hashedpassword') RETURNING id");
            hostId = newUser.rows[0].id;
        } else {
            hostId = userCheck.rows[0].id;
        }

        // 2. Insert an active session that expired 10 minutes ago
        const insertQuery = `
            INSERT INTO sessions (subject, exam_date, expiry_time, host_id, status)
            VALUES ($1, NOW(), NOW() - interval '10 minutes', $2, 'active')
            RETURNING id;
        `;
        const insertResult = await client.query(insertQuery, ['Cron Test Session', hostId]);
        const sessionId = insertResult.rows[0].id;
        console.log(`Created test session ${sessionId} which should be expired.`);

        // 3. Run the logic that the cron job runs
        console.log('Running cron logic...');
        const updateQuery = `
            UPDATE sessions
            SET status = 'expired'
            WHERE status = 'active' AND expiry_time < NOW()
            RETURNING id;
        `;
        const updateResult = await client.query(updateQuery);

        // 4. Verify
        const updatedIds = updateResult.rows.map(row => row.id);
        console.log(`Expired sessions: ${updatedIds.join(', ')}`);

        if (updatedIds.includes(sessionId)) {
            console.log('SUCCESS: Test session was correctly expired.');
        } else {
            console.error('FAILURE: Test session was NOT expired.');
        }

        // Cleanup
        await client.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
        console.log('Cleanup complete.');

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        client.release();
        process.exit(0);
    }
};

runVerification();

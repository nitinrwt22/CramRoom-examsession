import request from 'supertest';
import app from '../src/app';
import pool from '../src/config/database';
import { createUser, createSession, addParticipant, getSessionById } from '../src/db/helpers';
import jwt from 'jsonwebtoken';
import { config } from '../src/config/env';

const checkLeave = async () => {
    try {
        console.log('--- Checking Leave Session Route ---');

        const timestamp = Date.now();

        // 1. Setup Host and Session
        const host = await createUser(`Host Leave Check ${timestamp}`, `host_check_${timestamp}@example.com`, 'hashedpassword');
        const hostToken = jwt.sign({ id: host.id, email: host.email }, config.jwt.secret as string);

        const session = await createSession('Leave Check Subject', new Date(), new Date(Date.now() + 3600000), host.id);
        const sessionId = session.id;
        console.log(`Created Session: ${sessionId}`);

        // 2. Setup Participant
        const user = await createUser(`User Leave Check ${timestamp}`, `user_check_${timestamp}@example.com`, 'hashedpassword');
        const userToken = jwt.sign({ id: user.id, email: user.email }, config.jwt.secret as string);
        await addParticipant(user.id, sessionId);
        console.log(`User ${user.id} joined session`);

        // 3. Test Participant Leave
        console.log('\nTesting Participant Leave...');
        const partLeaveRes = await request(app)
            .post('/session/leave')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ sessionId });

        console.log(`Participant Leave Status: ${partLeaveRes.status}`);
        if (partLeaveRes.status === 200 && partLeaveRes.body.message === 'Successfully left session') {
            console.log('✅ Participant leave successful');
        } else {
            console.error('❌ Participant leave failed:', partLeaveRes.body);
        }

        // 4. Test Participant Leave Again (Should fail)
        console.log('\nTesting Double Leave...');
        const doubleLeaveRes = await request(app)
            .post('/session/leave')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ sessionId });

        console.log(`Double Leave Status: ${doubleLeaveRes.status}`);
        if (doubleLeaveRes.status === 400 && doubleLeaveRes.body.error === 'User is not a participant of this session') {
            console.log('✅ Double leave correctly blocked');
        } else {
            console.error('❌ Double leave check failed:', doubleLeaveRes.body);
        }

        // 5. Test Host Leave
        console.log('\nTesting Host Leave...');
        const hostLeaveRes = await request(app)
            .post('/session/leave')
            .set('Authorization', `Bearer ${hostToken}`)
            .send({ sessionId });

        console.log(`Host Leave Status: ${hostLeaveRes.status}`);
        if (hostLeaveRes.status === 200 && hostLeaveRes.body.message === 'Host left, session expired') {
            console.log('✅ Host leave successful');

            // Verify DB status
            const dbSession = await getSessionById(sessionId);
            if (dbSession.status === 'expired') {
                console.log('✅ Session status updated to expired');
            } else {
                console.error('❌ Session status NOT updated:', dbSession.status);
            }

        } else {
            console.error('❌ Host leave failed:', hostLeaveRes.body);
        }

    } catch (error) {
        console.error('Check Error:', error);
    } finally {
        await pool.end();
    }
};

checkLeave();

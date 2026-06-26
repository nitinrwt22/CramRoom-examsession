import * as dbHelper from '../db/helpers';
import pool from '../config/database';

/**
 * Creates a new session and adds the host as a participant.
 * 
 * @param subject - The subject of the exam/session
 * @param examDate - Date of the exam
 * @param expiryTime - Expiration time of the session
 * @param hostId - ID of the user creating the session
 * @returns The created session details
 */
export const createSession = async (
    subject: string,
    examDate: Date,
    expiryTime: Date,
    hostId: number
) => {
    try {
        // 1. Insert new session
        const session = await dbHelper.createSession(subject, examDate, expiryTime, hostId);

        if (!session || !session.id) {
            throw new Error('Failed to create session record');
        }

        // 2. Add host as participant
        // Note: This is not transactional with session creation based on current helpers
        const participant = await dbHelper.addParticipant(hostId, session.id);

        if (!participant) {
            // In a real transactional system we might roll back here, 
            // but current requirements specify using existing helpers.
            console.warn(`Host ${hostId} could not be added to session ${session.id}`);
            // We might want to throw here or just return the session with a warning.
            // Requirement says "Throw clear errors on failure", implies strict success.
            throw new Error('Failed to add host to session participants');
        }

        return {
            ...session,
            hostParticipantId: participant.id
        };

    } catch (error) {
        console.error('Error in createSession service:', error);
        if (error instanceof Error) {
            throw new Error(`Session creation failed: ${error.message}`);
        }
        throw new Error('Session creation failed due to an unknown error');
    }
};

/**
 * Adds a user to an existing active session.
 * 
 * @param sessionId - The ID of the session to join
 * @param userId - The ID of the user joining
 * @returns Success message or session info
 */
export const joinSession = async (sessionId: number, userId: number) => {
    try {
        // 1. Check if session exists
        const session = await dbHelper.getSessionById(sessionId);

        if (!session) {
            throw new Error('Session not found');
        }

        // 2. Check if session is expired
        if (new Date() > new Date(session.expiry_time)) {
            throw new Error('Session has expired');
        }

        if (session.status !== 'active') {
            throw new Error('Session is not active');
        }

        // 3. Add user to participants
        try {
            await dbHelper.addParticipant(userId, sessionId);
        } catch (error: any) {
            // Check for unique constraint violation (Postgres code 23505)
            if (error.code === '23505') {
                throw new Error('User already joined this session');
            }
            throw error;
        }

        return {
            message: 'Successfully joined session',
            sessionId: session.id,
            subject: session.subject
        };

    } catch (error) {
        console.error('Error in joinSession service:', error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('Failed to join session');
    }
};

/**
 * Removes a user from the session participants.
 * 
 * @param sessionId - The ID of the session to leave
 * @param userId - The ID of the user leaving
 * @returns Success message
 */
export const leaveSession = async (sessionId: number, userId: number) => {
    try {
        // 1. Get session to check host
        const session = await dbHelper.getSessionById(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        // 2. Check if session is expired
        if (new Date() > new Date(session.expiry_time)) {
            throw new Error('Session is expired');
        }

        // 3. Check if user is host
        if (session.host_id === userId) {
            // Host is leaving, expire the session
            await dbHelper.updateSessionStatus(sessionId, 'expired');
            return {
                message: 'Host left, session expired'
            };
        }

        // 4. Not host, just remove participant
        const removedParticipant = await dbHelper.removeParticipant(userId, sessionId);

        if (!removedParticipant) {
            throw new Error('User is not a participant of this session');
        }

        return {
            message: 'Successfully left session'
        };

    } catch (error) {
        console.error('Error in leaveSession service:', error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('Failed to leave session');
    }
};


/**
 * Fetches all sessions where the user is a participant.
 * 
 * @param userId - The ID of the user
 * @returns List of session details with role
 */
export const getMySessions = async (userId: number) => {
    const query = `
        SELECT 
            s.id,
            s.subject,
            s.status,
            s.exam_date,
            s.expiry_time,
            CASE 
                WHEN s.host_id = $1 THEN 'host'
                ELSE 'participant'
            END AS "role",
            (SELECT COUNT(*) FROM session_members p2 WHERE p2.session_id = s.id)::int as participants
        FROM sessions s
        JOIN session_members p ON s.id = p.session_id
        WHERE p.user_id = $1
        ORDER BY s.exam_date DESC;
    `;

    try {
        const result = await pool.query(query, [userId]);
        return result.rows;
    } catch (error) {
        console.error('Error fetching user sessions:', error);
        throw new Error('Failed to fetch user sessions');
    }
};

/**
 * Fetches active sessions where the user is a participant.
 * 
 * @param userId - The ID of the user
 * @returns List of active session details
 */
export const getActiveSessions = async (userId: number) => {
    const query = `
        SELECT 
            s.id AS "session_id",
            s.subject,
            s.status,
            s.exam_date,
            s.expiry_time,
            CASE 
                WHEN s.host_id = $1 THEN 'host'
                ELSE 'participant'
            END AS "role"
        FROM sessions s
        JOIN session_members p ON s.id = p.session_id
        WHERE p.user_id = $1 AND s.status = 'active'
        ORDER BY s.exam_date ASC;
    `;

    try {
        const result = await pool.query(query, [userId]);
        return result.rows;
    } catch (error) {
        console.error('Error fetching active sessions:', error);
        throw new Error('Failed to fetch active sessions');
    }
};


/**
 * Fetches session details and participants if the user is a member.
 * 
 * @param sessionId - The ID of the session
 * @param userId - The ID of the user requesting details
 * @returns Session details and list of participants
 */
export const getSessionDetails = async (sessionId: number, userId: number) => {
    const client = await pool.connect();
    try {
        // 1. Verify membership and get session details
        // We join sessions with participants to check if the requesting user is in the session
        const sessionQuery = `
            SELECT 
                s.id,
                s.subject,
                s.status,
                s.exam_date,
                s.expiry_time,
                s.host_id,
                s.created_at
            FROM sessions s
            JOIN session_members p ON s.id = p.session_id
            WHERE s.id = $1 AND p.user_id = $2;
        `;

        const sessionResult = await client.query(sessionQuery, [sessionId, userId]);

        if (sessionResult.rowCount === 0) {
            console.error(`Debug: Session not found or user not participant. SessionID: ${sessionId}, UserID: ${userId}`);



            throw new Error('Session not found or user is not a participant');
        }

        const session = sessionResult.rows[0];

        // 2. Get all participants
        const participantsQuery = `
            SELECT 
                u.id AS "user_id",
                u.name,
                CASE 
                    WHEN u.id = $2 THEN 'host'
                    ELSE 'participant'
                END AS "role"
            FROM session_members p
            JOIN users u ON p.user_id = u.id
            WHERE p.session_id = $1;
        `;

        const participantsResult = await client.query(participantsQuery, [sessionId, session.host_id]);

        return {
            ...session,
            participants: participantsResult.rows
        };

    } catch (error) {
        console.error('Error fetching session details:', error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('Failed to fetch session details');
    } finally {
        client.release();
    }
};



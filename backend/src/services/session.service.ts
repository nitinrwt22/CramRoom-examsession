import * as dbHelper from '../db/helpers';

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


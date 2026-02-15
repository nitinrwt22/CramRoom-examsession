import pool from '../config/database';

/**
 * SessionAIMessage
 * Represents a single interaction between a user and the AI within a session.
 */
export interface SessionAIMessage {
    id: string; // UUID
    session_id: number; // Integer (Foreign Key)
    user_id: number; // Integer (Foreign Key)
    intent: string;
    question: string;
    answer: string;
    created_at: Date;
}

/**
 * Saves a new AI interaction message to the database.
 * @param data - The message data to save (excluding id and created_at).
 * @returns The saved message record.
 */
export const saveSessionAIMessage = async (data: {
    session_id: number;
    user_id: number;
    intent: string;
    question: string;
    answer: string;
}): Promise<SessionAIMessage> => {
    const query = `
        INSERT INTO session_ai_messages (session_id, user_id, intent, question, answer)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
    `;

    try {
        const { session_id, user_id, intent, question, answer } = data;
        const result = await pool.query(query, [session_id, user_id, intent, question, answer]);
        return result.rows[0];
    } catch (error) {
        console.error("AI SAVE ERROR:", error);
        throw error;
    }
};

/**
 * Retrieves the AI interaction history for a specific session.
 * @param sessionId - The ID of the session (Integer).
 * @returns An array of AI messages ordered by creation time.
 */
export const getSessionAIHistory = async (sessionId: number): Promise<SessionAIMessage[]> => {
    const query = `
        SELECT * FROM session_ai_messages
        WHERE session_id = $1
        ORDER BY created_at ASC;
    `;

    try {
        const result = await pool.query(query, [sessionId]);
        return result.rows;
    } catch (error) {
        console.error('Error fetching session AI history:', error);
        throw error;
    }
};

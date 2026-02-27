import pool from '../config/database';

/**
 * Retrieves unchunked messages for a specific session.
 * @param sessionId - The ID of the session.
 */
export const getUnchunkedMessages = async (sessionId: string) => {
    const query = `
        SELECT * FROM session_ai_messages
        WHERE session_id = $1 AND is_chunked = false
        ORDER BY created_at ASC;
    `;
    const result = await pool.query(query, [sessionId]);
    return result.rows;
};

/**
 * Marks an array of message IDs as chunked.
 * @param messageIds - Array of message UUIDs.
 */
export const markMessagesAsChunked = async (messageIds: string[]) => {
    if (!messageIds.length) return;

    // Using ANY($1) is the standard parameterized way to do IN (...) in node-postgres
    const query = `
        UPDATE session_ai_messages
        SET is_chunked = true
        WHERE id = ANY($1);
    `;
    await pool.query(query, [messageIds]);
};

/**
 * Saves a new chunk summary to the database.
 * @param sessionId - The ID of the session.
 * @param startIndex - The starting index of the chunked messages.
 * @param endIndex - The ending index of the chunked messages.
 * @param summaryText - The synthesized summary text.
 */
export const saveChunkSummary = async (sessionId: string, startIndex: number, endIndex: number, summaryText: string) => {
    const query = `
        INSERT INTO session_ai_chunks (session_id, start_index, end_index, summary_text)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;
    const result = await pool.query(query, [sessionId, startIndex, endIndex, summaryText]);
    return result.rows[0];
};

/**
 * Retrieves all chunk summaries for a specific session.
 * @param sessionId - The ID of the session.
 */
export const getChunkSummaries = async (sessionId: string) => {
    const query = `
        SELECT * FROM session_ai_chunks
        WHERE session_id = $1
        ORDER BY created_at ASC;
    `;
    const result = await pool.query(query, [sessionId]);
    return result.rows;
};

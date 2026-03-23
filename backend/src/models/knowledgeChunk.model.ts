import pool from '../config/database';

/**
 * Knowledge chunk from the files table + session_ai_chunks.
 * Only chunks with file_id IS NOT NULL are knowledge chunks
 * (as opposed to AI message summary chunks).
 */
export interface KnowledgeChunk {
    id: string;
    session_id: number;
    file_id: number;
    topic: string;
    chunk_text: string;
    created_at: Date;
}

/**
 * Retrieves all knowledge chunks for a given session.
 * Knowledge chunks are distinguished from AI summary chunks by
 * having a non-null file_id.
 *
 * @param sessionId - The integer session ID
 * @returns Array of knowledge chunks ordered by creation time
 */
export const getKnowledgeChunksForSession = async (sessionId: number): Promise<KnowledgeChunk[]> => {
    const query = `
        SELECT
            sac.id,
            sac.session_id,
            sac.file_id,
            sac.topic,
            sac.chunk_text,
            sac.created_at
        FROM session_ai_chunks sac
        WHERE sac.session_id = $1
          AND sac.file_id IS NOT NULL
          AND sac.chunk_text IS NOT NULL
        ORDER BY sac.created_at ASC;
    `;
    const result = await pool.query(query, [sessionId]);
    return result.rows;
};

/**
 * Retrieves knowledge chunks for a session filtered by topic keyword.
 * Useful for intent-specific retrieval (e.g., only fetch chunks
 * relevant to the user's question topic).
 *
 * @param sessionId - The integer session ID
 * @param topicKeyword - Partial match against chunk topic column
 * @returns Filtered knowledge chunks
 */
export const getKnowledgeChunksByTopic = async (
    sessionId: number,
    topicKeyword: string
): Promise<KnowledgeChunk[]> => {
    const query = `
        SELECT
            sac.id,
            sac.session_id,
            sac.file_id,
            sac.topic,
            sac.chunk_text,
            sac.created_at
        FROM session_ai_chunks sac
        WHERE sac.session_id = $1
          AND sac.file_id IS NOT NULL
          AND sac.chunk_text IS NOT NULL
          AND LOWER(sac.topic) LIKE LOWER($2)
        ORDER BY sac.created_at ASC;
    `;
    const result = await pool.query(query, [sessionId, `%${topicKeyword}%`]);
    return result.rows;
};

import pool from '../config/database';

/**
 * Knowledge chunk — sourced from V2 tables (raw_questions, topics, uploaded_notes).
 * file_id is the V2 UUID of the parent paper, syllabus, or note.
 * Consumers should treat it as an opaque string identifier.
 */
export interface KnowledgeChunk {
    id: string;
    session_id: number;
    file_id: string;
    topic: string;
    chunk_text: string;
    created_at: Date;
}

/**
 * Retrieves all knowledge chunks for a given session from V2 tables.
 * Returns questions from papers, topic outlines from syllabi, and uploaded-note stubs.
 *
 * @param sessionId - The integer session ID
 * @returns Array of knowledge chunks ordered by creation time
 */
export const getKnowledgeChunksForSession = async (sessionId: number): Promise<KnowledgeChunk[]> => {
    const query = `
        SELECT * FROM (
            -- 1. PYQ questions
            SELECT
                rq.id::text AS id,
                p.session_id,
                p.id::text AS file_id,
                COALESCE(t.name, p.title) AS topic,
                rq.original_text AS chunk_text,
                p.uploaded_at AS created_at
            FROM raw_questions rq
            JOIN papers p ON rq.paper_id = p.id
            LEFT JOIN topics t ON rq.topic_id = t.id
            WHERE p.session_id = $1

            UNION ALL

            -- 2. Syllabus topics
            SELECT
                t.id::text AS id,
                s.session_id,
                s.id::text AS file_id,
                t.name AS topic,
                CASE
                    WHEN array_length(t.subtopics, 1) > 0 THEN t.name || E'\nSubtopics:\n- ' || array_to_string(t.subtopics, E'\n- ')
                    ELSE t.name
                END AS chunk_text,
                t.created_at
            FROM topics t
            JOIN syllabi s ON t.syllabus_id = s.id
            WHERE s.session_id = $1

            UNION ALL

            -- 3. Uploaded notes (placeholder chunk; full text is extracted
            --    asynchronously by the upload job worker).
            SELECT
                un.id::text AS id,
                un.session_id,
                un.id::text AS file_id,
                un.title AS topic,
                '[Uploaded Note]' || E'\n'
                    || 'Title: ' || un.title || E'\n'
                    || 'Status: pending extraction' || E'\n'
                    || 'PDF: ' || COALESCE(un.pdf_url, '') || E'\n\n'
                    || 'This note is registered in the knowledge base. '
                    || 'Detailed text extraction is performed asynchronously '
                    || 'by the upload job worker.'
                    AS chunk_text,
                un.uploaded_at AS created_at
            FROM uploaded_notes un
            WHERE un.session_id = $1
        ) q
        ORDER BY q.created_at ASC;
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
        SELECT * FROM (
            -- 1. PYQ questions
            SELECT
                rq.id::text AS id,
                p.session_id,
                p.id::text AS file_id,
                COALESCE(t.name, p.title) AS topic,
                rq.original_text AS chunk_text,
                p.uploaded_at AS created_at
            FROM raw_questions rq
            JOIN papers p ON rq.paper_id = p.id
            LEFT JOIN topics t ON rq.topic_id = t.id
            WHERE p.session_id = $1

            UNION ALL

            -- 2. Syllabus topics
            SELECT
                t.id::text AS id,
                s.session_id,
                s.id::text AS file_id,
                t.name AS topic,
                CASE
                    WHEN array_length(t.subtopics, 1) > 0 THEN t.name || E'\nSubtopics:\n- ' || array_to_string(t.subtopics, E'\n- ')
                    ELSE t.name
                END AS chunk_text,
                t.created_at
            FROM topics t
            JOIN syllabi s ON t.syllabus_id = s.id
            WHERE s.session_id = $1

            UNION ALL

            -- 3. Uploaded notes
            SELECT
                un.id::text AS id,
                un.session_id,
                un.id::text AS file_id,
                un.title AS topic,
                '[Uploaded Note]' || E'\n'
                    || 'Title: ' || un.title || E'\n'
                    || 'Status: pending extraction' || E'\n'
                    || 'PDF: ' || COALESCE(un.pdf_url, '') || E'\n\n'
                    || 'This note is registered in the knowledge base. '
                    || 'Detailed text extraction is performed asynchronously '
                    || 'by the upload job worker.'
                    AS chunk_text,
                un.uploaded_at AS created_at
            FROM uploaded_notes un
            WHERE un.session_id = $1
        ) q
        WHERE LOWER(q.topic) LIKE LOWER($2)
        ORDER BY q.created_at ASC;
    `;
    const result = await pool.query(query, [sessionId, `%${topicKeyword}%`]);
    return result.rows;
};

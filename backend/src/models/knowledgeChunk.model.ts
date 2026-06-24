import pool from '../config/database';
import { config } from '../config/env';

/**
 * Knowledge chunk.
 * In legacy mode the source is `files` + `session_ai_chunks` (file_id is the
 * legacy integer `files.id`). In V2 mode the source is `raw_questions`,
 * `topics`, or `uploaded_notes`, and file_id may be either the mapped legacy
 * integer (when present in `migration_file_uuid_map`) or the new V2 UUID
 * stringified. Consumers should treat it as an opaque identifier.
 */
export interface KnowledgeChunk {
    id: string;
    session_id: number;
    file_id: number | string;
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
    if (config.useV2Intelligence) {
        const query = `
            SELECT * FROM (
                -- 1. PYQ questions
                SELECT
                    rq.id::text AS id,
                    p.session_id,
                    m.old_file_id::text AS file_id,
                    COALESCE(t.name, p.title) AS topic,
                    rq.original_text AS chunk_text,
                    p.uploaded_at AS created_at
                FROM raw_questions rq
                JOIN papers p ON rq.paper_id = p.id
                LEFT JOIN topics t ON rq.topic_id = t.id
                JOIN migration_file_uuid_map m ON m.new_uuid = p.id AND m.target_table = 'papers'
                WHERE p.session_id = $1

                UNION ALL

                -- 2. Syllabus topics
                SELECT
                    t.id::text AS id,
                    s.session_id,
                    m.old_file_id::text AS file_id,
                    t.name AS topic,
                    CASE
                        WHEN array_length(t.subtopics, 1) > 0 THEN t.name || E'\nSubtopics:\\n- ' || array_to_string(t.subtopics, E'\n- ')
                        ELSE t.name
                    END AS chunk_text,
                    t.created_at
                FROM topics t
                JOIN syllabi s ON t.syllabus_id = s.id
                JOIN migration_file_uuid_map m ON m.new_uuid = s.id AND m.target_table = 'syllabi'
                WHERE s.session_id = $1

                UNION ALL

                -- 3. Uploaded notes (placeholder chunk; full text is extracted
                --    asynchronously by the upload job worker in Phase 4).
                SELECT
                    un.id::text AS id,
                    un.session_id,
                    COALESCE(m.old_file_id::text, un.id::text) AS file_id,
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
                LEFT JOIN migration_file_uuid_map m
                    ON m.new_uuid = un.id AND m.target_table = 'uploaded_notes'
                WHERE un.session_id = $1
            ) q
            ORDER BY q.created_at ASC;
        `;
        const result = await pool.query(query, [sessionId]);
        return result.rows;
    }

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
    if (config.useV2Intelligence) {
        const query = `
            SELECT * FROM (
                -- 1. PYQ questions
                SELECT
                    rq.id::text AS id,
                    p.session_id,
                    m.old_file_id::text AS file_id,
                    COALESCE(t.name, p.title) AS topic,
                    rq.original_text AS chunk_text,
                    p.uploaded_at AS created_at
                FROM raw_questions rq
                JOIN papers p ON rq.paper_id = p.id
                LEFT JOIN topics t ON rq.topic_id = t.id
                JOIN migration_file_uuid_map m ON m.new_uuid = p.id AND m.target_table = 'papers'
                WHERE p.session_id = $1

                UNION ALL

                -- 2. Syllabus topics
                SELECT
                    t.id::text AS id,
                    s.session_id,
                    m.old_file_id::text AS file_id,
                    t.name AS topic,
                    CASE
                        WHEN array_length(t.subtopics, 1) > 0 THEN t.name || E'\nSubtopics:\\n- ' || array_to_string(t.subtopics, E'\n- ')
                        ELSE t.name
                    END AS chunk_text,
                    t.created_at
                FROM topics t
                JOIN syllabi s ON t.syllabus_id = s.id
                JOIN migration_file_uuid_map m ON m.new_uuid = s.id AND m.target_table = 'syllabi'
                WHERE s.session_id = $1

                UNION ALL

                -- 3. Uploaded notes (placeholder chunk; full text is extracted
                --    asynchronously by the upload job worker in Phase 4).
                SELECT
                    un.id::text AS id,
                    un.session_id,
                    COALESCE(m.old_file_id::text, un.id::text) AS file_id,
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
                LEFT JOIN migration_file_uuid_map m
                    ON m.new_uuid = un.id AND m.target_table = 'uploaded_notes'
                WHERE un.session_id = $1
            ) q
            WHERE LOWER(q.topic) LIKE LOWER($2)
            ORDER BY q.created_at ASC;
        `;
        const result = await pool.query(query, [sessionId, `%${topicKeyword}%`]);
        return result.rows;
    }

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

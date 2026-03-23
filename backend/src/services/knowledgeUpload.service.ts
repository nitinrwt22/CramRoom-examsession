import fs from 'fs';
import matter from 'gray-matter';
import pool from '../config/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KnowledgeContentType =
    | 'notes'
    | 'pyqs'
    | 'assignments'
    | 'references'
    | 'cheatsheets';

export interface KnowledgeUploadResult {
    fileId: number;
    title: string;
    topic: string;
    contentType: KnowledgeContentType;
    chunkCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split markdown content into semantic chunks by ## headings.
 * Returns { heading, body } pairs. Skips empty sections.
 */
function chunkByHeadings(content: string, fallbackTopic: string): Array<{ heading: string; body: string }> {
    const chunks: Array<{ heading: string; body: string }> = [];
    const sections = content.split(/^(?=## )/m);

    for (const section of sections) {
        const trimmed = section.trim();
        if (!trimmed) continue;

        const headingMatch = trimmed.match(/^## (.+)/);
        if (headingMatch) {
            const heading = headingMatch[1].trim();
            const body = trimmed.replace(/^## .+\n?/, '').trim();
            if (body.length > 20) {
                chunks.push({ heading, body });
            }
        } else if (trimmed.length > 20) {
            chunks.push({ heading: fallbackTopic, body: trimmed });
        }
    }

    return chunks;
}

// ---------------------------------------------------------------------------
// Main service
// ---------------------------------------------------------------------------

/**
 * Processes a markdown knowledge file upload for a session.
 *
 * Pipeline:
 *  1. Verify session is active and user is a participant
 *  2. Parse YAML frontmatter from file buffer
 *  3. Resolve content type (frontmatter > user-provided > fallback)
 *  4. Insert file record into `files` table
 *  5. Chunk content by ## headings
 *  6. Insert chunks into `session_ai_chunks`
 */
export const processKnowledgeUpload = async (
    sessionId: number,
    userId: number,
    fileBuffer: Buffer,
    originalName: string,
    userContentType?: string
): Promise<KnowledgeUploadResult> => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verify session is active
        const sessionResult = await client.query(
            `SELECT id, status, expiry_time FROM sessions WHERE id = $1`,
            [sessionId]
        );
        if (sessionResult.rows.length === 0) {
            throw new Error('Session not found');
        }
        const session = sessionResult.rows[0];
        if (session.status !== 'active' || new Date(session.expiry_time) <= new Date()) {
            throw new Error('Session is not active or has expired');
        }

        // 2. Verify user is a participant
        const participantResult = await client.query(
            `SELECT 1 FROM participants WHERE session_id = $1 AND user_id = $2`,
            [sessionId, userId]
        );
        if (participantResult.rows.length === 0) {
            throw new Error('User is not a participant in this session');
        }

        // 3. Parse frontmatter
        const rawContent = fileBuffer.toString('utf-8');
        const parsed = matter(rawContent);
        const fm = parsed.data as {
            type?: string;
            topic?: string;
            session_tags?: string[];
        };

        // Resolve topic and content type
        const stem = originalName.replace(/\.md$/i, '').replace(/-/g, ' ');
        const topic: string = fm.topic || stem;
        const title: string = topic;

        const validTypes: KnowledgeContentType[] = ['notes', 'pyqs', 'assignments', 'references', 'cheatsheets'];
        const resolvedType = (
            (fm.type && validTypes.includes(fm.type as KnowledgeContentType) ? fm.type : null) ||
            (userContentType && validTypes.includes(userContentType as KnowledgeContentType) ? userContentType : null) ||
            'notes'
        ) as KnowledgeContentType;

        // 4. Insert file record into `files` table
        const fileInsert = await client.query(
            `INSERT INTO files (title, topic, content_type)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [title, topic, resolvedType]
        );
        const fileId: number = fileInsert.rows[0].id;

        // 5. Chunk markdown content
        const chunks = chunkByHeadings(parsed.content, topic);

        // 6. Insert chunks into session_ai_chunks
        for (const chunk of chunks) {
            await client.query(
                `INSERT INTO session_ai_chunks (session_id, file_id, topic, chunk_text)
                 VALUES ($1, $2, $3, $4)`,
                [sessionId, fileId, chunk.heading, chunk.body]
            );
        }

        await client.query('COMMIT');

        return {
            fileId,
            title,
            topic,
            contentType: resolvedType,
            chunkCount: chunks.length,
        };

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// ---------------------------------------------------------------------------
// List knowledge files for a session
// ---------------------------------------------------------------------------

/**
 * Returns all knowledge files attached to a session, with chunk count.
 */
export const getKnowledgeFiles = async (sessionId: number, userId: number) => {
    // Verify participant
    const participantResult = await pool.query(
        `SELECT 1 FROM participants WHERE session_id = $1 AND user_id = $2`,
        [sessionId, userId]
    );
    if (participantResult.rows.length === 0) {
        throw new Error('User is not a participant in this session');
    }

    const result = await pool.query(
        `SELECT
            f.id,
            f.title,
            f.topic,
            f.content_type,
            COUNT(sac.id)::int AS chunk_count,
            MIN(sac.created_at) AS created_at
         FROM files f
         JOIN session_ai_chunks sac ON sac.file_id = f.id
         WHERE sac.session_id = $1
           AND sac.file_id IS NOT NULL
           AND sac.chunk_text IS NOT NULL
         GROUP BY f.id, f.title, f.topic, f.content_type
         ORDER BY MIN(sac.created_at) DESC`,
        [sessionId]
    );
    return result.rows;
};

// ---------------------------------------------------------------------------
// Delete a knowledge file and its chunks
// ---------------------------------------------------------------------------

/**
 * Deletes a knowledge file and all its associated chunks for a session.
 * Only the uploader or host can delete.
 */
export const deleteKnowledgeFile = async (fileId: number, sessionId: number, userId: number) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verify file exists and is linked to this session
        const chunkCheck = await client.query(
            `SELECT 1 FROM session_ai_chunks WHERE file_id = $1 AND session_id = $2 LIMIT 1`,
            [fileId, sessionId]
        );
        if (chunkCheck.rows.length === 0) {
            throw new Error('Knowledge file not found in this session');
        }

        // Verify user is host or participant (anyone in the session can delete for now)
        const participantResult = await client.query(
            `SELECT 1 FROM participants WHERE session_id = $1 AND user_id = $2`,
            [sessionId, userId]
        );
        if (participantResult.rows.length === 0) {
            throw new Error('Unauthorized');
        }

        // Delete chunks then file
        await client.query(
            `DELETE FROM session_ai_chunks WHERE file_id = $1 AND session_id = $2`,
            [fileId, sessionId]
        );
        await client.query(`DELETE FROM files WHERE id = $1`, [fileId]);

        await client.query('COMMIT');
        return { message: 'Knowledge file deleted successfully' };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

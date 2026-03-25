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

/**
 * Custom parser for PYQ files. Extracts marks, year, and question text.
 */
function parsePyqContent(content: string, fallbackTopic: string, fallbackYear: number | null): Array<{ topic: string; chunk_text: string; marks: number | null; year: number | null }> {
    const chunks: Array<{ topic: string; chunk_text: string; marks: number | null; year: number | null }> = [];
    const sections = content.split(/^(?=## )/m);

    for (const section of sections) {
        const trimmed = section.trim();
        if (!trimmed) continue;

        const headingMatch = trimmed.match(/^## (.+)/);
        if (headingMatch) {
            let heading = headingMatch[1].trim();
            let body = trimmed.replace(/^## .+\n?/, '').trim();
            
            let marks: number | null = null;
            const marksMatch = heading.match(/(?:\[|\()?\s*(\d+)\s*(?:marks?|m)\s*(?:\]|\))?/i);
            if (marksMatch) {
                marks = parseInt(marksMatch[1], 10);
                heading = heading.replace(marksMatch[0], '').trim();
            } else {
                const bodyMarksMatch = body.match(/(?:\[|\()?\s*(\d+)\s*(?:marks?|m)\s*(?:\]|\))?/i);
                if (bodyMarksMatch) {
                    marks = parseInt(bodyMarksMatch[1], 10);
                }
            }

            let year: number | null = fallbackYear;
            const yearMatch = heading.match(/(?:\[|\()?\s*(20\d{2})\s*(?:\]|\))?/);
            if (yearMatch) {
                year = parseInt(yearMatch[1], 10);
                heading = heading.replace(yearMatch[0], '').trim();
            } else {
                const bodyYearMatch = body.match(/(?:\[|\()?\s*(20\d{2})\s*(?:\]|\))?/);
                if (bodyYearMatch) {
                    year = parseInt(bodyYearMatch[1], 10);
                }
            }

            // Cleanup heading
            heading = heading.replace(/^[\s\-\:]+|[\s\-\:]+$/g, '').trim();

            if (heading.length > 5) {
                const chunk_text = body ? `${heading}\n\n${body}` : heading;
                chunks.push({ topic: fallbackTopic, chunk_text, marks, year });
            }
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

        // 3. Parse frontmatter — strip null bytes first (PostgreSQL UTF-8 rejects 0x00)
        const rawContent = fileBuffer.toString('utf-8').replace(/\0/g, '');
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
            `INSERT INTO files (file_name, file_type, file_url, title, topic, content_type)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [originalName, 'text/markdown', 'knowledge', title, topic, resolvedType]
        );
        const fileId: number = fileInsert.rows[0].id;

        // 5. Parse content based on type
        let totalChunks = 0;

        if (resolvedType === 'pyqs') {
            // Extract a generic year from the title if available
            const yearMatch = title.match(/(20\d{2})/);
            const fallbackYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
            
            const pyqChunks = parsePyqContent(parsed.content, topic, fallbackYear);
            totalChunks = pyqChunks.length;
            
            for (const chunk of pyqChunks) {
                await client.query(
                    `INSERT INTO session_ai_chunks (session_id, file_id, topic, chunk_text, marks, year)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [sessionId, fileId, chunk.topic, chunk.chunk_text, chunk.marks, chunk.year]
                );
            }
        } else {
            const chunks = chunkByHeadings(parsed.content, topic);
            totalChunks = chunks.length;

            for (const chunk of chunks) {
                await client.query(
                    `INSERT INTO session_ai_chunks (session_id, file_id, topic, chunk_text)
                     VALUES ($1, $2, $3, $4)`,
                    [sessionId, fileId, chunk.heading, chunk.body]
                );
            }
        }

        await client.query('COMMIT');

        return {
            fileId,
            title,
            topic,
            contentType: resolvedType,
            chunkCount: totalChunks,
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

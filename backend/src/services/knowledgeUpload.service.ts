import matter from 'gray-matter';
import pool from '../config/database';
import { detectFileType, extractText, normaliseToMarkdown } from '../utils/fileConverter.util';
import fs from 'fs';
import path from 'path';

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
    const sections = content.split(/^(?=## |(?:Q?\d+\.)(?:\s+|$))/m);

    for (const section of sections) {
        const trimmed = section.trim();
        if (!trimmed) continue;

        const headingMatch = trimmed.match(/^(?:## |(?:Q?\d+\.))\s*(.*)/);
        if (headingMatch && headingMatch[1].trim()) {
            let heading = headingMatch[1].trim();
            let body = trimmed.replace(/^(?:## |(?:Q?\d+\.))\s*.*\n?/, '').trim();
            
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

            if (heading.length > 3 || body.length > 5) {
                const chunk_text = body ? `${heading}\n\n${body}` : heading;
                chunks.push({ topic: fallbackTopic, chunk_text: chunk_text.trim(), marks, year });
            }
        } else if (trimmed.length > 10) {
            let marks: number | null = null;
            const marksMatch = trimmed.match(/(?:\[|\()?\s*(\d+)\s*(?:marks?|m)\s*(?:\]|\))?/i);
            if (marksMatch) marks = parseInt(marksMatch[1], 10);

            let year: number | null = fallbackYear;
            const yearMatch = trimmed.match(/(?:\[|\()?\s*(20\d{2})\s*(?:\]|\))?/);
            if (yearMatch) year = parseInt(yearMatch[1], 10);

            chunks.push({ topic: fallbackTopic, chunk_text: trimmed, marks, year });
        }
    }

    return chunks;
}

// ---------------------------------------------------------------------------
// Main service
// ---------------------------------------------------------------------------

/**
 * Processes a knowledge file upload (.md, .pdf, or .docx) for a session.
 *
 * Pipeline:
 *  1. Verify session is active and user is a participant
 *  2. Extract text from file (PDF/Word → plain text; MD → raw string)
 *  3. Resolve topic and content type
 *  4. Insert file record into `files` table
 *  5. Chunk content by headings
 *  6. Insert chunks into `session_ai_chunks`
 */
export const processKnowledgeUpload = async (
    sessionId: number,
    userId: number,
    fileBuffer: Buffer,
    originalName: string,
    userContentType?: string,
    storedFileName?: string
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

        // 3. Detect file type and extract plain text
        const fileType = detectFileType(originalName);
        const mimeTypeMap = { md: 'text/markdown', pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
        const extractedText = await extractText(fileBuffer, fileType);

        // For MD files: parse YAML frontmatter. For PDF/Word: treat all as plain content.
        let fm: { type?: string; topic?: string } = {};
        let markdownContent: string;

        if (fileType === 'md') {
            const parsed = matter(extractedText);
            fm = parsed.data as { type?: string; topic?: string };
            markdownContent = parsed.content;
        } else {
            // Convert PDF/Word extracted text to a markdown-like format for chunking
            markdownContent = normaliseToMarkdown(extractedText);
        }

        // Resolve topic and content type
        const stem = originalName
            .replace(/\.(md|pdf|docx)$/i, '')
            .replace(/[-_]/g, ' ');
        const topic: string = fm.topic || stem;
        const title: string = topic;

        const validTypes: KnowledgeContentType[] = ['notes', 'pyqs', 'assignments', 'references', 'cheatsheets'];
        const resolvedType = (
            (fm.type && validTypes.includes(fm.type as KnowledgeContentType) ? fm.type : null) ||
            (userContentType && validTypes.includes(userContentType as KnowledgeContentType) ? userContentType : null) ||
            'notes'
        ) as KnowledgeContentType;

        // Save file to disk if storedFileName is provided
        if (storedFileName) {
            const uploadPath = path.join(process.cwd(), 'uploads/knowledge');
            if (!fs.existsSync(uploadPath)) {
                fs.mkdirSync(uploadPath, { recursive: true });
            }
            fs.writeFileSync(path.join(uploadPath, storedFileName), fileBuffer);
        }

        // 4. Insert file record into `files` table
        const fileInsert = await client.query(
            `INSERT INTO files (file_name, file_type, file_url, title, topic, content_type)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [originalName, mimeTypeMap[fileType], storedFileName || 'knowledge', title, topic, resolvedType]
        );
        const fileId: number = fileInsert.rows[0].id;

        // 5. Parse content based on type
        let totalChunks = 0;

        if (resolvedType === 'pyqs') {
            // Extract a generic year from the title if available
            const yearMatch = title.match(/(20\d{2})/);
            const fallbackYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
            
            const pyqChunks = parsePyqContent(markdownContent, topic, fallbackYear);
            totalChunks = pyqChunks.length;
            
            for (const chunk of pyqChunks) {
                await client.query(
                    `INSERT INTO session_ai_chunks (session_id, file_id, topic, chunk_text, marks, year)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [sessionId, fileId, chunk.topic, chunk.chunk_text, chunk.marks, chunk.year]
                );
            }
        } else {
            const chunks = chunkByHeadings(markdownContent, topic);
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
         LEFT JOIN session_ai_chunks sac ON sac.file_id = f.id
         WHERE (sac.session_id = $1 OR f.id IN (SELECT file_id FROM session_ai_chunks WHERE session_id = $1))
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

        // Fetch file URL before deleting to remove from disk
        const fileRecordResult = await client.query(
            `SELECT file_url FROM files WHERE id = $1`,
            [fileId]
        );
        const fileUrl = fileRecordResult.rows.length > 0 ? fileRecordResult.rows[0].file_url : null;
        
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

        // Delete from disk if we have a stored file URL
        if (fileUrl && fileUrl !== 'knowledge') {
            const filePath = path.join(process.cwd(), 'uploads/knowledge', fileUrl);
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (fsError) {
                console.error(`Failed to delete file from disk: ${filePath}`, fsError);
            }
        }

        return { message: 'Knowledge file deleted successfully' };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// ---------------------------------------------------------------------------
// Download a knowledge file
// ---------------------------------------------------------------------------

export const downloadKnowledgeFile = async (fileId: number, sessionId: number, userId: number) => {
    // 1. Verify file exists
    const fileResult = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);

    if (fileResult.rows.length === 0) {
        throw new Error('File not found');
    }

    const file = fileResult.rows[0];

    // 2. Verify user is a participant
    const participantResult = await pool.query(
        'SELECT 1 FROM participants WHERE session_id = $1 AND user_id = $2',
        [sessionId, userId]
    );

    if (participantResult.rows.length === 0) {
        throw new Error('User is not a participant in this session');
    }

    // 3. Verify file exists on disk
    if (!file.file_url || file.file_url === 'knowledge') {
        throw new Error('This file was not saved globally and cannot be downloaded.');
    }

    const absolutePath = path.join(process.cwd(), 'uploads/knowledge', file.file_url);

    if (!fs.existsSync(absolutePath)) {
        throw new Error('File not found on disk');
    }

    return {
        absolutePath,
        mimeType: file.file_type,
        originalName: file.file_name,
    };
};

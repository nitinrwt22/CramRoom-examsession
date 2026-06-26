import matter from 'gray-matter';
import pool from '../config/database';
import { detectFileType, extractText, normaliseToMarkdown } from '../utils/fileConverter.util';
import fs from 'fs';
import path from 'path';

// Shared query runner type — accepts either the connection pool or a
// transactional PoolClient (both expose `.query(text, values)`).
type QueryRunner = {
    query: (text: string, values?: any[]) => Promise<{ rows: any[]; rowCount: number }>;
};

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
    fileId: string;    // V2 UUID of the inserted record
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
 *  4. Insert into the appropriate V2 table (papers / syllabi / uploaded_notes)
 *  5. Queue a background job for async text extraction and chunking
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
            `SELECT 1 FROM session_members WHERE session_id = $1 AND user_id = $2`,
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

        // 4. Insert into the appropriate V2 table and queue a background processing job
        let v2FileId: string;

        if (resolvedType === 'pyqs') {
            const yearMatch = title.match(/(20\d{2})/);
            const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

            const nameLower = originalName.toLowerCase();
            let examType = 'endsem';
            if (nameLower.includes('mid') || nameLower.includes('midsem')) examType = 'midsem';
            else if (nameLower.includes('quiz')) examType = 'quiz';

            const paperInsert = await client.query(
                `INSERT INTO papers (session_id, title, year, exam_type, pdf_url, status, uploaded_by)
                 VALUES ($1, $2, $3, $4, $5, 'uploaded', $6)
                 RETURNING id`,
                [sessionId, title, year, examType, storedFileName || 'knowledge', userId]
            );
            v2FileId = paperInsert.rows[0].id;

            const payload = { storedFileName, originalName, title, topic, resolvedType };
            await client.query(
                `INSERT INTO jobs (session_id, job_type, status, payload)
                 VALUES ($1, 'UPLOAD_PROCESSING', 'queued', $2)`,
                [sessionId, JSON.stringify(payload)]
            );
        } else if (originalName.toLowerCase().includes('syllabus') || topic.toLowerCase() === 'syllabus') {
            const syllabusInsert = await client.query(
                `INSERT INTO syllabi (session_id, file_name, file_url, raw_text, uploaded_by)
                 VALUES ($1, $2, $3, '', $4)
                 RETURNING id`,
                [sessionId, originalName, storedFileName || 'knowledge', userId]
            );
            v2FileId = syllabusInsert.rows[0].id;

            const payload = { storedFileName, originalName, title, topic, resolvedType };
            await client.query(
                `INSERT INTO jobs (session_id, job_type, status, payload)
                 VALUES ($1, 'SYLLABUS_PROCESSING', 'queued', $2)`,
                [sessionId, JSON.stringify(payload)]
            );
        } else {
            // reference notes / slides
            const notesInsert = await client.query(
                `INSERT INTO uploaded_notes (session_id, title, pdf_url, uploaded_by)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id`,
                [sessionId, title, storedFileName || 'knowledge', userId]
            );
            v2FileId = notesInsert.rows[0].id;
        }

        await client.query('COMMIT');

        // chunkCount is 0 at upload time; chunks are produced asynchronously by job workers.
        return {
            fileId: v2FileId,
            title,
            topic,
            contentType: resolvedType,
            chunkCount: 0,
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
 * Resolve a knowledge-file UUID to a concrete V2 record.
 * Returns null when the id does not match any V2 record.
 */
interface V2KnowledgeFileRef {
    kind: 'paper' | 'syllabus' | 'note';
    uuid: string;
    storage_url: string | null;
    original_name: string;
}

const resolveV2KnowledgeFile = async (
    client: QueryRunner,
    fileId: string | number
): Promise<V2KnowledgeFileRef | null> => {
    const uuid = String(fileId).trim();
    const uuidRes = await client.query(
        `SELECT 'paper'::text AS kind, id, pdf_url AS storage_url, title AS original_name
           FROM papers WHERE id::text = $1
         UNION ALL
         SELECT 'syllabus'::text, id, file_url, file_name
           FROM syllabi WHERE id::text = $1
         UNION ALL
         SELECT 'note'::text, id, pdf_url, title
           FROM uploaded_notes WHERE id::text = $1
         LIMIT 1`,
        [uuid]
    );
    if (uuidRes.rows.length === 0) return null;
    const row = uuidRes.rows[0];
    return {
        kind: row.kind as 'paper' | 'syllabus' | 'note',
        uuid: row.id,
        storage_url: row.storage_url,
        original_name: row.original_name
    };
};

/**
 * Returns all knowledge files attached to a session, with chunk count.
 * Sourced from V2 tables (papers, syllabi, uploaded_notes).
 */
export const getKnowledgeFiles = async (sessionId: number, userId: number) => {
    // Verify participant
    const participantResult = await pool.query(
        `SELECT 1 FROM session_members WHERE session_id = $1 AND user_id = $2`,
        [sessionId, userId]
    );
    if (participantResult.rows.length === 0) {
        throw new Error('User is not a participant in this session');
    }

    const result = await pool.query(
        `SELECT * FROM (
            SELECT
                p.id::text AS id,
                p.title,
                COALESCE(p.title, '') AS topic,
                'pyqs' AS content_type,
                (SELECT COUNT(*)::int FROM raw_questions WHERE paper_id = p.id) AS chunk_count,
                p.uploaded_at AS created_at
            FROM papers p
            WHERE p.session_id = $1

            UNION ALL

            SELECT
                sy.id::text AS id,
                sy.file_name AS title,
                sy.file_name AS topic,
                'syllabus' AS content_type,
                (SELECT COUNT(*)::int FROM topics WHERE syllabus_id = sy.id) AS chunk_count,
                sy.uploaded_at AS created_at
            FROM syllabi sy
            WHERE sy.session_id = $1

            UNION ALL

            SELECT
                un.id::text AS id,
                un.title,
                un.title AS topic,
                'notes' AS content_type,
                1 AS chunk_count,
                un.uploaded_at AS created_at
            FROM uploaded_notes un
            WHERE un.session_id = $1
        ) v2
        ORDER BY created_at DESC`,
        [sessionId]
    );

    return result.rows;
};

// ---------------------------------------------------------------------------
// Delete a knowledge file and its chunks
// ---------------------------------------------------------------------------

/**
 * Deletes a knowledge file and all its associated data for a session.
 * Only a session participant can delete. Accepts a V2 UUID.
 */
export const deleteKnowledgeFile = async (fileId: number | string, sessionId: number, userId: number) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Authorization — verify participant
        const participantResult = await client.query(
            `SELECT 1 FROM session_members WHERE session_id = $1 AND user_id = $2`,
            [sessionId, userId]
        );
        if (participantResult.rows.length === 0) {
            throw new Error('Unauthorized');
        }

        const v2Ref = await resolveV2KnowledgeFile(client, fileId);
        if (!v2Ref) {
            throw new Error('Knowledge file not found in this session');
        }

        // Verify the resolved record belongs to this session
        let belongs = false;
        if (v2Ref.kind === 'paper') {
            const r = await client.query(`SELECT 1 FROM papers WHERE id = $1 AND session_id = $2`, [v2Ref.uuid, sessionId]);
            belongs = r.rows.length > 0;
        } else if (v2Ref.kind === 'syllabus') {
            const r = await client.query(`SELECT 1 FROM syllabi WHERE id = $1 AND session_id = $2`, [v2Ref.uuid, sessionId]);
            belongs = r.rows.length > 0;
        } else {
            const r = await client.query(`SELECT 1 FROM uploaded_notes WHERE id = $1 AND session_id = $2`, [v2Ref.uuid, sessionId]);
            belongs = r.rows.length > 0;
        }
        if (!belongs) {
            throw new Error('Knowledge file not found in this session');
        }

        // Cascade delete in safe order (FKs without ON DELETE CASCADE
        // must be cleaned explicitly before the parent row is removed).
        if (v2Ref.kind === 'paper') {
            await client.query(
                `DELETE FROM question_variants
                  WHERE raw_question_id IN (SELECT id FROM raw_questions WHERE paper_id = $1)`,
                [v2Ref.uuid]
            );
            await client.query(
                `DELETE FROM raw_questions WHERE paper_id = $1`,
                [v2Ref.uuid]
            );
            await client.query(
                `DELETE FROM papers WHERE id = $1`,
                [v2Ref.uuid]
            );
        } else if (v2Ref.kind === 'syllabus') {
            // topics under this syllabus may have canonical_questions and analytics
            await client.query(
                `DELETE FROM topic_analytics
                  WHERE topic_id IN (SELECT id FROM topics WHERE syllabus_id = $1)`,
                [v2Ref.uuid]
            );
            await client.query(
                `DELETE FROM question_analytics
                  WHERE canonical_question_id IN (
                      SELECT cq.id FROM canonical_questions cq
                      JOIN topics t ON cq.topic_id = t.id
                      WHERE t.syllabus_id = $1
                  )`,
                [v2Ref.uuid]
            );
            await client.query(
                `DELETE FROM question_variants
                  WHERE canonical_question_id IN (
                      SELECT cq.id FROM canonical_questions cq
                      JOIN topics t ON cq.topic_id = t.id
                      WHERE t.syllabus_id = $1
                  )`,
                [v2Ref.uuid]
            );
            await client.query(
                `DELETE FROM canonical_questions
                  WHERE topic_id IN (SELECT id FROM topics WHERE syllabus_id = $1)`,
                [v2Ref.uuid]
            );
            await client.query(
                `DELETE FROM topic_progress_history
                  WHERE topic_id IN (SELECT id FROM topics WHERE syllabus_id = $1)`,
                [v2Ref.uuid]
            );
            await client.query(
                `DELETE FROM topics WHERE syllabus_id = $1`,
                [v2Ref.uuid]
            );
            await client.query(
                `DELETE FROM syllabi WHERE id = $1`,
                [v2Ref.uuid]
            );
        } else {
            // uploaded_notes — no children to cascade.
            await client.query(
                `DELETE FROM uploaded_notes WHERE id = $1`,
                [v2Ref.uuid]
            );
        }

        await client.query('COMMIT');

        if (v2Ref.storage_url && v2Ref.storage_url !== 'knowledge') {
            const filePath = path.join(process.cwd(), 'uploads/knowledge', v2Ref.storage_url);
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

export const downloadKnowledgeFile = async (fileId: number | string, sessionId: number, userId: number) => {
    // 1. Verify user is a participant
    const participantResult = await pool.query(
        'SELECT 1 FROM session_members WHERE session_id = $1 AND user_id = $2',
        [sessionId, userId]
    );
    if (participantResult.rows.length === 0) {
        throw new Error('User is not a participant in this session');
    }

    // 2. Resolve V2 record
    const v2Ref = await resolveV2KnowledgeFile(pool, fileId);
    if (!v2Ref) {
        throw new Error('File not found');
    }

    // Confirm the resolved record belongs to this session
    let belongs = false;
    if (v2Ref.kind === 'paper') {
        const r = await pool.query(`SELECT 1 FROM papers WHERE id = $1 AND session_id = $2`, [v2Ref.uuid, sessionId]);
        belongs = r.rows.length > 0;
    } else if (v2Ref.kind === 'syllabus') {
        const r = await pool.query(`SELECT 1 FROM syllabi WHERE id = $1 AND session_id = $2`, [v2Ref.uuid, sessionId]);
        belongs = r.rows.length > 0;
    } else {
        const r = await pool.query(`SELECT 1 FROM uploaded_notes WHERE id = $1 AND session_id = $2`, [v2Ref.uuid, sessionId]);
        belongs = r.rows.length > 0;
    }
    if (!belongs) {
        throw new Error('File not found');
    }

    if (!v2Ref.storage_url || v2Ref.storage_url === 'knowledge') {
        throw new Error('This file was not saved globally and cannot be downloaded.');
    }
    const absolutePath = path.join(process.cwd(), 'uploads/knowledge', v2Ref.storage_url);
    if (!fs.existsSync(absolutePath)) {
        throw new Error('File not found on disk');
    }
    return {
        absolutePath,
        mimeType: 'application/pdf',
        originalName: v2Ref.original_name,
    };
};

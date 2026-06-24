import matter from 'gray-matter';
import pool from '../config/database';
import { detectFileType, extractText, normaliseToMarkdown } from '../utils/fileConverter.util';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';

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

        // 4. Insert file record into `files` table (Compatibility master registration)
        const fileInsert = await client.query(
            `INSERT INTO files (file_name, file_type, file_url, title, topic, content_type)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [originalName, mimeTypeMap[fileType], storedFileName || 'knowledge', title, topic, resolvedType]
        );
        const fileId: number = fileInsert.rows[0].id;

        // 5. If V2 is active, insert into V2 tables and queue background jobs
        if (config.useV2Intelligence) {
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
                const paperUuid = paperInsert.rows[0].id;

                await client.query(
                    `INSERT INTO migration_file_uuid_map (old_file_id, new_uuid, target_table)
                     VALUES ($1, $2, 'papers')`,
                    [fileId, paperUuid]
                );

                const payload = { fileId, storedFileName, originalName, title, topic, resolvedType };
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
                const syllabusUuid = syllabusInsert.rows[0].id;

                await client.query(
                    `INSERT INTO migration_file_uuid_map (old_file_id, new_uuid, target_table)
                     VALUES ($1, $2, 'syllabi')`,
                    [fileId, syllabusUuid]
                );

                const payload = { fileId, storedFileName, originalName, title, topic, resolvedType };
                await client.query(
                    `INSERT INTO jobs (session_id, job_type, status, payload)
                     VALUES ($1, 'SYLLABUS_PROCESSING', 'queued', $2)`,
                    [sessionId, JSON.stringify(payload)]
                );
            } else {
                // reference notes/slides
                const notesInsert = await client.query(
                    `INSERT INTO uploaded_notes (session_id, title, pdf_url, uploaded_by)
                     VALUES ($1, $2, $3, $4)
                     RETURNING id`,
                    [sessionId, title, storedFileName || 'knowledge', userId]
                );
                const notesUuid = notesInsert.rows[0].id;

                await client.query(
                    `INSERT INTO migration_file_uuid_map (old_file_id, new_uuid, target_table)
                     VALUES ($1, $2, 'uploaded_notes')`,
                    [fileId, notesUuid]
                );
            }
        }

        // Dual-write synchronously to legacy tables for rollback safety
        let totalChunks = 0;
        if (resolvedType === 'pyqs') {
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
 * Resolve a knowledge-file id (either a legacy integer from the `files` table
 * or a V2 UUID from `papers`/`syllabi`/`uploaded_notes`) to a concrete V2
 * record, when one exists. Returns null when the id does not match any V2
 * record. The integer form is resolved via `migration_file_uuid_map` first,
 * then by direct UUID match across the three V2 tables.
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
    const numericId = typeof fileId === 'number' ? fileId : parseInt(fileId, 10);
    const hasNumeric = !isNaN(numericId) && String(numericId) === String(fileId).trim();

    if (hasNumeric) {
        const mapRes = await client.query(
            `SELECT new_uuid, target_table
             FROM migration_file_uuid_map
             WHERE old_file_id = $1`,
            [numericId]
        );
        if (mapRes.rows.length > 0) {
            const { new_uuid, target_table } = mapRes.rows[0];
            if (target_table === 'papers') {
                const r = await client.query(`SELECT id, pdf_url, title FROM papers WHERE id = $1`, [new_uuid]);
                if (r.rows.length > 0) return { kind: 'paper', uuid: r.rows[0].id, storage_url: r.rows[0].pdf_url, original_name: r.rows[0].title };
            } else if (target_table === 'syllabi') {
                const r = await client.query(`SELECT id, file_url, file_name FROM syllabi WHERE id = $1`, [new_uuid]);
                if (r.rows.length > 0) return { kind: 'syllabus', uuid: r.rows[0].id, storage_url: r.rows[0].file_url, original_name: r.rows[0].file_name };
            } else if (target_table === 'uploaded_notes') {
                const r = await client.query(`SELECT id, pdf_url, title FROM uploaded_notes WHERE id = $1`, [new_uuid]);
                if (r.rows.length > 0) return { kind: 'note', uuid: r.rows[0].id, storage_url: r.rows[0].pdf_url, original_name: r.rows[0].title };
            }
        }
    }

    // Fallback: treat input as a UUID. Accept any V2 table.
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
 *
 * In V2 mode, results from both the legacy `files` table and the V2 tables
 * (`papers`, `syllabi`, `uploaded_notes`) are merged and deduplicated by id
 * so that any pre-existing legacy uploads remain visible alongside V2
 * uploads produced by the dual-write path.
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

    if (!config.useV2Intelligence) {
        return result.rows;
    }

    // V2 branch: papers + syllabi + uploaded_notes, with mapped legacy id
    // when available so the same upload exposed by both tables shares one id.
    const v2Result = await pool.query(
        `SELECT * FROM (
            SELECT
                COALESCE(m.old_file_id::text, p.id::text) AS id,
                p.title,
                COALESCE(p.title, '') AS topic,
                'pyqs' AS content_type,
                (SELECT COUNT(*)::int FROM raw_questions WHERE paper_id = p.id) AS chunk_count,
                p.uploaded_at AS created_at
            FROM papers p
            LEFT JOIN migration_file_uuid_map m
                ON m.new_uuid = p.id AND m.target_table = 'papers'
            WHERE p.session_id = $1

            UNION ALL

            SELECT
                COALESCE(m.old_file_id::text, sy.id::text) AS id,
                sy.file_name AS title,
                sy.file_name AS topic,
                'syllabus' AS content_type,
                (SELECT COUNT(*)::int FROM topics WHERE syllabus_id = sy.id) AS chunk_count,
                sy.uploaded_at AS created_at
            FROM syllabi sy
            LEFT JOIN migration_file_uuid_map m
                ON m.new_uuid = sy.id AND m.target_table = 'syllabi'
            WHERE sy.session_id = $1

            UNION ALL

            SELECT
                COALESCE(m.old_file_id::text, un.id::text) AS id,
                un.title,
                un.title AS topic,
                'notes' AS content_type,
                1 AS chunk_count,
                un.uploaded_at AS created_at
            FROM uploaded_notes un
            LEFT JOIN migration_file_uuid_map m
                ON m.new_uuid = un.id AND m.target_table = 'uploaded_notes'
            WHERE un.session_id = $1
        ) v2`,
        [sessionId]
    );

    // Merge legacy and V2 results, dedupe by id (legacy rows win on conflict
    // because they carry richer `topic`/`content_type` data from the upload).
    const merged = new Map<string, any>();
    for (const row of result.rows) {
        merged.set(String(row.id), row);
    }
    for (const row of v2Result.rows) {
        const key = String(row.id);
        if (!merged.has(key)) {
            merged.set(key, row);
        }
    }
    const finalRows = Array.from(merged.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return finalRows;
};

// ---------------------------------------------------------------------------
// Delete a knowledge file and its chunks
// ---------------------------------------------------------------------------

/**
 * Deletes a knowledge file and all its associated chunks for a session.
 * Only the uploader or host can delete.
 *
 * Accepts either the legacy integer `files.id` (when the upload predates V2
 * or was dual-written) or a V2 UUID. When `useV2Intelligence=true` and the id
 * resolves to a V2 record, the corresponding V2 tables are cascade-cleaned
 * (and the legacy mirror rows are also removed when present, to avoid
 * leaving orphaned legacy chunks after a V2 delete).
 */
export const deleteKnowledgeFile = async (fileId: number | string, sessionId: number, userId: number) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Authorization first — same rule for both branches
        const participantResult = await client.query(
            `SELECT 1 FROM participants WHERE session_id = $1 AND user_id = $2`,
            [sessionId, userId]
        );
        if (participantResult.rows.length === 0) {
            throw new Error('Unauthorized');
        }

        // Try V2 resolution first when the flag is enabled. If a V2 record
        // exists, perform the cascade delete and return.
        if (config.useV2Intelligence) {
            const v2Ref = await resolveV2KnowledgeFile(client, fileId);
            if (v2Ref) {
                // Verify the resolved record is scoped to this session.
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
                    // Delete variant links that point at any raw_question of
                    // this paper, then the raw_questions, then the paper.
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
                    // topics under this syllabus may have canonical_questions
                    // and analytics — delete analytics first, then topics.
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

                // Clean up the migration map entry so future lookups don't
                // dangle. Also clean up the legacy mirror rows so a re-query
                // through the legacy path doesn't return an orphan.
                const numericId = typeof fileId === 'number' ? fileId : parseInt(String(fileId), 10);
                if (!isNaN(numericId) && String(numericId) === String(fileId).trim()) {
                    await client.query(
                        `DELETE FROM migration_file_uuid_map WHERE old_file_id = $1`,
                        [numericId]
                    );
                    await client.query(
                        `DELETE FROM session_ai_chunks WHERE file_id = $1 AND session_id = $2`,
                        [numericId, sessionId]
                    );
                    await client.query(
                        `DELETE FROM files WHERE id = $1`,
                        [numericId]
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
            }
            // V2 flag is on but no V2 record was found — fall through to
            // legacy path so a pre-V2 upload can still be deleted.
        }

        // Legacy path (also used when V2 lookup yields nothing).
        const numericFileId = typeof fileId === 'number' ? fileId : parseInt(String(fileId), 10);
        if (isNaN(numericFileId)) {
            throw new Error('Knowledge file not found in this session');
        }

        // Fetch file URL before deleting to remove from disk
        const fileRecordResult = await client.query(
            `SELECT file_url FROM files WHERE id = $1`,
            [numericFileId]
        );
        const fileUrl = fileRecordResult.rows.length > 0 ? fileRecordResult.rows[0].file_url : null;

        // Verify file exists and is linked to this session
        const chunkCheck = await client.query(
            `SELECT 1 FROM session_ai_chunks WHERE file_id = $1 AND session_id = $2 LIMIT 1`,
            [numericFileId, sessionId]
        );
        if (chunkCheck.rows.length === 0) {
            throw new Error('Knowledge file not found in this session');
        }

        // Delete chunks then file
        await client.query(
            `DELETE FROM session_ai_chunks WHERE file_id = $1 AND session_id = $2`,
            [numericFileId, sessionId]
        );
        await client.query(`DELETE FROM files WHERE id = $1`, [numericFileId]);

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

export const downloadKnowledgeFile = async (fileId: number | string, sessionId: number, userId: number) => {
    // 1. Verify user is a participant
    const participantResult = await pool.query(
        'SELECT 1 FROM participants WHERE session_id = $1 AND user_id = $2',
        [sessionId, userId]
    );
    if (participantResult.rows.length === 0) {
        throw new Error('User is not a participant in this session');
    }

    // 2. Try V2 resolution when the flag is enabled.
    if (config.useV2Intelligence) {
        const v2Ref = await resolveV2KnowledgeFile(pool, fileId);
        if (v2Ref) {
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
        }
        // No V2 record — fall through to legacy path.
    }

    // 3. Legacy path
    const numericFileId = typeof fileId === 'number' ? fileId : parseInt(String(fileId), 10);
    if (isNaN(numericFileId)) {
        throw new Error('File not found');
    }
    const fileResult = await pool.query('SELECT * FROM files WHERE id = $1', [numericFileId]);
    if (fileResult.rows.length === 0) {
        throw new Error('File not found');
    }
    const file = fileResult.rows[0];
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

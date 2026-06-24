import pool from '../../config/database';
import { config } from '../../config/env';
import { detectFileType, extractText, normaliseToMarkdown } from '../../utils/fileConverter.util';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Helpers duplicated/adapted from knowledgeUpload.service.ts and migration scripts
// ---------------------------------------------------------------------------

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

function extractSubtopics(chunkText: string): string[] {
    if (!chunkText || chunkText.trim() === '') return [];
    const lines = chunkText.split(/\r?\n/);
    const subtopics: string[] = [];
    for (const line of lines) {
        const match = line.match(/^\s*[-*•]\s+(.+)/);
        if (match && match[1].trim().length > 4) {
            subtopics.push(match[1].trim());
        }
    }
    return subtopics;
}

// ---------------------------------------------------------------------------
// Worker Implementation
// ---------------------------------------------------------------------------

let pollingTimer: NodeJS.Timeout | null = null;
let isProcessing = false;

const runWorkerStep = async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
        // Find next queued job
        const jobQuery = `
            SELECT * FROM jobs 
            WHERE status = 'queued' 
            ORDER BY created_at ASC 
            LIMIT 1;
        `;
        const jobResult = await pool.query(jobQuery);

        if (jobResult.rows.length === 0) {
            isProcessing = false;
            return;
        }

        const job = jobResult.rows[0];
        console.log(`[JobWorker] Picked up job ${job.id} (${job.job_type})`);

        // Mark as processing
        await pool.query(
            `UPDATE jobs SET status = 'processing', updated_at = NOW() WHERE id = $1`,
            [job.id]
        );

        try {
            await processJob(job);
            
            // Mark as completed
            await pool.query(
                `UPDATE jobs SET status = 'completed', updated_at = NOW() WHERE id = $1`,
                [job.id]
            );
            console.log(`[JobWorker] ✅ Job ${job.id} completed.`);
        } catch (err: any) {
            console.error(`[JobWorker] ❌ Job ${job.id} failed:`, err.message);
            // Mark as failed
            await pool.query(
                `UPDATE jobs SET status = 'failed', error_message = $1, retry_count = retry_count + 1, updated_at = NOW() WHERE id = $2`,
                [err.message, job.id]
            );
        }
    } catch (err: any) {
        console.error('[JobWorker] Error in polling step:', err.message);
    } finally {
        isProcessing = false;
    }
};

export const processJob = async (job: any) => {
    const { session_id, job_type, payload } = job;
    const { fileId, oldFileId, storedFileName, originalName, title, topic, resolvedType } = payload || {};

    const uploadPath = storedFileName ? path.join(process.cwd(), 'uploads/knowledge', storedFileName) : '';
    
    if (job_type === 'UPLOAD_PROCESSING') {
        if (!fs.existsSync(uploadPath)) {
            throw new Error(`File not found on disk: ${uploadPath}`);
        }
        
        const fileBuffer = fs.readFileSync(uploadPath);
        const fileType = detectFileType(originalName);
        const extractedText = await extractText(fileBuffer, fileType);
        const markdownContent = normaliseToMarkdown(extractedText);

        const yearMatch = title.match(/(20\d{2})/);
        const fallbackYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
        
        const pyqChunks = parsePyqContent(markdownContent, topic, fallbackYear);

        // Fetch the V2 paper ID
        const paperRes = await pool.query(
            `SELECT id FROM papers WHERE session_id = $1 AND title = $2 LIMIT 1`,
            [session_id, title]
        );
        const paperUuid = paperRes.rows[0]?.id;
        if (!paperUuid) throw new Error(`Paper UUID not found for title ${title}`);

        // Insert raw questions
        for (const chunk of pyqChunks) {
            // First, create a default topic if none exists
            let topicUuid = null;
            const topicRes = await pool.query(
                `SELECT t.id FROM topics t
                 JOIN syllabi s ON t.syllabus_id = s.id
                 WHERE s.session_id = $1 AND LOWER(t.name) = LOWER($2) LIMIT 1`,
                [session_id, chunk.topic]
            );
            
            if (topicRes.rows.length > 0) {
                topicUuid = topicRes.rows[0].id;
            } else {
                // Find or create default syllabus
                let syllabusRes = await pool.query(
                    `SELECT id FROM syllabi WHERE session_id = $1 LIMIT 1`,
                    [session_id]
                );
                let syllabusUuid = syllabusRes.rows[0]?.id;
                
                if (!syllabusUuid) {
                    const syllabusInsert = await pool.query(
                        `INSERT INTO syllabi (session_id, file_name, file_url, raw_text, uploaded_by)
                         VALUES ($1, 'Default Syllabus', 'default', 'System Generated default syllabus', 1)
                         RETURNING id`,
                        [session_id]
                    );
                    syllabusUuid = syllabusInsert.rows[0].id;
                }
                
                const topicInsert = await pool.query(
                    `INSERT INTO topics (syllabus_id, name, subtopics)
                     VALUES ($1, $2, '{}')
                     RETURNING id`,
                    [syllabusUuid, chunk.topic]
                );
                topicUuid = topicInsert.rows[0].id;
            }

            // Create canonical question
            const canonicalInsert = await pool.query(
                `INSERT INTO canonical_questions (topic_id, text)
                 VALUES ($1, $2)
                 RETURNING id`,
                [topicUuid, chunk.chunk_text]
            );
            const canonicalUuid = canonicalInsert.rows[0].id;

            // Insert raw question
            const rawInsert = await pool.query(
                `INSERT INTO raw_questions (paper_id, original_text, marks, topic_id, canonical_id)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id`,
                [paperUuid, chunk.chunk_text, chunk.marks ?? null, topicUuid, canonicalUuid]
            );
            const rawUuid = rawInsert.rows[0].id;

            // Create question variant join
            await pool.query(
                `INSERT INTO question_variants (canonical_question_id, raw_question_id)
                 VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [canonicalUuid, rawUuid]
            );
        }

        // Trigger analytics rebuild job
        await queueSubsequentJob(session_id, 'ANALYTICS_REBUILD');

    } else if (job_type === 'SYLLABUS_PROCESSING') {
        if (!fs.existsSync(uploadPath)) {
            throw new Error(`File not found on disk: ${uploadPath}`);
        }
        
        const fileBuffer = fs.readFileSync(uploadPath);
        const fileType = detectFileType(originalName);
        const extractedText = await extractText(fileBuffer, fileType);
        const markdownContent = normaliseToMarkdown(extractedText);

        // Update syllabus raw_text
        await pool.query(
            `UPDATE syllabi SET raw_text = $1 WHERE session_id = $2 AND file_name = $3`,
            [markdownContent, session_id, originalName]
        );

        // Fetch syllabus UUID
        const syllabusRes = await pool.query(
            `SELECT id FROM syllabi WHERE session_id = $1 AND file_name = $2 LIMIT 1`,
            [session_id, originalName]
        );
        const syllabusUuid = syllabusRes.rows[0]?.id;
        if (!syllabusUuid) throw new Error(`Syllabus UUID not found for ${originalName}`);

        const chunks = chunkByHeadings(markdownContent, topic);
        for (const chunk of chunks) {
            const subtopics = extractSubtopics(chunk.body);
            await pool.query(
                `INSERT INTO topics (syllabus_id, name, subtopics)
                 VALUES ($1, $2, $3)
                 ON CONFLICT DO NOTHING`,
                [syllabusUuid, chunk.heading, subtopics]
            );
        }

        // Trigger rebuild jobs
        await queueSubsequentJob(session_id, 'ANALYTICS_REBUILD');

    } else if (job_type === 'ANALYTICS_REBUILD') {
        // Pre-compute topic analytics and question analytics
        const topicsRes = await pool.query(
            `SELECT t.id, t.name, s.session_id 
             FROM topics t 
             JOIN syllabi s ON t.syllabus_id = s.id 
             WHERE s.session_id = $1`,
            [session_id]
        );

        for (const topicRow of topicsRes.rows) {
            // Count frequency from raw_questions
            const countRes = await pool.query(
                `SELECT COUNT(*)::int AS count 
                 FROM raw_questions 
                 WHERE topic_id = $1`,
                [topicRow.id]
            );
            const frequency = countRes.rows[0]?.count || 0;
            const priorityScore = frequency * 2.5;
            let priorityLabel = 'Low';
            if (priorityScore >= 10.0) priorityLabel = 'Very High';
            else if (priorityScore >= 5.0) priorityLabel = 'High';
            else if (priorityScore >= 2.5) priorityLabel = 'Medium';

            await pool.query(
                `INSERT INTO topic_analytics (topic_id, session_id, appearance_frequency, priority_score, priority_label)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (topic_id, session_id) DO UPDATE 
                 SET appearance_frequency = EXCLUDED.appearance_frequency,
                     priority_score = EXCLUDED.priority_score,
                     priority_label = EXCLUDED.priority_label,
                     last_rebuilt_at = NOW()`,
                [topicRow.id, session_id, frequency, priorityScore, priorityLabel]
            );
        }

        // Rebuild question analytics
        const questionsRes = await pool.query(
            `SELECT cq.id 
             FROM canonical_questions cq
             JOIN topics t ON cq.topic_id = t.id
             JOIN syllabi s ON t.syllabus_id = s.id
             WHERE s.session_id = $1`,
            [session_id]
        );

        for (const qRow of questionsRes.rows) {
            const countRes = await pool.query(
                `SELECT COUNT(*)::int AS count 
                 FROM question_variants 
                 WHERE canonical_question_id = $1`,
                [qRow.id]
            );
            const frequency = countRes.rows[0]?.count || 0;
            let priorityLabel = 'Low';
            if (frequency >= 3) priorityLabel = 'High';
            else if (frequency >= 2) priorityLabel = 'Medium';

            await pool.query(
                `INSERT INTO question_analytics (canonical_question_id, appearance_frequency, priority_label)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (canonical_question_id) DO UPDATE 
                 SET appearance_frequency = EXCLUDED.appearance_frequency,
                     priority_label = EXCLUDED.priority_label,
                     last_rebuilt_at = NOW()`,
                [qRow.id, frequency, priorityLabel]
            );
        }
    }
};

const queueSubsequentJob = async (sessionId: number, jobType: string) => {
    await pool.query(
        `INSERT INTO jobs (session_id, job_type, status, payload)
         VALUES ($1, $2, 'queued', '{}')`,
        [sessionId, jobType]
    );
};

export const startJobWorker = () => {
    if (!config.useV2Intelligence) return;
    if (pollingTimer) return;

    console.log('[JobWorker] 🚀 Background job worker started.');
    pollingTimer = setInterval(runWorkerStep, 3000); // Poll every 3 seconds
};

export const stopJobWorker = () => {
    if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
        console.log('[JobWorker] 🛑 Background job worker stopped.');
    }
};

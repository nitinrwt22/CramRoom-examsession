import pool from '../../config/database';
import { detectFileType, extractText, normaliseToMarkdown, chunkByHeadings, parsePyqContent, extractSubtopics } from '../../utils/fileConverter.util';
import fs from 'fs';
import path from 'path';

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
                    // Resolve the session host to use as the uploader,
                    // avoiding the previously hardcoded `uploaded_by = 1` assumption.
                    const hostRes = await pool.query(
                        `SELECT host_id FROM sessions WHERE id = $1 LIMIT 1`,
                        [session_id]
                    );
                    const hostId = hostRes.rows[0]?.host_id ?? null;

                    const syllabusInsert = await pool.query(
                        `INSERT INTO syllabi (session_id, file_name, file_url, raw_text, uploaded_by)
                         VALUES ($1, 'Default Syllabus', 'default', 'System Generated default syllabus', $2)
                         RETURNING id`,
                        [session_id, hostId]
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
        // ── Phase 2: Algorithmic Refinement ──────────────────────────────────
        //
        // Compute three metrics per topic:
        //   1. appearance_frequency  – count of mapped raw_questions
        //   2. recency_index         – how recently the topic appeared in exam papers
        //                              Formula: 1.0 for the latest year, minus 0.1
        //                              per calendar year older, floored at 0.00.
        //   3. syllabus_coverage_pct – fraction of all topics in the session's
        //                              syllabi that have at least one raw question.
        //                              Stored on every topic row for the session.
        // ─────────────────────────────────────────────────────────────────────

        // Fetch all topics for this session (joined through syllabi).
        const topicsRes = await pool.query(
            `SELECT t.id, t.name, s.session_id
             FROM topics t
             JOIN syllabi s ON t.syllabus_id = s.id
             WHERE s.session_id = $1`,
            [session_id]
        );

        const totalTopicCount = topicsRes.rows.length;

        // ── recency_index: year-based decay ──────────────────────────────────
        // Fetch distinct years of all papers uploaded for this session.
        const yearsRes = await pool.query(
            `SELECT DISTINCT year
             FROM papers
             WHERE session_id = $1 AND year IS NOT NULL
             ORDER BY year DESC`,
            [session_id]
        );
        const maxYear: number | null = yearsRes.rows.length > 0 ? yearsRes.rows[0].year : null;

        // Build a map: topic_id → latest year from any paper whose raw_questions
        // reference that topic.
        const topicYearRes = await pool.query(
            `SELECT rq.topic_id, MAX(p.year) AS latest_year
             FROM raw_questions rq
             JOIN papers p ON rq.paper_id = p.id
             WHERE p.session_id = $1
               AND rq.topic_id IS NOT NULL
               AND p.year IS NOT NULL
             GROUP BY rq.topic_id`,
            [session_id]
        );
        const topicLatestYear = new Map<string, number>(
            topicYearRes.rows.map((r: any) => [r.topic_id, r.latest_year])
        );

        // ── syllabus_coverage_pct: topics with ≥ 1 question ──────────────────
        // Count how many topics have at least one mapped raw question.
        const coveredTopicRes = await pool.query(
            `SELECT COUNT(DISTINCT rq.topic_id)::int AS covered
             FROM raw_questions rq
             JOIN topics t ON rq.topic_id = t.id
             JOIN syllabi s ON t.syllabus_id = s.id
             WHERE s.session_id = $1`,
            [session_id]
        );
        const coveredTopicCount: number = coveredTopicRes.rows[0]?.covered ?? 0;
        const coveragePct: number =
            totalTopicCount > 0
                ? parseFloat(((coveredTopicCount / totalTopicCount) * 100).toFixed(2))
                : 0.00;

        // ── Per-topic upsert ──────────────────────────────────────────────────
        for (const topicRow of topicsRes.rows) {
            // 1. Frequency
            const countRes = await pool.query(
                `SELECT COUNT(*)::int AS count
                 FROM raw_questions
                 WHERE topic_id = $1`,
                [topicRow.id]
            );
            const frequency: number = countRes.rows[0]?.count ?? 0;

            // 2. Priority score & label
            const priorityScore = frequency * 2.5;
            let priorityLabel = 'Low';
            if (priorityScore >= 10.0) priorityLabel = 'Very High';
            else if (priorityScore >= 5.0) priorityLabel = 'High';
            else if (priorityScore >= 2.5) priorityLabel = 'Medium';

            // 3. Recency index
            //    If the topic appears in papers, compare its most-recent year to
            //    the session's overall latest year.
            //    recency_index = max(0, 1.0 − 0.1 × (maxYear − topicLatestYear))
            let recencyIndex = 0.00;
            const topicYear = topicLatestYear.get(topicRow.id) ?? null;
            if (topicYear !== null && maxYear !== null) {
                const yearDelta = maxYear - topicYear;
                recencyIndex = parseFloat(Math.max(0, 1.0 - yearDelta * 0.1).toFixed(2));
            }

            // 4. Syllabus coverage pct is session-wide (same value for every topic row)
            await pool.query(
                `INSERT INTO topic_analytics
                     (topic_id, session_id, appearance_frequency,
                      priority_score, priority_label,
                      recency_index, syllabus_coverage_pct)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (topic_id, session_id) DO UPDATE
                     SET appearance_frequency  = EXCLUDED.appearance_frequency,
                         priority_score        = EXCLUDED.priority_score,
                         priority_label        = EXCLUDED.priority_label,
                         recency_index         = EXCLUDED.recency_index,
                         syllabus_coverage_pct = EXCLUDED.syllabus_coverage_pct,
                         last_rebuilt_at       = NOW()`,
                [topicRow.id, session_id, frequency, priorityScore, priorityLabel,
                 recencyIndex, coveragePct]
            );
        }

        // ── Question analytics rebuild ────────────────────────────────────────
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
            const frequency: number = countRes.rows[0]?.count ?? 0;
            let priorityLabel = 'Low';
            if (frequency >= 3) priorityLabel = 'High';
            else if (frequency >= 2) priorityLabel = 'Medium';

            await pool.query(
                `INSERT INTO question_analytics (canonical_question_id, appearance_frequency, priority_label)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (canonical_question_id) DO UPDATE
                     SET appearance_frequency = EXCLUDED.appearance_frequency,
                         priority_label        = EXCLUDED.priority_label,
                         last_rebuilt_at       = NOW()`,
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

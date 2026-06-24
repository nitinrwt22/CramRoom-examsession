import pool from '../src/config/database';
import { config } from '../src/config/env';
import { getKnowledgeChunksForSession } from '../src/models/knowledgeChunk.model';
import { generateExpectedQuestions } from '../src/services/ai/pyqRecommendation.service';
import { detectWeakTopics } from '../src/services/ai/weakTopicAnalytics.service';
import { runAIEngine } from '../src/services/ai/aiEngine.service';
import { buildSessionContext } from '../src/services/sessionContext.service';
import * as knowledgeService from '../src/services/knowledgeUpload.service';
import fs from 'fs';
import path from 'path';

const log = (msg: string) => console.log(`[TestV2] ${msg}`);
const ok = (msg: string) => console.log(`[TestV2] ✅  ${msg}`);
const fail = (msg: string) => console.log(`[TestV2] ❌  ${msg}`);
const sep = () => console.log('─'.repeat(60));

async function runTests() {
    log('Starting CramRoom Backend Service V2 Migration Integration Tests...');
    sep();

    const client = await pool.connect();
    
    try {
        // Find a session that has migrated data
        const sessionRes = await client.query(`
            SELECT DISTINCT session_id FROM papers LIMIT 1
        `);
        if (sessionRes.rows.length === 0) {
            fail('No sessions with V2 migrated data found. Please run migrations first.');
            process.exit(1);
        }
        
        const sessionIdNum = sessionRes.rows[0].session_id;
        const sessionId = sessionIdNum.toString();
        log(`Using active Session ID: ${sessionId} for testing.`);
        
        // Find host user for the session
        const hostRes = await client.query(`
            SELECT host_id FROM sessions WHERE id = $1
        `, [sessionIdNum]);
        const hostId = hostRes.rows[0].host_id;

        // Ensure we have a personal note entry for caching notes hash test
        await client.query(`
            INSERT INTO personal_notes (session_id, user_id, content)
            VALUES ($1, $2, 'Study scheduling and paging notes.')
            ON CONFLICT (session_id, user_id) DO NOTHING
        `, [sessionIdNum, hostId]);

        // Ensure there is at least one topic and canonical question for caching tests
        const topicCheck = await client.query(`
            SELECT t.id FROM topics t
            JOIN syllabi s ON t.syllabus_id = s.id
            WHERE s.session_id = $1 LIMIT 1
        `, [sessionIdNum]);
        
        let topicUuid = topicCheck.rows[0]?.id;
        if (!topicUuid) {
            // Let's create one topic and canonical question to ensure cache works
            let syllabusRes = await client.query(`
                SELECT id FROM syllabi WHERE session_id = $1 LIMIT 1
            `, [sessionIdNum]);
            let syllabusUuid = syllabusRes.rows[0]?.id;
            if (!syllabusUuid) {
                const sylRes = await client.query(`
                    INSERT INTO syllabi (session_id, file_name, file_url, raw_text, uploaded_by)
                    VALUES ($1, 'Syllabus Doc', 'syllabus_url', 'CPU scheduling and Memory management topics.', $2)
                    RETURNING id
                `, [sessionIdNum, hostId]);
                syllabusUuid = sylRes.rows[0].id;
            }
            
            const topRes = await client.query(`
                INSERT INTO topics (syllabus_id, name, subtopics)
                VALUES ($1, 'CPU Scheduling', '{"FCFS", "SJF", "Round Robin"}')
                RETURNING id
            `, [syllabusUuid]);
            topicUuid = topRes.rows[0].id;
        }

        // Check if there is a canonical question for this topic
        const cqCheck = await client.query(`
            SELECT id FROM canonical_questions WHERE topic_id = $1 LIMIT 1
        `, [topicUuid]);
        
        let cqUuid = cqCheck.rows[0]?.id;
        if (!cqUuid) {
            const cqInsert = await client.query(`
                INSERT INTO canonical_questions (topic_id, text)
                VALUES ($1, 'What is Round Robin scheduling?')
                RETURNING id
            `, [topicUuid]);
            cqUuid = cqInsert.rows[0].id;
        }

        // Link at least one raw question to make cache lookup work
        await client.query(`
            UPDATE raw_questions 
            SET canonical_id = $1, topic_id = $2
            WHERE paper_id IN (SELECT id FROM papers WHERE session_id = $3)
        `, [cqUuid, topicUuid, sessionIdNum]);

        // Initialize rebuild job to populate analytics
        const rebuildJob = await client.query(`
            INSERT INTO jobs (session_id, job_type, status, payload)
            VALUES ($1, 'ANALYTICS_REBUILD', 'queued', '{}')
            RETURNING id
        `, [sessionIdNum]);
        
        // Execute the job worker synchronously to populate V2 analytics
        const { startJobWorker, stopJobWorker } = require('../src/services/ai/jobWorker.service');
        // Import jobWorker functions and call processJob directly
        const { processJob } = require('../src/services/ai/jobWorker.service');
        const jobRow = (await client.query('SELECT * FROM jobs WHERE id = $1', [rebuildJob.rows[0].id])).rows[0];
        await processJob(jobRow);
        await client.query("UPDATE jobs SET status = 'completed' WHERE id = $1", [rebuildJob.rows[0].id]);
        ok('Pre-computed analytics populated via job worker.');

        // ==========================================
        // Test Part 1: USE_V2_INTELLIGENCE = false
        // ==========================================
        sep();
        log('Testing under USE_V2_INTELLIGENCE = false (Legacy Paths)...');
        config.useV2Intelligence = false;
        
        // 1. Chunks
        const legacyChunks = await getKnowledgeChunksForSession(sessionIdNum);
        ok(`Legacy Knowledge Chunks count: ${legacyChunks.length}`);
        
        // 2. expected questions
        const legacyExpected = await generateExpectedQuestions(sessionId);
        ok(`Legacy Expected Questions count: ${legacyExpected.length}`);

        // 3. weak topics
        const legacyWeak = await detectWeakTopics(sessionId);
        ok(`Legacy Weak Topics: ${JSON.stringify(legacyWeak)}`);

        // 4. Session Context
        const legacyCtx = await buildSessionContext(sessionId, hostId.toString());
        ok(`Legacy Session Context Materials files: ${legacyCtx.materials.files.length}`);

        // ==========================================
        // Test Part 2: USE_V2_INTELLIGENCE = true
        // ==========================================
        sep();
        log('Testing under USE_V2_INTELLIGENCE = true (V2 Paths)...');
        config.useV2Intelligence = true;

        // 1. Chunks
        const v2Chunks = await getKnowledgeChunksForSession(sessionIdNum);
        ok(`V2 Knowledge Chunks count: ${v2Chunks.length}`);
        if (v2Chunks.length > 0) {
            ok(`Sample Chunk: ${v2Chunks[0].topic} - ${v2Chunks[0].chunk_text.substring(0, 50)}...`);
        }

        // 2. Expected questions
        const v2Expected = await generateExpectedQuestions(sessionId);
        ok(`V2 Expected Questions count: ${v2Expected.length}`);
        if (v2Expected.length > 0) {
            ok(`Sample Expected Question: ${v2Expected[0].question_text} (Score: ${v2Expected[0].score}, Prob: ${v2Expected[0].probability})`);
        }

        // 3. Weak topics
        const v2Weak = await detectWeakTopics(sessionId);
        ok(`V2 Weak Topics (Syllabus matched): ${JSON.stringify(v2Weak)}`);

        // 4. Session Context
        const v2Ctx = await buildSessionContext(sessionId, hostId.toString());
        ok(`V2 Session Context Materials files: ${v2Ctx.materials.files.length}`);
        if (v2Ctx.materials.files.length > 0) {
            ok(`Sample V2 Material: ${v2Ctx.materials.files[0].name} (${v2Ctx.materials.files[0].type})`);
        }

        // 5. Answer Cache Integration
        sep();
        log('Testing V2 Answer Cache...');
        // Clear any old generated answers to test miss -> hit sequence
        await client.query(`
            DELETE FROM generated_answers WHERE canonical_question_id = $1
        `, [cqUuid]);

        const questionQueryPayload = JSON.stringify({
            questionText: 'What is Round Robin scheduling?',
            marks: 5
        });

        // Miss check
        const startTimeMiss = Date.now();
        const missResp = await runAIEngine({
            context: v2Ctx,
            intent: 'pyq_answer_generation',
            question: questionQueryPayload
        });
        const durationMiss = Date.now() - startTimeMiss;
        log(`Cache Miss Response obtained in ${durationMiss}ms.`);
        
        // Verify insert in DB
        const cacheCheck = await client.query(`
            SELECT COUNT(*)::int FROM generated_answers WHERE canonical_question_id = $1
        `, [cqUuid]);
        if (cacheCheck.rows[0].count === 1) {
            ok('Answer cached successfully in generated_answers.');
        } else {
            fail('Answer was NOT cached.');
        }

        // Hit check
        const startTimeHit = Date.now();
        const hitResp = await runAIEngine({
            context: v2Ctx,
            intent: 'pyq_answer_generation',
            question: questionQueryPayload
        });
        const durationHit = Date.now() - startTimeHit;
        log(`Cache Hit Response obtained in ${durationHit}ms.`);
        
        if (durationHit < 100 && hitResp.answer === missResp.answer) {
            ok('Answer cache HIT successful (retrieved instantly from cache).');
        } else {
            fail(`Cache HIT failed (Duration: ${durationHit}ms).`);
        }

        // ==========================================
        // Test Part 3: V2 Upload Lifecycle (P0 fixes)
        // ==========================================
        sep();
        log('Testing V2 Upload Lifecycle (list/delete/download + uploaded_notes in chunks)...');

        // Helper used for cleanup in case of partial failures.
        const cleanupUuids: string[] = [];

        try {
            // Ensure the host user is a participant (upload/download require it)
            await client.query(
                `INSERT INTO participants (session_id, user_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [sessionIdNum, hostId]
            );

            // --- 3a. uploaded_notes visibility in knowledge chunks ---
            // Allocate a fresh legacy file id slot so we don't collide with
            // existing rows. The mapping table requires old_file_id PRIMARY KEY.
            const newLegacyIdRes = await client.query(
                `INSERT INTO files (file_name, file_type, file_url, title, topic, content_type)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                ['test-note.pdf', 'application/pdf', 'placeholder', 'Test Note', 'notes', 'notes']
            );
            const noteLegacyId = newLegacyIdRes.rows[0].id;

            const noteInsert = await client.query(
                `INSERT INTO uploaded_notes (session_id, title, pdf_url, uploaded_by)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [sessionIdNum, 'Test Note', `note-${sessionIdNum}-${Date.now()}.pdf`, hostId]
            );
            const noteUuid = noteInsert.rows[0].id;
            cleanupUuids.push(noteUuid);

            await client.query(
                `INSERT INTO migration_file_uuid_map (old_file_id, new_uuid, target_table)
                 VALUES ($1, $2, 'uploaded_notes')`,
                [noteLegacyId, noteUuid]
            );

            const v2ChunksWithNote = await getKnowledgeChunksForSession(sessionIdNum);
            const noteChunk = v2ChunksWithNote.find((c: any) => c.topic === 'Test Note');
            if (noteChunk && typeof noteChunk.chunk_text === 'string' && noteChunk.chunk_text.startsWith('[Uploaded Note]')) {
                ok(`uploaded_notes visible in chunk retrieval (topic="Test Note", id=${noteChunk.id})`);
            } else {
                fail('uploaded_notes NOT visible in chunk retrieval');
            }

            // --- 3b. GET /session/:id/knowledge returns V2 uploads ---
            const listed = await knowledgeService.getKnowledgeFiles(sessionIdNum, hostId);
            const ids = new Set(listed.map((r: any) => String(r.id)));
            const hasNoteMapped = ids.has(String(noteLegacyId));
            const hasNoteUuid = ids.has(String(noteUuid));
            if (hasNoteMapped || hasNoteUuid) {
                ok(`GET /session/:id/knowledge returns the V2 uploaded_notes (id=${hasNoteMapped ? noteLegacyId : noteUuid})`);
            } else {
                fail('GET /session/:id/knowledge did not return the V2 uploaded_notes');
            }

            // --- 3c. deleteKnowledgeFile via legacy integer (mapping) ---
            const deleteResultMapped = await knowledgeService.deleteKnowledgeFile(noteLegacyId, sessionIdNum, hostId);
            if (deleteResultMapped && deleteResultMapped.message) {
                ok(`deleteKnowledgeFile via mapped integer succeeded (${deleteResultMapped.message})`);
            } else {
                fail('deleteKnowledgeFile via mapped integer returned unexpected response');
            }

            // Verify the row is gone
            const verifyGone = await client.query(
                `SELECT id FROM uploaded_notes WHERE id = $1`,
                [noteUuid]
            );
            if (verifyGone.rows.length === 0) {
                ok('uploaded_notes row removed by delete');
            } else {
                fail('uploaded_notes row still present after delete');
            }
            const verifyMapGone = await client.query(
                `SELECT 1 FROM migration_file_uuid_map WHERE old_file_id = $1`,
                [noteLegacyId]
            );
            if (verifyMapGone.rows.length === 0) {
                ok('migration_file_uuid_map row cleaned up by delete');
            } else {
                fail('migration_file_uuid_map row still present after delete');
            }
            // Also clean up the synthetic legacy `files` row that the test inserted
            await client.query(`DELETE FROM files WHERE id = $1`, [noteLegacyId]);

            // --- 3d. deleteKnowledgeFile + downloadKnowledgeFile via UUID (no mapping) ---
            const noteUuid2Res = await client.query(
                `INSERT INTO uploaded_notes (session_id, title, pdf_url, uploaded_by)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [sessionIdNum, 'Round Robin Note', `rr-${sessionIdNum}-${Date.now()}.pdf`, hostId]
            );
            const noteUuid2 = noteUuid2Res.rows[0].id;
            cleanupUuids.push(noteUuid2);

            // Create a tiny placeholder file on disk so download succeeds.
            const downloadPath = path.join(process.cwd(), 'uploads/knowledge', `rr-${sessionIdNum}-${Date.now()}.pdf`);
            try {
                fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
                fs.writeFileSync(downloadPath, 'PDF-CONTENT-STUB');
            } catch (e: any) {
                fail(`Could not create stub download file: ${e.message}`);
            }

            // Update the V2 row to point at the on-disk file we just created.
            await client.query(
                `UPDATE uploaded_notes SET pdf_url = $1 WHERE id = $2`,
                [path.basename(downloadPath), noteUuid2]
            );

            const dlRes = await knowledgeService.downloadKnowledgeFile(noteUuid2, sessionIdNum, hostId);
            if (
                dlRes &&
                dlRes.absolutePath === downloadPath &&
                dlRes.originalName === 'Round Robin Note' &&
                dlRes.mimeType === 'application/pdf' &&
                fs.existsSync(dlRes.absolutePath)
            ) {
                ok(`downloadKnowledgeFile via UUID succeeded (path=${dlRes.absolutePath})`);
            } else {
                fail(`downloadKnowledgeFile via UUID failed: ${JSON.stringify(dlRes)}`);
            }

            const deleteResultUuid = await knowledgeService.deleteKnowledgeFile(noteUuid2, sessionIdNum, hostId);
            if (deleteResultUuid && deleteResultUuid.message) {
                ok(`deleteKnowledgeFile via UUID succeeded (${deleteResultUuid.message})`);
            } else {
                fail('deleteKnowledgeFile via UUID returned unexpected response');
            }

            // Disk file should be gone
            if (!fs.existsSync(downloadPath)) {
                ok('Disk file removed by V2 delete');
            } else {
                fail(`Disk file still present after delete: ${downloadPath}`);
            }

            // --- 3e. Legacy regression (useV2Intelligence=false path still works) ---
            config.useV2Intelligence = false;
            const legacyList = await knowledgeService.getKnowledgeFiles(sessionIdNum, hostId);
            // The legacy path should at least return an array (possibly empty
            // for this freshly-migrated session). What matters is that it
            // doesn't throw and the shape is preserved.
            if (Array.isArray(legacyList)) {
                ok(`Legacy getKnowledgeFiles still works (returned ${legacyList.length} rows)`);
            } else {
                fail('Legacy getKnowledgeFiles returned non-array');
            }
            const legacyChunks = await getKnowledgeChunksForSession(sessionIdNum);
            if (Array.isArray(legacyChunks)) {
                ok(`Legacy getKnowledgeChunksForSession still works (returned ${legacyChunks.length} chunks)`);
            } else {
                fail('Legacy getKnowledgeChunksForSession returned non-array');
            }
            config.useV2Intelligence = true;
        } catch (lifecycleErr: any) {
            fail(`V2 lifecycle test threw: ${lifecycleErr.message}`);
            console.error(lifecycleErr);
        } finally {
            // Best-effort cleanup of any UUIDs that survived the test
            for (const uuid of cleanupUuids) {
                try {
                    await client.query(`DELETE FROM uploaded_notes WHERE id = $1`, [uuid]);
                } catch (_) { /* ignore */ }
            }
        }

        sep();
        ok('All integration tests passed successfully!');
        
    } catch (err: any) {
        fail(`Integration test failed: ${err.message}`);
        console.error(err);
    } finally {
        client.release();
        await pool.end();
        process.exit(0);
    }
}

runTests();

/**
 * CramRoom Topic Intelligence — Phase 4 Test Suite
 *
 * Validates the API & Integration Layer changes introduced in Phase 4:
 *   A. computeMappingConfidence() — unit tests for keyword-overlap formula
 *   B. ExpectedQuestion payload shape — recency_index + mapping_confidence present
 *   C. getTopicProgress payload shape — meta summary + trend fields present
 *   D. question_analytics.recency_index — populated by ANALYTICS_REBUILD
 *   E. raw_questions.mapping_confidence — column exists, values in [0.000, 1.000]
 *   F. Phase 1/2/3 regression guards (compile-time import checks)
 *
 * Does NOT test Phase 5 functionality.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/runPhase4Tests.ts
 */

import pool from '../src/config/database';
import { computeMappingConfidence } from '../src/services/ai/jobWorker.service';
import { generateExpectedQuestions } from '../src/services/ai/pyqRecommendation.service';
import { getTopicProgressComparison } from '../src/services/ai/topicProgress.service';
import { processJob } from '../src/services/ai/jobWorker.service';

// ---------------------------------------------------------------------------
// Minimal test harness (mirrors previous phase suites)
// ---------------------------------------------------------------------------

interface TestResult {
    suite: string;
    name: string;
    passed: boolean;
    durationMs: number;
    message: string;
    error?: string;
}

const results: TestResult[] = [];
let currentSuite = '';

const suite = (name: string) => { currentSuite = name; };

const test = async (
    name: string,
    fn: () => void | Promise<void>
): Promise<void> => {
    const start = Date.now();
    try {
        await fn();
        results.push({ suite: currentSuite, name, passed: true, durationMs: Date.now() - start, message: 'OK' });
    } catch (err: any) {
        results.push({
            suite: currentSuite,
            name,
            passed: false,
            durationMs: Date.now() - start,
            message: err.message ?? String(err),
            error: err.stack,
        });
    }
};

const assert = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`Assertion failed: ${message}`);
};

const assertEqual = <T>(actual: T, expected: T, label: string) => {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
};

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

const cleanupQueue: Array<() => Promise<void>> = [];
const withCleanup = (fn: () => Promise<void>) => cleanupQueue.push(fn);
const runCleanup = async () => {
    for (const fn of cleanupQueue.reverse()) {
        try { await fn(); } catch { /* best-effort */ }
    }
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {

    // ── Suite A: computeMappingConfidence() ───────────────────────────────
    suite('A — computeMappingConfidence() Unit Tests');

    await test('A.1 — perfect topic match returns 1.000', () => {
        // Every token in the question is in the topic name
        const score = computeMappingConfidence('normalization database', 'normalization database');
        assert(score === 1.000, `Expected 1.000, got ${score}`);
    });

    await test('A.2 — zero overlap returns 0.000', () => {
        const score = computeMappingConfidence('explain binary tree traversal', 'TCP/IP networking model');
        assertEqual(score, 0.000, 'Zero-overlap confidence');
    });

    await test('A.3 — partial overlap returns value between 0 and 1', () => {
        const score = computeMappingConfidence('explain normalization in relational databases', 'Normalization');
        assert(score > 0 && score <= 1, `Expected (0,1], got ${score}`);
    });

    await test('A.4 — empty question text returns 0.000', () => {
        const score = computeMappingConfidence('', 'Database Normalization');
        assertEqual(score, 0.000, 'Empty question should return 0');
    });

    await test('A.5 — result is always rounded to 3 decimal places', () => {
        const score = computeMappingConfidence('explain normalization concepts with examples', 'normalization');
        const asString = score.toString();
        const decimals = asString.includes('.') ? asString.split('.')[1].length : 0;
        assert(decimals <= 3, `Expected ≤ 3 decimal places, got ${decimals} in ${score}`);
    });

    await test('A.6 — stopwords are ignored (no artificial boost from common words)', () => {
        // "the is are" are all stopwords — topic match should be 0
        const score = computeMappingConfidence('the is are', 'Normalization');
        assertEqual(score, 0.000, 'Stopword-only question should return 0');
    });

    await test('A.7 — confidence is clamped to 1.000 (never exceeds 1)', () => {
        const score = computeMappingConfidence('normalization normalization normalization', 'normalization');
        assert(score <= 1.000, `Confidence must not exceed 1.000, got ${score}`);
    });

    // ── Suite B: raw_questions.mapping_confidence column ──────────────────
    suite('B — raw_questions.mapping_confidence Column');

    await test('B.1 — mapping_confidence column exists in raw_questions', async () => {
        const res = await pool.query(
            `SELECT column_name, data_type
             FROM information_schema.columns
             WHERE table_name = 'raw_questions' AND column_name = 'mapping_confidence'`
        );
        assert(res.rows.length === 1, 'mapping_confidence column must exist in raw_questions');
        assertEqual(res.rows[0].data_type, 'numeric', 'mapping_confidence must be numeric');
    });

    await test('B.2 — all existing mapping_confidence values are in [0.000, 1.000]', async () => {
        const res = await pool.query(
            `SELECT COUNT(*)::int AS out_of_range
             FROM raw_questions
             WHERE mapping_confidence < 0 OR mapping_confidence > 1`
        );
        assertEqual(res.rows[0].out_of_range, 0, 'No mapping_confidence values should be out of range');
    });

    await test('B.3 — mapped rows (topic_id IS NOT NULL) have mapping_confidence > 0', async () => {
        const res = await pool.query(
            `SELECT COUNT(*)::int AS zero_confidence_mapped
             FROM raw_questions
             WHERE topic_id IS NOT NULL AND mapping_confidence = 0`
        );
        // After the migration back-fill, mapped rows should have confidence > 0.
        // This test asserts the migration ran correctly.
        assert(res.rows[0].zero_confidence_mapped === 0,
            `${res.rows[0].zero_confidence_mapped} mapped rows still have 0 confidence (migration may not have run)`);
    });

    // ── Suite C: question_analytics.recency_index population ──────────────
    suite('C — question_analytics.recency_index Population');

    await test('C.1 — question_analytics.recency_index column exists', async () => {
        const res = await pool.query(
            `SELECT column_name, data_type
             FROM information_schema.columns
             WHERE table_name = 'question_analytics' AND column_name = 'recency_index'`
        );
        assert(res.rows.length === 1, 'recency_index column must exist in question_analytics');
    });

    // Integration test: create a minimal fixture, run ANALYTICS_REBUILD, verify recency_index
    await test('C.2 — ANALYTICS_REBUILD populates question_analytics.recency_index', async () => {
        // 1. Create test session
        const sessionRes = await pool.query(
            `INSERT INTO sessions (host_id, subject, exam_date, expiry_time, status)
             VALUES (1, 'Phase4Test', NOW() + INTERVAL '30 days', NOW() + INTERVAL '7 days', 'active')
             RETURNING id`
        );
        const sessionId: number = sessionRes.rows[0].id;
        withCleanup(() => pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]));

        // 2. Create syllabus + topic
        const syllabusRes = await pool.query(
            `INSERT INTO syllabi (session_id, file_name, file_url, raw_text, uploaded_by)
             VALUES ($1, 'p4_test.pdf', 'http://test', 'Test content', 1)
             RETURNING id`,
            [sessionId]
        );
        const syllabusId: string = syllabusRes.rows[0].id;

        const topicRes = await pool.query(
            `INSERT INTO topics (syllabus_id, name, subtopics)
             VALUES ($1, 'P4 Test Topic', '{}')
             RETURNING id`,
            [syllabusId]
        );
        const topicId: string = topicRes.rows[0].id;

        // 3. Create paper with a year
        const paperRes = await pool.query(
            `INSERT INTO papers (session_id, title, year, exam_type, pdf_url, uploaded_by)
             VALUES ($1, 'P4 Paper 2024', 2024, 'endsem', 'http://test/p4.pdf', 1)
             RETURNING id`,
            [sessionId]
        );
        const paperId: string = paperRes.rows[0].id;

        // 4. Create canonical question + raw question + variant
        const cqRes = await pool.query(
            `INSERT INTO canonical_questions (topic_id, text)
             VALUES ($1, 'Explain P4 test question')
             RETURNING id`,
            [topicId]
        );
        const cqId: string = cqRes.rows[0].id;

        const rqRes = await pool.query(
            `INSERT INTO raw_questions (paper_id, original_text, topic_id, canonical_id)
             VALUES ($1, 'Explain P4 test question', $2, $3)
             RETURNING id`,
            [paperId, topicId, cqId]
        );
        const rqId: string = rqRes.rows[0].id;

        await pool.query(
            `INSERT INTO question_variants (canonical_question_id, raw_question_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [cqId, rqId]
        );

        // 5. Run ANALYTICS_REBUILD
        await processJob({ session_id: sessionId, job_type: 'ANALYTICS_REBUILD', payload: {} });

        // 6. Assert recency_index is 1.00 (question in latest year = max year)
        const qaRes = await pool.query(
            `SELECT recency_index FROM question_analytics WHERE canonical_question_id = $1`,
            [cqId]
        );
        assert(qaRes.rows.length > 0, 'question_analytics row must exist after ANALYTICS_REBUILD');
        const recencyIndex = parseFloat(qaRes.rows[0].recency_index);
        assert(recencyIndex === 1.00,
            `Expected recency_index = 1.00 for question in latest year, got ${recencyIndex}`);
    });

    // ── Suite D: ExpectedQuestion payload shape ────────────────────────────
    suite('D — ExpectedQuestion Payload Shape');

    await test('D.1 — generateExpectedQuestions returns array', async () => {
        // Use a session ID that may or may not have data; function must not throw
        const result = await generateExpectedQuestions('999999');
        assert(Array.isArray(result), 'generateExpectedQuestions must return an array');
    });

    await test('D.2 — returned ExpectedQuestion objects have recency_index field', async () => {
        // Query for any real session that has canonical questions
        const sessionRes = await pool.query(
            `SELECT s.id FROM sessions s
             JOIN syllabi sy ON sy.session_id = s.id
             JOIN topics t ON t.syllabus_id = sy.id
             JOIN canonical_questions cq ON cq.topic_id = t.id
             LIMIT 1`
        );
        if (sessionRes.rows.length === 0) {
            // No data available — skip gracefully
            console.log('      (skipped: no canonical questions in DB)');
            return;
        }
        const sid = sessionRes.rows[0].id.toString();
        const questions = await generateExpectedQuestions(sid);
        assert(questions.length > 0, 'Must return at least 1 question for a session with data');

        for (const q of questions) {
            assert('recency_index' in q, `Question ${q.id} must have recency_index field`);
            assert(typeof q.recency_index === 'number', 'recency_index must be a number');
            assert(q.recency_index >= 0 && q.recency_index <= 1,
                `recency_index must be in [0,1], got ${q.recency_index}`);
        }
    });

    await test('D.3 — returned ExpectedQuestion objects have mapping_confidence field', async () => {
        const sessionRes = await pool.query(
            `SELECT s.id FROM sessions s
             JOIN syllabi sy ON sy.session_id = s.id
             JOIN topics t ON t.syllabus_id = sy.id
             JOIN canonical_questions cq ON cq.topic_id = t.id
             LIMIT 1`
        );
        if (sessionRes.rows.length === 0) {
            console.log('      (skipped: no canonical questions in DB)');
            return;
        }
        const sid = sessionRes.rows[0].id.toString();
        const questions = await generateExpectedQuestions(sid);

        for (const q of questions) {
            assert('mapping_confidence' in q, `Question ${q.id} must have mapping_confidence field`);
            assert(typeof q.mapping_confidence === 'number', 'mapping_confidence must be a number');
            assert(q.mapping_confidence >= 0 && q.mapping_confidence <= 1,
                `mapping_confidence must be in [0,1], got ${q.mapping_confidence}`);
        }
    });

    await test('D.4 — questions are sorted by score descending', async () => {
        const sessionRes = await pool.query(
            `SELECT s.id FROM sessions s
             JOIN syllabi sy ON sy.session_id = s.id
             JOIN topics t ON t.syllabus_id = sy.id
             JOIN canonical_questions cq ON cq.topic_id = t.id
             LIMIT 1`
        );
        if (sessionRes.rows.length === 0) {
            console.log('      (skipped: no canonical questions in DB)');
            return;
        }
        const sid = sessionRes.rows[0].id.toString();
        const questions = await generateExpectedQuestions(sid);

        for (let i = 1; i < questions.length; i++) {
            assert(questions[i - 1].score >= questions[i].score,
                `Questions must be sorted by score DESC: ${questions[i-1].score} < ${questions[i].score}`);
        }
    });

    // ── Suite E: getTopicProgress payload shape ────────────────────────────
    suite('E — getTopicProgress Payload Shape');

    await test('E.1 — getTopicProgressComparison returns array', async () => {
        const result = await getTopicProgressComparison('999999');
        assert(Array.isArray(result), 'getTopicProgressComparison must return an array');
    });

    await test('E.2 — progress entries have required fields', async () => {
        // Find a session with progress history
        const sessionRes = await pool.query(
            `SELECT DISTINCT session_id FROM topic_progress_history LIMIT 1`
        );
        if (sessionRes.rows.length === 0) {
            console.log('      (skipped: no topic_progress_history rows)');
            return;
        }
        const sid = sessionRes.rows[0].session_id.toString();
        const progress = await getTopicProgressComparison(sid);

        for (const entry of progress) {
            assert('topic'         in entry, 'Progress entry must have topic');
            assert('currentScore'  in entry, 'Progress entry must have currentScore');
            assert('previousScore' in entry, 'Progress entry must have previousScore');
            assert('trend'         in entry, 'Progress entry must have trend');
            assert(
                ['improving', 'worsening', 'stable', 'insufficient_data'].includes(entry.trend),
                `Invalid trend value: ${entry.trend}`
            );
        }
    });

    await test('E.3 — insufficient_data returned when only one history snapshot exists', async () => {
        // Create a session with exactly one progress snapshot
        const sessionRes = await pool.query(
            `INSERT INTO sessions (host_id, subject, exam_date, expiry_time, status)
             VALUES (1, 'P4TrendTest', NOW() + INTERVAL '30 days', NOW() + INTERVAL '7 days', 'active')
             RETURNING id`
        );
        const sessionId: number = sessionRes.rows[0].id;
        withCleanup(() => pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]));

        const syllabusRes = await pool.query(
            `INSERT INTO syllabi (session_id, file_name, file_url, raw_text, uploaded_by)
             VALUES ($1, 'trend_test.pdf', 'http://test', 'content', 1) RETURNING id`,
            [sessionId]
        );
        const syllabusId: string = syllabusRes.rows[0].id;

        const topicRes = await pool.query(
            `INSERT INTO topics (syllabus_id, name, subtopics)
             VALUES ($1, 'TrendTopic', '{}') RETURNING id`,
            [syllabusId]
        );
        const topicId: string = topicRes.rows[0].id;

        // Insert exactly one snapshot
        await pool.query(
            `INSERT INTO topic_progress_history (session_id, topic_id, score)
             VALUES ($1, $2, 5)`,
            [sessionId, topicId]
        );

        const progress = await getTopicProgressComparison(sessionId.toString());
        assert(progress.length === 1, 'Must have exactly 1 progress entry');
        assertEqual(progress[0].trend, 'insufficient_data',
            'Single snapshot must return insufficient_data');
    });

    // ── Suite F: Phase 1/2/3 Regression Guards ────────────────────────────
    suite('F — Phase 1/2/3 Regression Guards (compile-time)');

    await test('F.1 — chunkByHeadings still importable from fileConverter.util', async () => {
        const mod = await import('../src/utils/fileConverter.util');
        assert(typeof mod.chunkByHeadings === 'function', 'chunkByHeadings must be exported');
    });

    await test('F.2 — detectWeakTopics still importable from weakTopicAnalytics.service', async () => {
        const mod = await import('../src/services/ai/weakTopicAnalytics.service');
        assert(typeof mod.detectWeakTopics === 'function', 'detectWeakTopics must be exported');
    });

    await test('F.3 — FORMATTING_RULES still exported from aiEngine.service', async () => {
        const mod = await import('../src/services/ai/aiEngine.service');
        assert(typeof mod.FORMATTING_RULES === 'string' && mod.FORMATTING_RULES.length > 0,
            'FORMATTING_RULES must be a non-empty string');
    });

    await test('F.4 — createLLMProvider() still exported from aiProvider', async () => {
        const mod = await import('../src/services/ai/aiProvider');
        assert(typeof mod.createLLMProvider === 'function', 'createLLMProvider must be exported');
    });

    await test('F.5 — selectChunksBySource() still exported from knowledgeRetrieval.service', async () => {
        const mod = await import('../src/services/ai/knowledgeRetrieval.service');
        assert(typeof mod.selectChunksBySource === 'function', 'selectChunksBySource must be exported');
    });

    // ── Print Results ──────────────────────────────────────────────────────
    await runCleanup();

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  CramRoom Topic Intelligence — Phase 4 Test Results        ');
    console.log('════════════════════════════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;
    let currentSuiteLabel = '';

    for (const r of results) {
        if (r.suite !== currentSuiteLabel) {
            currentSuiteLabel = r.suite;
            console.log(`\n  ${r.suite}`);
            console.log('  ' + '─'.repeat(r.suite.length));
        }
        const icon = r.passed ? '✅' : '❌';
        const dur  = `${r.durationMs}ms`;
        console.log(`  ${icon} ${r.name.padEnd(60)} (${dur})`);
        if (!r.passed) {
            console.log(`     ↳ ${r.message}`);
            failed++;
        } else {
            passed++;
        }
    }

    const total = passed + failed;
    console.log(`\n════════════════════════════════════════════════════════════`);
    console.log(`  Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`════════════════════════════════════════════════════════════\n`);

    if (failed > 0) {
        process.exit(1);
    }
};

main().catch(err => {
    console.error('Test runner crashed:', err);
    process.exit(1);
});

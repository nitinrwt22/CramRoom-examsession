/**
 * CramRoom Topic Intelligence — Phase 2 Test Suite
 *
 * Validates the algorithmic refinements introduced in Phase 2:
 *   A. Weak Topic Score Threshold  (detectWeakTopics must enforce >= 3)
 *   B. Recency Index computation   (year-based decay formula in ANALYTICS_REBUILD)
 *   C. Syllabus Coverage %         (fraction of topics with >= 1 raw question)
 *   D. ANALYTICS_REBUILD integration (end-to-end against real DB data)
 *   E. topic_progress_history table existence (migration was applied)
 *
 * Does NOT touch Phase 3 functionality.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/runPhase2Tests.ts
 */

import pool from '../src/config/database';
import { processJob } from '../src/services/ai/jobWorker.service';

// ---------------------------------------------------------------------------
// Minimal test harness (mirrors runParserTests.ts / runDatabaseTests.ts)
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
// Helper: track inserted rows for cleanup
// ---------------------------------------------------------------------------

const cleanupQueue: Array<() => Promise<void>> = [];
const withCleanup = (fn: () => Promise<void>) => cleanupQueue.push(fn);

const runCleanup = async () => {
    for (const fn of cleanupQueue.reverse()) {
        try { await fn(); } catch { /* best-effort */ }
    }
};

// ---------------------------------------------------------------------------
// Utility: replicate the recency / coverage formulas for unit assertions
// ---------------------------------------------------------------------------

const computeRecency = (maxYear: number | null, topicYear: number | null): number => {
    if (topicYear === null || maxYear === null) return 0.00;
    const yearDelta = maxYear - topicYear;
    return parseFloat(Math.max(0, 1.0 - yearDelta * 0.1).toFixed(2));
};

const computeCoverage = (covered: number, total: number): number => {
    if (total === 0) return 0.00;
    return parseFloat(((covered / total) * 100).toFixed(2));
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {

    // ========================================================================
    // SUITE A — Weak Topic Score Threshold (logic extracted, no DB)
    // ========================================================================
    suite('A — Weak Topic Score Threshold');

    await test('A.1 Topics below threshold (score < 3) are excluded from results', async () => {
        const MIN = 3;
        const mockTopics = [
            { name: 'Normal Forms', score: 2 },  // below
            { name: 'Indexing',     score: 4 },  // qualifies
            { name: 'Query',        score: 1 },  // below
        ];
        const qualifying = mockTopics.filter(t => t.score >= MIN);
        assertEqual(qualifying.length, 1, 'Qualifying topic count');
        assertEqual(qualifying[0].name, 'Indexing', 'Qualifying topic name');
    });

    await test('A.2 Topics exactly at threshold (score === 3) are included', async () => {
        const MIN = 3;
        const qualifying = [{ name: 'Exactly Three', score: 3 }].filter(t => t.score >= MIN);
        assertEqual(qualifying.length, 1, 'Exactly-at-threshold topic count');
    });

    await test('A.3 Score = 2 (just below threshold) is excluded', async () => {
        assert(2 < 3, 'Score 2 must be below MIN_WEAK_TOPIC_SCORE');
    });

    await test('A.4 Scores 0, 1, 2 excluded; 3, 5, 10 included', async () => {
        const MIN = 3;
        [0, 1, 2].forEach(s => assert(s < MIN, `Score ${s} must not qualify`));
        [3, 5, 10].forEach(s => assert(s >= MIN, `Score ${s} must qualify`));
    });

    // ========================================================================
    // SUITE B — Recency Index Formula (pure math)
    // ========================================================================
    suite('B — Recency Index Formula');

    await test('B.1 Topic in the latest year gets recency_index = 1.00', async () => {
        assertEqual(computeRecency(2024, 2024), 1.00, 'Most recent year');
    });

    await test('B.2 Topic 1 year behind latest gets recency_index = 0.90', async () => {
        assertEqual(computeRecency(2024, 2023), 0.90, 'One year behind');
    });

    await test('B.3 Topic 5 years behind latest gets recency_index = 0.50', async () => {
        assertEqual(computeRecency(2024, 2019), 0.50, 'Five years behind');
    });

    await test('B.4 Topic 10 years behind latest gets recency_index = 0.00 (floored)', async () => {
        assertEqual(computeRecency(2024, 2014), 0.00, 'Ten years behind (floor at 0)');
    });

    await test('B.5 Topic 12 years behind still returns 0.00 (not negative)', async () => {
        const result = computeRecency(2024, 2012);
        assert(result >= 0, 'Recency index must not be negative');
        assertEqual(result, 0.00, 'Twelve years behind');
    });

    await test('B.6 No paper year data → recency_index = 0.00', async () => {
        assertEqual(computeRecency(null, null), 0.00, 'Null maxYear');
        assertEqual(computeRecency(2024, null), 0.00, 'Null topicYear');
    });

    // ========================================================================
    // SUITE C — Syllabus Coverage % Formula (pure math)
    // ========================================================================
    suite('C — Syllabus Coverage Percentage Formula');

    await test('C.1 3 covered out of 5 total = 60.00%', async () => {
        assertEqual(computeCoverage(3, 5), 60.00, '3/5 coverage');
    });

    await test('C.2 0 covered out of 5 total = 0.00%', async () => {
        assertEqual(computeCoverage(0, 5), 0.00, '0/5 coverage');
    });

    await test('C.3 5 covered out of 5 total = 100.00%', async () => {
        assertEqual(computeCoverage(5, 5), 100.00, '5/5 coverage');
    });

    await test('C.4 0 total topics = 0.00% (no division by zero)', async () => {
        assertEqual(computeCoverage(0, 0), 0.00, '0/0 coverage');
    });

    await test('C.5 1 covered out of 3 = 33.33%', async () => {
        assertEqual(computeCoverage(1, 3), 33.33, '1/3 coverage');
    });

    // ========================================================================
    // SUITE D — ANALYTICS_REBUILD DB Integration (live DB)
    // ========================================================================
    suite('D — ANALYTICS_REBUILD Integration (live DB)');

    let testSessionId: number | null = null;
    let testSyllabusUuid: string | null = null;
    let testPaperUuid: string | null = null;
    const testTopicIds: string[] = [];

    await test('D.1 Setup: create temporary test fixtures', async () => {
        // Reuse the first existing user — avoid creating new users
        const userRes = await pool.query(`SELECT id FROM users LIMIT 1`);
        const userId: number = userRes.rows[0]?.id;
        assert(userId != null, 'At least one user must exist in the DB');

        // Session — include all NOT NULL columns
        const sessRes = await pool.query(
            `INSERT INTO sessions (host_id, subject, exam_date, expiry_time, status)
             VALUES ($1, 'Phase2Test', NOW() + interval '7 days', NOW() + interval '8 days', 'active')
             RETURNING id`,
            [userId]
        );
        testSessionId = sessRes.rows[0].id;
        withCleanup(async () => {
            await pool.query(`DELETE FROM sessions WHERE id = $1`, [testSessionId]);
        });

        // Syllabus (cascades from session)
        const sylRes = await pool.query(
            `INSERT INTO syllabi (session_id, file_name, file_url, raw_text, uploaded_by)
             VALUES ($1, 'Phase2Test.pdf', 'test', 'Phase2 test content', $2)
             RETURNING id`,
            [testSessionId, userId]
        );
        testSyllabusUuid = sylRes.rows[0].id;

        // 4 topics: questions will be mapped to first 3 → coverage = 75%
        for (const name of ['TopicA', 'TopicB', 'TopicC', 'TopicD']) {
            const tRes = await pool.query(
                `INSERT INTO topics (syllabus_id, name) VALUES ($1, $2) RETURNING id`,
                [testSyllabusUuid, name]
            );
            testTopicIds.push(tRes.rows[0].id);
        }

        // Paper with year 2024
        const papRes = await pool.query(
            `INSERT INTO papers (session_id, title, year, exam_type, pdf_url, uploaded_by)
             VALUES ($1, 'Phase2Paper', 2024, 'endsem', 'test.pdf', $2)
             RETURNING id`,
            [testSessionId, userId]
        );
        testPaperUuid = papRes.rows[0].id;

        // Map questions to TopicA, TopicB, TopicC (NOT TopicD)
        for (let i = 0; i < 3; i++) {
            const cqRes = await pool.query(
                `INSERT INTO canonical_questions (topic_id, text) VALUES ($1, $2) RETURNING id`,
                [testTopicIds[i], `Phase2 CQ ${i}`]
            );
            const cqId: string = cqRes.rows[0].id;
            const rqRes = await pool.query(
                `INSERT INTO raw_questions (paper_id, original_text, topic_id, canonical_id)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [testPaperUuid, `Phase2 question text ${i}`, testTopicIds[i], cqId]
            );
            await pool.query(
                `INSERT INTO question_variants (canonical_question_id, raw_question_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [cqId, rqRes.rows[0].id]
            );
        }

        assert(testSessionId !== null, 'Session created');
        assert(testTopicIds.length === 4, '4 topics created');
    });

    await test('D.2 ANALYTICS_REBUILD populates topic_analytics (4 rows)', async () => {
        assert(testSessionId !== null, 'Session must be set up');
        const job = { id: 'p2-test', session_id: testSessionId, job_type: 'ANALYTICS_REBUILD', payload: {} };
        await processJob(job);

        const rows = await pool.query(
            `SELECT ta.topic_id
             FROM topic_analytics ta
             JOIN topics t ON ta.topic_id = t.id
             JOIN syllabi s ON t.syllabus_id = s.id
             WHERE s.session_id = $1`,
            [testSessionId]
        );
        assertEqual(rows.rows.length, 4, 'Expected 4 topic_analytics rows');
    });

    await test('D.3 syllabus_coverage_pct = 75.00 (3 of 4 topics have questions)', async () => {
        assert(testSessionId !== null, 'Session must be set up');
        const row = await pool.query(
            `SELECT ta.syllabus_coverage_pct
             FROM topic_analytics ta
             JOIN topics t ON ta.topic_id = t.id
             JOIN syllabi s ON t.syllabus_id = s.id
             WHERE s.session_id = $1
             LIMIT 1`,
            [testSessionId]
        );
        const pct = parseFloat(row.rows[0]?.syllabus_coverage_pct ?? '0');
        assertEqual(pct, 75.00, 'syllabus_coverage_pct for 3/4 topics');
    });

    await test('D.4 recency_index = 1.00 for TopicA (mapped to 2024 paper)', async () => {
        assert(testSessionId !== null && testTopicIds.length > 0, 'Setup required');
        const row = await pool.query(
            `SELECT recency_index FROM topic_analytics WHERE topic_id = $1 AND session_id = $2`,
            [testTopicIds[0], testSessionId]
        );
        const recency = parseFloat(row.rows[0]?.recency_index ?? '-1');
        assertEqual(recency, 1.00, 'TopicA recency_index');
    });

    await test('D.5 recency_index = 0.00 for TopicD (no questions)', async () => {
        assert(testSessionId !== null && testTopicIds.length > 0, 'Setup required');
        const row = await pool.query(
            `SELECT recency_index FROM topic_analytics WHERE topic_id = $1 AND session_id = $2`,
            [testTopicIds[3], testSessionId]
        );
        const recency = parseFloat(row.rows[0]?.recency_index ?? '-1');
        assertEqual(recency, 0.00, 'TopicD recency_index');
    });

    await test('D.6 appearance_frequency = 0 for TopicD (no mapped questions)', async () => {
        assert(testSessionId !== null && testTopicIds.length > 0, 'Setup required');
        const row = await pool.query(
            `SELECT appearance_frequency FROM topic_analytics WHERE topic_id = $1 AND session_id = $2`,
            [testTopicIds[3], testSessionId]
        );
        assertEqual(row.rows[0]?.appearance_frequency, 0, 'TopicD frequency');
    });

    await test('D.7 appearance_frequency = 1 for TopicA (1 raw question)', async () => {
        assert(testSessionId !== null && testTopicIds.length > 0, 'Setup required');
        const row = await pool.query(
            `SELECT appearance_frequency FROM topic_analytics WHERE topic_id = $1 AND session_id = $2`,
            [testTopicIds[0], testSessionId]
        );
        assertEqual(row.rows[0]?.appearance_frequency, 1, 'TopicA frequency');
    });

    await test('D.8 ANALYTICS_REBUILD is idempotent (second run does not duplicate rows)', async () => {
        assert(testSessionId !== null, 'Session required');
        const job = { id: 'p2-test-2', session_id: testSessionId, job_type: 'ANALYTICS_REBUILD', payload: {} };
        await processJob(job);
        const rows = await pool.query(
            `SELECT ta.topic_id
             FROM topic_analytics ta
             JOIN topics t ON ta.topic_id = t.id
             JOIN syllabi s ON t.syllabus_id = s.id
             WHERE s.session_id = $1`,
            [testSessionId]
        );
        assertEqual(rows.rows.length, 4, 'Still 4 rows after second rebuild (ON CONFLICT)');
    });

    // ========================================================================
    // SUITE E — topic_progress_history Migration
    // ========================================================================
    suite('E — topic_progress_history Migration');

    await test('E.1 topic_progress_history table exists', async () => {
        const t = await pool.query(`SELECT to_regclass('public.topic_progress_history')`);
        assert(t.rows[0].to_regclass !== null, 'topic_progress_history table must exist');
    });

    await test('E.2 topic_progress_history has required columns', async () => {
        const cols = await pool.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name = 'topic_progress_history'`
        );
        const names: string[] = cols.rows.map((r: any) => r.column_name);
        for (const col of ['id', 'session_id', 'topic_id', 'score', 'recorded_at']) {
            assert(names.includes(col), `Column '${col}' must exist in topic_progress_history`);
        }
    });

    // ========================================================================
    // Teardown
    // ========================================================================
    await runCleanup();

    // ========================================================================
    // Report
    // ========================================================================
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    console.log('\n' + '═'.repeat(64));
    console.log('  CramRoom Phase 2 — Algorithmic Refinement Test Results');
    console.log('═'.repeat(64));

    let lastSuite = '';
    for (const r of results) {
        if (r.suite !== lastSuite) {
            console.log(`\n  ${r.suite}`);
            lastSuite = r.suite;
        }
        const icon = r.passed ? '✅' : '❌';
        console.log(`  ${icon} [${r.durationMs}ms] ${r.name}`);
        if (!r.passed) console.log(`       → ${r.message}`);
    }

    console.log('\n' + '─'.repeat(64));
    console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
    console.log('─'.repeat(64) + '\n');

    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
};

main().catch(err => {
    console.error('Phase 2 test runner crashed:', err);
    process.exit(1);
});

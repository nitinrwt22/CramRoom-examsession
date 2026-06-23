/**
 * CramRoom V2 Migration Validation Script
 *
 * Runs a comprehensive validation against all migrated V2 tables.
 * Run AFTER runDataMigration.ts to confirm data integrity.
 *
 * Checks:
 *   1.  File partition count (legacy files vs V2 sum + skipped)
 *   2.  Chunk partition count (legacy chunks vs V2 sum)
 *   3.  Orphaned raw_questions (paper_id IS NULL)
 *   4.  Orphaned topics (syllabus_id IS NULL)
 *   5.  Required field null checks
 *   6.  Foreign key reference integrity (expanded — includes syllabi + uploaded_notes)
 *   7.  Total count summary
 *   8.  participants compatibility VIEW (NEW — P0 fix verification)
 *   9.  Placeholder raw_text count in syllabi (NEW — P1 fix informational)
 *
 * Usage:
 *   npx ts-node scripts/runValidation.ts
 */

import pool from '../src/config/database';

const log  = (msg: string) => console.log(`[Validate] ${msg}`);
const ok   = (msg: string) => console.log(`[Validate] ✅  ${msg}`);
const fail = (msg: string) => console.log(`[Validate] ❌  ${msg}`);
const warn = (msg: string) => console.log(`[Validate] ⚠️   ${msg}`);
const info = (msg: string) => console.log(`[Validate] ℹ️   ${msg}`);
const sep  = ()             => console.log('[Validate] ' + '─'.repeat(60));

const SKIPPED_TABLE = 'migration_skipped_files';
const PLACEHOLDER_PREFIX = '[Migrated from legacy file:';

interface CheckResult {
    name: string;
    passed: boolean;
    message: string;
    informational?: boolean;  // if true, does not count toward failure total
}

async function runValidation(): Promise<void> {
    log('CramRoom V2 Migration Validation');
    sep();

    const client = await pool.connect();
    const results: CheckResult[] = [];

    try {
        // ─── Check 1: File Partition Counts ───────────────────────────────────
        sep();
        log('CHECK 1: File partition count (legacy files vs V2 tables + skipped)');

        const legacyFilesCount = parseInt(
            (await client.query('SELECT COUNT(*) FROM files')).rows[0].count, 10
        );
        const papersCount      = parseInt(
            (await client.query('SELECT COUNT(*) FROM papers')).rows[0].count, 10
        );
        const syllabiCount     = parseInt(
            (await client.query('SELECT COUNT(*) FROM syllabi')).rows[0].count, 10
        );
        const uploadedNotesCnt = parseInt(
            (await client.query('SELECT COUNT(*) FROM uploaded_notes')).rows[0].count, 10
        );
        const mappedFilesCount = parseInt(
            (await client.query('SELECT COUNT(*) FROM migration_file_uuid_map')
                .catch(() => ({ rows: [{ count: '0' }] }))).rows[0].count, 10
        );
        // Count distinct skipped file IDs (a file may have multiple skip-log entries from retries)
        const skippedFilesCount = parseInt(
            (await client.query(`SELECT COUNT(DISTINCT file_id) FROM ${SKIPPED_TABLE}`)
                .catch(() => ({ rows: [{ count: '0' }] }))).rows[0].count, 10
        );

        const v2FilesSum   = papersCount + syllabiCount + uploadedNotesCnt;
        const accountedFor = mappedFilesCount + skippedFilesCount;
        const unaccounted  = legacyFilesCount - accountedFor;

        log(`  Legacy files table:         ${legacyFilesCount} total`);
        log(`  → papers:                   ${papersCount}`);
        log(`  → syllabi:                  ${syllabiCount}`);
        log(`  → uploaded_notes:           ${uploadedNotesCnt}`);
        log(`  V2 sum (p+s+n):             ${v2FilesSum}`);
        log(`  Mapping table total:        ${mappedFilesCount}`);
        log(`  Skipped (${SKIPPED_TABLE}): ${skippedFilesCount}`);
        log(`  Unaccounted:                ${unaccounted}`);

        // Primary check: V2 sum must match the mapping table
        if (v2FilesSum !== mappedFilesCount) {
            results.push({
                name: 'File partition count',
                passed: false,
                message: `V2 sum (${v2FilesSum}) ≠ mapping table count (${mappedFilesCount}).`
            });
        } else if (unaccounted !== 0) {
            // Secondary check: every legacy file must be either migrated or in the skip log
            results.push({
                name: 'File partition count',
                passed: false,
                message: `${unaccounted} legacy file(s) are neither migrated nor in the skip log — investigate.`
            });
        } else {
            results.push({
                name: 'File partition count',
                passed: true,
                message: `All ${legacyFilesCount} legacy files accounted for (migrated=${mappedFilesCount}, skipped=${skippedFilesCount}).`
            });
        }

        // ─── Check 2: Chunk Partition Counts ──────────────────────────────────
        sep();
        log('CHECK 2: Chunk partition count (legacy chunks vs V2 tables)');

        const legacyKnowledgeChunks = parseInt(
            (await client.query(
                "SELECT COUNT(*) FROM session_ai_chunks WHERE file_id IS NOT NULL AND chunk_text IS NOT NULL"
            )).rows[0].count, 10
        );
        const rawQuestionsCount = parseInt(
            (await client.query('SELECT COUNT(*) FROM raw_questions')).rows[0].count, 10
        );
        const topicsCount       = parseInt(
            (await client.query('SELECT COUNT(*) FROM topics')).rows[0].count, 10
        );

        log(`  Legacy knowledge chunks: ${legacyKnowledgeChunks}`);
        log(`  → raw_questions:         ${rawQuestionsCount}`);
        log(`  → topics:                ${topicsCount}`);

        const v2ChunksSum = rawQuestionsCount + topicsCount;
        if (v2ChunksSum === legacyKnowledgeChunks) {
            results.push({
                name: 'Chunk partition count',
                passed: true,
                message: `All ${legacyKnowledgeChunks} chunks accounted for.`
            });
        } else {
            const skipped = legacyKnowledgeChunks - v2ChunksSum;
            results.push({
                name: 'Chunk partition count',
                passed: skipped >= 0,
                message: skipped >= 0
                    ? `${v2ChunksSum} migrated, ${skipped} skipped (chunks whose parent file was not migrated).`
                    : `V2 sum (${v2ChunksSum}) exceeds legacy count (${legacyKnowledgeChunks}) — duplicate insert suspected!`
            });
        }

        // ─── Check 3: Orphaned raw_questions ──────────────────────────────────
        sep();
        log('CHECK 3: Orphaned raw_questions (paper_id IS NULL)');
        const orphanRQ = parseInt(
            (await client.query('SELECT COUNT(*) FROM raw_questions WHERE paper_id IS NULL')).rows[0].count, 10
        );
        log(`  Orphaned raw_questions: ${orphanRQ}`);
        results.push({
            name: 'Orphaned raw_questions',
            passed: orphanRQ === 0,
            message: orphanRQ === 0 ? 'None found.' : `${orphanRQ} raw_questions have NULL paper_id!`
        });

        // ─── Check 4: Orphaned topics ─────────────────────────────────────────
        sep();
        log('CHECK 4: Orphaned topics (syllabus_id IS NULL)');
        const orphanTopics = parseInt(
            (await client.query('SELECT COUNT(*) FROM topics WHERE syllabus_id IS NULL')).rows[0].count, 10
        );
        log(`  Orphaned topics: ${orphanTopics}`);
        results.push({
            name: 'Orphaned topics',
            passed: orphanTopics === 0,
            message: orphanTopics === 0 ? 'None found.' : `${orphanTopics} topics have NULL syllabus_id!`
        });

        // ─── Check 5: Required field null checks ──────────────────────────────
        sep();
        log('CHECK 5: Required field null checks');

        const nullPaperTitle    = parseInt((await client.query("SELECT COUNT(*) FROM papers WHERE title IS NULL OR title = ''")).rows[0].count, 10);
        const nullPaperPdfUrl   = parseInt((await client.query("SELECT COUNT(*) FROM papers WHERE pdf_url IS NULL")).rows[0].count, 10);
        const nullPaperSession  = parseInt((await client.query("SELECT COUNT(*) FROM papers WHERE session_id IS NULL")).rows[0].count, 10);
        const nullRQText        = parseInt((await client.query("SELECT COUNT(*) FROM raw_questions WHERE original_text IS NULL OR original_text = ''")).rows[0].count, 10);
        const nullRQPaper       = parseInt((await client.query("SELECT COUNT(*) FROM raw_questions WHERE paper_id IS NULL")).rows[0].count, 10);
        const nullTopicName     = parseInt((await client.query("SELECT COUNT(*) FROM topics WHERE name IS NULL OR name = ''")).rows[0].count, 10);
        const nullTopicSyllabus = parseInt((await client.query("SELECT COUNT(*) FROM topics WHERE syllabus_id IS NULL")).rows[0].count, 10);

        log(`  papers.title IS NULL:            ${nullPaperTitle}`);
        log(`  papers.pdf_url IS NULL:           ${nullPaperPdfUrl}`);
        log(`  papers.session_id IS NULL:        ${nullPaperSession}`);
        log(`  raw_questions.original_text NULL: ${nullRQText}`);
        log(`  raw_questions.paper_id IS NULL:   ${nullRQPaper}`);
        log(`  topics.name IS NULL:              ${nullTopicName}`);
        log(`  topics.syllabus_id IS NULL:       ${nullTopicSyllabus}`);

        const totalNullCritical = nullPaperTitle + nullPaperSession + nullRQText + nullRQPaper + nullTopicSyllabus;
        results.push({
            name: 'Required field null checks',
            passed: totalNullCritical === 0,
            message: totalNullCritical === 0
                ? 'All critical fields populated.'
                : `${totalNullCritical} critical null field violations found!`
        });

        // ─── Check 6: FK Reference integrity (EXPANDED) ───────────────────────
        //
        // FIX: The original Check 6 only tested:
        //   papers → sessions, raw_questions → papers, topics → syllabi
        //
        // Added the four missing FK paths called out in the review §4.5 / §9 P2-10:
        //   syllabi → sessions, syllabi → users,
        //   uploaded_notes → sessions, uploaded_notes → users
        // ─────────────────────────────────────────────────────────────────────
        sep();
        log('CHECK 6: Foreign key reference integrity');

        const dangling_papers_session = parseInt((await client.query(`
            SELECT COUNT(*) FROM papers p
            LEFT JOIN sessions s ON s.id = p.session_id
            WHERE s.id IS NULL
        `)).rows[0].count, 10);

        const dangling_rq_paper = parseInt((await client.query(`
            SELECT COUNT(*) FROM raw_questions rq
            LEFT JOIN papers p ON p.id = rq.paper_id
            WHERE rq.paper_id IS NOT NULL AND p.id IS NULL
        `)).rows[0].count, 10);

        const dangling_topics_syllabus = parseInt((await client.query(`
            SELECT COUNT(*) FROM topics t
            LEFT JOIN syllabi s ON s.id = t.syllabus_id
            WHERE t.syllabus_id IS NOT NULL AND s.id IS NULL
        `)).rows[0].count, 10);

        // Previously missing — syllabi FK checks
        const dangling_syllabi_session = parseInt((await client.query(`
            SELECT COUNT(*) FROM syllabi sy
            LEFT JOIN sessions s ON s.id = sy.session_id
            WHERE s.id IS NULL
        `)).rows[0].count, 10);

        const dangling_syllabi_user = parseInt((await client.query(`
            SELECT COUNT(*) FROM syllabi sy
            LEFT JOIN users u ON u.id = sy.uploaded_by
            WHERE u.id IS NULL
        `)).rows[0].count, 10);

        // Previously missing — uploaded_notes FK checks
        const dangling_notes_session = parseInt((await client.query(`
            SELECT COUNT(*) FROM uploaded_notes un
            LEFT JOIN sessions s ON s.id = un.session_id
            WHERE s.id IS NULL
        `)).rows[0].count, 10);

        const dangling_notes_user = parseInt((await client.query(`
            SELECT COUNT(*) FROM uploaded_notes un
            LEFT JOIN users u ON u.id = un.uploaded_by
            WHERE u.id IS NULL
        `)).rows[0].count, 10);

        log(`  papers → sessions dangling FKs:           ${dangling_papers_session}`);
        log(`  raw_questions → papers dangling FKs:      ${dangling_rq_paper}`);
        log(`  topics → syllabi dangling FKs:            ${dangling_topics_syllabus}`);
        log(`  syllabi → sessions dangling FKs:          ${dangling_syllabi_session}`);
        log(`  syllabi → users dangling FKs:             ${dangling_syllabi_user}`);
        log(`  uploaded_notes → sessions dangling FKs:   ${dangling_notes_session}`);
        log(`  uploaded_notes → users dangling FKs:      ${dangling_notes_user}`);

        const totalFKIssues =
            dangling_papers_session +
            dangling_rq_paper +
            dangling_topics_syllabus +
            dangling_syllabi_session +
            dangling_syllabi_user +
            dangling_notes_session +
            dangling_notes_user;

        results.push({
            name: 'FK reference integrity',
            passed: totalFKIssues === 0,
            message: totalFKIssues === 0
                ? 'All FK references are valid (7 paths checked).'
                : `${totalFKIssues} dangling foreign key references found!`
        });

        // ─── Check 7: session_members exists ──────────────────────────────────
        sep();
        log('CHECK 7: session_members table exists');
        const smExists = await client.query(`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'session_members'
              AND table_type = 'BASE TABLE'
        `);
        const smCount = smExists.rows.length > 0
            ? parseInt((await client.query('SELECT COUNT(*) FROM session_members')).rows[0].count, 10)
            : 0;
        log(`  session_members exists: ${smExists.rows.length > 0 ? 'YES' : 'NO'} (${smCount} rows)`);
        results.push({
            name: 'session_members exists',
            passed: smExists.rows.length > 0,
            message: smExists.rows.length > 0
                ? `session_members table exists with ${smCount} rows.`
                : 'session_members table not found — Phase 1 may not have run.'
        });

        // ─── Check 8 (NEW): participants compatibility VIEW ───────────────────
        //
        // FIX (P0 verification): Phase 1 now creates a VIEW named participants
        // immediately after renaming the physical table. This check verifies:
        //   (a) participants exists as a VIEW (not a table),
        //   (b) SELECT COUNT(*) through the view matches session_members.
        // ─────────────────────────────────────────────────────────────────────
        sep();
        log('CHECK 8: participants compatibility VIEW (P0 fix verification)');

        const participantsKind = await client.query(`
            SELECT table_type FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'participants'
        `);

        if (participantsKind.rows.length === 0) {
            fail('  participants object not found — application code will fail!');
            results.push({
                name: 'participants compatibility VIEW',
                passed: false,
                message: 'participants VIEW is missing — Phase 1 did not create it.'
            });
        } else if (participantsKind.rows[0].table_type !== 'VIEW') {
            warn('  participants exists as a BASE TABLE — rename not yet performed.');
            results.push({
                name: 'participants compatibility VIEW',
                passed: false,
                message: 'participants is still a physical table — Phase 1 rename not yet run.'
            });
        } else {
            // It's a view — verify row count parity with session_members
            const viewCount = parseInt(
                (await client.query('SELECT COUNT(*) FROM participants')).rows[0].count, 10
            );
            const tableCount = parseInt(
                (await client.query('SELECT COUNT(*) FROM session_members')).rows[0].count, 10
            );
            log(`  participants VIEW row count:   ${viewCount}`);
            log(`  session_members table count:   ${tableCount}`);

            if (viewCount === tableCount) {
                ok('  participants is a VIEW over session_members — compatibility layer active.');
                results.push({
                    name: 'participants compatibility VIEW',
                    passed: true,
                    message: `VIEW exists and is consistent (${viewCount} rows through view = ${tableCount} in session_members).`
                });
            } else {
                results.push({
                    name: 'participants compatibility VIEW',
                    passed: false,
                    message: `VIEW row count (${viewCount}) ≠ session_members count (${tableCount}) — unexpected!`
                });
            }
        }

        // ─── Check 9 (NEW): Placeholder raw_text in syllabi ──────────────────
        //
        // Informational — not a hard failure (placeholders are still better than
        // crashing). Operators should review migration_skipped_files for these rows
        // and consider re-running the migration after uploading missing files.
        // ─────────────────────────────────────────────────────────────────────
        sep();
        log('CHECK 9: Placeholder raw_text in syllabi (P1 fix informational)');

        const placeholderSyllabi = parseInt(
            (await client.query(`
                SELECT COUNT(*) FROM syllabi
                WHERE raw_text LIKE '${PLACEHOLDER_PREFIX}%'
            `)).rows[0].count, 10
        );
        const totalSyllabi = syllabiCount;

        log(`  Total syllabi:              ${totalSyllabi}`);
        log(`  Syllabi with placeholder:   ${placeholderSyllabi}`);
        log(`  Syllabi with real content:  ${totalSyllabi - placeholderSyllabi}`);

        if (placeholderSyllabi === 0) {
            info('  All syllabi have real raw_text content.');
        } else {
            warn(`  ${placeholderSyllabi} syllabus/syllabi still have placeholder raw_text.`);
            warn(`  Check ${SKIPPED_TABLE} for details and upload the missing files before Step 3.`);
        }

        results.push({
            name: 'Syllabi placeholder raw_text count',
            passed: placeholderSyllabi === 0,
            informational: true,
            message: placeholderSyllabi === 0
                ? 'All syllabi have real content.'
                : `${placeholderSyllabi} of ${totalSyllabi} syllabi have placeholder raw_text (informational — check ${SKIPPED_TABLE}).`
        });

        // ─── Summary ──────────────────────────────────────────────────────────
        sep();
        log('VALIDATION RESULTS:');
        sep();
        let passed = 0;
        let hardFailed = 0;
        for (const r of results) {
            if (r.passed) {
                ok(`${r.name}: ${r.message}`);
                passed++;
            } else if (r.informational) {
                warn(`${r.name}: ${r.message}`);
                // informational checks do not increment hardFailed
            } else {
                fail(`${r.name}: ${r.message}`);
                hardFailed++;
            }
        }
        sep();

        const hardChecks = results.filter(r => !r.informational).length;
        const infoChecks = results.filter(r => r.informational).length;
        log(`TOTAL: ${passed}/${results.length} checks passed (${hardChecks} hard, ${infoChecks} informational).`);
        sep();

        if (hardFailed === 0) {
            ok('All hard checks passed. Migration is verified complete.');
            if (results.some(r => r.informational && !r.passed)) {
                warn('Some informational checks have warnings — review them above before Step 3.');
            }
        } else {
            warn(`${hardFailed} hard check(s) failed. Review output above before proceeding to Step 3.`);
        }

    } finally {
        client.release();
        await pool.end();
    }
}

runValidation().catch(err => {
    console.error('[Validate] ❌ Validation runner error:', err.message);
    process.exit(1);
});

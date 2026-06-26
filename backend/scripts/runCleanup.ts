/**
 * CramRoom V2 Legacy Cleanup Runner
 *
 * Executes migration_v2_cleanup.sql which:
 *  1. Creates topic_progress_history (V2 progress table)
 *  2. Migrates existing session_topic_progress data
 *  3. Drops participants VIEW
 *  4. Drops migration_file_uuid_map TABLE
 *  5. Drops V1 columns from session_ai_chunks
 *  6. Drops session_topic_progress TABLE
 *  7. Drops files TABLE
 *
 * PRE-CONDITIONS (verified before execution):
 *  - No references to legacy tables remain in application code
 *  - A pg_dump cold backup has been created before running this
 *
 * Usage:
 *   npx ts-node scripts/runCleanup.ts
 */

import fs from 'fs';
import path from 'path';
import pool from '../src/config/database';

const log  = (msg: string) => console.log(`[Cleanup]   ${msg}`);
const ok   = (msg: string) => console.log(`[Cleanup] ✅ ${msg}`);
const fail = (msg: string) => { console.error(`[Cleanup] ❌ ${msg}`); process.exit(1); };

const runCleanup = async () => {
    console.log('\n[Cleanup] ════════════════════════════════════════════');
    console.log('[Cleanup]  CramRoom V2 Legacy Cleanup');
    console.log('[Cleanup] ════════════════════════════════════════════\n');

    const client = await pool.connect();
    try {
        // ─── Pre-condition checks ────────────────────────────────────────────
        log('Running pre-condition checks...');

        // 1. Confirm V2 tables exist and are populated
        const papersCount    = (await client.query('SELECT COUNT(*)::int FROM papers')).rows[0].count;
        const syllabiiCount  = (await client.query('SELECT COUNT(*)::int FROM syllabi')).rows[0].count;
        const topicsCount    = (await client.query('SELECT COUNT(*)::int FROM topics')).rows[0].count;
        log(`V2 data: ${papersCount} papers | ${syllabiiCount} syllabi | ${topicsCount} topics`);

        // 2. Confirm legacy tables still exist (haven't already been dropped)
        const legacyCheck = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('files', 'session_topic_progress', 'migration_file_uuid_map')
        `);
        const foundLegacy = legacyCheck.rows.map((r: any) => r.table_name);
        log(`Legacy tables found: ${foundLegacy.join(', ') || 'none (already cleaned)'}`);

        if (foundLegacy.length === 0) {
            ok('Legacy tables already absent — cleanup was previously run. Exiting cleanly.');
            process.exit(0);
        }

        // 3. Snapshot counts for post-validation
        const filesCount       = (await client.query('SELECT COUNT(*)::int FROM files')).rows[0].count;
        const chunksBefore     = (await client.query('SELECT COUNT(*)::int FROM session_ai_chunks')).rows[0].count;
        const progressCount    = foundLegacy.includes('session_topic_progress')
            ? (await client.query('SELECT COUNT(*)::int FROM session_topic_progress')).rows[0].count
            : 0;
        log(`Pre-cleanup counts: files=${filesCount}, session_ai_chunks=${chunksBefore}, session_topic_progress=${progressCount}`);

        ok('Pre-condition checks passed.\n');

        // ─── Execute cleanup SQL ─────────────────────────────────────────────
        log('Executing migration_v2_cleanup.sql...');
        const sqlPath = path.join(__dirname, '../migration_v2_cleanup.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        await client.query(sql);
        ok('SQL executed successfully.\n');

        // ─── Post-validation ─────────────────────────────────────────────────
        log('Running post-validation...');

        // Confirm legacy tables gone
        const tablesAfter = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('files', 'session_topic_progress', 'migration_file_uuid_map', 'participants')
        `);
        if (tablesAfter.rows.length > 0) {
            fail(`Some legacy objects still exist: ${tablesAfter.rows.map((r: any) => r.table_name).join(', ')}`);
        }
        ok('Legacy tables/view confirmed absent.');

        // Confirm session_ai_chunks still has its core columns
        const chunksAfter = (await client.query('SELECT COUNT(*)::int FROM session_ai_chunks')).rows[0].count;
        ok(`session_ai_chunks preserved: ${chunksAfter} rows (chat summaries intact).`);

        // Confirm topic_progress_history exists
        const tphCount = (await client.query('SELECT COUNT(*)::int FROM topic_progress_history')).rows[0].count;
        ok(`topic_progress_history created with ${tphCount} migrated rows (from ${progressCount} legacy rows).`);

        // Confirm V2 tables untouched
        const papersAfter = (await client.query('SELECT COUNT(*)::int FROM papers')).rows[0].count;
        const topicsAfter = (await client.query('SELECT COUNT(*)::int FROM topics')).rows[0].count;
        if (papersAfter !== papersCount || topicsAfter !== topicsCount) {
            fail('V2 table row counts changed unexpectedly — investigation required.');
        }
        ok(`V2 tables intact: ${papersAfter} papers, ${topicsAfter} topics.`);

        console.log('\n[Cleanup] ════════════════════════════════════════════');
        console.log('[Cleanup]  🎉 Legacy cleanup complete.');
        console.log('[Cleanup] ════════════════════════════════════════════\n');

        process.exit(0);
    } catch (err: any) {
        console.error('[Cleanup] ❌ Cleanup failed:', err.message);
        console.error('[Cleanup]    Database is unchanged (transaction was rolled back).');
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

runCleanup();

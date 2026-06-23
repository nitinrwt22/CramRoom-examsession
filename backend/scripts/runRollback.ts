/**
 * CramRoom V2 Migration Rollback Script
 *
 * Undoes the data migration by truncating all V2 tables in reverse
 * foreign key dependency order.
 *
 * WHAT THIS DOES:
 *   - Truncates all newly populated V2 tables (papers, syllabi, topics,
 *     raw_questions, uploaded_notes, personal_notes, generated_answers,
 *     question_variants, canonical_questions, topic_analytics,
 *     question_analytics, ai_suggested_questions, jobs)
 *   - Drops the temporary migration_file_uuid_map table
 *   - Optionally reverts session_members → participants rename
 *
 * WHAT THIS DOES NOT DO:
 *   - Does NOT drop V2 table structures (tables remain, just emptied)
 *   - Does NOT touch any legacy V1 tables
 *   - Does NOT affect users, sessions, files, session_ai_chunks,
 *     session_ai_messages, session_topic_progress, messages, session_files
 *
 * Usage:
 *   npx ts-node scripts/runRollback.ts
 *
 *   To also revert the participants rename:
 *   REVERT_RENAME=true npx ts-node scripts/runRollback.ts
 */

import pool from '../src/config/database';

const REVERT_RENAME = process.env.REVERT_RENAME === 'true';

const log  = (msg: string) => console.log(`[Rollback] ${msg}`);
const ok   = (msg: string) => console.log(`[Rollback] ✅  ${msg}`);
const warn = (msg: string) => console.log(`[Rollback] ⚠️   ${msg}`);
const sep  = ()             => console.log('[Rollback] ' + '─'.repeat(60));

async function rollback(): Promise<void> {
    log('Starting V2 data rollback...');
    log('Legacy tables will NOT be modified.');
    sep();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Truncate in reverse FK dependency order
        // (deepest children first to avoid constraint violations)
        const tablesToTruncate = [
            'ai_suggested_questions',
            'question_analytics',
            'topic_analytics',
            'generated_answers',
            'question_variants',
            'raw_questions',        // depends on papers, topics
            'topics',               // depends on syllabi
            'canonical_questions',  // depends on topics
            'uploaded_notes',
            'personal_notes',
            'jobs',
            'papers',               // depends on sessions, users
            'syllabi',              // depends on sessions, users
        ];

        for (const table of tablesToTruncate) {
            // Check table exists before truncating
            const tableCheck = await client.query(`
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = $1
            `, [table]);

            if (tableCheck.rows.length === 0) {
                warn(`Table '${table}' does not exist — skipping.`);
                continue;
            }

            const countResult = await client.query(`SELECT COUNT(*) FROM "${table}"`);
            const count = parseInt(countResult.rows[0].count, 10);

            await client.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
            log(`  Truncated ${table} (${count} rows removed).`);
        }

        // Drop the temporary UUID mapping table
        const mappingExists = await client.query(`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'migration_file_uuid_map'
        `);
        if (mappingExists.rows.length > 0) {
            const mapCount = await client.query('SELECT COUNT(*) FROM migration_file_uuid_map');
            await client.query('DROP TABLE IF EXISTS migration_file_uuid_map');
            log(`  Dropped migration_file_uuid_map (${mapCount.rows[0].count} mapping records removed).`);
        } else {
            log('  migration_file_uuid_map not found — already clean.');
        }

        await client.query('COMMIT');
        ok('All V2 data tables truncated successfully.');
        sep();

        // Optional: revert session_members → participants
        if (REVERT_RENAME) {
            log('REVERT_RENAME=true — reverting session_members → participants...');

            const sessionMembersExists = await client.query(`
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'session_members'
            `);
            const participantsExists = await client.query(`
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'participants'
            `);

            if (sessionMembersExists.rows.length > 0 && participantsExists.rows.length === 0) {
                await client.query('ALTER TABLE session_members RENAME TO participants');
                ok('session_members renamed back to participants.');
            } else if (participantsExists.rows.length > 0) {
                warn('participants table already exists — skipping rename revert.');
            } else {
                warn('session_members not found — nothing to rename.');
            }
        } else {
            log('Skipping rename revert (set REVERT_RENAME=true to also revert participants rename).');
        }

        sep();
        ok('Rollback complete. Legacy tables are untouched and operational.');
        sep();
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`[Rollback] ❌ Rollback failed: ${err.message}`);
        console.error(err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

rollback();

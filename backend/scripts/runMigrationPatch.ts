/**
 * CramRoom V2 Migration Schema Patch Runner
 *
 * Applies migration_v2_data_patch.sql which adds idempotency tracking
 * columns to raw_questions and topics tables.
 *
 * MUST be run BEFORE runDataMigration.ts.
 *
 * Usage:
 *   npx ts-node scripts/runMigrationPatch.ts
 */

import fs from 'fs';
import path from 'path';
import pool from '../src/config/database';

const runPatch = async () => {
    console.log('[Patch] Applying V2 data migration schema patch...');

    try {
        const sqlPath = path.join(__dirname, '../migration_v2_data_patch.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        await pool.query(sql);

        console.log('[Patch] ✅ Schema patch applied successfully.');
        process.exit(0);
    } catch (err: any) {
        console.error('[Patch] ❌ Patch failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

runPatch();

/**
 * CramRoom V2 Schema Migration Runner
 *
 * Runs migration_v2_schema.sql which creates all 13 new V2 tables.
 * Existing tables are NOT modified or dropped.
 *
 * Usage:
 *   npx ts-node scripts/runMigrationV2.ts
 */
import fs from 'fs';
import path from 'path';
import pool from '../src/config/database';

const runMigrationV2 = async () => {
    console.log('[V2 Migration] Starting...');

    try {
        const sqlPath = path.join(__dirname, '../migration_v2_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('[V2 Migration] Executing migration_v2_schema.sql...');
        await pool.query(sql);

        console.log('[V2 Migration] ✅ All V2 tables created successfully.');
        process.exit(0);
    } catch (err: any) {
        console.error('[V2 Migration] ❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

runMigrationV2();

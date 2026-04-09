import fs from 'fs';
import path from 'path';
import pool from '../src/config/database';

const runMigration = async () => {
    try {
        const sqlPath = path.join(__dirname, '../migration_chat_tags.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await pool.query(sql);
        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed', err);
        process.exit(1);
    }
};

runMigration();

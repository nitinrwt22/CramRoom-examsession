const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'cramroom',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

async function getSchema() {
    try {
        const client = await pool.connect();
        
        const tables = ['files', 'session_ai_chunks', 'session_topic_progress', 'session_ai_messages'];
        for (const table of tables) {
            console.log(`\n--- Schema for ${table} ---`);
            const res = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1
            `, [table]);
            console.table(res.rows);
        }

        client.release();
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

getSchema();

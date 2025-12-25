import { Pool } from 'pg';
import { config } from './env';

const pool = new Pool({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    port: config.db.port,
});

export const connectDB = async () => {
    try {
        const client = await pool.connect();
        console.log('Database connected successfully');
        client.release();
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
};

export default pool;

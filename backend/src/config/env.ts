import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
    port: process.env.PORT || 5001,
    db: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        name: process.env.DB_NAME || 'postgres',
        port: parseInt(process.env.DB_PORT || '5432', 10),
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'default_secret',
    },
};

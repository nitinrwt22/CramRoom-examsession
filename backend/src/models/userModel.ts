import pool from '../config/database';

export const getUserById = async (userId: number) => {
    const query = `
        SELECT * FROM users WHERE id = $1;
    `;
    try {
        const result = await pool.query(query, [userId]);
        return result.rows[0];
    } catch (error) {
        console.error('Error fetching user by ID:', error);
        throw error;
    }
};

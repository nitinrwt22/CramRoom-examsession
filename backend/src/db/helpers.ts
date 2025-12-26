import pool from '../config/database';

export const createUser = async (name: string, email: string, passwordHash: string) => {
    const query = `
    INSERT INTO users (name, email, password)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
    try {
        const result = await pool.query(query, [name, email, passwordHash]);
        return result.rows[0];
    } catch (error) {
        console.error('Error creating user:', error);
        throw error;
    }
};

export const getUserByEmail = async (email: string) => {
    const query = `
    SELECT * FROM users
    WHERE email = $1;
  `;
    try {
        const result = await pool.query(query, [email]);
        return result.rows[0];
    } catch (error) {
        console.error('Error fetching user by email:', error);
        throw error;
    }
};

export const createSession = async (subject: string, examDate: Date, expiryTime: Date, hostId: number) => {
    const query = `
    INSERT INTO sessions (subject, exam_date, expiry_time, host_id)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;
    try {
        const result = await pool.query(query, [subject, examDate, expiryTime, hostId]);
        return result.rows[0];
    } catch (error) {
        console.error('Error creating session:', error);
        throw error;
    }
};

export const addParticipant = async (userId: number, sessionId: number) => {
    const query = `
    INSERT INTO participants (user_id, session_id)
    VALUES ($1, $2)
    RETURNING *;
  `;
    try {
        const result = await pool.query(query, [userId, sessionId]);
        return result.rows[0];
    } catch (error) {
        console.error('Error adding participant:', error);
        throw error;
    }
};

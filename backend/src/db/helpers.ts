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

export const getSessionById = async (sessionId: number) => {
    const query = `
    SELECT * FROM sessions
    WHERE id = $1;
  `;
    try {
        const result = await pool.query(query, [sessionId]);
        return result.rows[0];
    } catch (error) {
        console.error('Error fetching session by ID:', error);
        throw error;
    }
};



export const updateSessionStatus = async (sessionId: number, status: string) => {
    const query = `
    UPDATE sessions
    SET status = $2
    WHERE id = $1
    RETURNING *;
  `;
    try {
        const result = await pool.query(query, [sessionId, status]);
        return result.rows[0];
    } catch (error) {
        console.error('Error updating session status:', error);
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

export const removeParticipant = async (userId: number, sessionId: number) => {
    const query = `
    DELETE FROM participants
    WHERE user_id = $1 AND session_id = $2
    RETURNING *;
  `;
    try {
        const result = await pool.query(query, [userId, sessionId]);
        return result.rows[0];
    } catch (error) {
        console.error('Error removing participant:', error);
        throw error;
    }
};

export const addFile = async (sessionId: number, uploadedBy: number, fileName: string, fileType: string, fileUrl: string) => {
    const query = `
    INSERT INTO files (session_id, uploaded_by, file_name, file_type, file_url)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
    try {
        const result = await pool.query(query, [sessionId, uploadedBy, fileName, fileType, fileUrl]);
        return result.rows[0];
    } catch (error) {
        console.error('Error adding file:', error);
        throw error;
    }
};

export const getFilesBySession = async (sessionId: number) => {
    const query = `
    SELECT * FROM files
    WHERE session_id = $1;
  `;
    try {
        const result = await pool.query(query, [sessionId]);
        return result.rows;
    } catch (error) {
        console.error('Error fetching files by session:', error);
        throw error;
    }
};


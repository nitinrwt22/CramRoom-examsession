import pool from '../config/database';

export const saveMessage = async (roomId: number, userId: number, username: string, messageText: string, tags: string[] = []) => {
    const query = `
        INSERT INTO messages (room_id, user_id, username, message_text, tags)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
    `;
    try {
        const result = await pool.query(query, [roomId, userId, username, messageText, tags]);
        return result.rows[0];
    } catch (error) {
        console.error('Error saving message:', error);
        throw error;
    }
};

export const getMessagesByRoom = async (roomId: number) => {
    const query = `
        SELECT * FROM messages
        WHERE room_id = $1
        ORDER BY timestamp ASC;
    `;
    try {
        const result = await pool.query(query, [roomId]);
        return result.rows;
    } catch (error) {
        console.error('Error fetching messages by room:', error);
        throw error;
    }
};

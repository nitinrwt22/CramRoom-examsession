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

export const updateReaction = async (messageId: number, emoji: string, userId: number, action: 'add' | 'remove') => {
    // 1. Fetch current reactions
    const fetchQuery = `SELECT reactions FROM messages WHERE message_id = $1`;
    const fetchResult = await pool.query(fetchQuery, [messageId]);
    if (fetchResult.rows.length === 0) throw new Error('Message not found');

    const currentReactions: Record<string, number[]> = fetchResult.rows[0].reactions || {};
    
    // 2. Modify mapping string safely
    let users = currentReactions[emoji] || [];
    if (action === 'add') {
        if (!users.includes(userId)) {
            users.push(userId);
        }
    } else if (action === 'remove') {
        users = users.filter((id: number) => id !== userId);
    }
    
    if (users.length > 0) {
        currentReactions[emoji] = users;
    } else {
        delete currentReactions[emoji];
    }
    
    // 3. Push to JSONB
    const updateQuery = `
        UPDATE messages
        SET reactions = $1
        WHERE message_id = $2
        RETURNING reactions;
    `;
    const updateResult = await pool.query(updateQuery, [currentReactions, messageId]);
    return updateResult.rows[0].reactions;
};

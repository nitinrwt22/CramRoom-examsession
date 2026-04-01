import pool from '../config/database';

export const createRoom = async (roomName: string) => {
    const query = `
        INSERT INTO rooms (room_name)
        VALUES ($1)
        RETURNING *;
    `;
    try {
        const result = await pool.query(query, [roomName]);
        return result.rows[0];
    } catch (error) {
        console.error('Error creating room:', error);
        throw error;
    }
};

export const getRooms = async () => {
    const query = `
        SELECT * FROM rooms ORDER BY created_at DESC;
    `;
    try {
        const result = await pool.query(query);
        return result.rows;
    } catch (error) {
        console.error('Error fetching rooms:', error);
        throw error;
    }
};

export const getRoomById = async (roomId: number) => {
    const query = `
        SELECT * FROM rooms WHERE room_id = $1;
    `;
    try {
        const result = await pool.query(query, [roomId]);
        return result.rows[0];
    } catch (error) {
        console.error('Error fetching room by ID:', error);
        throw error;
    }
};

import { Router } from 'express';
import { createRoom, getRooms } from '../models/roomModel';
import { getMessagesByRoom } from '../models/messageModel';

const router = Router();

// GET /rooms - List all available rooms
router.get('/', async (req, res) => {
    try {
        const rooms = await getRooms();
        res.status(200).json(rooms);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rooms' });
    }
});

// POST /rooms/create - Create new room
router.post('/create', async (req, res) => {
    try {
        const { room_name } = req.body;
        if (!room_name) {
            return res.status(400).json({ error: 'room_name is required' });
        }
        
        const newRoom = await createRoom(room_name);
        res.status(201).json({ message: 'Room created successfully', room: newRoom });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create room' });
    }
});

// GET /rooms/:room_id/messages - returns previous chat messages of that room
router.get('/:room_id/messages', async (req, res) => {
    try {
        const { room_id } = req.params;
        const messages = await getMessagesByRoom(parseInt(room_id, 10));
        res.status(200).json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch messages for room' });
    }
});

export default router;

import { Server, Socket } from 'socket.io';
import { saveMessage } from '../models/messageModel';

export const setupChatSocket = (io: Server) => {
    io.on('connection', (socket: Socket) => {
        console.log(`[Socket] User connected: ${socket.id}`);

        // Join room event
        socket.on('join_room', (data: { room_id: number; user_id: number; username: string }) => {
            const { room_id, user_id, username } = data;
            
            // Convert room_id to string for socket.io rooms
            const roomStr = `room_${room_id}`;
            socket.join(roomStr);
            
            console.log(`[Socket] User ${username} (${user_id}) joined room ${room_id}`);
            
            // Optional: notify others in the room
            socket.to(roomStr).emit('user_joined', { username, room_id, timestamp: new Date() });
        });

        // Send message event
        socket.on('send_message', async (data: {
            room_id: number;
            user_id: number;
            username: string;
            message_text: string;
            timestamp: string; // client can send it, but we use DB's returned timestamp
        }) => {
            const { room_id, user_id, username, message_text } = data;
            const roomStr = `room_${room_id}`;
            
            try {
                // Save message in database
                const savedMessage = await saveMessage(room_id, user_id, username, message_text);
                
                // Broadcast message to all users in that room (including sender: use io.to / io.in)
                io.in(roomStr).emit('receive_message', savedMessage);
                
                console.log(`[Socket] Message sent in room ${room_id} by ${username}`);
            } catch (error) {
                console.error('[Socket] Error handling send_message event:', error);
                // Optional: send error back to the sender
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Disconnect event
        socket.on('disconnect', () => {
             // socket.rooms is automatically cleaned up by socket.io upon disconnect
             // if you need to perform additional actions, you can do them here.
             console.log(`[Socket] User disconnected: ${socket.id}`);
        });
    });
};

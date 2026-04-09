import { Server, Socket } from 'socket.io';
import { saveMessage } from '../models/messageModel';

export const setupChatSocket = (io: Server) => {
    io.on('connection', (socket: Socket) => {
        console.log(`[Socket] User connected: ${socket.id}`);

        // Join room event
        socket.on('join_room', async (data: { room_id: number; user_id: number; username: string }) => {
            const { room_id, user_id, username } = data;
            
            socket.data.userId = user_id;
            socket.data.roomId = room_id;

            // Convert room_id to string for socket.io rooms
            const roomStr = `room_${room_id}`;
            socket.join(roomStr);
            
            console.log(`[Socket] User ${username} (${user_id}) joined room ${room_id}`);
            
            const sockets = await io.in(roomStr).fetchSockets();
            const activeUsers = Array.from(new Set(sockets.map(s => s.data.userId).filter(Boolean)));
            io.in(roomStr).emit('active_users', activeUsers);
            
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
                // Extract tags (words starting with #)
                const regex = /#([a-zA-Z0-9_]+)/g;
                const matches = message_text.match(regex);
                const tags = matches ? matches.map(tag => tag.substring(1)) : [];

                // Save message in database
                const savedMessage = await saveMessage(room_id, user_id, username, message_text, tags);
                
                // Broadcast message to all users in that room (including sender: use io.to / io.in)
                io.in(roomStr).emit('receive_message', savedMessage);
                
                console.log(`[Socket] Message sent in room ${room_id} by ${username} with tags [${tags.join(',')}]`);
            } catch (error) {
                console.error('[Socket] Error handling send_message event:', error);
                // Optional: send error back to the sender
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Typing events
        socket.on('typing_start', (data: { room_id: number; user_id: number; username: string }) => {
            const roomStr = `room_${data.room_id}`;
            socket.to(roomStr).emit('typing_start', data);
        });

        socket.on('typing_stop', (data: { room_id: number; user_id: number }) => {
            const roomStr = `room_${data.room_id}`;
            socket.to(roomStr).emit('typing_stop', data);
        });

        // Disconnect event
        socket.on('disconnect', async () => {
             console.log(`[Socket] User disconnected: ${socket.id}`);
             if (socket.data.roomId) {
                 const roomStr = `room_${socket.data.roomId}`;
                 const sockets = await io.in(roomStr).fetchSockets();
                 const activeUsers = Array.from(new Set(sockets.map(s => s.data.userId).filter(Boolean)));
                 io.in(roomStr).emit('active_users', activeUsers);
             }
        });
    });
};

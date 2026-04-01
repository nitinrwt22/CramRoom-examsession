import app from "./app";
import { config } from "./config/env";
import { connectDB } from "./config/database";
import http from 'http';
import { Server } from 'socket.io';
import { setupChatSocket } from './socket/chatSocket';

const PORT = config.port;

import { initSessionExpiryCron } from "./cron/sessionExpiry.cron";

const startServer = async () => {
    await connectDB();
    initSessionExpiryCron();
    
    // Create HTTP Server extending Express App
    const server = http.createServer(app);
    
    // Initialize Socket.io
    const io = new Server(server, {
        cors: {
            origin: "*", // Or specific allowed origins based on user preferences config
            methods: ["GET", "POST"]
        }
    });

    // Setup chat socket logic
    setupChatSocket(io);
    
    // Start listening on the upgraded server instance
    server.listen(PORT, () => {
        console.log(`CramRoom backend running on port ${PORT}`);
    });
};

startServer();

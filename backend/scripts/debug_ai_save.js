"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sessionAiMessage_model_1 = require("../src/models/sessionAiMessage.model");
const database_1 = __importDefault(require("../src/config/database"));
async function testSave() {
    try {
        console.log('Connecting to database...');
        const client = await database_1.default.connect();
        console.log('Connected to database.');
        client.release();
        // 1. Get a valid session and user
        const sessionRes = await database_1.default.query('SELECT id, host_id as user_id FROM sessions LIMIT 1');
        if (sessionRes.rows.length === 0) {
            console.error('No sessions found in DB to test with.');
            process.exit(1);
        }
        const session = sessionRes.rows[0];
        const sessionId = session.id;
        const userId = session.user_id; // Using the creator as the user for simplicity
        console.log(`Testing with Session ID: ${sessionId}, User ID: ${userId}`);
        // 2. Save a message
        const message = {
            session_id: sessionId,
            user_id: userId,
            intent: 'concept_clarification',
            question: 'What is the powerhouse of the cell?',
            answer: 'The mitochondria is the powerhouse of the cell.'
        };
        console.log('Attempting to save message:', message);
        const saved = await (0, sessionAiMessage_model_1.saveSessionAIMessage)(message);
        console.log('Message saved successfully:', saved);
        // 3. Verify it was saved
        const history = await (0, sessionAiMessage_model_1.getSessionAIHistory)(sessionId);
        console.log(`History for session ${sessionId}:`, history);
        const match = history.find(m => m.id === saved.id);
        if (match) {
            console.log('Verification SUCCESS: Message found in history.');
        }
        else {
            console.error('Verification FAILED: Message not found in history.');
        }
    }
    catch (error) {
        console.error('Test FAILED with error:', error);
    }
    finally {
        await database_1.default.end();
    }
}
testSave();

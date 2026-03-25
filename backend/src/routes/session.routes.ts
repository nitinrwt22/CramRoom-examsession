import express from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import * as sessionService from '../services/session.service';
import * as sessionFileService from '../services/sessionFile.service';
import { handleAIQuery, getSessionHistory, getWeakTopics, getTopicProgress, getExpectedQuestions } from '../controllers/aiSession.controller';
import { upload } from '../config/multer';


const router = express.Router();

// Middleware is applied in app.ts, but we keep the type safety

// POST /session/create
router.post('/create', async (req: AuthRequest, res) => {
    try {
        const { subject, examDate, expiryTime } = req.body;
        const hostId = req.user.id;

        if (!subject || !examDate || !expiryTime) {
            res.status(400).json({ error: 'Missing required fields: subject, examDate, expiryTime' });
            return;
        }

        const session = await sessionService.createSession(subject, new Date(examDate), new Date(expiryTime), hostId);
        res.status(201).json(session);
    } catch (error: any) {
        console.error('Error in /session/create:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /session/join
router.post('/join', async (req: AuthRequest, res) => {
    try {
        const { sessionId } = req.body;
        const userId = req.user.id;

        if (!sessionId) {
            res.status(400).json({ error: 'Missing required field: sessionId' });
            return;
        }

        const result = await sessionService.joinSession(sessionId, userId);
        res.status(200).json(result);
    } catch (error: any) {
        console.error('Error in /session/join:', error);
        if (error.message === 'Session not found' || error.message === 'Session has expired') {
            res.status(404).json({ error: error.message });
        } else if (error.message === 'User already joined this session') {
            res.status(409).json({ error: error.message });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// POST /session/leave
router.post('/leave', async (req: AuthRequest, res) => {
    try {
        const { sessionId } = req.body;
        const userId = req.user.id;

        if (!sessionId) {
            res.status(400).json({ error: 'Missing required field: sessionId' });
            return;
        }

        const result = await sessionService.leaveSession(sessionId, userId);
        res.status(200).json(result);
    } catch (error: any) {
        console.error('Error in /session/leave:', error);
        if (error.message === 'Session not found') {
            res.status(404).json({ error: error.message });
        } else if (error.message === 'User is not a participant of this session' || error.message === 'Session is expired') {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// GET /session/my
router.get('/my', async (req: AuthRequest, res) => {
    try {
        const userId = req.user.id;
        const sessions = await sessionService.getMySessions(userId);
        res.status(200).json(sessions);
    } catch (error: any) {
        console.error('Error in /session/my:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /session/active
router.get('/active', async (req: AuthRequest, res) => {
    try {
        const userId = req.user.id;
        const sessions = await sessionService.getActiveSessions(userId);
        res.status(200).json(sessions);
    } catch (error: any) {
        console.error('Error in /session/active:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /session/:id
router.get('/:id', async (req: AuthRequest, res) => {
    try {
        const sessionId = parseInt(req.params.id);
        const userId = req.user.id;

        if (isNaN(sessionId)) {
            res.status(400).json({ error: `Invalid session ID: ${req.params.id}` });
            return;
        }

        const session = await sessionService.getSessionDetails(sessionId, userId);
        res.status(200).json(session);
    } catch (error: any) {
        console.error(`Error in /session/${req.params.id}:`, error);
        if (error.message === 'Session not found or user is not a participant') {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});





// POST /session/:sessionId/ai/query
router.post('/:sessionId/ai/query', handleAIQuery);

// GET /session/:sessionId/ai/history
router.get('/:sessionId/ai/history', getSessionHistory);

// GET /session/:sessionId/ai/weak-topics
router.get('/:sessionId/ai/weak-topics', getWeakTopics);

// GET /session/:sessionId/ai/progress
router.get('/:sessionId/ai/progress', getTopicProgress);

// GET /session/:sessionId/ai/expected-questions
router.get('/:sessionId/ai/expected-questions', getExpectedQuestions);

export default router;

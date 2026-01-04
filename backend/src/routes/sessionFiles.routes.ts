import express from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import * as sessionFileService from '../services/sessionFile.service';
import { upload } from '../config/multer';

const router = express.Router();

// POST /session/:id/files
router.post('/:id/files', upload.single('file'), async (req: AuthRequest, res) => {
    try {
        const sessionId = parseInt(req.params.id);
        const userId = req.user.id;
        const file = req.file;

        if (isNaN(sessionId)) {
            res.status(400).json({ error: `Invalid session ID: ${req.params.id}` });
            return;
        }

        if (!file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const savedFile = await sessionFileService.uploadSessionFile(sessionId, userId, file);
        res.status(201).json(savedFile);
    } catch (error: any) {
        console.error(`Error in /session/${req.params.id}/files:`, error);
        if (error.message === 'Session not found' || error.message === 'User is not a participant in this session' || error.message === 'Session is not active or has expired') {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// GET /session/:id/files
router.get('/:id/files', async (req: AuthRequest, res) => {
    try {
        const sessionId = parseInt(req.params.id);
        const userId = req.user.id;

        if (isNaN(sessionId)) {
            res.status(400).json({ error: `Invalid session ID: ${req.params.id}` });
            return;
        }

        const files = await sessionFileService.getSessionFiles(sessionId, userId);
        res.status(200).json(files);
    } catch (error: any) {
        console.error(`Error in GET /session/${req.params.id}/files:`, error);
        if (error.message === 'Session not found' || error.message === 'User is not a participant in this session') {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// DELETE /session/files/:fileId
router.delete('/files/:fileId', async (req: AuthRequest, res) => {
    try {
        const fileId = parseInt(req.params.fileId);
        const userId = req.user.id;

        if (isNaN(fileId)) {
            res.status(400).json({ error: `Invalid file ID: ${req.params.fileId}` });
            return;
        }

        const result = await sessionFileService.deleteSessionFile(fileId, userId);
        res.status(200).json(result);
    } catch (error: any) {
        console.error(`Error in DELETE /session/files/${req.params.fileId}:`, error);
        if (error.message === 'File not found' || error.message === 'Associated session not found') {
            res.status(404).json({ error: error.message });
        } else if (error.message.startsWith('Unauthorized')) {
            res.status(403).json({ error: error.message });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

export default router;

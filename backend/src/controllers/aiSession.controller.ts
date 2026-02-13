
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { buildSessionContext } from '../services/sessionContext.service';
import { runAIEngine } from '../services/ai/aiEngine.service';
import { saveSessionAIMessage } from '../models/sessionAiMessage.model';

/**
 * Handles the AI query request for a specific session.
 * 
 * Steps:
 * 1. Validate input (sessionId, intent, question).
 * 2. buildSessionContext() to gather all session data.
 * 3. runAIEngine() with context + user query.
 * 4. Return structured response.
 */
export const handleAIQuery = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { sessionId } = req.params;
        const { intent, question } = req.body;
        const userId = req.user?.id; // Auth middleware ensures this exists

        // 1. Validation
        if (!sessionId) {
            res.status(400).json({ error: 'Missing sessionId parameter' });
            return;
        }

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        if (!intent || !question) {
            res.status(400).json({ error: 'Missing required fields: intent, question' });
            return;
        }

        // Strictly limit allowed intents for now (as per requirements)
        if (intent !== 'concept_clarification') {
            res.status(400).json({ error: `Unsupported intent: ${intent}` });
            return;
        }

        // 2. Build Session Context
        // This service checks if user is a participant and fetches all relevant data
        const sessionContext = await buildSessionContext(sessionId, userId.toString());

        // 3. Run AI Engine
        const aiResponse = await runAIEngine({
            context: sessionContext,
            intent,
            question
        });

        // Save AI interaction to maintain session history
        await saveSessionAIMessage({
            session_id: parseInt(sessionId, 10),
            user_id: parseInt(userId!.toString(), 10),
            intent,
            question,
            answer: aiResponse.answer
        });

        // 4. Return Response
        res.status(200).json(aiResponse);

    } catch (error: any) {
        console.error('Error in handleAIQuery:', error);

        // Map known errors to status codes
        if (error.message.includes('Authorization error') || error.message.includes('User is not a participant')) {
            res.status(403).json({ error: error.message });
        } else if (error.message.includes('Session not found')) {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Internal Server Error during AI processing' });
        }
    }
};

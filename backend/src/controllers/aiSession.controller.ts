import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { buildSessionContext } from '../services/sessionContext.service';
import { runAIEngine } from '../services/ai/aiEngine.service';
import { getSessionDetails } from '../services/session.service';
import { saveSessionAIMessage, getSessionAIHistory } from '../models/sessionAiMessage.model';
import { getUnchunkedMessages, markMessagesAsChunked, saveChunkSummary } from '../models/sessionAiChunk.model';
import { detectWeakTopics } from '../services/ai/weakTopicAnalytics.service';
import { getTopicProgressComparison } from '../services/ai/topicProgress.service';
import { generateExpectedQuestions } from '../services/ai/pyqRecommendation.service';
import { logAIEvent } from '../utils/aiLogger';

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
        const { intent } = req.body;
        let { question } = req.body;
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

        if (!intent) {
            res.status(400).json({ error: 'Missing required field: intent' });
            return;
        }

        // Question is required for some intents, but not session_summary
        if (intent !== 'session_summary' && !question) {
            res.status(400).json({ error: 'Missing required field: question' });
            return;
        }

        // Strictly limit allowed intents for now (as per requirements)
        const allowedIntents = ['concept_clarification', 'revision_guidance', 'chunk_summary', 'session_summary', 'pyq_answer_generation'];
        if (!allowedIntents.includes(intent)) {
            res.status(400).json({ error: `Unsupported intent: ${intent}` });
            return;
        }

        // Prevent 400 Token excess by truncating ridiculously massive queries
        if (question && typeof question === 'string' && question.length > 20000) {
            question = question.substring(0, 20000) + '... [TRUNCATED DUE TO LENGTH]';
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

        // Automatic chunk-based AI memory summarization
        try {
            const unchunkedMessages = await getUnchunkedMessages(sessionId);

            if (unchunkedMessages.length >= 5) {
                const startTime = Date.now();
                const messagesToChunk = unchunkedMessages.slice(0, 5);

                // Format them as Q: question \n A: answer
                const formattedMessagesBlock = messagesToChunk
                    .map(msg => `Q: ${msg.question}\nA: ${msg.answer}`)
                    .join('\n\n');

                // Call runAIEngine with chunk_summary intent
                const summaryResponse = await runAIEngine({
                    context: sessionContext,
                    intent: 'chunk_summary',
                    question: formattedMessagesBlock
                });

                // Save the summary
                await saveChunkSummary(
                    sessionId,
                    0,
                    19,
                    summaryResponse.answer
                );

                // Mark the messages as chunked
                const messageIds = messagesToChunk.map(msg => msg.id);
                await markMessagesAsChunked(messageIds);

                const durationMs = Date.now() - startTime;
                logAIEvent({
                    type: "CHUNK_CREATED",
                    sessionId,
                    durationMs,
                    metadata: {
                        chunkSize: 20,
                        summaryLength: summaryResponse.answer.length
                    }
                });
            }
        } catch (error: any) {
            console.error('Error during automatic chunk summarization:', error);
            logAIEvent({
                type: "AI_ERROR",
                sessionId,
                intent: "chunk_summary",
                metadata: {
                    error: error.message
                }
            });
            // If chunk summarization fails, do NOT break main AI response
        }

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

/**
 * Retrieves the AI interaction history for a specific session.
 * 
 * Steps:
 * 1. Validate sessionId and userId.
 * 2. Verify user is a participant of the session.
 * 3. Fetch history from database.
 * 4. Return formatted response.
 */
export const getSessionHistory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const sessionId = parseInt(req.params.sessionId, 10);
        const userId = req.user?.id;

        if (isNaN(sessionId)) {
            res.status(400).json({ error: 'Invalid sessionId' });
            return;
        }

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // 1. Verify Session Participation
        // Throws if session not found or user not participant
        await getSessionDetails(sessionId, userId);

        // 2. Fetch History
        const history = await getSessionAIHistory(sessionId);

        // 3. Format Response
        const formattedHistory = history.map(msg => ({
            id: msg.id,
            sessionId: msg.session_id,
            userId: msg.user_id,
            intent: msg.intent,
            question: msg.question,
            answer: msg.answer,
            createdAt: msg.created_at
        }));

        res.status(200).json(formattedHistory);

    } catch (error: any) {
        console.error('Error in getSessionHistory:', error);

        if (error.message.includes('Session not found or user is not a participant')) {
            res.status(403).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Internal Server Error fetching history' });
        }
    }
};

/**
 * Retrieves the weak topic analytics for a session.
 */
export const getWeakTopics = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const sessionId = req.params.sessionId;
        const userId = req.user?.id;

        if (!sessionId) {
            res.status(400).json({ error: 'Missing sessionId parameter' });
            return;
        }

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Validate Session Participation
        const sessionIdNum = parseInt(sessionId, 10);
        await getSessionDetails(sessionIdNum, userId);

        // Fetch weak topics
        const weakTopics = await detectWeakTopics(sessionId);

        res.status(200).json({ weakTopics });

    } catch (error: any) {
        console.error('Error in getWeakTopics:', error);

        if (error.message.includes('Session not found or user is not a participant')) {
            res.status(403).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Internal Server Error fetching weak topics' });
        }
    }
};

/**
 * Retrieves the topic progress comparison for a session.
 *
 * Response shape:
 * {
 *   meta: { total: number, trends: { improving: number, worsening: number, stable: number, insufficient_data: number } },
 *   progress: TopicProgressEntry[]
 * }
 *
 * Each TopicProgressEntry contains:
 *   - topic           : string   — syllabus topic name
 *   - currentScore    : number   — latest weak-topic confusion score
 *   - previousScore   : number | null — previous snapshot score (null if first entry)
 *   - trend           : 'improving' | 'worsening' | 'stable' | 'insufficient_data'
 */
export const getTopicProgress = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const sessionId = req.params.sessionId;
        const userId = req.user?.id;

        if (!sessionId) {
            res.status(400).json({ error: 'Missing sessionId parameter' });
            return;
        }

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Validate Session Participation
        const sessionIdNum = parseInt(sessionId, 10);
        await getSessionDetails(sessionIdNum, userId);

        const progress = await getTopicProgressComparison(sessionId);

        // Phase 4: build a meta summary so clients can render trend counts
        // without having to aggregate the array themselves.
        const trends = { improving: 0, worsening: 0, stable: 0, insufficient_data: 0 };
        for (const entry of progress) {
            trends[entry.trend]++;
        }
        const meta = { total: progress.length, trends };

        res.status(200).json({ meta, progress });

    } catch (error: any) {
        console.error('Error in getTopicProgress:', error);

        if (error.message.includes('Session not found or user is not a participant')) {
            res.status(403).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Internal Server Error fetching topic progress' });
        }
    }
};

/**
 * Retrieves the expected PYQs for a session.
 *
 * Phase 4 enriched payload:
 * {
 *   meta: {
 *     total                : number  — total canonical questions returned
 *     highly_expected_count: number  — count with probability === 'Highly Expected'
 *     avg_mapping_confidence: number — session-wide avg confidence of topic mapping
 *   },
 *   expectedQuestions: ExpectedQuestion[]
 * }
 *
 * Each ExpectedQuestion now includes:
 *   - recency_index      : number (0.00 – 1.00) — how recently this question appeared in exams
 *   - mapping_confidence : number (0.000 – 1.00) — heuristic confidence of topic mapping
 *   - probability        : 'Highly Expected' | 'Medium Probability' | 'Low Probability'
 *   - score              : number — composite ranking score
 */
export const getExpectedQuestions = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const sessionId = req.params.sessionId;
        const userId = req.user?.id;

        if (!sessionId) {
            res.status(400).json({ error: 'Missing sessionId parameter' });
            return;
        }

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Validate Session Participation
        const sessionIdNum = parseInt(sessionId, 10);
        await getSessionDetails(sessionIdNum, userId);

        const expectedQuestions = await generateExpectedQuestions(sessionId);

        // Phase 4: build a meta summary for the dashboard.
        const highlyExpectedCount = expectedQuestions.filter(
            q => q.probability === 'Highly Expected'
        ).length;
        const avgMappingConfidence = expectedQuestions.length > 0
            ? parseFloat(
                (expectedQuestions.reduce((sum, q) => sum + q.mapping_confidence, 0) / expectedQuestions.length)
                    .toFixed(3)
              )
            : 0;
        const meta = {
            total:                  expectedQuestions.length,
            highly_expected_count:  highlyExpectedCount,
            avg_mapping_confidence: avgMappingConfidence
        };

        res.status(200).json({ meta, expectedQuestions });

    } catch (error: any) {
        console.error('Error in getExpectedQuestions:', error);

        if (error.message.includes('Session not found or user is not a participant')) {
            res.status(403).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Internal Server Error fetching expected questions' });
        }
    }
};

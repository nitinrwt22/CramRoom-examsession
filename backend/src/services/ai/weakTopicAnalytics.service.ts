import { getSessionAIHistory } from '../../models/sessionAiMessage.model';
import { getChunkSummaries } from '../../models/sessionAiChunk.model';
import { logAIEvent } from "../../utils/aiLogger";
import pool from '../../config/database';

export interface WeakTopic {
    topic: string;
    frequency: number;
}

const genericWords = new Set([
    "generate", "create", "session", "question", "answer", "summary", "revision", "analysis",
    "topic", "plan", "help", "show", "make", "use", "learn", "understand", "discuss",
    "describe", "define", "design", "exam", "study", "problem", "example", "concept",
    "section", "part", "thing", "material", "guide"
]);

const timeWords = new Set([
    "time", "minute", "minutes", "hour", "hours", "day", "days", "week", "weeks", "month", "months"
]);

/**
 * Deterministically analyzes session history to detect weak topics.
 * Extracts keywords from user questions, chunk summaries, and revision guidance.
 * 
 * @param sessionId - The session ID as a string
 * @returns Array of top 3 weak topics
 */
export const detectWeakTopics = async (sessionId: string): Promise<WeakTopic[]> => {
    try {
        const startTime = Date.now();
        const sessionIdNum = parseInt(sessionId, 10);
        if (isNaN(sessionIdNum)) return [];

        // Fetch messages and summaries
        const messages = await getSessionAIHistory(sessionIdNum);
        const chunkSummaries = await getChunkSummaries(sessionId);

        const topicScores = new Map<string, number>();
        const chunkWords = new Set<string>();

        const processText = (text: string | undefined | null, increment: number, isChunk: boolean = false) => {
            if (!text) return;
            // Convert to lowercase and remove punctuation
            const cleanText = text.toLowerCase().replace(/[^\w\s]|_/g, ' ');
            const words = cleanText.split(/\s+/);

            words.forEach(w => {
                // Ignore conditions
                if (w.length < 5 || genericWords.has(w) || timeWords.has(w) || w.endsWith('ing')) {
                    return;
                }

                let word = w;
                // Simple plural normalization
                if (word.endsWith('s')) {
                    word = word.slice(0, -1);
                }

                const currentScore = topicScores.get(word) || 0;
                topicScores.set(word, currentScore + increment);

                if (isChunk) {
                    chunkWords.add(word);
                }
            });
        };

        chunkSummaries.forEach(chunk => {
            processText(chunk.summary_text, 3, true);
        });

        messages.forEach(msg => {
            processText(msg.question, 1, false);
            if (msg.intent === "revision_guidance") {
                processText(msg.answer, 2, false);
            }
        });

        const weakTopics: WeakTopic[] = [];
        for (const [topic, score] of topicScores.entries()) {
            // Only allow topic if: (score >= 3 AND appears in at least one chunk summary) OR score >= 4
            if ((score >= 3 && chunkWords.has(topic)) || score >= 4) {
                weakTopics.push({ topic, frequency: score });
            }
        }

        // Sort descending by score and return top 3
        const result = weakTopics
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 3);

        const durationMs = Date.now() - startTime;
        logAIEvent({
            type: "WEAK_ANALYTICS",
            sessionId,
            durationMs,
            metadata: {
                topics: result
            }
        });

        if (result.length > 0) {
            try {
                const insertQuery = `
                    INSERT INTO session_topic_progress (session_id, topic, score)
                    VALUES ($1, $2, $3)
                `;
                for (const topic of result) {
                    await pool.query(insertQuery, [sessionIdNum, topic.topic, topic.frequency]);
                }
            } catch (dbError: any) {
                logAIEvent({
                    type: "AI_ERROR",
                    sessionId,
                    intent: "weak_topic_snapshot_db",
                    metadata: {
                        error: dbError.message
                    }
                });
            }
        }

        return result;
    } catch (error: any) {
        logAIEvent({
            type: "AI_ERROR",
            sessionId,
            intent: "weak_topic_detection",
            metadata: {
                error: error.message
            }
        });
        return [];
    }
};

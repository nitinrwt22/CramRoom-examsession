import { getSessionAIHistory } from '../../models/sessionAiMessage.model';
import { getChunkSummaries } from '../../models/sessionAiChunk.model';
import { logAIEvent } from "../../utils/aiLogger";

export interface WeakTopic {
    topic: string;
    frequency: number;
}

// Stop words to ignore during extraction
const STOP_WORDS = new Set([
    "the", "is", "are", "what", "why", "how", "explain", "tell", "about", "this", "that", "and", "with", "for", "from",
    "generate", "create", "session", "question", "answer", "summary", "revision", "analysis", "topic",
    "plan", "help", "show", "give", "make", "use", "learn", "understand", "discuss", "describe", "define"
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

        const processText = (text: string | undefined | null, increment: number) => {
            if (!text) return;
            // Convert to lowercase and remove punctuation
            const cleanText = text.toLowerCase().replace(/[^\w\s]|_/g, ' ');
            const words = cleanText.split(/\s+/);

            words.forEach(word => {
                // Ignore short words, stop words, and words ending with 'ing'
                if (word.length >= 4 && !STOP_WORDS.has(word) && !word.endsWith('ing')) {
                    const currentScore = topicScores.get(word) || 0;
                    topicScores.set(word, currentScore + increment);
                }
            });
        };

        chunkSummaries.forEach(chunk => {
            processText(chunk.summary_text, 3);
        });

        messages.forEach(msg => {
            processText(msg.question, 1);
            if (msg.intent === "revision_guidance") {
                processText(msg.answer, 2);
            }
        });

        // Keep topics with score >= 3
        const weakTopics: WeakTopic[] = [];
        for (const [topic, score] of topicScores.entries()) {
            if (score >= 3) {
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

import { getSessionAIHistory } from '../../models/sessionAiMessage.model';
import { getChunkSummaries } from '../../models/sessionAiChunk.model';
import { logAIEvent } from "../../utils/aiLogger";

export interface WeakTopic {
    topic: string;
    frequency: number;
}

// Stop words to ignore during extraction
const STOP_WORDS = new Set([
    "the", "is", "are", "what", "why", "how",
    "explain", "tell", "about", "this", "that",
    "and", "with", "for", "from"
]);

/**
 * Deterministically analyzes session history to detect weak topics.
 * Extracts keywords from user questions and chunk summaries.
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

        // Combine question text and summary text
        const textSources: string[] = [];

        messages.forEach(msg => {
            if (msg.question) textSources.push(msg.question);
        });

        chunkSummaries.forEach(chunk => {
            if (chunk.summary_text) textSources.push(chunk.summary_text);
        });

        // Extract and count keywords
        const wordCounts: Record<string, number> = {};

        textSources.forEach(text => {
            // Convert to lowercase and remove punctuation
            const cleanText = text.toLowerCase().replace(/[^\w\s]|_/g, ' ');

            // Split into words
            const words = cleanText.split(/\s+/);

            words.forEach(word => {
                // Ignore short words and stop words
                if (word.length >= 4 && !STOP_WORDS.has(word)) {
                    wordCounts[word] = (wordCounts[word] || 0) + 1;
                }
            });
        });

        // Filter by frequency >= 2
        const weakTopics: WeakTopic[] = [];
        for (const [topic, frequency] of Object.entries(wordCounts)) {
            if (frequency >= 2) {
                weakTopics.push({ topic, frequency });
            }
        }

        // Sort descending by frequency and return top 3
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

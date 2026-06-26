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
 * Matches against V2 canonical topics (from syllabi) and returns the top 3 weak topics.
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

        // Match word scores against V2 canonical topics from syllabi
        const topicsRes = await pool.query(
            `SELECT t.id, t.name, t.subtopics 
             FROM topics t 
             JOIN syllabi s ON t.syllabus_id = s.id 
             WHERE s.session_id = $1`,
            [sessionIdNum]
        );

        const v2TopicScores: { id: string; name: string; score: number }[] = [];

        for (const row of topicsRes.rows) {
            const topicName = row.name;
            const subtopics: string[] = row.subtopics || [];

            let totalScore = 0;

            const nameWords = topicName.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
            nameWords.forEach((word: string) => {
                let normWord = word;
                if (normWord.endsWith('s') && normWord.length > 4) normWord = normWord.slice(0, -1);
                totalScore += topicScores.get(normWord) || 0;
            });

            subtopics.forEach(subtopic => {
                const subWords = subtopic.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
                subWords.forEach((word: string) => {
                    let normWord = word;
                    if (normWord.endsWith('s') && normWord.length > 4) normWord = normWord.slice(0, -1);
                    totalScore += (topicScores.get(normWord) || 0) * 0.5;
                });
            });

            if (totalScore > 0) {
                v2TopicScores.push({ id: row.id, name: topicName, score: Math.round(totalScore) });
            }
        }

        const result: WeakTopic[] = v2TopicScores
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(item => ({ topic: item.name, frequency: item.score }));

        const durationMs = Date.now() - startTime;
        logAIEvent({
            type: "WEAK_ANALYTICS",
            sessionId,
            durationMs,
            metadata: {
                topics: result
            }
        });

        // Persist snapshot to topic_progress_history (V2 progress table)
        if (result.length > 0) {
            // Build a map of topicName → topic_id for efficient lookup
            const topicIdMap = new Map<string, string>(
                v2TopicScores.map(item => [item.name, item.id])
            );

            const selectQuery = `
                SELECT tph.score
                FROM topic_progress_history tph
                WHERE tph.session_id = $1 AND tph.topic_id = $2
                ORDER BY tph.recorded_at DESC
                LIMIT 1
            `;
            const insertQuery = `
                INSERT INTO topic_progress_history (session_id, topic_id, score)
                VALUES ($1, $2, $3)
            `;

            for (const topic of result) {
                const topicId = topicIdMap.get(topic.topic);
                if (!topicId) continue; // only tracked topics that exist in syllabi

                try {
                    const previousRes = await pool.query(selectQuery, [sessionIdNum, topicId]);
                    const previousScore = previousRes.rows.length > 0 ? previousRes.rows[0].score : null;

                    if (previousScore === null || previousScore !== topic.frequency) {
                        await pool.query(insertQuery, [sessionIdNum, topicId, topic.frequency]);
                    }
                } catch (dbError: any) {
                    logAIEvent({
                        type: "AI_ERROR",
                        sessionId,
                        intent: "weak_topic_snapshot_db",
                        metadata: {
                            error: dbError.message,
                            failedTopic: topic.topic
                        }
                    });
                }
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

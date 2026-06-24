import pool from '../../config/database';
import { config } from '../../config/env';

export interface TopicProgressEntry {
    topic: string;
    currentScore: number;
    previousScore: number | null;
    trend: "improving" | "worsening" | "stable" | "insufficient_data";
}

/**
 * Fetches and compares topic progress for a specific session over time.
 * Calculates trend based on score variation between the latest and previous entries.
 * 
 * @param sessionId - The session ID to fetch progress for
 * @returns Array of topic progress comparison entries
 */
export const getTopicProgressComparison = async (sessionId: string): Promise<TopicProgressEntry[]> => {
    try {
        const sessionIdNum = parseInt(sessionId, 10);
        if (isNaN(sessionIdNum)) return [];

        let rows = [];

        if (config.useV2Intelligence) {
            const query = `
                SELECT stp.topic, stp.score, stp.recorded_at
                FROM session_topic_progress stp
                JOIN syllabi s ON s.session_id = stp.session_id
                JOIN topics t ON t.syllabus_id = s.id AND LOWER(t.name) = LOWER(stp.topic)
                WHERE stp.session_id = $1
                ORDER BY stp.recorded_at DESC
            `;
            const result = await pool.query(query, [sessionIdNum]);
            rows = result.rows;

            if (rows.length === 0) {
                const legacyQuery = `
                    SELECT topic, score, recorded_at
                    FROM session_topic_progress
                    WHERE session_id = $1
                    ORDER BY recorded_at DESC
                `;
                const legacyResult = await pool.query(legacyQuery, [sessionIdNum]);
                rows = legacyResult.rows;
            }
        } else {
            const query = `
                SELECT topic, score, recorded_at
                FROM session_topic_progress
                WHERE session_id = $1
                ORDER BY recorded_at DESC
            `;
            const result = await pool.query(query, [sessionIdNum]);
            rows = result.rows;
        }

        // Group rows by topic
        const groupedTopics: Record<string, { score: number, recorded_at: Date }[]> = {};
        for (const row of rows) {
            if (!groupedTopics[row.topic]) {
                groupedTopics[row.topic] = [];
            }
            groupedTopics[row.topic].push({ score: row.score, recorded_at: row.recorded_at });
        }

        const comparisonResults: TopicProgressEntry[] = [];

        // For each topic, determine the trend by comparing the most recent score to the previous one
        for (const [topic, entries] of Object.entries(groupedTopics)) {
            // entries is already sorted by recorded_at DESC because of the SQL query ORDER BY clause
            const latestEntry = entries[0];
            const currentScore = latestEntry.score;

            if (entries.length >= 2) {
                // Determine trend based on previous entry
                const previousEntry = entries[1];
                const previousScore = previousEntry.score;

                let trend: "improving" | "worsening" | "stable";

                // If the score decreased, the weak topic is "improving" (getting less weak)
                if (currentScore < previousScore) {
                    trend = "improving";
                }
                // If the score increased, the weak topic is "worsening" (getting weaker)
                else if (currentScore > previousScore) {
                    trend = "worsening";
                }
                // If the score is the same, it is "stable"
                else {
                    trend = "stable";
                }

                comparisonResults.push({
                    topic,
                    currentScore,
                    previousScore,
                    trend
                });
            } else {
                // Only 1 entry exists, insufficient data to calculate a trend
                comparisonResults.push({
                    topic,
                    currentScore,
                    previousScore: null,
                    trend: "insufficient_data"
                });
            }
        }

        return comparisonResults;
    } catch (error) {
        console.error('Error fetching topic progress comparison:', error);
        return [];
    }
};

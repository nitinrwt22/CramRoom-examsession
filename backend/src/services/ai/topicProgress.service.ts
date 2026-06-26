import pool from '../../config/database';

export interface TopicProgressEntry {
    topic: string;
    currentScore: number;
    previousScore: number | null;
    trend: "improving" | "worsening" | "stable" | "insufficient_data";
}

/**
 * Fetches and compares topic progress for a specific session over time.
 * Reads from topic_progress_history (V2), keyed by topic_id UUID.
 * Calculates trend based on score variation between the latest and previous entries.
 *
 * @param sessionId - The session ID to fetch progress for
 * @returns Array of topic progress comparison entries
 */
export const getTopicProgressComparison = async (sessionId: string): Promise<TopicProgressEntry[]> => {
    try {
        const sessionIdNum = parseInt(sessionId, 10);
        if (isNaN(sessionIdNum)) return [];

        const query = `
            SELECT t.name AS topic, tph.score, tph.recorded_at
            FROM topic_progress_history tph
            JOIN topics t ON tph.topic_id = t.id
            WHERE tph.session_id = $1
            ORDER BY tph.recorded_at DESC
        `;
        const result = await pool.query(query, [sessionIdNum]);
        const rows = result.rows;

        // Group rows by topic name
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

/**
 * pyqRecommendation.service.ts
 *
 * Phase 4 Update: API & Integration Layer
 *
 * Changes from Phase 3 baseline:
 *   - Added `recency_index`       to ExpectedQuestion interface and payload.
 *   - Added `mapping_confidence`  to ExpectedQuestion interface and payload.
 *     Sourced from raw_questions.mapping_confidence (populated during UPLOAD_PROCESSING
 *     by the keyword-overlap heuristic in jobWorker.service.ts – Phase 4).
 *     This satisfies Gate 4: "expected questions API endpoint returns priority-ordered
 *     payload containing confidence levels."
 */
import pool from '../../config/database';
import { detectWeakTopics } from './weakTopicAnalytics.service';

export interface ExpectedQuestion {
    id: string;
    question_text: string;
    topic: string;
    marks: number | null;
    year: number | null;
    frequency: number;
    /** Recency index of the canonical question (0.00 – 1.00). Populated by ANALYTICS_REBUILD. */
    recency_index: number;
    /**
     * Heuristic mapping confidence (0.000 – 1.000).
     * Represents how confidently the raw question was mapped to its topic.
     * Sourced from raw_questions.mapping_confidence (populated during UPLOAD_PROCESSING).
     * Values below 0.500 indicate low-confidence mappings requiring manual review.
     */
    mapping_confidence: number;
    probability: 'Highly Expected' | 'Medium Probability' | 'Low Probability';
    score: number;
}

export const generateExpectedQuestions = async (sessionId: string): Promise<ExpectedQuestion[]> => {
    // 1. Fetch weak topics for this session
    const weakTopics = await detectWeakTopics(sessionId);

    const sessionIdNum = parseInt(sessionId, 10);
    if (isNaN(sessionIdNum)) return [];

    // 2. Query canonical questions from V2 schema.
    //    Phase 4: also fetch recency_index from question_analytics and
    //    the average mapping_confidence across all raw questions linked to
    //    each canonical question.
    const v2Query = `
        SELECT 
            cq.id::text AS id,
            cq.text AS question_text,
            t.name AS topic,
            COALESCE(qa.appearance_frequency, 0) AS frequency,
            qa.priority_label,
            COALESCE(qa.recency_index, 0.0) AS recency_index,
            (
                SELECT MAX(rq.marks) 
                FROM raw_questions rq 
                JOIN question_variants qv ON rq.id = qv.raw_question_id 
                WHERE qv.canonical_question_id = cq.id
            ) AS marks,
            (
                SELECT MAX(p.year) 
                FROM raw_questions rq 
                JOIN question_variants qv ON rq.id = qv.raw_question_id 
                JOIN papers p ON rq.paper_id = p.id
                WHERE qv.canonical_question_id = cq.id
            ) AS year,
            (
                SELECT COALESCE(AVG(rq.mapping_confidence), 0.0)
                FROM raw_questions rq
                JOIN question_variants qv ON rq.id = qv.raw_question_id
                WHERE qv.canonical_question_id = cq.id
            ) AS mapping_confidence
        FROM canonical_questions cq
        JOIN topics t ON cq.topic_id = t.id
        JOIN syllabi s ON t.syllabus_id = s.id
        LEFT JOIN question_analytics qa ON qa.canonical_question_id = cq.id
        WHERE s.session_id = $1
    `;
    const result = await pool.query(v2Query, [sessionIdNum]);

    if (result.rows.length === 0) return [];

    const scoredQuestions: ExpectedQuestion[] = [];
    for (const row of result.rows) {
        const frequency      = parseInt(row.frequency, 10);
        const recencyIndex   = parseFloat(row.recency_index   || '0');
        const recencyScore   = Math.round(recencyIndex * 5);
        const mappingConf    = parseFloat(row.mapping_confidence || '0');

        let weakTopicScore = 0;
        const combinedText = (row.topic + ' ' + row.question_text).toLowerCase();
        for (const wt of weakTopics) {
            if (combinedText.includes(wt.topic.toLowerCase())) {
                weakTopicScore += wt.frequency;
            }
        }

        const score = (frequency * 3) + recencyScore + (weakTopicScore * 2);

        let probability: 'Highly Expected' | 'Medium Probability' | 'Low Probability' = 'Low Probability';
        if (row.priority_label === 'Very High' || row.priority_label === 'High') {
            probability = 'Highly Expected';
        } else if (row.priority_label === 'Medium') {
            probability = 'Medium Probability';
        }

        scoredQuestions.push({
            id:                 row.id,
            question_text:      row.question_text,
            topic:              row.topic,
            marks:              row.marks ? parseInt(row.marks, 10) : null,
            year:               row.year  ? parseInt(row.year, 10)  : null,
            frequency,
            recency_index:      parseFloat(recencyIndex.toFixed(2)),
            mapping_confidence: parseFloat(mappingConf.toFixed(3)),
            probability,
            score
        });
    }

    scoredQuestions.sort((a, b) => b.score - a.score);

    const total      = scoredQuestions.length;
    const top20Index = Math.ceil(total * 0.2);
    const top50Index = Math.ceil(total * 0.5);

    scoredQuestions.forEach((q, idx) => {
        if (idx < top20Index) {
            q.probability = 'Highly Expected';
        } else if (idx < top50Index) {
            q.probability = 'Medium Probability';
        } else {
            q.probability = 'Low Probability';
        }
    });

    return scoredQuestions;
};

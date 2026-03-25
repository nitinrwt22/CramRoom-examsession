import pool from '../../config/database';
import { detectWeakTopics } from './weakTopicAnalytics.service';

export interface ExpectedQuestion {
    id: string;
    question_text: string;
    topic: string;
    marks: number | null;
    year: number | null;
    frequency: number;
    probability: 'Highly Expected' | 'Medium Probability' | 'Low Probability';
    score: number;
}

export const generateExpectedQuestions = async (sessionId: string): Promise<ExpectedQuestion[]> => {
    // 1. Fetch weak topics for this session
    const weakTopics = await detectWeakTopics(sessionId);
    const weakTopicNames = weakTopics.map(w => w.topic.toLowerCase());

    // 2. Fetch all PYQ chunks for this session
    const query = `
        SELECT 
            sac.id, sac.chunk_text as question_text, sac.topic, sac.marks, sac.year
        FROM session_ai_chunks sac
        JOIN files f ON sac.file_id = f.id
        WHERE sac.session_id = $1 AND f.content_type = 'pyqs'
    `;
    const result = await pool.query(query, [sessionId]);
    const pyqs = result.rows;

    if (pyqs.length === 0) return [];

    // 3. Cluster/Group similar questions to calculate frequency
    // Basic clustering: normalizing text and checking substring/similarity
    const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Group them
    const groups: { baseText: string, items: any[] }[] = [];
    
    for (const pyq of pyqs) {
        const norm = normalize(pyq.question_text);
        let foundGroup = false;
        for (const group of groups) {
            // Very naive similarity: if one contains the other or they share a long substring
            if (norm.includes(group.baseText) || group.baseText.includes(norm) ||
                (norm.length > 20 && group.baseText.length > 20 && 
                 (norm.substring(0, 20) === group.baseText.substring(0, 20)))) {
                group.items.push(pyq);
                foundGroup = true;
                break;
            }
        }
        if (!foundGroup) {
            groups.push({ baseText: norm, items: [pyq] });
        }
    }

    // 4. Score each group
    const currentYear = new Date().getFullYear();
    const scoredQuestions: ExpectedQuestion[] = [];

    for (const group of groups) {
        // frequency = number of times it appeared
        const frequency = group.items.length;
        
        // determine the latest year and max marks from the group
        let latestYear = 0;
        let maxMarks = 0;
        for (const item of group.items) {
            if (item.year && item.year > latestYear) latestYear = item.year;
            if (item.marks && item.marks > maxMarks) maxMarks = item.marks;
        }

        // recency_score = higher if closer to current year
        let recencyScore = 0;
        if (latestYear > 0) {
            const gap = currentYear - latestYear;
            recencyScore = Math.max(0, 5 - gap); // 5 points for current year, 4 for last year, etc.
        }

        // weak_topic_score
        let weakTopicScore = 0;
        // Use the first item's topic and text to match against weak topics
        const representative = group.items[0];
        const combinedText = (representative.topic + " " + representative.question_text).toLowerCase();
        for (const wt of weakTopics) {
            if (combinedText.includes(wt.topic.toLowerCase())) {
                weakTopicScore += wt.frequency; // boost by weak topic frequency
            }
        }

        const score = (frequency * 3) + recencyScore + (weakTopicScore * 2);

        scoredQuestions.push({
            id: representative.id,
            question_text: representative.question_text,
            topic: representative.topic,
            marks: maxMarks > 0 ? maxMarks : null,
            year: latestYear > 0 ? latestYear : null,
            frequency,
            score,
            probability: 'Low Probability' // placeholder
        });
    }

    // 5. Rank and assign probabilities
    scoredQuestions.sort((a, b) => b.score - a.score);

    const total = scoredQuestions.length;
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

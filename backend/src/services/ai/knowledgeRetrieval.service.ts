/**
 * knowledgeRetrieval.service.ts
 *
 * Selects the most relevant knowledge chunks for a given user question
 * using TF-IDF-style keyword overlap scoring — no embeddings required.
 *
 * Scoring:
 *   - Each keyword match in chunk_text  → +1
 *   - Each keyword match in topic       → +3 (topic matches are higher signal)
 * Returns top-K chunks sorted by descending score.
 * Falls back to returning all chunks if no keywords can be extracted.
 */

// Common English + academic stopwords to strip before scoring
const STOPWORDS = new Set([
    'a','an','the','is','are','was','were','be','been','being',
    'have','has','had','do','does','did','will','would','could',
    'should','may','might','shall','can','need','dare','ought',
    'used','to','of','in','on','at','by','for','with','about',
    'against','between','into','through','during','before','after',
    'above','below','from','up','down','out','off','over','under',
    'again','further','then','once','and','but','or','nor','not',
    'so','yet','both','either','neither','and','just','also',
    'what','which','who','whom','this','that','these','those',
    'i','me','my','we','our','you','your','he','she','it','its',
    'they','them','their','explain','describe','tell','how','why',
    'when','where','define','difference','between','example',
    'give','write','list','calculate','find','show','prove'
]);

export interface RankedChunk {
    topic: string;
    text: string;
    score: number;
}

/**
 * Tokenize a string into lowercase, de-duplicated keywords
 * with stopwords and short tokens removed.
 */
function extractKeywords(text: string): string[] {
    return [
        ...new Set(
            text
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 2 && !STOPWORDS.has(w))
        )
    ];
}

/**
 * Score a single chunk against a set of query keywords.
 * Topic matches are weighted 3× body matches.
 */
function scoreChunk(
    chunk: { topic: string; text: string },
    keywords: string[]
): number {
    if (keywords.length === 0) return 0;

    const topicLower = chunk.topic.toLowerCase();
    const textLower = chunk.text.toLowerCase();
    let score = 0;

    for (const kw of keywords) {
        // Count all occurrences in body
        const bodyMatches = (textLower.match(new RegExp(kw, 'g')) || []).length;
        // Count occurrences in topic (weighted)
        const topicMatches = (topicLower.match(new RegExp(kw, 'g')) || []).length;

        score += bodyMatches + topicMatches * 3;
    }

    return score;
}

/**
 * Select the top-K most relevant chunks for a question.
 *
 * @param question  - The user's raw question string
 * @param chunks    - All available knowledge chunks for the session
 * @param topK      - How many chunks to return (default: 5)
 * @returns         - Ranked chunks (score > 0 first, then fallback if all score 0)
 */
export function selectRelevantChunks(
    question: string,
    chunks: { topic: string; text: string }[],
    topK = 5
): { topic: string; text: string }[] {
    if (chunks.length === 0) return [];

    const keywords = extractKeywords(question);

    // If no usable keywords, return first topK chunks as-is (best-effort)
    if (keywords.length === 0) {
        return chunks.slice(0, topK);
    }

    const ranked: RankedChunk[] = chunks.map(chunk => ({
        topic: chunk.topic,
        text: chunk.text,
        score: scoreChunk(chunk, keywords),
    }));

    ranked.sort((a, b) => b.score - a.score);

    // If everything scored 0, still return topK to avoid empty context
    const hasRelevantChunks = ranked.some(r => r.score > 0);
    if (!hasRelevantChunks) {
        return chunks.slice(0, topK);
    }

    return ranked
        .filter(r => r.score > 0)
        .slice(0, topK)
        .map(({ topic, text }) => ({ topic, text }));
}

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
    /**
     * Origin of this chunk — determines grounding priority:
     *   'syllabus' (Primary) → 'pyq' (Evidence) → 'notes' (Style/Supporting)
     */
    source: 'syllabus' | 'pyq' | 'notes';
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
        source: (chunk as any).source ?? 'pyq',
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
        .map(({ topic, text, source }) => ({ topic, text, source }));
}

/**
 * The canonical hierarchy priority order for prompt grounding.
 * Lower index = higher grounding priority.
 */
const SOURCE_PRIORITY: Record<'syllabus' | 'pyq' | 'notes', number> = {
    syllabus: 0,
    pyq: 1,
    notes: 2,
};

/**
 * Returns up to topK chunks selected by TF-IDF relevance, then
 * **sorted by grounding hierarchy** (syllabus first, then pyq, then notes)
 * so that prompt compilers can inject them in the correct priority order.
 *
 * If the question is empty, falls back to returning chunks in hierarchy order
 * without keyword ranking.
 *
 * @param question - The user's raw question string
 * @param chunks   - All available knowledge chunks (must carry a `source` field)
 * @param topK     - Maximum total chunks to return (default: 6)
 * @returns        - Chunks in hierarchy order, each carrying its source tag
 */
export function selectChunksBySource(
    question: string,
    chunks: { topic: string; text: string; source: 'syllabus' | 'pyq' | 'notes' }[],
    topK = 6
): { topic: string; text: string; source: 'syllabus' | 'pyq' | 'notes' }[] {
    if (chunks.length === 0) return [];

    const keywords = extractKeywords(question);

    // Score every chunk (score = 0 if no usable keywords)
    const scored: RankedChunk[] = chunks.map(chunk => ({
        topic: chunk.topic,
        text: chunk.text,
        source: chunk.source,
        score: keywords.length > 0 ? scoreChunk(chunk, keywords) : 1,
    }));

    // Sort: primary = descending relevance score; secondary = hierarchy tier
    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source];
    });

    const selected = scored.slice(0, topK);

    // Re-sort the final selection strictly by hierarchy so the prompt
    // compiler receives them in the correct injection order.
    selected.sort((a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]);

    return selected.map(({ topic, text, source }) => ({ topic, text, source }));
}

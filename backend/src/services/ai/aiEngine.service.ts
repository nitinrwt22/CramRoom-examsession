
import { SessionContext } from '../sessionContext.service';
import { createLLMProvider } from './aiProvider';
import { getChunkSummaries, getUnchunkedMessages } from '../../models/sessionAiChunk.model';
import { detectWeakTopics } from './weakTopicAnalytics.service';
import { logAIEvent } from "../../utils/aiLogger";
import { selectRelevantChunks, selectChunksBySource } from './knowledgeRetrieval.service';
import pool from '../../config/database';

// ---------------------------------------------------------------------------
// Shared Constants & Helpers (Phase 3)
// ---------------------------------------------------------------------------

/**
 * FORMATTING_RULES
 * Appended to every system prompt to enforce answer presentation standards.
 *
 * Rules (from TOPIC_SYSTEM_V2_DESIGN.md § 8.4 — Flowchart-first Answer Strategy):
 *   - Use plain-text (ASCII/markdown) for all diagrams and flowcharts.
 *   - Prefer structured tables and bullet lists for multi-part answers.
 *   - Explicitly prohibit generating graphical, SVG, or image-based layouts.
 */
export const FORMATTING_RULES = `
Formatting Rules (Mandatory):
- Use only plain text (ASCII/markdown). Do NOT generate images, SVGs, or graphical diagrams.
- Show processes as ASCII flowcharts using arrows (-->, ->, |) and boxes ([Step]).
- Present comparisons in markdown tables (| Col | Col |).
- Use numbered lists for steps and bullet points (-) for features.
- Keep answers concise and exam-focused. Avoid motivational or casual language.
`.trim();

/**
 * SOURCE_LABEL maps a chunk source to a human-readable prompt heading.
 */
const SOURCE_LABEL: Record<'syllabus' | 'pyq' | 'notes', string> = {
    syllabus: 'Syllabus Grounding (Primary Context)',
    pyq:      'PYQ Historical Evidence',
    notes:    'Uploaded Notes (Style & Supporting Context)',
};

/**
 * buildHierarchicalKnowledgeBlock()
 *
 * Assembles the RAG context prompt block following the grounding hierarchy:
 *   Syllabus (Primary) → PYQ (Evidence) → Notes (Style/Supporting)
 *
 * Each source tier is injected under a labelled heading so the model
 * understands the epistemic weight of each block.
 *
 * Notes cannot override syllabus facts (enforced by ordering — syllabus
 * is presented first as the anchor).
 *
 * @param question - User question string (used for TF-IDF relevance scoring)
 * @param chunks   - All knowledge chunks from SessionContext (must carry `source`)
 * @param topK     - Maximum chunks to inject across all tiers (default: 6)
 * @returns        - Formatted multi-tier context string, or empty string if no chunks
 */
export function buildHierarchicalKnowledgeBlock(
    question: string,
    chunks: Array<{ topic: string; text: string; source: 'syllabus' | 'pyq' | 'notes' }>,
    topK = 6
): string {
    if (chunks.length === 0) return '';

    const selected = selectChunksBySource(question, chunks, topK);
    if (selected.length === 0) return '';

    // Group by source
    const bySource: Record<string, typeof selected> = { syllabus: [], pyq: [], notes: [] };
    for (const chunk of selected) {
        bySource[chunk.source].push(chunk);
    }

    const sections: string[] = [];

    for (const src of ['syllabus', 'pyq', 'notes'] as const) {
        const tier = bySource[src];
        if (tier.length === 0) continue;

        const body = tier
            .map(c => `[${c.topic}]\n${c.text}`)
            .join('\n\n---\n\n');

        sections.push(`${SOURCE_LABEL[src]}:\n${body}`);
    }

    return sections.length > 0
        ? `\n\nKnowledge Context:\n${sections.join('\n\n===\n\n')}`
        : '';
}


/**
 * AIIntent
 * Define allowed intents for the AI Engine.
 */
export type AIIntent = 'concept_clarification' | 'revision_guidance' | 'chunk_summary' | 'session_summary' | 'pyq_answer_generation';

/**
 * AIEngineInput
 * Structure of the input expected by the AI Engine.
 * Includes the full session context, the user's intent, and their specific question.
 */
export interface AIEngineInput {
    context: SessionContext;
    intent: AIIntent;
    question: string;
}

/**
 * 3. AIEngineResponse
 * Structure of the response returned by the AI Engine.
 * Contains the answer text, confidence level, and any sources used.
 */
export interface AIEngineResponse {
    answer: string;
    confidence: 'low' | 'medium' | 'high';
    sourcesUsed: string[];
}

// ---------------------------------------------------------------------------
// Intent: concept_clarification
// ---------------------------------------------------------------------------

const handleConceptClarification = async (input: AIEngineInput): Promise<AIEngineResponse> => {
    const provider = createLLMProvider();
    const { context, question } = input;

    // 1. System Prompt
    const systemPrompt = [
        `You are an AI exam assistant. Your goal is to help students prepare for upcoming exams.`,
        `- Provide clear, structured, and exam-focused explanations.`,
        `- Do NOT provide motivational or casual conversation.`,
        `- If you do not know the answer, admit it clearly.`,
        `- Keep answers concise and relevant to the exam syllabus.`,
        ``,
        FORMATTING_RULES,
    ].join('\n');

    // 2. Session context header
    const { sessionMeta, timeContext, flags } = context;
    const sessionHeader = [
        `Session Context:`,
        `- Subject: ${sessionMeta.subject}`,
        `- Exam Date: ${sessionMeta.examDate} (in ${timeContext.examInDays} days)`,
        `- Session Status: ${flags.isActive ? 'Active' : 'Expired'}`,
    ].join('\n');

    // 3. Hierarchical knowledge block (Syllabus → PYQ → Notes)
    const allChunks = context.knowledge?.chunks || [];
    const knowledgeBlock = buildHierarchicalKnowledgeBlock(question, allChunks, 6);

    // 4. Recent conversation history
    let historyBlock = '';
    const recentHistory = context.recentHistory || [];
    if (recentHistory.length > 0) {
        const historyText = recentHistory
            .map(msg => `Q: ${msg.question}\nA: ${msg.answer}`)
            .join('\n\n');
        historyBlock = `\n\nRecent Conversation (use for continuity):\n${historyText}`;
    }

    // 5. Intent-specific instructions
    const intentPrompt = [
        `Intent: Concept Clarification`,
        `- Explain the concept clearly using bullet points.`,
        `- Keep depth suitable for an exam context.`,
        `- Use examples only if they significantly improve clarity.`,
    ].join('\n');

    const contextPrompt = `${sessionHeader}${knowledgeBlock}${historyBlock}`;
    const userPrompt = `Question: ${question}`;

    const sessionId = sessionMeta.sessionId;
    const startTime = Date.now();
    let aiResponse;
    try {
        aiResponse = await provider.generateResponse({
            systemPrompt: `${systemPrompt}\n\n${intentPrompt}`,
            contextPrompt,
            userPrompt
        });
        logAIEvent({ type: 'AI_CALL', sessionId, intent: input.intent, durationMs: Date.now() - startTime, metadata: { responseLength: aiResponse.text.length } });
    } catch (error: any) {
        logAIEvent({ type: 'AI_ERROR', sessionId, intent: input.intent, metadata: { error: error.message } });
        throw error;
    }

    const sourcesUsed = context.materials.files
        .filter(f => aiResponse.text.includes(f.name))
        .map(f => f.name);

    return { answer: aiResponse.text, confidence: 'low', sourcesUsed };
};


// ---------------------------------------------------------------------------
// Intent: revision_guidance
// ---------------------------------------------------------------------------

const handleRevisionGuidance = async (input: AIEngineInput): Promise<AIEngineResponse> => {
    const provider = createLLMProvider();
    const { context } = input;
    const { sessionMeta, timeContext, flags } = context;

    // 1. System Prompt
    const systemPrompt = [
        `You are an AI exam assistant. Your goal is to help students prepare for upcoming exams.`,
        `- Exam-focused`,
        `- Structured output only`,
        `- No casual language`,
        `- No generic motivational advice`,
        `- If you do not know the answer, admit it clearly.`,
        ``,
        FORMATTING_RULES,
    ].join('\n');

    // 2. Session context header
    const sessionHeader = [
        `Session Context:`,
        `- Subject: ${sessionMeta.subject}`,
        `- Exam In Days: ${timeContext.examInDays}`,
        `- Time Remaining (hours): ${timeContext.timeRemainingInHours}`,
        `- Session Status: ${flags.isActive ? 'Active' : 'Inactive'}`,
    ].join('\n');

    // 3. Hierarchical knowledge block (Syllabus → PYQ → Notes)
    const allChunks = context.knowledge?.chunks || [];
    const knowledgeBlock = buildHierarchicalKnowledgeBlock(input.question || '', allChunks, 6);

    // 4. Recent conversation history
    let historyBlock = '';
    const recentHistory = context.recentHistory || [];
    if (recentHistory.length > 0) {
        const historyText = recentHistory
            .map(msg => `Q: ${msg.question}\nA: ${msg.answer}`)
            .join('\n\n');
        historyBlock = `\n\nRecent Conversation (use for continuity):\n${historyText}`;
    }

    // 5. Intent-specific format
    const intentPrompt = [
        `Intent: Revision Guidance`,
        `AI must respond in this strict format:`,
        ``,
        `Exam Urgency Level:`,
        `<High / Medium / Low>`,
        ``,
        `Top Priority Topics:`,
        `1.`,
        `2.`,
        `3.`,
        ``,
        `Recommended PYQ Focus:`,
        `-`,
        ``,
        `Suggested 2-Hour Revision Plan:`,
        `-`,
    ].join('\n');

    const contextPrompt = `${sessionHeader}${knowledgeBlock}${historyBlock}`;

    const sessionId = sessionMeta.sessionId;
    const startTime = Date.now();
    let aiResponse;
    try {
        aiResponse = await provider.generateResponse({
            systemPrompt: `${systemPrompt}\n\n${intentPrompt}`,
            contextPrompt,
            userPrompt: input.question || 'Generate revision guidance.'
        });
        logAIEvent({ type: 'AI_CALL', sessionId, intent: input.intent, durationMs: Date.now() - startTime, metadata: { responseLength: aiResponse.text.length } });
    } catch (error: any) {
        logAIEvent({ type: 'AI_ERROR', sessionId, intent: input.intent, metadata: { error: error.message } });
        throw error;
    }

    return {
        answer: aiResponse.text,
        confidence: 'medium',
        sourcesUsed: context.materials.files.map(f => f.name)
    };
};


// ---------------------------------------------------------------------------
// Intent: chunk_summary
// ---------------------------------------------------------------------------

const handleChunkSummary = async (input: AIEngineInput): Promise<AIEngineResponse> => {
    const provider = createLLMProvider();

    // 1. System Prompt (internal memory compression — no knowledge hierarchy needed)
    const systemPrompt = [
        `You are an AI summarizing an exam preparation session.`,
        `- Academic tone`,
        `- Extremely concise`,
        `- Keyword-based output only`,
        `- No explanations`,
        `- No motivational text`,
        `- No repetition`,
        ``,
        FORMATTING_RULES,
    ].join('\n');

    // 2. Intent-Specific Prompt
    const intentPrompt = [
        `Return strictly in this format:`,
        ``,
        `Core Topics:`,
        `-`,
        `-`,
        ``,
        `Repeated Confusions:`,
        `-`,
        `-`,
        ``,
        `High-Yield Themes:`,
        `-`,
        `-`,
    ].join('\n');

    const sessionId = input.context.sessionMeta.sessionId;
    const startTime = Date.now();
    let aiResponse;
    try {
        aiResponse = await provider.generateResponse({
            systemPrompt: `${systemPrompt}\n\n${intentPrompt}`,
            contextPrompt: '',
            userPrompt: input.question
        });
        logAIEvent({ type: 'AI_CALL', sessionId, intent: input.intent, durationMs: Date.now() - startTime, metadata: { responseLength: aiResponse.text.length } });
    } catch (error: any) {
        logAIEvent({ type: 'AI_ERROR', sessionId, intent: input.intent, metadata: { error: error.message } });
        throw error;
    }

    return { answer: aiResponse.text, confidence: 'high', sourcesUsed: [] };
};


// ---------------------------------------------------------------------------
// Intent: session_summary
// ---------------------------------------------------------------------------

const handleSessionSummary = async (input: AIEngineInput): Promise<AIEngineResponse> => {
    const provider = createLLMProvider();
    const sessionIdStr = input.context.sessionMeta.sessionId;

    const chunkSummaries    = await getChunkSummaries(sessionIdStr);
    const unchunkedMessages = await getUnchunkedMessages(sessionIdStr);
    const weakTopics        = await detectWeakTopics(sessionIdStr);

    // 1. System Prompt
    const systemPrompt = [
        `SYSTEM RULES:`,
        `- Academic tone`,
        `- Strategic exam-focused analysis`,
        `- Structured output only`,
        `- No motivational language`,
        ``,
        `Strict output format:`,
        ``,
        `Session Summary:`,
        ``,
        `Core Topics Covered:`,
        `-`,
        ``,
        `Common Weak Areas (Evidence-Based):`,
        `- Include topics from deterministic evidence if valid`,
        ``,
        `Frequently Repeated Themes:`,
        `-`,
        ``,
        `Strategic Next Focus:`,
        `-`,
        ``,
        FORMATTING_RULES,
    ].join('\n');

    // 2. Input block with evidence hierarchy
    let chunksText = chunkSummaries.map(c => `- ${c.summary_text}`).join('\n') || 'None';
    let recentMessagesText = unchunkedMessages.map(m => `Q: ${m.question}\nA: ${m.answer}`).join('\n\n') || 'None';

    let weakTopicEvidence = 'Weak Topic Evidence (Deterministic Analysis):\n';
    weakTopicEvidence += weakTopics.length > 0
        ? weakTopics.map((wt: any) => `- ${wt.topic} (frequency: ${wt.frequency})`).join('\n')
        : 'None';

    const historyPrompt = [
        `INPUT BLOCK:`,
        ``,
        weakTopicEvidence,
        ``,
        `Chunk Memory Summaries:`,
        chunksText,
        ``,
        `Recent Messages:`,
        recentMessagesText,
    ].join('\n');

    const startTime = Date.now();
    let aiResponse;
    try {
        aiResponse = await provider.generateResponse({
            systemPrompt,
            contextPrompt: historyPrompt,
            userPrompt: input.question || 'Generate session summary.'
        });
        logAIEvent({ type: 'AI_CALL', sessionId: sessionIdStr, intent: input.intent, durationMs: Date.now() - startTime, metadata: { responseLength: aiResponse.text.length } });
    } catch (error: any) {
        logAIEvent({ type: 'AI_ERROR', sessionId: sessionIdStr, intent: input.intent, metadata: { error: error.message } });
        throw error;
    }

    return { answer: aiResponse.text, confidence: 'high', sourcesUsed: [] };
};


// ---------------------------------------------------------------------------
// Intent: pyq_answer_generation
// ---------------------------------------------------------------------------

const handlePyqAnswerGeneration = async (input: AIEngineInput): Promise<AIEngineResponse> => {
    const provider = createLLMProvider();
    const { context } = input;

    // Parse question and marks from JSON input
    let questionText = input.question;
    let marks: number | null = null;
    try {
        const parsed = JSON.parse(input.question);
        if (parsed.questionText) {
            questionText = parsed.questionText;
            marks = parsed.marks;
        }
    } catch (e) {
        // Fallback for raw string
    }

    const sessionIdNum = parseInt(context.sessionMeta.sessionId, 10);
    const finalMarks = marks || 5;

    let cachedAnswer: string | null = null;
    let canonicalQuestionId: string | null = null;
    let notesHash = 'default_version';

    if (!isNaN(sessionIdNum)) {
        try {
            // 1. Try JSON payload
            try {
                const parsed = JSON.parse(input.question);
                if (parsed.canonicalQuestionId) {
                    canonicalQuestionId = parsed.canonicalQuestionId;
                }
            } catch (_) {}

            // 2. Try match against canonical_questions text
            if (!canonicalQuestionId) {
                const cqTextRes = await pool.query(
                    `SELECT cq.id 
                     FROM canonical_questions cq
                     JOIN topics t ON cq.topic_id = t.id
                     JOIN syllabi s ON t.syllabus_id = s.id
                     WHERE s.session_id = $1 AND LOWER(cq.text) = LOWER($2)
                     LIMIT 1`,
                    [sessionIdNum, questionText]
                );
                if (cqTextRes.rows.length > 0) {
                    canonicalQuestionId = cqTextRes.rows[0].id;
                }
            }

            // 3. Fallback to raw_questions match
            if (!canonicalQuestionId) {
                const rqRes = await pool.query(
                    `SELECT rq.canonical_id 
                     FROM raw_questions rq
                     JOIN papers p ON rq.paper_id = p.id
                     WHERE p.session_id = $1 AND (LOWER(rq.original_text) = LOWER($2) OR LOWER(rq.corrected_text) = LOWER($2))
                     LIMIT 1`,
                    [sessionIdNum, questionText]
                );
                if (rqRes.rows.length > 0 && rqRes.rows[0].canonical_id) {
                    canonicalQuestionId = rqRes.rows[0].canonical_id;
                }
            }

            if (canonicalQuestionId) {
                // 2. Fetch notes hash
                const notesRes = await pool.query(
                    `SELECT content FROM personal_notes WHERE session_id = $1 LIMIT 1`,
                    [sessionIdNum]
                );
                const notesContent = notesRes.rows.length > 0 ? notesRes.rows[0].content : '';
                const crypto = require('crypto');
                notesHash = crypto.createHash('sha256').update(notesContent).digest('hex');
                
                // 3. Query generated_answers cache
                const cacheRes = await pool.query(
                    `SELECT exam_focused_answer 
                     FROM generated_answers 
                     WHERE canonical_question_id = $1 AND marks = $2 AND notes_version_hash = $3`,
                    [canonicalQuestionId, finalMarks, notesHash]
                );
                
                if (cacheRes.rows.length > 0) {
                    cachedAnswer = cacheRes.rows[0].exam_focused_answer;
                }
            }
        } catch (e: any) {
            console.error('Error during answer cache lookup:', e.message);
        }
    }

    if (cachedAnswer) {
        const sourcesUsed = context.materials.files
            .filter(f => cachedAnswer!.includes(f.name))
            .map(f => f.name);

        return {
            answer: cachedAnswer,
            confidence: "high",
            sourcesUsed: sourcesUsed.length > 0 ? sourcesUsed : ["Cached Knowledge"]
        };
    }

    // 1. System Prompt
    const systemPrompt = [
        `You are an expert AI exam assistant. Your primary goal is to provide highly structured, marks-weighted answers for previous year questions (PYQs).`,
        `- Academic and formal tone.`,
        `- Adhere strictly to the formatting rules corresponding to the marks weightage.`,
        `- Use the provided context materials as your primary source of truth.`,
        ``,
        FORMATTING_RULES,
    ].join('\n');

    // 2. Marks-based formatting intent
    let intentPrompt = `Answer this question perfectly for the exam.\n`;
    if (marks) {
        if (marks <= 2) {
            intentPrompt += `Target Marks: ${marks}\nFormat Rule: Provide only a short, direct definition (2-3 lines max).\n`;
        } else if (marks <= 5) {
            intentPrompt += `Target Marks: ${marks}\nFormat Rule: Provide a clear definition, 3-4 key bullet points, and a small example.\n`;
        } else if (marks <= 10) {
            intentPrompt += `Target Marks: ${marks}\nFormat Rule: Provide a definition, step-by-step explanation, a text-based flowchart/diagram using ASCII characters (-->, ->, |, [Step]), advantages/disadvantages, and a brief summary.\n`;
        } else {
            intentPrompt += `Target Marks: ${marks}\nFormat Rule: Provide a highly detailed explanation, a structured ASCII flowchart or diagram, comprehensive examples, comparison tables if applicable, and a strong conclusion.\n`;
        }
    }

    // 3. Hierarchical knowledge block (Syllabus → PYQ → Notes)
    const allChunks = context.knowledge?.chunks || [];
    const knowledgeBlock = buildHierarchicalKnowledgeBlock(questionText, allChunks, 7);
    const contextPrompt = `Session Outline: ${context.sessionMeta.subject}${knowledgeBlock}`;

    // 4. Call AI Provider
    const sessionId = context.sessionMeta.sessionId;
    const startTime = Date.now();
    let aiResponse;
    try {
        aiResponse = await provider.generateResponse({
            systemPrompt: `${systemPrompt}\n\n${intentPrompt}`,
            contextPrompt,
            userPrompt: `Question: ${questionText}`
        });

        const durationMs = Date.now() - startTime;
        logAIEvent({
            type: "AI_CALL",
            sessionId,
            intent: input.intent,
            durationMs,
            metadata: {
                responseLength: aiResponse.text.length,
                marks: marks
            }
        });
    } catch (error: any) {
        logAIEvent({
            type: "AI_ERROR",
            sessionId,
            intent: input.intent,
            metadata: {
                error: error.message
            }
        });
        throw error;
    }

    if (canonicalQuestionId) {
        try {
            await pool.query(
                `INSERT INTO generated_answers (canonical_question_id, marks, notes_version_hash, exam_focused_answer)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (canonical_question_id, marks, notes_version_hash) DO NOTHING`,
                [canonicalQuestionId, finalMarks, notesHash, aiResponse.text]
            );
        } catch (e: any) {
            console.error('Error saving answer to cache:', e.message);
        }
    }

    // Extract sources
    const sourcesUsed = context.materials.files
        .filter(f => aiResponse.text.includes(f.name))
        .map(f => f.name);

    return {
        answer: aiResponse.text,
        confidence: "high",
        sourcesUsed: sourcesUsed.length > 0 ? sourcesUsed : ["General Knowledge"]
    };
};

/**
 * Main entry point for the AI Engine.
 * Routes logic based on the intent provided in the input.
 * 
 * @param input - The structured input containing context, intent, and question.
 * @returns A promise resolving to the AI engine's structured response.
 * @throws Error if the intent is not supported.
 */
export const runAIEngine = async (input: AIEngineInput): Promise<AIEngineResponse> => {
    const { intent } = input;

    // Route logic based on intent
    if (intent === 'concept_clarification') {
        return handleConceptClarification(input);
    }

    if (intent === 'pyq_answer_generation') {
        return handlePyqAnswerGeneration(input);
    }

    if (intent === 'revision_guidance') {
        return handleRevisionGuidance(input);
    }

    if (intent === 'chunk_summary') {
        return handleChunkSummary(input);
    }

    if (intent === 'session_summary') {
        return handleSessionSummary(input);
    }

    // Explicitly handle unsupported intents (though TypeScript might catch this via type checking, runtime safety is good)
    throw new Error(`Unsupported AI intent: ${intent}`);
};

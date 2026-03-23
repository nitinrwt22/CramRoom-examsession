
import { SessionContext } from '../sessionContext.service';
import { DummyAIProvider } from './aiProvider';
import { getChunkSummaries, getUnchunkedMessages } from '../../models/sessionAiChunk.model';
import { detectWeakTopics } from './weakTopicAnalytics.service';
import { logAIEvent } from "../../utils/aiLogger";
import { selectRelevantChunks } from './knowledgeRetrieval.service';
/**
 * 1. AIIntent
 * Define allowed intents for the AI Engine.
 * For now, strictly limited to 'concept_clarification'.
 */
export type AIIntent = 'concept_clarification' | 'revision_guidance' | 'chunk_summary' | 'session_summary';

/**
 * 2. AIEngineInput
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

/**
 * Handler for 'concept_clarification' intent.
 * Currently returns a placeholder response as AI integration is not yet implemented.
 * 
 * @param input - The input for the AI engine.
 * @returns A placeholder AIEngineResponse.
 */
const handleConceptClarification = async (input: AIEngineInput): Promise<AIEngineResponse> => {
    const provider = new DummyAIProvider();
    const { context, question } = input;

    // 1. Construct System Prompt
    const systemPrompt = `
You are an AI exam assistant. Your goal is to help students prepare for upcoming exams.
- Provide clear, structured, and exam-focused explanations.
- Do NOT provide motivational or casual conversation.
- If you do not know the answer, admit it clearly.
- Keep answers concise and relevant to the exam syllabus.
`.trim();

    // 2. Construct Session Context Prompt
    const { sessionMeta, timeContext, flags, materials } = context;
    const materialNames = materials.files.length > 0
        ? materials.files.map(f => f.name).join(', ')
        : "None";

    const contextPrompt = `
Session Context:
- Subject: ${sessionMeta.subject}
- Exam Date: ${sessionMeta.examDate} (in ${timeContext.examInDays} days)
- Session Status: ${flags.isActive ? "Active" : "Expired"}
- Available Study Materials: ${materialNames}
`.trim();

    // 3b. Inject relevant knowledge chunks (keyword-ranked)
    let knowledgeBlock = '';
    const allChunks = context.knowledge?.chunks || [];
    const relevantChunks = selectRelevantChunks(question, allChunks, 5);
    if (relevantChunks.length > 0) {
        const knowledgeText = relevantChunks
            .map((chunk) => `[${chunk.topic}]\n${chunk.text}`)
            .join('\n\n---\n\n');
        knowledgeBlock = `\n\nKnowledge Base (from uploaded study materials):\n${knowledgeText}`;
    }

    // 3c. Inject recent conversation history
    let historyBlock = '';
    const recentHistory = context.recentHistory || [];
    if (recentHistory.length > 0) {
        const historyText = recentHistory
            .map((msg) => `Q: ${msg.question}\nA: ${msg.answer}`)
            .join('\n\n');
        historyBlock = `\n\nRecent Conversation (use for continuity):\n${historyText}`;
    }

    // 3. Construct Intent-Specific Prompt
    const intentPrompt = `
Intent: Concept Clarification
- Explain the concept clearly using potential bullet points.
- Keep depth suitable for an exam context.
- Use examples only if they significantly improve clarity.
`.trim();

    // 4. Construct User Prompt
    const userPrompt = `
Question: ${question}
`.trim();

    // NOTE: In a real implementation, we might combine these differently depending on the provider's API.
    // For now, we follow the interface structure.

    // Call AI provider
    const sessionId = context.sessionMeta.sessionId;
    const startTime = Date.now();
    let aiResponse;
    try {
        aiResponse = await provider.generateResponse({
            systemPrompt: `${systemPrompt}\n\n${intentPrompt}`,
            contextPrompt: contextPrompt + knowledgeBlock + historyBlock,
            userPrompt
        });

        const durationMs = Date.now() - startTime;
        logAIEvent({
            type: "AI_CALL",
            sessionId,
            intent: input.intent,
            durationMs,
            metadata: {
                responseLength: aiResponse.text.length
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

    // Extract sources if any (simple heuristic for now, matching material names in answer)
    // In a real scenario, the LLM might return cited sources explicitly.
    const sourcesUsed = materials.files
        .filter(f => aiResponse.text.includes(f.name))
        .map(f => f.name);

    return {
        answer: aiResponse.text,
        confidence: "low",
        sourcesUsed: sourcesUsed
    };
};



/**
 * Handler for 'revision_guidance' intent.
 * Provides structured exam preparation advice.
 */
const handleRevisionGuidance = async (input: AIEngineInput): Promise<AIEngineResponse> => {
    const provider = new DummyAIProvider();
    const { context } = input;
    const { sessionMeta, timeContext, flags, materials } = context;

    // 1. Construct System Prompt (SYSTEM RULES)
    const systemPrompt = `
You are an AI exam assistant. Your goal is to help students prepare for upcoming exams.
- Exam-focused
- Structured output only
- No casual language
- No generic motivational advice
- If you do not know the answer, admit it clearly.
`.trim();

    // 2. Construct Session Context Prompt (CONTEXT BLOCK)
    const materialNames = materials.files.length > 0
        ? materials.files.map(f => f.name).join(', ')
        : "None";

    let contextPrompt = `
Session Context:
- Subject: ${sessionMeta.subject}
- examInDays: ${timeContext.examInDays}
- timeRemainingInHours: ${timeContext.timeRemainingInHours}
- Session Status: ${flags.isActive ? "Active" : "Inactive"}
- List of material names: ${materialNames}
`.trim();

    // Check for PYQ
    const hasPYQ = materials.files.some(f =>
        f.name.toLowerCase().includes('pyq') ||
        f.name.toLowerCase().includes('previous')
    );

    if (hasPYQ) {
        contextPrompt += "\nPYQ materials detected. Prioritize repeated patterns.";
    }

    // Inject relevant knowledge chunks (keyword-ranked)
    const allChunksRev = context.knowledge?.chunks || [];
    const relevantChunksRev = selectRelevantChunks(input.question || '', allChunksRev, 5);
    if (relevantChunksRev.length > 0) {
        const knowledgeText = relevantChunksRev
            .slice(0, 6)
            .map((chunk) => `[${chunk.topic}]\n${chunk.text}`)
            .join('\n\n---\n\n');
        contextPrompt += `\n\nKnowledge Base (from uploaded study materials):\n${knowledgeText}`;
    }

    // Inject recent conversation history
    const recentHistoryRev = context.recentHistory || [];
    if (recentHistoryRev.length > 0) {
        const historyText = recentHistoryRev
            .map((msg) => `Q: ${msg.question}\nA: ${msg.answer}`)
            .join('\n\n');
        contextPrompt += `\n\nRecent Conversation (use for continuity):\n${historyText}`;
    }

    // 3. Construct Intent-Specific Prompt (INTENT RULES)
    const intentPrompt = `
Intent: Revision Guidance
AI must respond in this strict format:

Exam Urgency Level:
<High / Medium / Low>

Top Priority Topics:
1.
2.
3.

Recommended PYQ Focus:
-

Suggested 2-Hour Revision Plan:
-
`.trim();

    // 4. Combine Prompts and Call AI Provider
    const sessionId = context.sessionMeta.sessionId;
    const startTime = Date.now();
    let aiResponse;
    try {
        aiResponse = await provider.generateResponse({
            systemPrompt: `${systemPrompt}\n\n${intentPrompt}`,
            contextPrompt,
            userPrompt: input.question || "Generate revision guidance."
        });

        const durationMs = Date.now() - startTime;
        logAIEvent({
            type: "AI_CALL",
            sessionId,
            intent: input.intent,
            durationMs,
            metadata: {
                responseLength: aiResponse.text.length
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

    // 6. Return AIEngineResponse
    return {
        answer: aiResponse.text,
        confidence: "medium",
        sourcesUsed: materials.files.map(f => f.name)
    };
};

/**
 * Handler for 'chunk_summary' intent.
 * Generates a keyword-focused summary for a chunk of AI interactions.
 * This acts as internal memory compression.
 */
const handleChunkSummary = async (input: AIEngineInput): Promise<AIEngineResponse> => {
    const provider = new DummyAIProvider();

    // 1. Construct System Prompt (SYSTEM RULES)
    const systemPrompt = `
You are an AI summarizing an exam preparation session.
- Academic tone
- Extremely concise
- Keyword-based output only
- No explanations
- No motivational text
- No repetition
`.trim();

    // 2. Construct Intent-Specific Prompt (INTENT RULES)
    const intentPrompt = `
Return strictly in this format:

Core Topics:
-
-

Repeated Confusions:
-
-

High-Yield Themes:
-
-
`.trim();

    // 3. Call AI Provider (Internal memory compression, no session context needed)
    const sessionId = input.context.sessionMeta.sessionId;
    const startTime = Date.now();
    let aiResponse;
    try {
        aiResponse = await provider.generateResponse({
            systemPrompt: `${systemPrompt}\n\n${intentPrompt}`,
            contextPrompt: '',
            userPrompt: input.question
        });

        const durationMs = Date.now() - startTime;
        logAIEvent({
            type: "AI_CALL",
            sessionId,
            intent: input.intent,
            durationMs,
            metadata: {
                responseLength: aiResponse.text.length
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

    return {
        answer: aiResponse.text,
        confidence: "high",
        sourcesUsed: []
    };
};

/**
 * Handler for 'session_summary' intent.
 * Generates an overall session summary using hierarchical chunk memory.
 */
const handleSessionSummary = async (input: AIEngineInput): Promise<AIEngineResponse> => {
    const provider = new DummyAIProvider();
    const sessionIdStr = input.context.sessionMeta.sessionId;

    // Fetch memory
    const chunkSummaries = await getChunkSummaries(sessionIdStr);
    const unchunkedMessages = await getUnchunkedMessages(sessionIdStr);

    // Call weak topic analytics
    const weakTopics = await detectWeakTopics(sessionIdStr);

    // 1. Construct System Prompt (SYSTEM RULES & FORMAT)
    const systemPrompt = `
SYSTEM RULES:
- Academic tone
- Strategic exam-focused analysis
- Structured output only
- No motivational language

Strict output format:

Session Summary:

Core Topics Covered:
-

Common Weak Areas (Evidence-Based):
- Include topics from deterministic evidence if valid

Frequently Repeated Themes:
-

Strategic Next Focus:
-
`.trim();

    // Build hierarchical input blocks
    let chunksText = chunkSummaries.map(c => `- ${c.summary_text}`).join('\n');
    if (!chunksText) chunksText = "None";

    let recentMessagesText = unchunkedMessages.map(m => `Q: ${m.question}\nA: ${m.answer}`).join('\n\n');
    if (!recentMessagesText) recentMessagesText = "None";

    // Build evidence block
    let weakTopicEvidence = "Weak Topic Evidence (Deterministic Analysis):\n";
    if (weakTopics && weakTopics.length > 0) {
        weakTopicEvidence += weakTopics.map((wt: any) => `- ${wt.topic} (frequency: ${wt.frequency})`).join('\n');
    } else {
        weakTopicEvidence += "None";
    }

    // 2. Construct History Prompt (INPUT BLOCK)
    const historyPrompt = `
INPUT BLOCK:

${weakTopicEvidence}

Chunk Memory Summaries:
${chunksText}

Recent Messages:
${recentMessagesText}
`.trim();

    // 3. Call AI Provider
    const startTime = Date.now();
    let aiResponse;
    try {
        aiResponse = await provider.generateResponse({
            systemPrompt: systemPrompt,
            contextPrompt: historyPrompt,
            userPrompt: input.question || "Generate session summary."
        });

        const durationMs = Date.now() - startTime;
        logAIEvent({
            type: "AI_CALL",
            sessionId: sessionIdStr,
            intent: input.intent,
            durationMs,
            metadata: {
                responseLength: aiResponse.text.length
            }
        });
    } catch (error: any) {
        logAIEvent({
            type: "AI_ERROR",
            sessionId: sessionIdStr,
            intent: input.intent,
            metadata: {
                error: error.message
            }
        });
        throw error;
    }

    return {
        answer: aiResponse.text,
        confidence: "high",
        sourcesUsed: []
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

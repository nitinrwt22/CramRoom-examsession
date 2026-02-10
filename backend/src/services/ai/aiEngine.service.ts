
import { SessionContext } from '../sessionContext.service';
import { DummyAIProvider } from './aiProvider';

/**
 * 1. AIIntent
 * Define allowed intents for the AI Engine.
 * For now, strictly limited to 'concept_clarification'.
 */
export type AIIntent = 'concept_clarification';

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
    const aiResponse = await provider.generateResponse({
        systemPrompt: `${systemPrompt}\n\n${intentPrompt}`, // Combining intent into system/instruction for better adherence
        contextPrompt,
        userPrompt
    });

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

    // Explicitly handle unsupported intents (though TypeScript might catch this via type checking, runtime safety is good)
    throw new Error(`Unsupported AI intent: ${intent}`);
};

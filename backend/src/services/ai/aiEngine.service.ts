
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

    // Prepare placeholder prompts
    const systemPrompt = "Placeholder system prompt";
    const contextPrompt = "Placeholder context prompt";
    const userPrompt = "Placeholder user prompt";

    // Call AI provider
    const aiResponse = await provider.generateResponse({
        systemPrompt,
        contextPrompt,
        userPrompt
    });

    return {
        answer: aiResponse.text,
        confidence: "low",
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

    // Explicitly handle unsupported intents (though TypeScript might catch this via type checking, runtime safety is good)
    throw new Error(`Unsupported AI intent: ${intent}`);
};

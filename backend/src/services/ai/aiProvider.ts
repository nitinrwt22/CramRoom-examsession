
/**
 * AIProviderInput
 * The structure of the input required to generate an AI response.
 */
export interface AIProviderInput {
    systemPrompt: string;
    contextPrompt: string;
    userPrompt: string;
}

/**
 * AIProviderResponse
 * The structure of the response returned by an AI Provider.
 */
export interface AIProviderResponse {
    text: string;
}

/**
 * AIProvider Interface
 * Abstracts the interaction with AI models so the engine remains agnostic.
 */
export interface AIProvider {
    /**
     * Generates a response from the AI model based on the input prompts.
     * @param input - The prompts (system, context, user).
     * @returns A promise that resolves to the provider's response.
     */
    generateResponse(input: AIProviderInput): Promise<AIProviderResponse>;
}

/**
 * DummyAIProvider
 * A placeholder implementation of the AIProvider interface.
 * Returns a fixed response without making actual API calls.
 */
export class DummyAIProvider implements AIProvider {
    /**
     * Generates a dummy response.
     * @param input - The input prompts (ignored).
     * @returns A fixed response text.
     */
    async generateResponse(input: AIProviderInput): Promise<AIProviderResponse> {
        return {
            text: "AI provider not implemented yet."
        };
    }
}

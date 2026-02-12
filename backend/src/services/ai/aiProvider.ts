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
 * OllamaAIProvider
 * Implementation of the AIProvider interface using a local Ollama instance.
 * Uses the llama2 model via the /api/generate endpoint.
 */
export class OllamaAIProvider implements AIProvider {
    private readonly apiUrl = 'http://localhost:11434/api/generate';
    private readonly model = 'llama2';

    /**
     * Generates a response using the local Ollama API.
     * @param input - The input prompts.
     * @returns The generated text or an error message.
     */
    async generateResponse(input: AIProviderInput): Promise<AIProviderResponse> {
        try {
            // Combine prompts as required
            const combinedPrompt = `
${input.systemPrompt}

${input.contextPrompt}

${input.userPrompt}
`;

            // Prepare the request body for Ollama
            const body = {
                model: this.model,
                prompt: combinedPrompt,
                stream: false
            };

            // Send POST request to Ollama
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`Ollama API responded with status: ${response.status}`);
            }

            // Parse the JSON response
            const json = await response.json() as { response: string };

            return {
                text: json.response
            };
        } catch (error) {
            // Basic error handling
            // return text: "Local AI provider error."
            return {
                text: "Local AI provider error."
            };
        }
    }
}

/**
 * Exporting OllamaAIProvider as DummyAIProvider to maintain backward compatibility
 * with consumers (like AI Engine) that expect DummyAIProvider.
 */
export { OllamaAIProvider as DummyAIProvider };

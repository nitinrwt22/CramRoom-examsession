/**
 * aiProvider.ts
 *
 * Phase 3: Model-Agnostic LLM Provider Abstraction
 *
 * Defines the `AIProvider` interface that decouples all business logic from
 * any specific model SDK. The AI Engine imports `createLLMProvider()` instead
 * of instantiating a concrete class directly, making provider swaps a
 * single-line configuration change.
 *
 * Provider selection is driven by the LLM_PROVIDER environment variable:
 *   LLM_PROVIDER=ollama  → OllamaAIProvider  (default, local)
 *   LLM_PROVIDER=gemini  → GeminiAIProvider  (stub — wired in Phase 4)
 */

// ---------------------------------------------------------------------------
// Shared Types
// ---------------------------------------------------------------------------

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
 * Every concrete provider must implement this contract.
 */
export interface AIProvider {
    /**
     * Generates a response from the AI model based on the input prompts.
     * @param input - The structured prompts (system, context, user).
     * @returns A promise that resolves to the provider's text response.
     */
    generateResponse(input: AIProviderInput): Promise<AIProviderResponse>;

    /**
     * A human-readable identifier for logging and debugging.
     */
    readonly providerName: string;
}

// ---------------------------------------------------------------------------
// OllamaAIProvider — default local provider
// ---------------------------------------------------------------------------

/**
 * OllamaAIProvider
 * Sends requests to a locally-running Ollama instance (http://localhost:11434).
 * Model is configurable via the OLLAMA_MODEL environment variable (default: llama2).
 */
export class OllamaAIProvider implements AIProvider {
    readonly providerName = 'ollama';

    private readonly apiUrl: string;
    private readonly model: string;

    constructor() {
        this.apiUrl = process.env.OLLAMA_API_URL ?? 'http://localhost:11434/api/generate';
        this.model  = process.env.OLLAMA_MODEL    ?? 'llama2';
    }

    async generateResponse(input: AIProviderInput): Promise<AIProviderResponse> {
        try {
            const combinedPrompt = `${input.systemPrompt}\n\n${input.contextPrompt}\n\n${input.userPrompt}`;

            const body = {
                model: this.model,
                prompt: combinedPrompt,
                stream: false
            };

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`Ollama API responded with status: ${response.status}`);
            }

            const json = await response.json() as { response: string };
            return { text: json.response };

        } catch (error) {
            // Graceful degradation: return a safe fallback string rather than throwing
            return { text: 'Local AI provider error. Please check the Ollama service is running.' };
        }
    }
}

// ---------------------------------------------------------------------------
// GeminiAIProvider — cloud provider stub (Phase 4 wiring)
// ---------------------------------------------------------------------------

/**
 * GeminiAIProvider
 * Stub implementation for Google Gemini API integration.
 *
 * This stub satisfies the AIProvider interface and logs a clear message when
 * called, making it safe to register without causing runtime errors.
 * Full SDK integration is deferred to Phase 4 (API & Integration Layer).
 *
 * To activate:  set LLM_PROVIDER=gemini and GEMINI_API_KEY in your .env.
 */
export class GeminiAIProvider implements AIProvider {
    readonly providerName = 'gemini';

    async generateResponse(input: AIProviderInput): Promise<AIProviderResponse> {
        // Phase 4 will replace this body with the actual Gemini SDK call.
        console.warn(
            '[GeminiAIProvider] Gemini integration is not yet wired (Phase 4). ' +
            'Returning placeholder response.'
        );
        return {
            text: '[Gemini provider stub] Full integration is pending Phase 4 implementation.'
        };
    }
}

// ---------------------------------------------------------------------------
// Factory — createLLMProvider()
// ---------------------------------------------------------------------------

/**
 * createLLMProvider()
 *
 * Selects and instantiates the correct AIProvider based on the `LLM_PROVIDER`
 * environment variable. This is the single point where provider selection
 * is made — the AI Engine never calls `new <Provider>()` directly.
 *
 * Supported values of LLM_PROVIDER:
 *   'ollama'  → OllamaAIProvider (default)
 *   'gemini'  → GeminiAIProvider (stub until Phase 4)
 *
 * @returns An AIProvider instance ready for use.
 */
export function createLLMProvider(): AIProvider {
    const providerName = (process.env.LLM_PROVIDER ?? 'ollama').toLowerCase();

    switch (providerName) {
        case 'gemini':
            return new GeminiAIProvider();
        case 'ollama':
        default:
            return new OllamaAIProvider();
    }
}

// ---------------------------------------------------------------------------
// Backward-compatibility alias
// ---------------------------------------------------------------------------

/**
 * DummyAIProvider
 * Alias for OllamaAIProvider retained for any legacy callers.
 * Consumers should migrate to `createLLMProvider()`.
 * @deprecated Use createLLMProvider() instead.
 */
export { OllamaAIProvider as DummyAIProvider };

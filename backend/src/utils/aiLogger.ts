export type AIEventType =
    | 'AI_CALL'
    | 'CHUNK_CREATED'
    | 'WEAK_ANALYTICS'
    | 'SUMMARY_GENERATED'
    | 'AI_ERROR';

export interface LogAIEventOptions {
    type: AIEventType;
    sessionId?: string;
    intent?: string;
    durationMs?: number;
    metadata?: Record<string, any>;
}

export const logAIEvent = (options: LogAIEventOptions): void => {
    const timestamp = new Date().toISOString();
    let logMessage = `\n[${timestamp}] [${options.type}]`;

    if (options.sessionId) {
        logMessage += `\nsession: ${options.sessionId}`;
    }

    if (options.intent) {
        logMessage += `\nintent: ${options.intent}`;
    }

    if (options.durationMs !== undefined) {
        logMessage += `\nduration: ${options.durationMs}ms`;
    }

    if (options.metadata) {
        logMessage += `\nmetadata: ${JSON.stringify(options.metadata, null, 2)}`;
    }

    if (options.type === 'AI_ERROR') {
        console.error(logMessage);
    } else {
        console.log(logMessage);
    }
};

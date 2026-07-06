// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;
import mammoth from 'mammoth';

export type SupportedFileType = 'md' | 'pdf' | 'docx';

/**
 * Detects the file type from its extension.
 */
export function detectFileType(originalName: string): SupportedFileType {
    const lower = originalName.toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.docx')) return 'docx';
    return 'md';
}

/**
 * Extracts plain text from a file buffer based on its type.
 * - .md  → returns the buffer as UTF-8 string (no conversion)
 * - .pdf → uses pdf-parse to extract text
 * - .docx → uses mammoth to extract raw text
 */
export async function extractText(buffer: Buffer, fileType: SupportedFileType): Promise<string> {
    switch (fileType) {
        case 'pdf': {
            const data = await pdfParse(buffer);
            return data.text;
        }
        case 'docx': {
            const result = await mammoth.extractRawText({ buffer });
            return result.value;
        }
        case 'md':
        default:
            return buffer.toString('utf-8').replace(/\0/g, '');
    }
}

/**
 * Converts extracted plain text into a minimal Markdown-like format
 * so the existing heading-based chunker can process PDF/Word content.
 *
 * Strategy:
 *  - Lines that look like headings (short, no period at end, not lowercase) → ## heading
 *  - Everything else stays as paragraph text
 */
export function normaliseToMarkdown(text: string): string {
    const lines = text.split('\n');
    const output: string[] = [];

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
            output.push('');
            continue;
        }

        const isLikelyHeading =
            line.length < 80 &&
            !line.endsWith('.') &&
            !line.endsWith(',') &&
            /^[A-Z0-9]/.test(line) &&
            !/^[a-z]/.test(line);

        if (isLikelyHeading) {
            output.push(`## ${line}`);
        } else {
            output.push(line);
        }
    }

    return output.join('\n');
}

// ---------------------------------------------------------------------------
// Shared Text Parser Utilities
// Centralised here so knowledgeUpload.service.ts and jobWorker.service.ts
// share a single, canonical implementation. Any regex fix made here
// propagates to both pipelines automatically.
// ---------------------------------------------------------------------------

/**
 * Split markdown content into semantic chunks by ## headings.
 * Returns { heading, body } pairs. Skips empty sections.
 */
export function chunkByHeadings(
    content: string,
    fallbackTopic: string
): Array<{ heading: string; body: string }> {
    const chunks: Array<{ heading: string; body: string }> = [];
    const sections = content.split(/^(?=## )/m);

    for (const section of sections) {
        const trimmed = section.trim();
        if (!trimmed) continue;

        const headingMatch = trimmed.match(/^## (.+)/);
        if (headingMatch) {
            const heading = headingMatch[1].trim();
            const body = trimmed.replace(/^## .+\n?/, '').trim();
            if (body.length > 20) {
                chunks.push({ heading, body });
            }
        } else if (trimmed.length > 20) {
            chunks.push({ heading: fallbackTopic, body: trimmed });
        }
    }

    return chunks;
}

/**
 * Custom parser for PYQ files. Extracts marks, year, and question text.
 */
export function parsePyqContent(
    content: string,
    fallbackTopic: string,
    fallbackYear: number | null
): Array<{ topic: string; chunk_text: string; marks: number | null; year: number | null }> {
    const chunks: Array<{ topic: string; chunk_text: string; marks: number | null; year: number | null }> = [];
    const sections = content.split(/^(?=## |(?:Q?\d+\.)(?:\s+|$))/m);

    for (const section of sections) {
        const trimmed = section.trim();
        if (!trimmed) continue;

        const headingMatch = trimmed.match(/^(?:## |(?:Q?\d+\.))\s*(.*)/);
        if (headingMatch && headingMatch[1].trim()) {
            let heading = headingMatch[1].trim();
            let body = trimmed.replace(/^(?:## |(?:Q?\d+\.))\s*.*\n?/, '').trim();

            let marks: number | null = null;
            const marksMatch = heading.match(/(?:\[|\()?\s*(\d+)\s*(?:marks?|m)\s*(?:\]|\))?/i);
            if (marksMatch) {
                marks = parseInt(marksMatch[1], 10);
                heading = heading.replace(marksMatch[0], '').trim();
            } else {
                const bodyMarksMatch = body.match(/(?:\[|\()?\s*(\d+)\s*(?:marks?|m)\s*(?:\]|\))?/i);
                if (bodyMarksMatch) {
                    marks = parseInt(bodyMarksMatch[1], 10);
                }
            }

            let year: number | null = fallbackYear;
            const yearMatch = heading.match(/(?:\[|\()?\s*(20\d{2})\s*(?:\]|\))?/);
            if (yearMatch) {
                year = parseInt(yearMatch[1], 10);
                heading = heading.replace(yearMatch[0], '').trim();
            } else {
                const bodyYearMatch = body.match(/(?:\[|\()?\s*(20\d{2})\s*(?:\]|\))?/);
                if (bodyYearMatch) {
                    year = parseInt(bodyYearMatch[1], 10);
                }
            }

            // Clean up heading punctuation
            heading = heading.replace(/^[\s\-\:]+|[\s\-\:]+$/g, '').trim();

            if (heading.length > 3 || body.length > 5) {
                const chunk_text = body ? `${heading}\n\n${body}` : heading;
                chunks.push({ topic: fallbackTopic, chunk_text: chunk_text.trim(), marks, year });
            }
        } else if (trimmed.length > 10) {
            let marks: number | null = null;
            const marksMatch = trimmed.match(/(?:\[|\()?\s*(\d+)\s*(?:marks?|m)\s*(?:\]|\))?/i);
            if (marksMatch) marks = parseInt(marksMatch[1], 10);

            let year: number | null = fallbackYear;
            const yearMatch = trimmed.match(/(?:\[|\()?\s*(20\d{2})\s*(?:\]|\))?/);
            if (yearMatch) year = parseInt(yearMatch[1], 10);

            chunks.push({ topic: fallbackTopic, chunk_text: trimmed, marks, year });
        }
    }

    return chunks;
}

/**
 * Extract bullet-point subtopics from a chunk body.
 * Returns lines beginning with a list marker (-, *, •) that are longer than 4 chars.
 */
export function extractSubtopics(chunkText: string): string[] {
    if (!chunkText || chunkText.trim() === '') return [];
    const lines = chunkText.split(/\r?\n/);
    const subtopics: string[] = [];
    for (const line of lines) {
        const match = line.match(/^\s*[-*•]\s+(.+)/);
        if (match && match[1].trim().length > 4) {
            subtopics.push(match[1].trim());
        }
    }
    return subtopics;
}

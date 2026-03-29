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

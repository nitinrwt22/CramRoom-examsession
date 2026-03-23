/**
 * ingestContent.ts
 *
 * Ingestion pipeline for CramRoom markdown knowledge files.
 *
 * What it does:
 *   1. Walks the content/ directory recursively to find all .md files
 *   2. Parses YAML frontmatter (session_tags, type, topic) via gray-matter
 *   3. Matches session_tags → sessions table (by subject name LIKE query)
 *   4. Inserts (or retrieves) file metadata in the `files` table
 *   5. Chunks markdown by ## headings
 *   6. Stores chunks in session_ai_chunks (with file_id, topic, chunk_text)
 *
 * Design notes:
 *   - Knowledge files are stored in `files` (not session_files, which is for uploads)
 *   - Session relationship is captured directly in session_ai_chunks via session_id
 *   - Idempotent: deduplicates by file_path; skips already-ingested chunks
 *
 * Run:
 *   npx ts-node scripts/ingestContent.ts
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import pool from '../src/config/database';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONTENT_DIR = path.resolve(__dirname, '../../content');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all .md files under a directory, skip README.md */
function walkMarkdownFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkMarkdownFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
            results.push(fullPath);
        }
    }
    return results;
}

/**
 * Split markdown content (after stripping frontmatter) into semantically
 * meaningful chunks where each ## heading starts a new chunk.
 *
 * Returns an array of { heading, body } objects.
 */
function chunkByHeadings(content: string, fallbackTopic: string): Array<{ heading: string; body: string }> {
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
            // Content before first ## — use the file topic as the heading
            chunks.push({ heading: fallbackTopic, body: trimmed });
        }
    }

    return chunks;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/** Find session IDs whose subject matches any of the given tags */
async function findMatchingSessionIds(tags: string[]): Promise<number[]> {
    if (!tags || tags.length === 0) return [];

    const matched = new Set<number>();
    for (const tag of tags) {
        // Match both hyphenated form ("cpu-scheduling") and space form ("cpu scheduling")
        const result = await pool.query(
            `SELECT id FROM sessions WHERE LOWER(subject) LIKE LOWER($1) OR LOWER(subject) LIKE LOWER($2)`,
            [`%${tag}%`, `%${tag.replace(/-/g, ' ')}%`]
        );
        for (const row of result.rows) {
            matched.add(row.id);
        }
    }
    return Array.from(matched);
}

/**
 * Insert a knowledge file record into the `files` table.
 * If a record with the same file_path already exists, return its id.
 */
async function upsertFileRecord(
    title: string,
    topic: string,
    contentType: string,
    filePath: string
): Promise<number> {
    // Check for existing record (idempotency)
    const existing = await pool.query(
        `SELECT id FROM files WHERE file_path = $1`,
        [filePath]
    );
    if (existing.rows.length > 0) {
        console.log(`    ↩  Already in files table — file_id=${existing.rows[0].id}`);
        return existing.rows[0].id;
    }

    const result = await pool.query(
        `INSERT INTO files (title, topic, content_type, file_path)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [title, topic, contentType, filePath]
    );
    return result.rows[0].id;
}

/** Save a knowledge chunk into session_ai_chunks */
async function saveKnowledgeChunk(
    sessionId: number,
    fileId: number,
    topic: string,
    chunkText: string
): Promise<void> {
    await pool.query(
        `INSERT INTO session_ai_chunks (session_id, file_id, topic, chunk_text)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, fileId, topic, chunkText]
    );
}

/** Check if chunks for this file+session combo already exist */
async function chunksAlreadyExist(sessionId: number, fileId: number): Promise<boolean> {
    const result = await pool.query(
        `SELECT 1 FROM session_ai_chunks WHERE session_id = $1 AND file_id = $2 LIMIT 1`,
        [sessionId, fileId]
    );
    return result.rows.length > 0;
}

// ---------------------------------------------------------------------------
// Main ingestion loop
// ---------------------------------------------------------------------------

async function ingest(): Promise<void> {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  CramRoom Content Ingestion Pipeline');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Content directory: ${CONTENT_DIR}\n`);

    if (!fs.existsSync(CONTENT_DIR)) {
        console.error(`ERROR: content/ directory not found at ${CONTENT_DIR}`);
        process.exit(1);
    }

    const mdFiles = walkMarkdownFiles(CONTENT_DIR);
    console.log(`Found ${mdFiles.length} markdown file(s)\n`);

    let totalChunks = 0;
    let totalSkipped = 0;

    for (const absolutePath of mdFiles) {
        const relativePath = path.relative(path.resolve(__dirname, '../../'), absolutePath);
        console.log(`▶ ${relativePath}`);

        // 1. Parse
        const raw = fs.readFileSync(absolutePath, 'utf-8');
        const parsed = matter(raw);
        const fm = parsed.data as {
            session_tags?: string[];
            type?: string;
            topic?: string;
        };

        const sessionTags: string[] = fm.session_tags || [];
        const contentType: string = fm.type || path.basename(path.dirname(absolutePath));
        const topic: string = fm.topic || path.basename(absolutePath, '.md').replace(/-/g, ' ');
        const title: string = topic;

        console.log(`    tags     : [${sessionTags.join(', ')}]`);
        console.log(`    type     : ${contentType}  |  topic : ${topic}`);

        if (sessionTags.length === 0) {
            console.log(`    ⚠ No session_tags — skipping\n`);
            continue;
        }

        // 2. Match sessions
        const sessionIds = await findMatchingSessionIds(sessionTags);
        if (sessionIds.length === 0) {
            console.log(`    ⚠ No matching sessions found for tags [${sessionTags.join(', ')}] — skipping\n`);
            continue;
        }
        console.log(`    sessions : [${sessionIds.join(', ')}]`);

        // 3. Upsert file record
        const fileId = await upsertFileRecord(title, topic, contentType, relativePath);
        console.log(`    file_id  : ${fileId}`);

        // 4. Chunk markdown
        const chunks = chunkByHeadings(parsed.content, topic);
        console.log(`    chunks   : ${chunks.length}`);

        // 5. Insert chunks per session (skip if already done)
        for (const sId of sessionIds) {
            const alreadyDone = await chunksAlreadyExist(sId, fileId);
            if (alreadyDone) {
                console.log(`    ↩  Chunks already exist for session ${sId} — skipping`);
                totalSkipped += chunks.length;
                continue;
            }
            for (const chunk of chunks) {
                await saveKnowledgeChunk(sId, fileId, chunk.heading, chunk.body);
                totalChunks++;
            }
        }

        console.log('');
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Done!`);
    console.log(`  Files found     : ${mdFiles.length}`);
    console.log(`  Chunks stored   : ${totalChunks}`);
    console.log(`  Chunks skipped  : ${totalSkipped} (already ingested)`);
    console.log('═══════════════════════════════════════════════════════');

    await pool.end();
}

ingest().catch((err) => {
    console.error('\nIngestion failed:', err);
    process.exit(1);
});

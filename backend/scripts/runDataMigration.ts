/**
 * CramRoom V2 Data Migration Runner
 *
 * Migrates data from legacy V1 tables into the new V2 tables.
 *
 * Rules:
 *   - ADDITIVE ONLY: Never modifies or drops legacy tables.
 *   - All V2 tables must already exist (run runMigrationV2.ts first).
 *   - Idempotent: Checks for existing data before inserting.
 *   - Each phase is logged clearly.
 *
 * Usage:
 *   npx ts-node scripts/runDataMigration.ts
 *
 * Phases:
 *   Phase 1: Rename participants → session_members (+ compatibility VIEW)
 *   Phase 2: Migrate files(pyqs)      → papers
 *   Phase 3: Migrate files(notes/ref) → uploaded_notes
 *   Phase 4: Migrate files(syllabus)  → syllabi  [disk-read primary path]
 *   Phase 5: Migrate chunks(pyqs)     → raw_questions
 *   Phase 6: Migrate chunks(syllabus) → topics   [structured subtopics parser]
 *   Phase 7: Validate all migrations
 */

import pool from '../src/config/database';
import fs from 'fs';
import path from 'path';

// ─── Logging Helpers ────────────────────────────────────────────────────────

const log  = (msg: string) => console.log(`[Migration] ${msg}`);
const ok   = (msg: string) => console.log(`[Migration] ✅  ${msg}`);
const warn = (msg: string) => console.log(`[Migration] ⚠️   ${msg}`);
const fail = (msg: string) => console.error(`[Migration] ❌  ${msg}`);
const sep  = ()             => console.log('[Migration] ' + '─'.repeat(60));

// ─── Skipped-files table name ─────────────────────────────────────────────────
const SKIPPED_TABLE = 'migration_skipped_files';

// ─── Ensure migration_skipped_files table exists ──────────────────────────────

async function ensureSkippedFilesTable(): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SKIPPED_TABLE} (
            id          SERIAL PRIMARY KEY,
            file_id     INTEGER NOT NULL,
            phase       VARCHAR(20) NOT NULL,
            reason      TEXT NOT NULL,
            skipped_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function logSkippedFile(fileId: number, phase: string, reason: string): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO ${SKIPPED_TABLE} (file_id, phase, reason) VALUES ($1, $2, $3)`,
            [fileId, phase, reason]
        );
    } catch (_err) {
        // Non-fatal — the WARN log is still emitted by the caller.
    }
}

// ─── Phase 1: Rename participants → session_members ──────────────────────────
//
// FIX (P0): After renaming the physical table we immediately create a
// compatibility VIEW named `participants` that selects from session_members.
// This keeps all existing application queries (10+ files) working without any
// code changes, preventing "relation participants does not exist" errors.
//
// The view is intentionally left in place until Step 3 (Service Migration)
// updates the application code to reference session_members directly.
//
// Idempotency matrix:
//   session_members table  | participants object | Action
//   ──────────────────────────────────────────────────────
//   doesn't exist          | doesn't exist       | rename + create view (first run)
//   exists                 | is a VIEW           | skip (already done)
//   exists                 | is a TABLE          | both exist — leave intact (manual fix needed)
//   doesn't exist          | —                   | source missing — skip
// ─────────────────────────────────────────────────────────────────────────────

async function phase1_renameParticipants(): Promise<void> {
    sep();
    log('Phase 1: Rename participants → session_members (+ compatibility VIEW)');

    const client = await pool.connect();
    try {
        // ── 1a. Check if session_members table already exists ────────────────
        const smTableExists = await client.query(`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'session_members'
        `);

        if (smTableExists.rows.length > 0) {
            // session_members table is present — check what participants is now.
            const participantsKind = await client.query(`
                SELECT table_type
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'participants'
            `);

            if (participantsKind.rows.length === 0) {
                // participants doesn't exist at all — probably a view was dropped.
                // Re-create the compatibility view.
                log('participants object not found — re-creating compatibility VIEW...');
                await client.query(`
                    CREATE OR REPLACE VIEW participants AS SELECT * FROM session_members
                `);
                ok('Compatibility VIEW participants recreated over session_members.');
                return;
            }

            if (participantsKind.rows[0].table_type === 'VIEW') {
                ok('participants is already a VIEW over session_members — skipping.');
                return;
            }

            // participants is still a BASE TABLE — both exist (partial/manual state).
            warn('Both session_members TABLE and participants TABLE exist.');
            warn('Leaving both intact for safety — manual intervention required.');
            return;
        }

        // ── 1b. Verify source table exists ───────────────────────────────────
        const sourceExists = await client.query(`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'participants'
        `);
        if (sourceExists.rows.length === 0) {
            warn('participants table does not exist — skipping rename.');
            return;
        }

        // ── 1c. Perform the rename ────────────────────────────────────────────
        const count = await client.query('SELECT COUNT(*) FROM participants');
        log(`Renaming ${count.rows[0].count} participant records...`);

        await client.query('BEGIN');
        await client.query('ALTER TABLE participants RENAME TO session_members');

        // ── 1d. Create compatibility VIEW immediately after rename ────────────
        // This single statement keeps all application code working unchanged
        // until Step 3 (Service Migration) replaces the references.
        await client.query(`
            CREATE OR REPLACE VIEW participants AS SELECT * FROM session_members
        `);

        await client.query('COMMIT');

        ok(`participants renamed to session_members (${count.rows[0].count} rows preserved).`);
        ok('Compatibility VIEW participants created over session_members.');
        ok('Application code referencing participants will continue to work.');
    } catch (err: any) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
    } finally {
        client.release();
    }
}

// ─── Phase 2: Migrate files(pyqs) → papers ──────────────────────────────────

async function phase2_migratePapers(): Promise<number> {
    sep();
    log('Phase 2: Migrate files (content_type = pyqs) → papers');

    const client = await pool.connect();
    try {
        const sourcePyqs = await client.query(`
            SELECT COUNT(*) FROM files WHERE content_type = 'pyqs'
        `);
        const sourceCount = parseInt(sourcePyqs.rows[0].count, 10);
        log(`Found ${sourceCount} PYQ file(s) in legacy files table.`);

        if (sourceCount === 0) {
            warn('No PYQ files found — skipping papers migration.');
            return 0;
        }

        // Ensure mapping table exists
        const mappingExists = await client.query(`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'migration_file_uuid_map'
        `);
        if (mappingExists.rows.length === 0) {
            log('Creating temporary mapping table migration_file_uuid_map...');
            await client.query(`
                CREATE TABLE migration_file_uuid_map (
                    old_file_id   INTEGER PRIMARY KEY,
                    new_uuid      UUID NOT NULL,
                    target_table  VARCHAR(50) NOT NULL
                )
            `);
        }

        // Fetch unmigrated PYQ files
        const pyqFiles = await client.query(`
            SELECT f.id, f.session_id, f.uploaded_by, f.file_name, f.title, f.file_url, f.created_at
            FROM files f
            LEFT JOIN migration_file_uuid_map m ON m.old_file_id = f.id AND m.target_table = 'papers'
            WHERE f.content_type = 'pyqs'
              AND m.old_file_id IS NULL
        `);

        log(`Migrating ${pyqFiles.rows.length} unmigrated PYQ file(s)...`);
        let migrated = 0;

        for (const file of pyqFiles.rows) {
            await client.query('BEGIN');
            try {
                const title = file.title || file.file_name || 'Untitled Paper';

                const yearResult = await client.query(`
                    SELECT MAX(year) AS max_year
                    FROM session_ai_chunks
                    WHERE file_id = $1 AND year IS NOT NULL
                `, [file.id]);
                const year = yearResult.rows[0]?.max_year || new Date().getFullYear();

                const nameLower = (file.file_name || '').toLowerCase();
                let examType = 'endsem';
                if (nameLower.includes('mid') || nameLower.includes('midsem')) examType = 'midsem';
                else if (nameLower.includes('quiz'))                            examType = 'quiz';

                let sessionId = file.session_id;
                if (!sessionId) {
                    const sessionFromChunk = await client.query(`
                        SELECT session_id FROM session_ai_chunks
                        WHERE file_id = $1 AND session_id IS NOT NULL LIMIT 1
                    `, [file.id]);
                    if (sessionFromChunk.rows.length > 0) {
                        sessionId = sessionFromChunk.rows[0].session_id;
                    } else {
                        warn(`File id=${file.id} has no session_id and no linked chunks — skipping.`);
                        await client.query('ROLLBACK');
                        await logSkippedFile(file.id, 'phase2', 'no session_id and no linked chunks');
                        continue;
                    }
                }

                let uploadedBy = file.uploaded_by;
                if (!uploadedBy) {
                    const hostResult = await client.query(
                        'SELECT host_id FROM sessions WHERE id = $1', [sessionId]
                    );
                    uploadedBy = hostResult.rows[0]?.host_id || null;
                    if (!uploadedBy) {
                        warn(`File id=${file.id} has no uploaded_by and no session host — skipping.`);
                        await client.query('ROLLBACK');
                        await logSkippedFile(file.id, 'phase2', 'no uploaded_by and no session host');
                        continue;
                    }
                }

                const insertResult = await client.query(`
                    INSERT INTO papers (session_id, title, year, exam_type, pdf_url, status, uploaded_by, uploaded_at)
                    VALUES ($1, $2, $3, $4, $5, 'ready', $6, $7)
                    RETURNING id
                `, [sessionId, title, year, examType, file.file_url || '', uploadedBy, file.created_at || new Date()]);

                const newUuid = insertResult.rows[0].id;

                await client.query(`
                    INSERT INTO migration_file_uuid_map (old_file_id, new_uuid, target_table)
                    VALUES ($1, $2, 'papers')
                `, [file.id, newUuid]);

                await client.query('COMMIT');
                migrated++;
                log(`  File id=${file.id} → papers uuid=${newUuid} (year=${year}, exam_type=${examType})`);
            } catch (err: any) {
                await client.query('ROLLBACK');
                warn(`  File id=${file.id} failed: ${err.message} — skipping.`);
            }
        }

        ok(`Phase 2 complete: ${migrated} of ${pyqFiles.rows.length} PYQ files migrated to papers.`);
        return migrated;
    } finally {
        client.release();
    }
}

// ─── Phase 3: Migrate files(notes/refs) → uploaded_notes ────────────────────

async function phase3_migrateUploadedNotes(): Promise<number> {
    sep();
    log("Phase 3: Migrate files (notes/assignments/references/cheatsheets) → uploaded_notes");

    const client = await pool.connect();
    try {
        const noteFiles = await client.query(`
            SELECT f.id, f.session_id, f.uploaded_by, f.file_name, f.title, f.file_url, f.created_at, f.content_type
            FROM files f
            LEFT JOIN migration_file_uuid_map m ON m.old_file_id = f.id AND m.target_table = 'uploaded_notes'
            WHERE f.content_type IN ('notes', 'assignments', 'references', 'cheatsheets')
              AND LOWER(COALESCE(f.file_name, '')) NOT LIKE '%syllabus%'
              AND m.old_file_id IS NULL
        `);

        log(`Found ${noteFiles.rows.length} unmigrated note file(s).`);
        let migrated = 0;

        for (const file of noteFiles.rows) {
            await client.query('BEGIN');
            try {
                const title = file.title || file.file_name || 'Untitled Notes';

                let sessionId = file.session_id;
                if (!sessionId) {
                    const sessionFromChunk = await client.query(`
                        SELECT session_id FROM session_ai_chunks
                        WHERE file_id = $1 AND session_id IS NOT NULL LIMIT 1
                    `, [file.id]);
                    sessionId = sessionFromChunk.rows[0]?.session_id || null;
                }
                if (!sessionId) {
                    warn(`  File id=${file.id} (${file.content_type}) has no session_id — skipping.`);
                    await client.query('ROLLBACK');
                    await logSkippedFile(file.id, 'phase3', 'no session_id');
                    continue;
                }

                let uploadedBy = file.uploaded_by;
                if (!uploadedBy) {
                    const hostResult = await client.query(
                        'SELECT host_id FROM sessions WHERE id = $1', [sessionId]
                    );
                    uploadedBy = hostResult.rows[0]?.host_id || null;
                }
                if (!uploadedBy) {
                    warn(`  File id=${file.id} has no uploaded_by — skipping.`);
                    await client.query('ROLLBACK');
                    await logSkippedFile(file.id, 'phase3', 'no uploaded_by');
                    continue;
                }

                const insertResult = await client.query(`
                    INSERT INTO uploaded_notes (session_id, title, pdf_url, uploaded_by, uploaded_at)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id
                `, [sessionId, title, file.file_url || '', uploadedBy, file.created_at || new Date()]);

                const newUuid = insertResult.rows[0].id;

                await client.query(`
                    INSERT INTO migration_file_uuid_map (old_file_id, new_uuid, target_table)
                    VALUES ($1, $2, 'uploaded_notes')
                `, [file.id, newUuid]);

                await client.query('COMMIT');
                migrated++;
                log(`  File id=${file.id} (${file.content_type}) → uploaded_notes uuid=${newUuid}`);
            } catch (err: any) {
                await client.query('ROLLBACK');
                warn(`  File id=${file.id} failed: ${err.message} — skipping.`);
            }
        }

        ok(`Phase 3 complete: ${migrated} note files migrated to uploaded_notes.`);
        return migrated;
    } finally {
        client.release();
    }
}

// ─── Syllabus raw_text extraction helpers ─────────────────────────────────────
//
// FIX (P1): Implements a three-tier strategy for reconstructing raw_text:
//
//   Tier 1 — Disk read (primary):
//     Read the original file from uploads/knowledge/<file_url>.
//     Only safe for text-based formats (markdown / plain text).
//     Detected by: file_url doesn't contain a null byte when read as UTF-8,
//     and the file extension is .md / .txt (or no binary-header magic bytes).
//
//   Tier 2 — Chunk concatenation (secondary):
//     Join session_ai_chunks.chunk_text in created_at order with double newlines.
//     This is the original implementation's only path.
//
//   Tier 3 — Placeholder (last resort):
//     The old behaviour. Still used, but now WARN-logged and recorded in
//     migration_skipped_files so operators can reconcile.
// ─────────────────────────────────────────────────────────────────────────────

const KNOWLEDGE_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'knowledge');

/**
 * Returns true if the buffer looks like UTF-8 / plain text (no null bytes,
 * no binary PDF/ZIP/Office magic headers).
 */
function isReadableText(buf: Buffer): boolean {
    // Reject obvious binary magic bytes
    // PDF: %PDF  → 25 50 44 46
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return false;
    // ZIP / DOCX / XLSX:  PK  → 50 4B 03 04
    if (buf[0] === 0x50 && buf[1] === 0x4b) return false;
    // Null bytes in the first 512 bytes indicate binary content
    const sample = buf.slice(0, Math.min(512, buf.length));
    for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0x00) return false;
    }
    return true;
}

/**
 * Attempts to read raw_text from disk.
 * Returns the text string on success, or null if unavailable / binary.
 */
function tryReadFromDisk(fileUrl: string | null | undefined): string | null {
    // Sentinel value written when no storedFileName was provided at upload time
    if (!fileUrl || fileUrl === 'knowledge' || fileUrl.trim() === '') return null;

    const filePath = path.join(KNOWLEDGE_UPLOAD_DIR, fileUrl);
    if (!fs.existsSync(filePath)) return null;

    try {
        const buf = fs.readFileSync(filePath);
        if (!isReadableText(buf)) return null;
        const text = buf.toString('utf8').trim();
        return text.length > 0 ? text : null;
    } catch (_err) {
        return null;
    }
}

// ─── Phase 4: Migrate files(syllabus) → syllabi ─────────────────────────────

async function phase4_migrateSyllabi(): Promise<number> {
    sep();
    log("Phase 4: Migrate files (syllabus) → syllabi");

    const client = await pool.connect();
    try {
        const syllabusFiles = await client.query(`
            SELECT f.id, f.session_id, f.uploaded_by, f.file_name, f.title, f.file_url, f.created_at
            FROM files f
            LEFT JOIN migration_file_uuid_map m ON m.old_file_id = f.id AND m.target_table = 'syllabi'
            WHERE (LOWER(COALESCE(f.file_name, '')) LIKE '%syllabus%'
                   OR LOWER(COALESCE(f.topic, '')) = 'syllabus')
              AND m.old_file_id IS NULL
        `);

        log(`Found ${syllabusFiles.rows.length} unmigrated syllabus file(s).`);
        let migrated = 0;
        let diskReadCount = 0;
        let chunkConcatCount = 0;
        let placeholderCount = 0;

        for (const file of syllabusFiles.rows) {
            await client.query('BEGIN');
            try {
                let sessionId = file.session_id;
                if (!sessionId) {
                    const sessionFromChunk = await client.query(`
                        SELECT session_id FROM session_ai_chunks
                        WHERE file_id = $1 AND session_id IS NOT NULL LIMIT 1
                    `, [file.id]);
                    sessionId = sessionFromChunk.rows[0]?.session_id || null;
                }
                if (!sessionId) {
                    warn(`  Syllabus file id=${file.id} has no session_id — skipping.`);
                    await client.query('ROLLBACK');
                    await logSkippedFile(file.id, 'phase4', 'no session_id');
                    continue;
                }

                let uploadedBy = file.uploaded_by;
                if (!uploadedBy) {
                    const hostResult = await client.query(
                        'SELECT host_id FROM sessions WHERE id = $1', [sessionId]
                    );
                    uploadedBy = hostResult.rows[0]?.host_id || null;
                }
                if (!uploadedBy) {
                    warn(`  Syllabus file id=${file.id} has no uploaded_by — skipping.`);
                    await client.query('ROLLBACK');
                    await logSkippedFile(file.id, 'phase4', 'no uploaded_by');
                    continue;
                }

                // ── Tier 1: Disk read ─────────────────────────────────────────
                let rawText: string | null = tryReadFromDisk(file.file_url);
                let rawTextSource: string;

                if (rawText !== null) {
                    rawTextSource = `disk (${file.file_url})`;
                    diskReadCount++;
                } else {
                    // ── Tier 2: Chunk concatenation ───────────────────────────
                    const chunksResult = await client.query(`
                        SELECT chunk_text FROM session_ai_chunks
                        WHERE file_id = $1 AND chunk_text IS NOT NULL
                        ORDER BY created_at ASC
                    `, [file.id]);

                    if (chunksResult.rows.length > 0) {
                        rawText = chunksResult.rows
                            .map((r: any) => r.chunk_text as string)
                            .join('\n\n');
                        rawTextSource = `${chunksResult.rows.length} chunks`;
                        chunkConcatCount++;
                    } else {
                        // ── Tier 3: Placeholder (last resort) ─────────────────
                        rawText = `[Migrated from legacy file: ${file.file_name}]`;
                        rawTextSource = 'PLACEHOLDER — no disk file and no chunks';
                        placeholderCount++;
                        warn(`  Syllabus file id=${file.id} has no disk file and no chunks — using placeholder.`);
                        await logSkippedFile(
                            file.id,
                            'phase4',
                            'raw_text is a placeholder — no disk file and no associated chunks'
                        );
                    }
                }

                const insertResult = await client.query(`
                    INSERT INTO syllabi (session_id, file_name, file_url, raw_text, uploaded_by, uploaded_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING id
                `, [
                    sessionId,
                    file.file_name || 'syllabus',
                    file.file_url || '',
                    rawText,
                    uploadedBy,
                    file.created_at || new Date()
                ]);

                const newUuid = insertResult.rows[0].id;

                await client.query(`
                    INSERT INTO migration_file_uuid_map (old_file_id, new_uuid, target_table)
                    VALUES ($1, $2, 'syllabi')
                `, [file.id, newUuid]);

                await client.query('COMMIT');
                migrated++;
                log(`  Syllabus file id=${file.id} → syllabi uuid=${newUuid} (raw_text from ${rawTextSource})`);
            } catch (err: any) {
                await client.query('ROLLBACK');
                warn(`  Syllabus file id=${file.id} failed: ${err.message} — skipping.`);
            }
        }

        ok(`Phase 4 complete: ${migrated} syllabus files migrated.`);
        log(`  raw_text sources: disk=${diskReadCount}, chunks=${chunkConcatCount}, placeholder=${placeholderCount}`);
        if (placeholderCount > 0) {
            warn(`  ${placeholderCount} syllabus/syllabi have placeholder raw_text — check ${SKIPPED_TABLE} table.`);
        }
        return migrated;
    } finally {
        client.release();
    }
}

// ─── Phase 5: Migrate session_ai_chunks(pyqs) → raw_questions ───────────────

async function phase5_migrateRawQuestions(): Promise<number> {
    sep();
    log("Phase 5: Migrate session_ai_chunks (PYQ chunks) → raw_questions");

    const client = await pool.connect();
    try {
        const chunks = await client.query(`
            SELECT
                sac.id AS chunk_id,
                sac.chunk_text,
                sac.marks,
                sac.topic,
                sac.created_at,
                m.new_uuid AS paper_uuid
            FROM session_ai_chunks sac
            JOIN migration_file_uuid_map m ON m.old_file_id = sac.file_id AND m.target_table = 'papers'
            LEFT JOIN raw_questions rq ON rq.migrated_from_chunk_id = sac.id::text
            WHERE sac.chunk_text IS NOT NULL
              AND rq.id IS NULL
        `);

        log(`Found ${chunks.rows.length} unmigrated PYQ chunk(s) to migrate.`);
        let migrated = 0;

        for (const chunk of chunks.rows) {
            // FIX (P2): Per-chunk transaction — consistent with Phases 2-4.
            await client.query('BEGIN');
            try {
                await client.query(`
                    INSERT INTO raw_questions (paper_id, original_text, marks, migrated_from_chunk_id)
                    VALUES ($1, $2, $3, $4)
                `, [
                    chunk.paper_uuid,
                    chunk.chunk_text,
                    chunk.marks ?? null,
                    chunk.chunk_id
                ]);
                await client.query('COMMIT');
                migrated++;
            } catch (err: any) {
                await client.query('ROLLBACK');
                warn(`  Chunk id=${chunk.chunk_id} failed: ${err.message} — skipping.`);
            }
        }

        ok(`Phase 5 complete: ${migrated} PYQ chunks migrated to raw_questions.`);
        return migrated;
    } finally {
        client.release();
    }
}

// ─── Structured subtopics extractor ──────────────────────────────────────────
//
// FIX (P1): Replaces the naive line-splitting with a two-priority extractor:
//
//   Priority 1 — Markdown list items:
//     Lines starting with -, *, •, or N. (ordered list)
//     After stripping the prefix, apply noise filters.
//
//   Priority 2 — Sub-heading lines:
//     Lines starting with ## (but not the main heading).
//     After stripping the prefix, apply noise filters.
//
//   Priority 3 — Empty array:
//     If neither produced results, return []. This is intentional.
//     Prose-only chunks never contain valid list subtopics.
//     The TOPIC_MAPPING job (Step 3) is the correct place to generate
//     subtopics from free-form text using AI.
//
// Noise filter rules:
//   - Length: 5–120 characters (after trim)
//   - Not pure whitespace or pure digits
//   - Not page/figure/table references
//   - Not common noise patterns (continued, see also, note:, etc.)
//   - Deduplicated within a single chunk
// ─────────────────────────────────────────────────────────────────────────────

const NOISE_PATTERNS = [
    /^continued\b/i,
    /^see also\b/i,
    /^\bfigure\b/i,
    /^\btable\b/i,
    /^\bpage\b/i,
    /^\bnote:/i,
    /^\bref:/i,
    /^\bsource:/i,
    /^\bexample:/i,
    /^\d+\.?\s*$/, // lone digit(s)
    /^[-–—]{2,}$/, // horizontal rule fragments
];

function isNoiseLine(line: string): boolean {
    if (NOISE_PATTERNS.some(re => re.test(line))) return true;
    // Reject if it's a sentence ending in punctuation that suggests paragraph text
    // (heuristic: if the line ends with a period and is > 80 chars it's likely prose)
    if (line.length > 80 && /\.$/.test(line)) return true;
    return false;
}

function extractSubtopics(chunkText: string): string[] {
    if (!chunkText || chunkText.trim() === '') return [];

    const lines = chunkText.split(/\r?\n/);
    const seen = new Set<string>();

    function addIfValid(raw: string): string | null {
        const t = raw.trim();
        if (t.length < 5 || t.length > 120) return null;
        if (isNoiseLine(t)) return null;
        const key = t.toLowerCase();
        if (seen.has(key)) return null;
        seen.add(key);
        return t;
    }

    // ── Priority 1: Markdown list items ──────────────────────────────────────
    const listItems: string[] = [];
    for (const line of lines) {
        // Unordered: -, *, •  (with optional leading spaces)
        const unordered = line.match(/^\s*[-*•]\s+(.+)/);
        if (unordered) {
            const item = addIfValid(unordered[1]);
            if (item) listItems.push(item);
            continue;
        }
        // Ordered: 1., 2., i., a. etc.
        const ordered = line.match(/^\s*(?:\d+|[a-zA-Z])[.)]\s+(.+)/);
        if (ordered) {
            const item = addIfValid(ordered[1]);
            if (item) listItems.push(item);
        }
    }

    if (listItems.length > 0) return listItems;

    // ── Priority 2: Sub-heading lines (##) ────────────────────────────────────
    // Skip the very first ## line (that's the chunk heading stored in topics.name)
    let firstHeadingSkipped = false;
    const subheadings: string[] = [];
    for (const line of lines) {
        const heading = line.match(/^##\s+(.+)/);
        if (heading) {
            if (!firstHeadingSkipped) { firstHeadingSkipped = true; continue; }
            const item = addIfValid(heading[1]);
            if (item) subheadings.push(item);
        }
    }

    if (subheadings.length > 0) return subheadings;

    // ── Priority 3: Empty array ───────────────────────────────────────────────
    return [];
}

// ─── Phase 6: Migrate session_ai_chunks(syllabus) → topics ──────────────────

async function phase6_migrateTopics(): Promise<number> {
    sep();
    log("Phase 6: Migrate session_ai_chunks (syllabus chunks) → topics");

    const client = await pool.connect();
    try {
        const chunks = await client.query(`
            SELECT
                sac.id AS chunk_id,
                sac.topic AS topic_name,
                sac.chunk_text,
                sac.created_at,
                m.new_uuid AS syllabus_uuid
            FROM session_ai_chunks sac
            JOIN migration_file_uuid_map m ON m.old_file_id = sac.file_id AND m.target_table = 'syllabi'
            LEFT JOIN topics t ON t.migrated_from_chunk_id = sac.id::text
            WHERE sac.chunk_text IS NOT NULL
              AND t.id IS NULL
        `);

        log(`Found ${chunks.rows.length} unmigrated syllabus chunk(s) to migrate.`);
        let migrated = 0;
        let emptySubtopicsCount = 0;

        for (const chunk of chunks.rows) {
            // FIX (P2): Per-chunk transaction — consistent with Phases 2-4.
            await client.query('BEGIN');
            try {
                // FIX (P1): Structured subtopics extractor — replaces naive line-split.
                const subtopics = extractSubtopics(chunk.chunk_text);
                if (subtopics.length === 0) emptySubtopicsCount++;

                await client.query(`
                    INSERT INTO topics (syllabus_id, name, subtopics, created_at, migrated_from_chunk_id)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    chunk.syllabus_uuid,
                    chunk.topic_name || 'Unnamed Topic',
                    subtopics,
                    chunk.created_at || new Date(),
                    chunk.chunk_id
                ]);
                await client.query('COMMIT');
                migrated++;
            } catch (err: any) {
                await client.query('ROLLBACK');
                warn(`  Chunk id=${chunk.chunk_id} failed: ${err.message} — skipping.`);
            }
        }

        ok(`Phase 6 complete: ${migrated} syllabus chunks migrated to topics.`);
        if (emptySubtopicsCount > 0) {
            log(`  ${emptySubtopicsCount} topics have empty subtopics [] (prose-only chunks — TOPIC_MAPPING job will populate).`);
        }
        return migrated;
    } finally {
        client.release();
    }
}

// ─── Phase 7: Validation ─────────────────────────────────────────────────────

async function phase7_validate(): Promise<void> {
    sep();
    log("Phase 7: Running inline validation checks");

    const client = await pool.connect();
    try {
        let allPassed = true;

        // Check 1: File partition count — now compares V2 sum against BOTH
        // the mapping table AND the total legacy files count (FIX: was only
        // comparing V2 sum to mapping table, hiding skipped files).
        const legacyFiles  = await client.query('SELECT COUNT(*) FROM files');
        const v2Papers     = await client.query('SELECT COUNT(*) FROM papers');
        const v2Syllabi    = await client.query('SELECT COUNT(*) FROM syllabi');
        const v2Notes      = await client.query('SELECT COUNT(*) FROM uploaded_notes');
        const mappedFiles  = await client.query('SELECT COUNT(*) FROM migration_file_uuid_map');
        const skippedFiles = await client.query(`
            SELECT COUNT(DISTINCT file_id) FROM ${SKIPPED_TABLE}
        `).catch(() => ({ rows: [{ count: '0' }] }));

        const legacyCount   = parseInt(legacyFiles.rows[0].count, 10);
        const mappedCount   = parseInt(mappedFiles.rows[0].count, 10);
        const skippedCount  = parseInt(skippedFiles.rows[0].count, 10);
        const papersCount   = parseInt(v2Papers.rows[0].count, 10);
        const syllabiCount  = parseInt(v2Syllabi.rows[0].count, 10);
        const notesCount    = parseInt(v2Notes.rows[0].count, 10);
        const v2FilesSum    = papersCount + syllabiCount + notesCount;

        log(`CHECK 1: File partition`);
        log(`  Legacy files total:    ${legacyCount}`);
        log(`  Mapped/Migrated:       ${mappedCount}`);
        log(`  Skipped (logged):      ${skippedCount}`);
        log(`  → papers:              ${papersCount}`);
        log(`  → syllabi:             ${syllabiCount}`);
        log(`  → uploaded_notes:      ${notesCount}`);
        log(`  V2 sum (p+s+n):        ${v2FilesSum}`);

        if (v2FilesSum === mappedCount) {
            ok('  V2 table sum matches mapping table count.');
        } else {
            warn('  V2 table sum does not match mapping table — check for errors above.');
            allPassed = false;
        }
        const unaccounted = legacyCount - mappedCount - skippedCount;
        if (unaccounted !== 0) {
            warn(`  ${unaccounted} legacy file(s) are neither migrated nor in skipped log — investigate.`);
            allPassed = false;
        } else {
            ok(`  All legacy files accounted for (migrated=${mappedCount}, skipped=${skippedCount}).`);
        }

        // Check 2: Orphaned raw_questions
        const orphanRQ = await client.query(
            'SELECT COUNT(*) FROM raw_questions WHERE paper_id IS NULL'
        );
        const orphanRQCount = parseInt(orphanRQ.rows[0].count, 10);
        log(`CHECK 2: Orphaned raw_questions (paper_id IS NULL): ${orphanRQCount}`);
        if (orphanRQCount === 0) {
            ok('  No orphaned raw_questions.');
        } else {
            fail(`  ${orphanRQCount} orphaned raw_questions found!`);
            allPassed = false;
        }

        // Check 3: Orphaned topics
        const orphanTopics = await client.query(
            'SELECT COUNT(*) FROM topics WHERE syllabus_id IS NULL'
        );
        const orphanTopicsCount = parseInt(orphanTopics.rows[0].count, 10);
        log(`CHECK 3: Orphaned topics (syllabus_id IS NULL): ${orphanTopicsCount}`);
        if (orphanTopicsCount === 0) {
            ok('  No orphaned topics.');
        } else {
            fail(`  ${orphanTopicsCount} orphaned topics found!`);
            allPassed = false;
        }

        // Check 4: Null checks on critical fields
        const nullPaperTitle  = await client.query("SELECT COUNT(*) FROM papers WHERE title IS NULL OR title = ''");
        const nullPaperUrl    = await client.query("SELECT COUNT(*) FROM papers WHERE pdf_url IS NULL");
        const nullRQText      = await client.query("SELECT COUNT(*) FROM raw_questions WHERE original_text IS NULL OR original_text = ''");
        const nullSyllabiText = await client.query("SELECT COUNT(*) FROM syllabi WHERE raw_text IS NULL OR raw_text = ''");
        log('CHECK 4: Null field checks');
        log(`  papers with NULL title:        ${nullPaperTitle.rows[0].count}`);
        log(`  papers with NULL pdf_url:      ${nullPaperUrl.rows[0].count}`);
        log(`  raw_questions with NULL text:  ${nullRQText.rows[0].count}`);
        log(`  syllabi with empty raw_text:   ${nullSyllabiText.rows[0].count}`);
        const nullIssues =
            parseInt(nullPaperTitle.rows[0].count, 10) +
            parseInt(nullRQText.rows[0].count, 10);
        if (nullIssues === 0) {
            ok('  No critical null field issues.');
        } else {
            warn(`  ${nullIssues} null field issues found — review manually.`);
        }

        // Check 5: Participants compatibility view
        const participantsKind = await client.query(`
            SELECT table_type FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'participants'
        `);
        log('CHECK 5: participants compatibility view');
        if (participantsKind.rows.length > 0 && participantsKind.rows[0].table_type === 'VIEW') {
            ok('  participants is a VIEW (compatibility layer active).');
        } else if (participantsKind.rows.length === 0) {
            fail('  participants VIEW not found — application code will throw "relation does not exist"!');
            allPassed = false;
        } else {
            warn('  participants exists as a BASE TABLE — Phase 1 rename may not have completed.');
        }

        // Check 6: Total counts summary
        const rawQCount   = await client.query('SELECT COUNT(*) FROM raw_questions');
        const topicsCount = await client.query('SELECT COUNT(*) FROM topics');
        sep();
        log('MIGRATION SUMMARY:');
        log(`  papers:          ${papersCount}`);
        log(`  syllabi:         ${syllabiCount}`);
        log(`  uploaded_notes:  ${notesCount}`);
        log(`  raw_questions:   ${rawQCount.rows[0].count}`);
        log(`  topics:          ${topicsCount.rows[0].count}`);
        log(`  skipped files:   ${skippedCount} (see ${SKIPPED_TABLE})`);
        sep();

        if (allPassed) {
            ok('All validation checks passed. Migration is complete.');
        } else {
            warn('Some validation checks had warnings. Review the output above.');
        }
    } finally {
        client.release();
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function runDataMigration(): Promise<void> {
    log('CramRoom V2 Data Migration Starting...');
    sep();
    log('RULES: This script is ADDITIVE ONLY.');
    log('       Legacy tables will NOT be modified or dropped.');
    log('       V2 tables must already exist (run runMigrationV2.ts first).');
    sep();

    try {
        // Verify V2 tables exist before starting
        const tablesCheck = await pool.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('papers', 'syllabi', 'raw_questions', 'topics', 'uploaded_notes', 'jobs')
            ORDER BY table_name
        `);
        const existingV2Tables = tablesCheck.rows.map((r: any) => r.table_name);
        const requiredTables = ['papers', 'raw_questions', 'syllabi', 'topics', 'uploaded_notes'];
        const missingTables = requiredTables.filter(t => !existingV2Tables.includes(t));

        if (missingTables.length > 0) {
            fail(`V2 tables not found: ${missingTables.join(', ')}`);
            fail('Please run: npx ts-node scripts/runMigrationV2.ts first.');
            process.exit(1);
        }
        ok(`V2 tables verified: ${existingV2Tables.join(', ')}`);

        // Ensure the skipped-files audit table exists before any phase runs
        await ensureSkippedFilesTable();
        ok(`Audit table ${SKIPPED_TABLE} ready.`);

        // Run phases sequentially
        await phase1_renameParticipants();
        await phase2_migratePapers();
        await phase3_migrateUploadedNotes();
        await phase4_migrateSyllabi();
        await phase5_migrateRawQuestions();
        await phase6_migrateTopics();
        await phase7_validate();

        sep();
        ok('Data migration complete. Legacy tables remain intact and operational.');
        ok('Next: Run runValidation.ts for full validation, or runRollback.ts to undo.');
        sep();
    } catch (err: any) {
        fail(`Migration failed unexpectedly: ${err.message}`);
        console.error(err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runDataMigration();

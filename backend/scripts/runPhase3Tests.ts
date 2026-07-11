/**
 * CramRoom Topic Intelligence — Phase 3 Test Suite
 *
 * Validates the AI Prompt & RAG Scoping changes introduced in Phase 3:
 *   A. FORMATTING_RULES constant existence and content enforcement
 *   B. createLLMProvider() factory returns a valid AIProvider
 *   C. GeminiAIProvider stub satisfies the AIProvider contract
 *   D. selectChunksBySource() hierarchy ordering (syllabus → pyq → notes)
 *   E. buildHierarchicalKnowledgeBlock() section injection and empty-guard
 *   F. Phase 1 + Phase 2 regression checks (parser + analytics compile guard)
 *
 * Does NOT test Phase 4 or later functionality.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/runPhase3Tests.ts
 */

import { FORMATTING_RULES, buildHierarchicalKnowledgeBlock } from '../src/services/ai/aiEngine.service';
import { createLLMProvider, OllamaAIProvider, GeminiAIProvider } from '../src/services/ai/aiProvider';
import { selectChunksBySource } from '../src/services/ai/knowledgeRetrieval.service';

// ---------------------------------------------------------------------------
// Minimal test harness (mirrors previous phase suites)
// ---------------------------------------------------------------------------

interface TestResult {
    suite: string;
    name: string;
    passed: boolean;
    durationMs: number;
    message: string;
    error?: string;
}

const results: TestResult[] = [];
let currentSuite = '';

const suite = (name: string) => { currentSuite = name; };

const test = async (
    name: string,
    fn: () => void | Promise<void>
): Promise<void> => {
    const start = Date.now();
    try {
        await fn();
        results.push({ suite: currentSuite, name, passed: true, durationMs: Date.now() - start, message: 'OK' });
    } catch (err: any) {
        results.push({
            suite: currentSuite,
            name,
            passed: false,
            durationMs: Date.now() - start,
            message: err.message ?? String(err),
            error: err.stack,
        });
    }
};

const assert = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`Assertion failed: ${message}`);
};

const assertIncludes = (haystack: string, needle: string, label: string) => {
    if (!haystack.includes(needle)) {
        throw new Error(`${label}: expected string to include "${needle}"`);
    }
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {

    // ── Suite A: FORMATTING_RULES ──────────────────────────────────────────
    suite('A — FORMATTING_RULES Constant');

    await test('A.1 — FORMATTING_RULES is a non-empty string', () => {
        assert(typeof FORMATTING_RULES === 'string', 'FORMATTING_RULES must be a string');
        assert(FORMATTING_RULES.length > 0, 'FORMATTING_RULES must not be empty');
    });

    await test('A.2 — FORMATTING_RULES prohibits graphic/image generation', () => {
        assertIncludes(
            FORMATTING_RULES.toLowerCase(),
            'do not generate',
            'FORMATTING_RULES must explicitly prohibit image generation'
        );
    });

    await test('A.3 — FORMATTING_RULES requires ASCII flowcharts', () => {
        assertIncludes(
            FORMATTING_RULES.toLowerCase(),
            'ascii',
            'FORMATTING_RULES must mention ASCII flowcharts'
        );
    });

    await test('A.4 — FORMATTING_RULES enforces bullet points', () => {
        assertIncludes(
            FORMATTING_RULES.toLowerCase(),
            'bullet',
            'FORMATTING_RULES must mention bullet points'
        );
    });

    await test('A.5 — FORMATTING_RULES enforces tables', () => {
        assertIncludes(
            FORMATTING_RULES.toLowerCase(),
            'table',
            'FORMATTING_RULES must mention markdown tables'
        );
    });

    // ── Suite B: createLLMProvider() Factory ──────────────────────────────
    suite('B — createLLMProvider() Factory');

    await test('B.1 — returns an OllamaAIProvider by default (no env override)', () => {
        const originalEnv = process.env.LLM_PROVIDER;
        delete process.env.LLM_PROVIDER;
        const provider = createLLMProvider();
        assert(provider instanceof OllamaAIProvider, 'Default provider must be OllamaAIProvider');
        assert(provider.providerName === 'ollama', 'Provider name must be "ollama"');
        if (originalEnv !== undefined) process.env.LLM_PROVIDER = originalEnv;
    });

    await test('B.2 — returns OllamaAIProvider when LLM_PROVIDER=ollama', () => {
        process.env.LLM_PROVIDER = 'ollama';
        const provider = createLLMProvider();
        assert(provider instanceof OllamaAIProvider, 'Must return OllamaAIProvider for LLM_PROVIDER=ollama');
        delete process.env.LLM_PROVIDER;
    });

    await test('B.3 — returns GeminiAIProvider when LLM_PROVIDER=gemini', () => {
        process.env.LLM_PROVIDER = 'gemini';
        const provider = createLLMProvider();
        assert(provider instanceof GeminiAIProvider, 'Must return GeminiAIProvider for LLM_PROVIDER=gemini');
        delete process.env.LLM_PROVIDER;
    });

    await test('B.4 — returned provider exposes generateResponse method', () => {
        const provider = createLLMProvider();
        assert(typeof provider.generateResponse === 'function', 'Provider must have generateResponse()');
    });

    await test('B.5 — returned provider exposes providerName string', () => {
        const provider = createLLMProvider();
        assert(typeof provider.providerName === 'string', 'Provider must have a providerName string');
        assert(provider.providerName.length > 0, 'providerName must not be empty');
    });

    // ── Suite C: GeminiAIProvider Stub ────────────────────────────────────
    suite('C — GeminiAIProvider Stub');

    await test('C.1 — GeminiAIProvider returns a response (stub, no network)', async () => {
        const provider = new GeminiAIProvider();
        const response = await provider.generateResponse({
            systemPrompt: 'System',
            contextPrompt: 'Context',
            userPrompt: 'User query',
        });
        assert(typeof response.text === 'string', 'Stub response must be a string');
        assert(response.text.length > 0, 'Stub response must not be empty');
    });

    await test('C.2 — GeminiAIProvider providerName is "gemini"', () => {
        const provider = new GeminiAIProvider();
        assert(provider.providerName === 'gemini', 'GeminiAIProvider providerName must be "gemini"');
    });

    // ── Suite D: selectChunksBySource() Hierarchy ─────────────────────────
    suite('D — selectChunksBySource() Hierarchy Ordering');

    const sampleChunks = [
        { topic: 'Normalization',    text: 'Normalization reduces data redundancy.',      source: 'syllabus' as const },
        { topic: 'Boyce-Codd NF',   text: 'BCNF is a stricter form of 3NF.',             source: 'syllabus' as const },
        { topic: 'Normalization Q',  text: 'Normalize the given schema to 3NF.',          source: 'pyq'      as const },
        { topic: 'Indexing Q',       text: 'Explain B+ tree indexing with an example.',   source: 'pyq'      as const },
        { topic: 'My Notes',         text: 'Remember: BCNF requires every determinant.', source: 'notes'    as const },
    ];

    await test('D.1 — returns chunks in hierarchy order (syllabus before pyq before notes)', () => {
        const result = selectChunksBySource('normalization', sampleChunks, 5);
        assert(result.length > 0, 'Must return at least one chunk');
        const sources = result.map(c => c.source);
        // Verify syllabus entries all appear before any pyq entries
        const lastSyllabusIdx = sources.lastIndexOf('syllabus');
        const firstPyqIdx     = sources.indexOf('pyq');
        if (firstPyqIdx !== -1 && lastSyllabusIdx !== -1) {
            assert(lastSyllabusIdx < firstPyqIdx, 'All syllabus chunks must precede all pyq chunks');
        }
        // Verify pyq entries all appear before any notes entries
        const lastPyqIdx   = sources.lastIndexOf('pyq');
        const firstNotesIdx = sources.indexOf('notes');
        if (firstNotesIdx !== -1 && lastPyqIdx !== -1) {
            assert(lastPyqIdx < firstNotesIdx, 'All pyq chunks must precede all notes chunks');
        }
    });

    await test('D.2 — respects topK limit', () => {
        const result = selectChunksBySource('normalization', sampleChunks, 3);
        assert(result.length <= 3, `Must return at most 3 chunks, got ${result.length}`);
    });

    await test('D.3 — each returned chunk carries a source tag', () => {
        const result = selectChunksBySource('indexing', sampleChunks, 6);
        for (const chunk of result) {
            assert(
                ['syllabus', 'pyq', 'notes'].includes(chunk.source),
                `Chunk "${chunk.topic}" has invalid source: ${chunk.source}`
            );
        }
    });

    await test('D.4 — returns empty array for empty input', () => {
        const result = selectChunksBySource('anything', [], 5);
        assert(result.length === 0, 'Must return empty array for empty chunk input');
    });

    await test('D.5 — works with empty question (no keyword scoring)', () => {
        const result = selectChunksBySource('', sampleChunks, 5);
        assert(result.length > 0, 'Must return chunks even with empty question');
        // Still must be hierarchy-ordered
        const sources = result.map(c => c.source);
        const lastSyllabusIdx = sources.lastIndexOf('syllabus');
        const firstPyqIdx     = sources.indexOf('pyq');
        if (firstPyqIdx !== -1 && lastSyllabusIdx !== -1) {
            assert(lastSyllabusIdx < firstPyqIdx, 'Hierarchy must be maintained with empty question');
        }
    });

    // ── Suite E: buildHierarchicalKnowledgeBlock() ────────────────────────
    suite('E — buildHierarchicalKnowledgeBlock()');

    await test('E.1 — returns empty string for empty chunk array', () => {
        const result = buildHierarchicalKnowledgeBlock('any question', [], 6);
        assert(result === '', 'Must return empty string when no chunks provided');
    });

    await test('E.2 — result contains "Knowledge Context:" header', () => {
        const result = buildHierarchicalKnowledgeBlock('normalization', sampleChunks, 6);
        assertIncludes(result, 'Knowledge Context:', 'Block must include Knowledge Context header');
    });

    await test('E.3 — syllabus section header is present when syllabus chunks exist', () => {
        const result = buildHierarchicalKnowledgeBlock('normalization', sampleChunks, 6);
        assertIncludes(result, 'Syllabus Grounding', 'Must include syllabus section header');
    });

    await test('E.4 — PYQ section header is present when pyq chunks exist', () => {
        const result = buildHierarchicalKnowledgeBlock('normalization', sampleChunks, 6);
        assertIncludes(result, 'PYQ Historical Evidence', 'Must include PYQ section header');
    });

    await test('E.5 — Notes section header is present when notes chunks exist', () => {
        const result = buildHierarchicalKnowledgeBlock('normalization', sampleChunks, 6);
        assertIncludes(result, 'Uploaded Notes', 'Must include Notes section header');
    });

    await test('E.6 — syllabus section appears before PYQ section in output', () => {
        const result = buildHierarchicalKnowledgeBlock('normalization', sampleChunks, 6);
        const syllabusIdx = result.indexOf('Syllabus Grounding');
        const pyqIdx      = result.indexOf('PYQ Historical Evidence');
        assert(syllabusIdx < pyqIdx, 'Syllabus section must appear before PYQ section in the block');
    });

    await test('E.7 — notes section appears after PYQ section in output', () => {
        const result = buildHierarchicalKnowledgeBlock('normalization', sampleChunks, 6);
        const pyqIdx   = result.indexOf('PYQ Historical Evidence');
        const notesIdx = result.indexOf('Uploaded Notes');
        assert(pyqIdx < notesIdx, 'PYQ section must appear before Notes section in the block');
    });

    await test('E.8 — only syllabus section when only syllabus chunks supplied', () => {
        const onlySyllabus = sampleChunks.filter(c => c.source === 'syllabus');
        const result = buildHierarchicalKnowledgeBlock('normalization', onlySyllabus, 6);
        assertIncludes(result, 'Syllabus Grounding', 'Must include syllabus heading');
        assert(!result.includes('PYQ Historical Evidence'), 'Must NOT include PYQ heading when no pyq chunks');
        assert(!result.includes('Uploaded Notes'), 'Must NOT include notes heading when no notes chunks');
    });

    // ── Suite F: Phase 1 + Phase 2 Regression Guard ───────────────────────
    suite('F — Phase 1/2 Regression Guards (compile-time)');

    await test('F.1 — chunkByHeadings is importable from fileConverter.util', async () => {
        const mod = await import('../src/utils/fileConverter.util');
        assert(typeof mod.chunkByHeadings === 'function', 'chunkByHeadings must be exported');
    });

    await test('F.2 — parsePyqContent is importable from fileConverter.util', async () => {
        const mod = await import('../src/utils/fileConverter.util');
        assert(typeof mod.parsePyqContent === 'function', 'parsePyqContent must be exported');
    });

    await test('F.3 — detectWeakTopics is importable from weakTopicAnalytics.service', async () => {
        const mod = await import('../src/services/ai/weakTopicAnalytics.service');
        assert(typeof mod.detectWeakTopics === 'function', 'detectWeakTopics must be exported');
    });

    await test('F.4 — MIN_WEAK_TOPIC_SCORE enforcement: file is importable without error', async () => {
        // If the file fails to parse/compile, this test will throw
        const mod = await import('../src/services/ai/weakTopicAnalytics.service');
        assert(mod !== null, 'Module must load successfully');
    });

    await test('F.5 — selectRelevantChunks still exported (backward compat)', async () => {
        const mod = await import('../src/services/ai/knowledgeRetrieval.service');
        assert(typeof mod.selectRelevantChunks === 'function', 'selectRelevantChunks must still be exported');
    });

    // ── Print Results ──────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  CramRoom Topic Intelligence — Phase 3 Test Results   ');
    console.log('═══════════════════════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;
    let currentSuiteLabel = '';

    for (const r of results) {
        if (r.suite !== currentSuiteLabel) {
            currentSuiteLabel = r.suite;
            console.log(`\n  ${r.suite}`);
            console.log('  ' + '─'.repeat(r.suite.length));
        }
        const icon = r.passed ? '✅' : '❌';
        const dur  = `${r.durationMs}ms`;
        console.log(`  ${icon} ${r.name.padEnd(55)} (${dur})`);
        if (!r.passed) {
            console.log(`     ↳ ${r.message}`);
            failed++;
        } else {
            passed++;
        }
    }

    const total = passed + failed;
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`  Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`═══════════════════════════════════════════════════════\n`);

    if (failed > 0) {
        process.exit(1);
    }
};

main().catch(err => {
    console.error('Test runner crashed:', err);
    process.exit(1);
});

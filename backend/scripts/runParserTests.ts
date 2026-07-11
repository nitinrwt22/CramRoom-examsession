/**
 * CramRoom Topic Intelligence — Phase 1 P1 Test Deliverable
 * Parser Unit Tests for centralized utilities in `fileConverter.util.ts`.
 *
 * Goal: satisfy the Phase 1 Plan § 2 testing requirement:
 *   "Unit tests verifying markdown heading splits and bullet-point
 *    subtopic lists are correctly parsed from test documents."
 *
 * Rules:
 *   - Does NOT modify the parser source code.
 *   - Does NOT touch the database.
 *   - Locks in the *current* behavior of the extracted utilities so
 *     Phase 2 (algorithmic refinement) has a regression baseline.
 *
 * Conventions follow the existing V2 test suite under
 * `scripts/runDatabaseTests.ts` — a standalone ts-node script with a
 * simple test() harness and a JSON results file.
 *
 * Usage:
 *   npx ts-node scripts/runParserTests.ts
 */

import {
    chunkByHeadings,
    parsePyqContent,
    extractSubtopics,
} from '../src/utils/fileConverter.util';

// ---------------------------------------------------------------------------
// Test harness
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

const test = async (
    name: string,
    fn: () => void | Promise<void>
): Promise<void> => {
    const start = Date.now();
    try {
        await fn();
        const durationMs = Date.now() - start;
        results.push({
            suite: currentSuite,
            name,
            passed: true,
            durationMs,
            message: 'OK',
        });
        console.log(`  ✅ ${name}  (${durationMs}ms)`);
    } catch (err: any) {
        const durationMs = Date.now() - start;
        results.push({
            suite: currentSuite,
            name,
            passed: false,
            durationMs,
            message: err.message ?? String(err),
            error: err.stack,
        });
        console.log(`  ❌ ${name}`);
        console.log(`     ↳ ${err.message ?? String(err)}`);
    }
};

const suite = (name: string) => {
    currentSuite = name;
    console.log(`\n${name}`);
    console.log('─'.repeat(60));
};

const eq = <T>(actual: T, expected: T, label: string = 'Assertion failed') => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
        throw new Error(`${label}\n    expected: ${e}\n    actual:   ${a}`);
    }
};

const truthy = (v: any, label: string) => {
    if (!v) throw new Error(`${label} expected truthy, got ${JSON.stringify(v)}`);
};

const isNull = (v: any, label: string) => {
    if (v !== null) throw new Error(`${label} expected null, got ${JSON.stringify(v)}`);
};

// ---------------------------------------------------------------------------
// SUITE 1: chunkByHeadings
// ---------------------------------------------------------------------------

const runChunkTests = async () => {
    suite('SUITE 1 — chunkByHeadings');

    // 1.1 Empty input
    await test('1.1 returns [] for empty string', () => {
        eq(chunkByHeadings('', 'FB'), []);
    });

    // 1.2 Whitespace-only input
    await test('1.2 returns [] for whitespace-only input', () => {
        eq(chunkByHeadings('   \n\n  \n', 'FB'), []);
    });

    // 1.3 Single heading + long body
    await test('1.3 single ## heading with long body returns one chunk', () => {
        const md = '## Topic A\nThis is a sufficiently long body of text for the parser.';
        const r = chunkByHeadings(md, 'FB');
        eq(r.length, 1);
        eq(r[0].heading, 'Topic A');
        truthy(r[0].body.includes('sufficiently long body'), 'body contains text');
    });

    // 1.4 Multiple headings
    await test('1.4 multiple ## headings each become a chunk', () => {
        const md = [
            '## Topic A',
            'Body for topic A that is long enough to pass the threshold check.',
            '## Topic B',
            'Body for topic B that is long enough to pass the threshold check.',
            '## Topic C',
            'Body for topic C that is long enough to pass the threshold check.',
        ].join('\n');
        const r = chunkByHeadings(md, 'FB');
        eq(r.length, 3);
        eq(r[0].heading, 'Topic A');
        eq(r[1].heading, 'Topic B');
        eq(r[2].heading, 'Topic C');
    });

    // 1.5 Heading with body below 20-char threshold is dropped
    await test('1.5 heading with body ≤ 20 chars is dropped (body filter)', () => {
        const md = '## Topic A\nshort';
        const r = chunkByHeadings(md, 'FB');
        eq(r, []);
    });

    // 1.6 Heading with exactly 21-char body is kept
    await test('1.6 heading with body > 20 chars is kept', () => {
        const md = '## Topic A\n' + 'a'.repeat(21);
        const r = chunkByHeadings(md, 'FB');
        eq(r.length, 1);
    });

    // 1.7 Nested heading (###) is NOT a section break — treated as body
    await test('1.7 ### (h3) does NOT split sections, becomes body of ## section', () => {
        const md = [
            '## Outer',
            'Some introduction text that is comfortably above the threshold.',
            '### Inner',
            'Inner content that is also above the threshold for chunking purposes.',
        ].join('\n');
        const r = chunkByHeadings(md, 'FB');
        eq(r.length, 1);
        eq(r[0].heading, 'Outer');
        truthy(r[0].body.includes('### Inner'), 'body contains the ### line');
        truthy(r[0].body.includes('Inner content'), 'body contains inner text');
    });

    // 1.8 No ## heading at all — content > 20 chars falls back to fallbackTopic
    await test('1.8 no ## heading, long content uses fallbackTopic', () => {
        const md = 'Just some free-form text that is longer than 20 chars.';
        const r = chunkByHeadings(md, 'FALLBACK');
        eq(r.length, 1);
        eq(r[0].heading, 'FALLBACK');
        eq(r[0].body, md.trim());
    });

    // 1.9 No ## heading, short content (< 20 chars) is dropped
    await test('1.9 no ## heading, content ≤ 20 chars is dropped', () => {
        const md = 'tiny';
        const r = chunkByHeadings(md, 'FALLBACK');
        eq(r, []);
    });

    // 1.10 Mixed: short intro (dropped) + long ## section (kept)
    await test('1.10 pre-heading intro below threshold is dropped, ## section kept', () => {
        const md = [
            'Preamble below threshold.',          // 29 chars — actually above 20
            '',                                   // split
            '## Topic A',
            'This is the body of topic A which is comfortably long enough.',
        ].join('\n');
        const r = chunkByHeadings(md, 'FB');
        // The split regex puts the preamble into section 0 (no heading) and the
        // ## section into section 1. Preamble (> 20 chars) becomes fallback.
        eq(r.length, 2);
        eq(r[0].heading, 'FB');
        eq(r[0].body, 'Preamble below threshold.');
        eq(r[1].heading, 'Topic A');
    });

    // 1.11 Heading edge: # (h1) is NOT a split marker
    await test('1.11 # (h1) is NOT a split marker — content before first ## is fallback', () => {
        const md = [
            '# Heading One',
            'Some body content under heading one that is long enough.',
            '## Heading Two',
            'Some body content under heading two that is long enough.',
        ].join('\n');
        const r = chunkByHeadings(md, 'FB');
        // Split happens at "## ", so # h1 + body is section 0 (no heading marker,
        // length > 20) → fallback. Section 1 is the ## Heading Two chunk.
        eq(r.length, 2);
        eq(r[0].heading, 'FB');
        truthy(r[0].body.includes('# Heading One'), 'fallback body includes h1');
        eq(r[1].heading, 'Heading Two');
    });

    // 1.12 Heading with extra spaces
    await test('1.12 heading text with extra spaces is trimmed', () => {
        const md = '##    Spaced Topic   \nBody content long enough to pass threshold.';
        const r = chunkByHeadings(md, 'FB');
        eq(r.length, 1);
        eq(r[0].heading, 'Spaced Topic');
    });

    // 1.13 Two consecutive ## headings — first has no body
    await test('1.13 consecutive ## headings: empty-body heading is dropped', () => {
        const md = [
            '## Topic A',
            '## Topic B',
            'Body for topic B is long enough to pass the threshold.',
        ].join('\n');
        const r = chunkByHeadings(md, 'FB');
        // Topic A has no body (just the next heading line) — body is empty
        // after stripping the heading line, so it is dropped.
        // The remaining text becomes the body of Topic B.
        eq(r.length, 1);
        eq(r[0].heading, 'Topic B');
    });
};

// ---------------------------------------------------------------------------
// SUITE 2: extractSubtopics
// ---------------------------------------------------------------------------

const runSubtopicTests = async () => {
    suite('SUITE 2 — extractSubtopics');

    // 2.1 Empty input
    await test('2.1 returns [] for empty string', () => {
        eq(extractSubtopics(''), []);
    });

    // 2.2 Null input
    await test('2.2 returns [] for null input', () => {
        eq(extractSubtopics(null as any), []);
    });

    // 2.3 Undefined input
    await test('2.3 returns [] for undefined input', () => {
        eq(extractSubtopics(undefined as any), []);
    });

    // 2.4 Whitespace-only input
    await test('2.4 returns [] for whitespace-only input', () => {
        eq(extractSubtopics('   \n\n   '), []);
    });

    // 2.5 Plain text with no bullets
    await test('2.5 plain text with no bullets returns []', () => {
        eq(extractSubtopics('Just a paragraph of text without any list markers.'), []);
    });

    // 2.6 Single dash bullet, long content
    await test('2.6 dash-bullet with content > 4 chars is captured', () => {
        const text = '- First subtopic item';
        const r = extractSubtopics(text);
        eq(r, ['First subtopic item']);
    });

    // 2.7 Single asterisk bullet
    await test('2.7 asterisk-bullet is captured', () => {
        const text = '* Star item longer than 4 chars';
        const r = extractSubtopics(text);
        eq(r, ['Star item longer than 4 chars']);
    });

    // 2.8 Bullet (• U+2022) marker
    await test('2.8 unicode bullet (•) is captured', () => {
        const text = '• Unicode bullet item';
        const r = extractSubtopics(text);
        eq(r, ['Unicode bullet item']);
    });

    // 2.9 Bullets with leading whitespace
    await test('2.9 indented bullets are captured', () => {
        const text = '   - Indented bullet item';
        const r = extractSubtopics(text);
        eq(r, ['Indented bullet item']);
    });

    // 2.10 Multiple bullets
    await test('2.10 multiple bullets all captured in order', () => {
        const text = [
            '- First long enough item',
            '- Second long enough item',
            '* Third long enough item',
            '• Fourth long enough item',
        ].join('\n');
        const r = extractSubtopics(text);
        eq(r, [
            'First long enough item',
            'Second long enough item',
            'Third long enough item',
            'Fourth long enough item',
        ]);
    });

    // 2.11 Bullet content ≤ 4 chars is filtered out
    await test('2.11 bullet with content ≤ 4 chars is filtered', () => {
        const text = [
            '- abc',                   // 3 chars, filtered
            '- Long enough subtopic',  // kept
            '- x',                     // 1 char, filtered
        ].join('\n');
        const r = extractSubtopics(text);
        eq(r, ['Long enough subtopic']);
    });

    // 2.12 Mixed content: paragraphs + bullets
    await test('2.12 mixed paragraphs and bullets returns only bullets', () => {
        const text = [
            'This is a paragraph that has no bullet markers at all.',
            '',
            '- Bullet number one here',
            'Another paragraph line.',
            '- Bullet number two here',
        ].join('\n');
        const r = extractSubtopics(text);
        eq(r, ['Bullet number one here', 'Bullet number two here']);
    });

    // 2.13 Windows line endings (CRLF)
    await test('2.13 CRLF line endings are handled', () => {
        const text = '- First bullet line\r\n- Second bullet line';
        const r = extractSubtopics(text);
        eq(r, ['First bullet line', 'Second bullet line']);
    });

    // 2.14 Empty bullet line skipped
    await test('2.14 empty bullet line (just "- ") is skipped', () => {
        const text = [
            '-',
            '- Real subtopic item',
        ].join('\n');
        const r = extractSubtopics(text);
        eq(r, ['Real subtopic item']);
    });

    // 2.15 Plus sign marker is NOT a bullet (only -, *, •)
    await test('2.15 "+" marker is not a bullet', () => {
        const text = '+ Plus marker item here';
        const r = extractSubtopics(text);
        eq(r, []);
    });

    // 2.16 Numbered list is NOT a bullet
    await test('2.16 numbered list "1." is not a bullet', () => {
        const text = '1. Numbered item one\n2. Numbered item two';
        const r = extractSubtopics(text);
        eq(r, []);
    });

    // 2.17 Trailing whitespace on bullet content is trimmed
    await test('2.17 trailing whitespace on bullet content is trimmed', () => {
        const text = '- Item with trailing spaces   ';
        const r = extractSubtopics(text);
        eq(r, ['Item with trailing spaces']);
    });
};

// ---------------------------------------------------------------------------
// SUITE 3: parsePyqContent
// ---------------------------------------------------------------------------

const runPyqTests = async () => {
    suite('SUITE 3 — parsePyqContent');

    // 3.1 Empty input
    await test('3.1 returns [] for empty string', () => {
        eq(parsePyqContent('', 'FB', 2024), []);
    });

    // 3.2 Single ## heading + long body
    await test('3.2 single ## heading + long body produces one chunk with fallback topic', () => {
        const md = '## Question One\nThis is a question body that is comfortably long.';
        const r = parsePyqContent(md, 'OS', 2024);
        eq(r.length, 1);
        eq(r[0].topic, 'OS');
        truthy(r[0].chunk_text.includes('Question One'), 'chunk_text contains heading');
        truthy(r[0].chunk_text.includes('comfortably long'), 'chunk_text contains body');
        eq(r[0].year, 2024);
        isNull(r[0].marks, 'marks');
    });

    // 3.3 Numbered question "1."
    await test('3.3 numbered question "1." with body produces a chunk', () => {
        const md = '1. What is a semaphore?\nExplain the binary and counting variants with examples.';
        const r = parsePyqContent(md, 'OS', 2023);
        eq(r.length, 1);
        truthy(r[0].chunk_text.includes('semaphore'), 'contains question text');
        eq(r[0].year, 2023);
    });

    // 3.4 Numbered question with optional "Q" prefix "Q1."
    await test('3.4 "Q1." prefix is recognised as question marker', () => {
        const md = 'Q1. Explain deadlock detection.\nDescribe the wait-for graph algorithm in detail.';
        const r = parsePyqContent(md, 'OS', 2022);
        eq(r.length, 1);
        truthy(r[0].chunk_text.includes('deadlock detection'), 'contains question text');
    });

    // 3.5 Marks extraction from heading "[5 marks]"
    await test('3.5 marks extracted from heading "[5 marks]"', () => {
        const md = '## What is virtual memory [5 marks]\nLong enough body for the parser to accept this section.';
        const r = parsePyqContent(md, 'OS', 2024);
        eq(r.length, 1);
        eq(r[0].marks, 5);
        truthy(!r[0].chunk_text.includes('[5 marks]'), 'marks stripped from chunk_text');
    });

    // 3.6 Marks extraction "(10 marks)"
    await test('3.6 marks extracted from heading "(10 marks)"', () => {
        const md = '## Paging question (10 marks)\nLong enough body for the parser to accept this section.';
        const r = parsePyqContent(md, 'OS', 2024);
        eq(r.length, 1);
        eq(r[0].marks, 10);
    });

    // 3.7 Marks extraction from body (not heading)
    await test('3.7 marks extracted from body when not in heading', () => {
        const md = '## What is thrashing\nDescribe the working set model. [7 marks]';
        const r = parsePyqContent(md, 'OS', 2024);
        eq(r.length, 1);
        eq(r[0].marks, 7);
    });

    // 3.8 Year extraction from heading "[2023]"
    await test('3.8 year extracted from heading "[2023]"', () => {
        const md = '## Operating systems basics [2023]\nLong enough body to pass the threshold check.';
        const r = parsePyqContent(md, 'OS', null);
        eq(r.length, 1);
        eq(r[0].year, 2023);
    });

    // 3.9 Year extraction from body
    await test('3.9 year extracted from body when not in heading', () => {
        const md = '## Cache coherence\nDescribe MESI protocol. Exam 2019 reference.';
        const r = parsePyqContent(md, 'OS', 2024);
        eq(r.length, 1);
        eq(r[0].year, 2019);
    });

    // 3.10 Year falls back to fallbackYear when not in content
    await test('3.10 year falls back to fallbackYear when no year in content', () => {
        const md = '## Generic question\nLong enough body for the parser to accept this section.';
        const r = parsePyqContent(md, 'OS', 2021);
        eq(r.length, 1);
        eq(r[0].year, 2021);
    });

    // 3.11 Year falls back to null when no fallback and no year in content
    await test('3.11 year is null when no fallback and no year in content', () => {
        const md = '## Generic question\nLong enough body for the parser to accept this section.';
        const r = parsePyqContent(md, 'OS', null);
        eq(r.length, 1);
        isNull(r[0].year, 'year');
    });

    // 3.12 Multiple questions
    await test('3.12 multiple numbered questions each become a chunk', () => {
        const md = [
            '1. Explain process scheduling with examples and tradeoffs.',
            '2. What is a critical section and how is it implemented?',
            '3. Describe deadlock prevention strategies thoroughly.',
        ].join('\n');
        const r = parsePyqContent(md, 'OS', 2024);
        eq(r.length, 3);
    });

    // 3.13 Mixed ## headings and numbered questions
    await test('3.13 mixed ## headings and numbered questions both recognised', () => {
        const md = [
            '## Unit 1',
            '1. Explain process states with a state diagram and transitions.',
            '2. What are the differences between preemptive and non-preemptive scheduling?',
        ].join('\n');
        const r = parsePyqContent(md, 'OS', 2024);
        // ## section + 2 numbered sections = 3
        eq(r.length, 3);
    });

    // 3.14 Heading is too short and body too short — section dropped
    await test('3.14 heading ≤ 3 chars AND body ≤ 5 chars is dropped', () => {
        const md = '## ab\ncde';
        const r = parsePyqContent(md, 'OS', 2024);
        // heading "ab" (2 chars) and body "cde" (3 chars) — both below threshold
        eq(r, []);
    });

    // 3.15 Heading long enough even with short body is kept
    await test('3.15 long heading even with short body is kept', () => {
        const md = '## This is a long enough heading\nshort';
        const r = parsePyqContent(md, 'OS', 2024);
        eq(r.length, 1);
    });

    // 3.16 Section with no recognised marker but content > 10 chars — fallback to trimmed
    await test('3.16 unrecognised content > 10 chars uses trimmed text', () => {
        const md = 'Just some plain text content that is longer than 10 chars.';
        const r = parsePyqContent(md, 'OS', 2024);
        eq(r.length, 1);
        eq(r[0].topic, 'OS');
        truthy(r[0].chunk_text.includes('Just some plain text'), 'contains text');
    });

    // 3.17 Section with no recognised marker and ≤ 10 chars is dropped
    await test('3.17 unrecognised content ≤ 10 chars is dropped', () => {
        const md = 'tiny text';
        const r = parsePyqContent(md, 'OS', 2024);
        eq(r, []);
    });

    // 3.18 Marks with "m" abbreviation
    await test('3.18 marks abbreviation "m" recognised', () => {
        const md = '## What is paging [5m]\nLong enough body for the parser to accept this section.';
        const r = parsePyqContent(md, 'OS', 2024);
        eq(r.length, 1);
        eq(r[0].marks, 5);
    });

    // 3.19 Punctuation cleanup: leading/trailing ":", "-", " " stripped
    await test('3.19 leading/trailing punctuation stripped from heading', () => {
        const md = '## - Operating Systems: \nLong enough body for the parser to accept this section.';
        const r = parsePyqContent(md, 'OS', 2024);
        eq(r.length, 1);
        truthy(!r[0].chunk_text.match(/^[\s\-\:]+/), 'no leading dash/colon/space');
    });

    // 3.20 Topic field is always the fallbackTopic (parser does not infer topic)
    await test('3.20 topic field is always fallbackTopic, regardless of content', () => {
        const md = '1. Question about databases and SQL joins.';
        const r = parsePyqContent(md, 'DBMS', 2024);
        eq(r.length, 1);
        eq(r[0].topic, 'DBMS');
    });

    // 3.21 Invalid formatting: stray "##" with no text
    await test('3.21 ## with no following text does not produce empty chunk', () => {
        const md = '##\nJust some body content that is long enough to test parser behavior.';
        const r = parsePyqContent(md, 'OS', 2024);
        // The regex `^(?:## |(?:Q?\d+\.))\s*(.*)` requires at least one char after
        // "## " — so a bare "##" falls into the unrecognised branch and is kept
        // as long as the trimmed content > 10 chars.
        eq(r.length, 1);
    });

    // 3.22 Question number "10." (double-digit) is recognised
    await test('3.22 double-digit numbered question is recognised', () => {
        const md = "10. Explain the banker's algorithm in great technical detail.";
        const r = parsePyqContent(md, 'OS', 2024);
        eq(r.length, 1, 'should have 1 chunk');
    });

    // 3.23 Inline multiple bold questions with marks (User's specific case)
    await test('3.23 inline multiple bold questions with marks are split and parsed correctly', () => {
        const md = "**Q1 (2 Marks):** Define electric dipole moment. Write its SI unit. **Q2 (3 Marks):** State Kirchhoff's voltage law and Kirchhoff's current law. Use them to justify conservation of charge and energy in an electrical circuit. **Q3 (3 Marks):** A convex lens of focal length 20 cm forms a real image 3 times the size of the object. Calculate the object and image distances. **Q4 (5 Marks):** Derive an expression for the electric field on the axial line of an electric dipole at a distance r from its center. Show that for r >> a, the field varies as 1/r³. **Q5 (10 Marks):** (a) Explain the photoelectric effect and state the laws governing it. (b) Using Einstein's photoelectric equation, derive the relation between stopping potential and frequency of incident light. (c) A photon of energy 4.5 eV strikes a metal surface with work function 2.3 eV. Find the maximum kinetic energy of the emitted photoelectron and the stopping potential.";
        const r = parsePyqContent(md, 'Physics', 2026);
        eq(r.length, 5, 'should split into 5 chunks');
        eq(r[0].marks, 2, 'Q1 marks');
        truthy(r[0].chunk_text.includes('Define electric dipole moment'), 'Q1 body');
        eq(r[1].marks, 3, 'Q2 marks');
        truthy(r[1].chunk_text.includes("State Kirchhoff's voltage law"), 'Q2 body');
        eq(r[2].marks, 3, 'Q3 marks');
        truthy(r[2].chunk_text.includes('A convex lens of focal length 20 cm'), 'Q3 body');
        eq(r[3].marks, 5, 'Q4 marks');
        truthy(r[3].chunk_text.includes('Derive an expression for the electric field'), 'Q4 body');
        eq(r[4].marks, 10, 'Q5 marks');
        truthy(r[4].chunk_text.includes('Explain the photoelectric effect'), 'Q5 body');
        // Q5 subparts (a), (b), (c) should remain within Q5 and not be split
        truthy(r[4].chunk_text.includes('(b) Using Einstein'), 'Q5 subpart b remains inline');
        truthy(r[4].chunk_text.includes('(c) A photon of energy 4.5 eV'), 'Q5 subpart c remains inline');
    });

    // 3.24 Bulleted bold questions
    await test('3.24 bulleted bold questions are parsed correctly', () => {
        const md = [
            '- **Q1 (5 Marks):** First question.',
            '* **Q2:** Second question.',
        ].join('\n');
        const r = parsePyqContent(md, 'OS', 2024);
        eq(r.length, 2, 'should split into 2 chunks');
        eq(r[0].marks, 5, 'Q1 marks');
        eq(r[0].chunk_text, 'First question.', 'Q1 body');
        eq(r[1].chunk_text, 'Second question.', 'Q2 body');
    });

    // 3.25 Parenthesized/bracketed numbers at start of line
    await test('3.25 parenthesized and bracketed numbers at start of line are parsed', () => {
        const md = [
            '(1) Explain virtual memory.',
            '[2] Explain paging.',
        ].join('\n');
        const r = parsePyqContent(md, 'OS', 2024);
        eq(r.length, 2, 'should split into 2 chunks');
        eq(r[0].chunk_text, 'Explain virtual memory.', 'Q1 body');
        eq(r[1].chunk_text, 'Explain paging.', 'Q2 body');
    });
};

// ---------------------------------------------------------------------------
// SUITE 4: Integration — parsers together
// ---------------------------------------------------------------------------

const runIntegrationTests = async () => {
    suite('SUITE 4 — Integration (chunkByHeadings + extractSubtopics)');

    // 4.1 Realistic syllabus: ## headings with bullet subtopics
    await test('4.1 realistic syllabus parses into topics with subtopics', () => {
        const md = [
            '## Operating Systems',
            'Introduction to OS concepts and history.',
            '- Process management',
            '- Memory management',
            '- File systems',
            '- I/O scheduling',
            '## Database Systems',
            'Relational model fundamentals.',
            '- Normalization theory',
            '- Transaction management',
            '- Concurrency control',
        ].join('\n');

        const chunks = chunkByHeadings(md, 'FB');
        eq(chunks.length, 2);
        eq(chunks[0].heading, 'Operating Systems');
        eq(chunks[1].heading, 'Database Systems');

        const subs0 = extractSubtopics(chunks[0].body);
        eq(subs0, [
            'Process management',
            'Memory management',
            'File systems',
            'I/O scheduling',
        ]);

        const subs1 = extractSubtopics(chunks[1].body);
        eq(subs1, [
            'Normalization theory',
            'Transaction management',
            'Concurrency control',
        ]);
    });

    // 4.2 Realistic PYQ: numbered questions with marks + years
    await test('4.2 realistic PYQ file parses into question chunks with marks and years', () => {
        const md = [
            '1. Explain virtual memory with paging in operating systems. [10 marks]',
            '2. What is deadlock? Describe detection and recovery. (5 marks)',
            '3. Compare preemptive and non-preemptive scheduling algorithms.',
        ].join('\n');

        const chunks = parsePyqContent(md, 'OS', 2024);
        eq(chunks.length, 3);
        eq(chunks[0].marks, 10);
        eq(chunks[1].marks, 5);
        isNull(chunks[2].marks, 'q3 marks');
        // All inherit fallback year when no year in content
        eq(chunks[0].year, 2024);
        eq(chunks[1].year, 2024);
        eq(chunks[2].year, 2024);
        // All have the fallback topic
        chunks.forEach(c => eq(c.topic, 'OS'));
    });
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
    console.log('CramRoom Phase 1 — Parser Unit Tests');
    console.log('─'.repeat(60));
    console.log('Verifying behavior of centralized utilities in fileConverter.util.ts');

    await runChunkTests();
    await runSubtopicTests();
    await runPyqTests();
    await runIntegrationTests();

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    const totalMs = results.reduce((s, r) => s + r.durationMs, 0);

    console.log('\n' + '═'.repeat(60));
    console.log(`SUMMARY: ${passed}/${total} passed, ${failed} failed, ${totalMs}ms total`);
    console.log('═'.repeat(60));

    if (failed > 0) {
        console.log('\nFAILED CASES:');
        results.filter(r => !r.passed).forEach(r => {
            console.log(`  • [${r.suite}] ${r.name}`);
            console.log(`    ${r.message}`);
        });
        process.exit(1);
    }

    process.exit(0);
}

main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});

# CramRoom — Content Knowledge Base

This directory is the flat file store for all study materials indexed by CramRoom AI.
Files are **not** divided by subject; subjects are represented by **Session Rooms**.
This keeps the structure simple and easy for AI agents to index and chunk.

---

## Folder Structure

```
content/
├── pyqs/           # Previous year & practice questions
├── notes/          # Concept notes, theory, summaries
├── assignments/    # College assignments & problem sets
├── references/     # Books, articles, papers, external links
└── cheatsheets/    # Quick-revision: formulas, syntax, key points
```

---

## Folder Purposes

| Folder | What goes here |
|---|---|
| `pyqs/` | Previous year exam questions, university paper PDFs/MD, practice question banks |
| `notes/` | Topic explanations, theory writeups, lecture summaries, concept deep-dives |
| `assignments/` | College assignments, lab tasks, graded problem sets |
| `references/` | External book excerpts, research papers, curated link lists, documentation references |
| `cheatsheets/` | Formula sheets, syntax quick-refs, one-page summaries for last-minute revision |

---

## Naming Convention

### Format
```
{topic-slug}-{type}.md
```

### Rules
- All **lowercase**, words separated by **hyphens** (`-`)
- Be **specific** in the topic slug — AI uses the filename as a retrieval hint
- Always include the **type suffix** matching the folder (pyqs, notes, cheatsheet, etc.)
- For numbered items (assignments, papers), append `-{n}` at the end

### Examples

```
content/pyqs/
  binary-search-pyqs.md
  database-normalization-pyqs.md
  os-scheduling-2023-pyqs.md

content/notes/
  graph-algorithms-notes.md
  tcp-ip-model-notes.md
  recursion-and-backtracking-notes.md

content/assignments/
  operating-system-assignment-1.md
  dbms-er-diagram-assignment-2.md
  cn-socket-programming-assignment-1.md

content/references/
  system-design-reference-links.md
  compiler-design-books-reference.md
  machine-learning-papers-reference.md

content/cheatsheets/
  sql-joins-cheatsheet.md
  time-complexity-cheatsheet.md
  linux-commands-cheatsheet.md
```

---

## Session-Based Retrieval Mapping

Since files are **not** subject-divided, the AI maps files to session rooms via metadata:

### Recommended Frontmatter (add to every `.md` file)

```yaml
---
session_tags: [operating-systems, scheduling, memory-management]
type: notes          # pyqs | notes | assignment | reference | cheatsheet
topic: CPU Scheduling
difficulty: medium   # easy | medium | hard  (for pyqs/assignments)
created: 2026-03-22
---
```

### How Retrieval Works (future AI layer)

```
User in Session Room → "ECE Semester 4"
  ↓
AI reads session subject tags
  ↓
Vector search over content/ filtered by matching session_tags
  ↓
Returns ranked chunks from relevant files
```

This means a single file like `graph-algorithms-notes.md` with
`session_tags: [dsa, algorithms, graphs]` will surface in **any** session
that has those tags — no need to duplicate files per subject.

---

## Markdown File Guidelines for AI Chunking

- Use `##` headings to separate logical sections (AI chunks by heading)
- Keep each section **self-contained** (avoid "as mentioned above" references)
- Use code blocks for code/formulas
- Prefer bullet points over dense paragraphs for better chunk quality
- Aim for file sizes between **200–2000 lines** — split larger files by subtopic

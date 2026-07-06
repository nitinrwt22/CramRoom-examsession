# 🧠 CramRoom Architectural & Product Decisions Log (PROJECT_DECISIONS.md)

This document is the single source of truth for **why** the CramRoom V2 platform was architected and built the way it is. It documents our core philosophies, trade-offs, and design rules.

---

## 1. Core Philosophy: Evidence-First, AI Second

### Decision
We reject the industry-standard model of feeding exam papers directly to an LLM to predict questions. Instead, CramRoom parses exam papers into structured database entities first, computes deterministic statistics (frequency, marks weights, recency), and uses AI strictly as an enhancement layer.

### Rationale
*   **Prevent Hallucinations:** Generative AI is prone to inventing questions or details that never appeared. Grounding predictions in database rows (`raw_questions`) guarantees that every study recommendation is backed by historical evidence.
*   **Explainability:** Students must know exactly *why* a topic is marked as high priority. With structured database rows, the UI can show exact occurrence numbers and exam years alongside the recommendation.
*   **Performance:** Dynamically scanning raw PDF texts or running semantic indexing on every dashboard load is slow. Pre-calculating statistics in database caches (`topic_analytics`) guarantees dashboard loads under 300ms.

---

## 2. Ingestion & Mapping: Syllabus-First Grounding

### Decision
The course syllabus is the primary grounding taxonomy for the platform. All uploaded exam papers (PYQs) and notes are mapped directly to syllabus topics. If a session is started without an uploaded syllabus, the system automatically generates a "Default Syllabus" and creates fallback topics based on PDF file titles.

### Rationale
*   **Boundary Enforcement:** Students must not waste time studying topics that are outside the course scope. Mapping questions to syllabus topics guarantees that study guides align strictly with curriculum boundaries.
*   **Taxonomy Anchor:** Without a syllabus as a canonical taxonomic key, topic names would drift (e.g., "Normal Forms" vs. "Database Normalization" would be treated as separate concepts). Grouping variants under a canonical syllabus name stabilizes analytics.

---

## 3. Execution Priority: Deterministic → Heuristic → AI

### Decision
Wherever deterministic logic or heuristic word overlap calculations can confidently solve a problem (such as topic mapping or section parsing), they take precedence. The AI LLM classifier is invoked strictly as a fallback.

```text
Deterministic Rules ──> Heuristics ──> AI Fallback
```

### Rationale
*   **Cost & Latency:** LLM API queries cost money and take seconds. Deterministic string parsing and heuristic keyword overlap (TF-IDF) resolve in milliseconds at zero cost.
*   **Deterministic Reliability:** Parsing structured PDFs (e.g., matching question numbers, bullet lists) is best solved by regex patterns. Running LLMs on formatting parsing is brittle and unreliable.

---

## 4. Prompt Context: Multi-Source Grounding Hierarchy

### Decision
All AI prompt generation builders must compile RAG context blocks following a strict grounding hierarchy:
1.  **Syllabus (Primary Context):** Defines the boundary of the course.
2.  **PYQ Questions (Evidence Context):** Details the exam style, question format, and marks weight.
3.  **Uploaded Notes (Style Context):** Customizes vocabulary and layout (e.g., "the teacher prefers simple diagrams").

*Note:* Uploaded notes cannot override or contradict facts grounded in the syllabus or historical exam papers.

### Rationale
*   **Student Personalization:** Using notes as a style/supporting layer ensures the AI answers match the vocabulary and conventions taught in class, while grounding the facts in the syllabus ensures correctness.

---

## 5. UI Presentation: Flowchart-First Answers

### Decision
We enforce structured ASCII/markdown flowcharts, tables, and bullet points in generated answers. Visual image diagram generations (SVG, Canvas, or external links) are prohibited in V1.

### Rationale
*   **Client Compatibility:** Text-based ASCII flowcharts render instantly on all browsers, mobile devices, and terminal scripts without requiring heavy canvas/SVG rendering libraries.
*   **Clean Markdown:** Keeps the AI responses completely textual, matching the platform's focus on markdown-driven collaborative notebooks.

---

## 6. Integration: Model Independence

### Decision
All LLM operations (answering, categorization, expected question generation) are abstracted behind a unified interface (`LLMProvider`). Core business logic is decoupled from provider SDKs.

### Rationale
*   **Future-Proofing:** Swapping the underlying model (e.g., switching from Gemini to Claude or running a local Llama model via Ollama) only requires modifying the configuration wrapper, preventing codebase-wide rewrites.

---

## 7. UX Design: Analytics Default

### Decision
When a user opens a question card, the interface defaults to the **Analytics Tab** (marks distribution, frequency of variants, years appeared) rather than the Answer Tab.

### Rationale
*   **Evidence Awareness:** Forces students to notice the exam relevance and weight of the concept before reading the pre-generated answer, reinforcing the evidence-first study philosophy.

---

## 8. Topic Ownership: System-Managed Taxonomy

### Decision
In V1, users are prohibited from manual topic CRUD (creating, renaming, merging, deleting). Topics are strictly generated and managed by the platform based on syllabus ingestion.

### Rationale
*   **Prevent Taxonomy Corruption:** Student-side manual edits can corrupt the shared taxonomy. Restricting editing to background parsing guarantees database consistency across all participants in the session.

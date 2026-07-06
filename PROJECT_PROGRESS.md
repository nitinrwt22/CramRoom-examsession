# 🎓 CramRoom Project Progress Dashboard

This document serves as the master dashboard for the CramRoom V2 rebuild. It tracks the implementation of the **evidence-first exam intelligence platform**, mapping current progress, completed decisions, review history, and upcoming actions.

---

## SECTION 1: Executive Summary

*   **Overall Project Vision:** Transform CramRoom from a simple heuristic-based QA generator to an evidence-first exam intelligence platform where historical PYQ data serves as grounding evidence, and AI acts strictly as an advisory/enhancement layer.
*   **Current Development Phase:** Topic Intelligence — Phase 3 (AI Prompt & RAG Scoping)
*   **Overall Completion Percentage:** 16%
*   **Last Completed Milestone:** Topic Intelligence Phase 2 — Approved (2026-07-07)
*   **Current Active Milestone:** Topic Intelligence Phase 3: AI Prompt & RAG Scoping
*   **Next Milestone:** Topic Intelligence Phase 4: API & Integration Layer

---

## SECTION 2: Roadmap

| Subsystem | Status | Completion % | Description |
|---|---|---|---|
| **Database Foundation** | Completed | 100% | Rebuild schema from V1 heuristic tables to V2 normalized structures (`papers`, `syllabi`, `topics`, `raw_questions`, `canonical_questions`, `generated_answers`, etc.). |
| **Topic Intelligence** | In Progress | 40% | Consolidate parsing utilities and refine weak topic algorithms (deduplication, score thresholds, recency and coverage metrics). |
| **Question Intelligence** | Not Started | 0% | TF-IDF similarity mapping, variant grouping under canonical forms, and low-confidence classification fallback. |
| **Answer Intelligence** | Not Started | 0% | SHA-256 caching of generated answers and custom styling instructions extracted from student notes. |
| **Analytics** | Not Started | 0% | Pre-computed dashboard stats, frequency metrics, and marks distributions. |
| **Study Planner** | Not Started | 0% | 2-hour revision block scheduler using personalized weak/strong topic inputs. |
| **Frontend Integration** | Not Started | 0% | Redesigning dashboard cards, detail page defaults, and explainability evidence metrics. |
| **Optimization** | Not Started | 0% | Index coverage optimization and query latency controls. |
| **Production Readiness** | Not Started | 0% | Final staging verification, security audits, and cold-backup procedures. |

---

## SECTION 3: Milestone Tracker

### Milestone 1: Database V2 Migration
*   **Completion Date:** 2026-06-23
*   **Documents Produced:** [DATA_MIGRATION_PLAN.md](file:///Users/nitinrawat/sessiondrive/reports/database/DATA_MIGRATION_PLAN.md), [DATABASE_MIGRATION_EXECUTION_PLAN.md](file:///Users/nitinrawat/sessiondrive/reports/database/DATABASE_MIGRATION_EXECUTION_PLAN.md), [DATABASE_MIGRATION_REVIEW.md](file:///Users/nitinrawat/sessiondrive/reports/database/DATABASE_MIGRATION_REVIEW.md)
*   **Review Outcome:** Passed. Code renaming and database patch applied successfully.
*   **Test Status:** 16/16 data integrity checks passed.
*   **Final Approval Status:** Approved.

### Milestone 2: Database V2 Service & Integration Testing
*   **Completion Date:** 2026-06-25
*   **Documents Produced:** [DATABASE_TESTING_PLAN.md](file:///Users/nitinrawat/sessiondrive/reports/database/DATABASE_TESTING_PLAN.md), [DATABASE_TESTING_REVIEW.md](file:///Users/nitinrawat/sessiondrive/reports/database/DATABASE_TESTING_REVIEW.md)
*   **Review Outcome:** Passed. Minor latency gap on cache miss documented.
*   **Test Status:** 56/56 database integration test assertions passed.
*   **Final Approval Status:** Approved.

### Milestone 3: Database V2 Legacy Cleanup
*   **Completion Date:** 2026-06-26
*   **Documents Produced:** [LEGACY_CLEANUP_PLAN.md](file:///Users/nitinrawat/sessiondrive/reports/database/LEGACY_CLEANUP_PLAN.md), [LEGACY_CLEANUP_REVIEW.md](file:///Users/nitinrawat/sessiondrive/reports/database/LEGACY_CLEANUP_REVIEW.md), [PHASE_1_DATABASE_COMPLETION.md](file:///Users/nitinrawat/sessiondrive/reports/database/PHASE_1_DATABASE_COMPLETION.md)
*   **Review Outcome:** Passed. Stale columns pruned, views replaced, V1 fallbacks dropped.
*   **Test Status:** Cleanup validation completed with clean schema assertions.
*   **Final Approval Status:** Approved.

### Milestone 4: Topic Intelligence Phase 1 (Core Code Cleanup)
*   **Completion Date:** 2026-07-05
*   **Documents Produced:** [TOPIC_PHASE1_REVIEW.md](file:///Users/nitinrawat/sessiondrive/reports/topic_system/TOPIC_PHASE1_REVIEW.md)
*   **Review Outcome:** Passed. Parser utilities consolidated into `fileConverter.util.ts` and uploader user ID resolved dynamically.
*   **Test Status:** 54/54 parser unit tests passed.
*   **Final Approval Status:** Approved.

### Milestone 5: Topic Intelligence Phase 2 (Algorithmic Refinement)
*   **Completion Date:** 2026-07-07
*   **Documents Produced:** Test Runner [runPhase2Tests.ts](file:///Users/nitinrawat/sessiondrive/backend/scripts/runPhase2Tests.ts), [TOPIC_PHASE2_REVIEW.md](file:///Users/nitinrawat/sessiondrive/reports/topic_system/TOPIC_PHASE2_REVIEW.md)
*   **Review Outcome:** **APPROVED WITH MINOR NOTES** — Weak topic score threshold (>= 3) enforced, recency index and coverage percentages implemented. Two minor notes tracked as P1/P2 debt.
*   **Test Status:** 25/25 Phase 2 tests + 54/54 Phase 1 regression tests passed.
*   **Final Approval Status:** ✅ Approved.

---

## SECTION 4: Current Phase

*   **Current Phase:** Topic Intelligence — Phase 3 (AI Prompt and RAG Scoping)
*   **Goal:** Establish model-independent prompt compilation and enforce context priority grounding.
*   **Scope:**
    1.  Design and implement a model-agnostic `LLMProvider` interface to decouple business logic from provider SDKs.
    2.  Refactor RAG prompt builders to ground context in the strict priority hierarchy: **Syllabus (Primary) → PYQs (Evidence) → Uploaded Notes (Supporting)**.
    3.  Enforce plain-text (ASCII) flowchart, list, and table answer formatting rules.
*   **Key Documents:** [TOPIC_SYSTEM_V2_DESIGN.md](file:///Users/nitinrawat/sessiondrive/reports/topic_system/TOPIC_SYSTEM_V2_DESIGN.md), [TOPIC_IMPLEMENTATION_PLAN.md](file:///Users/nitinrawat/sessiondrive/reports/topic_system/TOPIC_IMPLEMENTATION_PLAN.md), [TOPIC_SYSTEM_REQUIREMENTS.md](file:///Users/nitinrawat/sessiondrive/reports/topic_system/TOPIC_SYSTEM_REQUIREMENTS.md)
*   **Current Status:** Planning
*   **Remaining Work:** Implement the LLM provider wrapper class, refactor context injection algorithms, and verify prompt layouts.

---

## SECTION 5: Completed Decisions

The following architectural and product design decisions are locked in:
1.  **Database V2 Schema:** Normalizes the V1 overloaded tables into specialized tables (`papers`, `syllabi`, `topics`, `raw_questions`, etc.).
2.  **Evidence-First AI:** Ground all insights, recommendations, and study prompts in precomputed database statistics (frequency, recency, marks weights) instead of LLM heuristics.
3.  **Syllabus-First Architecture:** The syllabus is the primary source of truth for topics. Questions map to syllabus topics; if no syllabus is present, a default syllabus object is generated.
4.  **Flowchart-First Answers:** Prompts force text-based ASCII flowcharts and structured tables; visual diagrams are deferred to future versions.
5.  **Advisory Pipeline:** Deterministic parsing dominates. The system order is: **Deterministic Rules → Heuristics → AI**. AI is only used as a fallback.
6.  **Topic Ownership:** Topics are strictly system-managed in V1. User-side CRUD controls are prohibited to prevent taxonomy corruption.
7.  **Multi-source Hierarchy:** Prompts assemble context in the strict order: Syllabus → PYQs → Uploaded Notes. Notes supplement formatting but cannot contradict the syllabus.
8.  **Model Independence:** Generative features are decoupled behind an abstraction wrapper, allowing seamless swaps between Gemini, Claude, or local models.

---

## SECTION 6: Pending Decisions

### Question Intelligence
*   *Lexical Overlap threshold:* Establish the default TF-IDF similarity threshold (currently proposed at 0.70) before invoking the fallback AI classifier.
*   *Confidence Audit triggers:* Determine what mapping confidence levels trigger alert flags for administrative reviews.

### Answer Intelligence
*   *Cache invalidation strategy:* Decide whether generated answer records should persist indefinitely or clear automatically after older years' exams are deleted.

### UX Dashboard
*   *Highlighting threshold:* Establish the exact priority-score boundaries that style a topic card as "Very High" vs. "High" on the dashboard.

---

## SECTION 7: Review History

| Phase | Review Document | Result | Important Fixes | Final Status |
|---|---|---|---|---|
| Database Migration | [DATABASE_MIGRATION_REVIEW.md](file:///Users/nitinrawat/sessiondrive/reports/database/DATABASE_MIGRATION_REVIEW.md) | PASS | Resolved participants view renaming. | Approved |
| Database Testing | [DATABASE_TESTING_REVIEW.md](file:///Users/nitinrawat/sessiondrive/reports/database/DATABASE_TESTING_REVIEW.md) | PASS | Logged performance scan Bitmap Heap exceptions. | Approved |
| Database Legacy Cleanup | [LEGACY_CLEANUP_REVIEW.md](file:///Users/nitinrawat/sessiondrive/reports/database/LEGACY_CLEANUP_REVIEW.md) | PASS | Refactored Dist files and purged V1 fallback flags. | Approved |
| Topic System Phase 1 | [TOPIC_PHASE1_REVIEW.md](file:///Users/nitinrawat/sessiondrive/reports/topic_system/TOPIC_PHASE1_REVIEW.md) | PASS | Centralized parser helpers to utils. | Approved |
| Topic System Phase 2 | [TOPIC_PHASE2_REVIEW.md](file:///Users/nitinrawat/sessiondrive/reports/topic_system/TOPIC_PHASE2_REVIEW.md) | APPROVED WITH MINOR NOTES | `question_analytics.recency_index` not yet populated (tracked P1 for Phase 4). Formula constant extraction recommended. | ✅ Approved |

---

## SECTION 8: Technical Debt

*   **Low:** `UPLOAD_PROCESSING` background worker executes sequential database operations without wrapping the entire question insert array in a single PostgreSQL transaction (status quo, inherited).
*   **Medium:** Stale compiled files in `backend/dist/` contain references to deprecated V1 database tables. Clearing these requires a clean rebuild, but they do not affect active runtime execution.

---

## SECTION 9: Deferred Work

*   **24-Hour Staging Soak:** Verifying log stability over 24 hours under active user simulations (postponed to release preparation).
*   **Dynamic Visual Flowcharts:** Rendering flowchart logic as visual diagram images instead of text ASCII layouts.
*   **Vector Search & Embeddings:** Moving from TF-IDF lexical mapping to semantic embeddings (pgvector).
*   **Multi-Subject Cross-Referencing:** Mapping overlapping topics across separate course syllabi.

---

## SECTION 10: Current Backlog

*   **Critical:** Implement `LLMProvider` interface and model wrappers (Phase 3).
*   **High:** Refactor RAG prompt compilers to enforce Syllabus → PYQ → Notes context hierarchy (Phase 3).
*   **Medium:** Populate `question_analytics.recency_index` in `ANALYTICS_REBUILD` (P1 carry-over from Phase 2 review, target Phase 4).
*   **Low:** Extract recency decay formula into a shared constant (P2 carry-over from Phase 2 review).

---

## SECTION 11: Risk Register

| Risk Description | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Serial SQL queries in job worker block transactions during database spikes. | Low | Medium | Throttle worker polling interval or wrap insertions in bulk statements. |
| Fallback AI classifier halts job processing if LLM API rate limits are reached. | Medium | High | Implement fallback rules assigning the general subject topic on API error. |
| Ingestion parsing regex fails on unstructured or scanning-only PDF files. | Medium | Medium | Implement optical character recognition fallback or simple raw-block text dump. |

---

## SECTION 12: Statistics

*   **Documents Created:** 18
*   **Reviews Completed:** 4
*   **Approved Phases:** 1 (Database Phase completely approved; Topic Phase 1 approved)
*   **Tests Executed:** 79 (54 parser unit tests + 25 algorithm and integration tests)
*   **Overall Code Health:** High (Typescript compiles cleanly with no errors, 100% test pass rate)
*   **Estimated Project Completion:** 6 Weeks

---

## SECTION 13: Next Actions

1.  **Gate 2 Approved ✅** — Phase 2 review completed and documented in [TOPIC_PHASE2_REVIEW.md](file:///Users/nitinrawat/sessiondrive/reports/topic_system/TOPIC_PHASE2_REVIEW.md).
2.  **Begin Phase 3** — Implement the model-agnostic `LLMProvider` abstraction interface in `backend/src/services/ai/`.
3.  **Refactor RAG prompt compilers** — Enforce Syllabus → PYQ → Notes grounding hierarchy in `aiEngine.service.ts` and `knowledgeRetrieval.service.ts`.

---

## SECTION 14: Executive Dashboard

```text
Database Foundation
████████████████████ 100%

Topic Intelligence
████████░░░░░░░░░░░░ 40%

Question Intelligence
░░░░░░░░░░░░░░░░░░░░ 0%

Answer Intelligence
░░░░░░░░░░░░░░░░░░░░ 0%

Analytics
░░░░░░░░░░░░░░░░░░░░ 0%

Frontend Integration
░░░░░░░░░░░░░░░░░░░░ 0%

Overall Progress
████░░░░░░░░░░░░░░░░ 16%
```

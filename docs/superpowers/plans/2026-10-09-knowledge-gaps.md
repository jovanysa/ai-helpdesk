# Knowledge Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record questions the chat could not answer (or refused as off-topic) and show them to staff grouped by normalized text.

**Architecture:** A `GapRecorder` is handed to the chat handler. Off-topic refusals are recorded immediately; normal replies are reviewed after `done` by a JSON yes/no model call (fire-and-forget). Rows live in SQLite; staff list and resolve them through two staff-only routes in the existing route table. A lazy Angular page shows them.

**Tech Stack:** Same as phases 2–3. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-09-knowledge-gaps-design.md`

## Global Constraints

- Reasons (exact): `no_answer`, `off_topic`. Default list reason `no_answer`.
- The answer check is `qwen2.5:3b` (same `OLLAMA_MODEL`), `stream: false`, `think: false`, `temperature: 0`, `format` `{ missing_information: boolean }`, prompt exactly as tested in the spike (spec §2), 30s timeout.
- Recording never throws and never delays the SSE stream. Log prefixes: `[gaps] could not record question:` and `[gaps] answer check failed:`.
- No review when the stream was aborted, errored, or the reply is blank.
- Staff routes only; same `ApiRoute` table and `runRoute` as phase 2.
- Never `git add angular.json`. Tests: `npx ng test --watch=false`.

## Review Focus

1. A recording failure (DB locked, Ollama down) must not break or slow the chat reply. Tests in Tasks 2 and 3.
2. The same question typed with different hamza/taa marbuta/punctuation groups together; a question asked again after "تم" reappears with a fresh count. Tests in Task 1.
3. The Stop button or a closed tab must not record a half reply. Test in Task 3.
4. Off-topic refusals are recorded with reason `off_topic`, not `no_answer`. Test in Task 3.
5. Unauthenticated access to the gaps routes returns 401 (covered by the existing route-table test once the routes are `staffOnly`). Test in Task 3.

---

### Task 1: Normalization and repository
- Create `src/server/unanswered-questions.ts`: `normalizeQuestion(text): string` (spec §2 rules), `type GapReason`, `interface GapGroup { key; question; count; lastAskedAt; lastReply }`, `class UnansweredRepository(db, now?)` with `record(question, reply, reason): void`, `listOpen(reason): GapGroup[]` (count desc, lastAskedAt desc; question/lastReply from the newest row), `resolve(reason, key): number`.
- Modify `src/server/db.ts`: add the spec §4 table and index; `db.spec.ts` table list gains `unanswered_questions`.
- Tests: normalization cases; grouping of `عندكم فرع في إسكندرية؟` + `عندكم فرع في اسكندرية` + `  عندكم   فرع في اسكندريه ` into one group of 3; ordering; reasons kept apart; resolve hides the group and returns the row count; asking again after resolve shows count 1.
- Commit `feat(server): store unanswered questions grouped by normalized text`

### Task 2: Answer check and recorder
- Create `src/server/gap-recorder.ts`: `ANSWER_CHECK_PROMPT`, `type AnswerCheck = (question, reply) => Promise<boolean>` (true = missing information), `createOllamaAnswerCheck(config)`, `interface GapRecorder { recordOffTopic(question, reply): void; reviewReply(question, reply): Promise<void> }`, `class GapLog implements GapRecorder(repo, check)`.
- Tests: request shape; boolean parsing and malformed → throw; `reviewReply` records only when missing; never rejects when the check or the repo throws; `recordOffTopic` never throws.
- Commit `feat(server): review replies for missing information`

### Task 3: Chat integration, API routes, server wiring
- `chat-handler.ts`: `startChatStream(deps: ChatDeps, turns, signal)` with `ChatDeps { provider; knowledge; isAboutFoundation; gaps }` (update all call sites/tests); off-topic → `gaps.recordOffTopic(current, refusal)`; `sseEvents` collects token text and after yielding `done` calls `void gaps.reviewReply(current, reply)` when the reply is not blank; not on error/abort.
- `chat-route.ts`: `createChatRouter(deps: ChatDeps)`.
- `api-routes.ts`: deps gain `gaps: UnansweredRepository`; add `GET /gaps` and `POST /gaps/resolve` (staffOnly). Handler validation: reason must be one of the two; key must be a non-empty string → 400 otherwise.
- `server.ts`: build `UnansweredRepository`, `GapLog(repo, createOllamaAnswerCheck(ollamaConfig))`, pass both.
- Tests: off-topic recorded; review called once with the full reply after done; not called after abort or mid-stream error; route table lists the two new staff routes as protected; list/resolve handlers (400 on bad reason/key).
- Build; commit `feat(server): record unanswered questions from the chat and expose them to staff`

### Task 4: Staff page
- `src/app/gaps/gaps-api.ts` (`list(reason)`, `resolve(reason, key)`), `src/app/staff/gaps-page.ts|html|scss` (tabs, groups, `×N`, last asked, `<details>` last reply, "تم" removes the group locally after success, empty state, footer hint), route `staff/gaps` (lazy, inside the guarded `staff` children), link in the ticket list header.
- Tests: API calls; page loads `no_answer` by default, switching tab loads `off_topic`, "تم" posts and removes the row, empty state text.
- Build; commit `feat(staff): page for questions the chat could not answer`

### Task 5: End-to-end
- Fresh server with scratch DB: ask the spec §5 sequence through `/api/chat`; log in; `GET /api/gaps` for both reasons; resolve one; add an answer to a scratch `KNOWLEDGE_DIR`, restart, ask again → answered and not recorded.

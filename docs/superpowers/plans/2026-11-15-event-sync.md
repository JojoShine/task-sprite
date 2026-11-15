# Event-driven Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Task mutations upload immediately and cloud notifications update other online terminals, replacing timer-driven full sync.

**Architecture:** Existing authenticated HTTP long-wait metadata channel backed by PostgreSQL commit notifications. Separate mutation queue and notification receiver per client; reuse existing conflict/revision/data protocols.

**Tech Stack:** NestJS, Prisma, pg, Taro/React, Rust/Tauri/reqwest; no new transport dependency.

**Spec:** docs/specs/event-sync.md

## Global Constraints
- Preserve real data, account/license/device identities, original protected credential agent and signing keys.
- Existing task-specific desktop branch and copied miniapp workspace are the execution scope; no template edits, resets, commits/pushes or company-server deployment.
- `/changes/wait`: POST authenticated through TaskSyncGuard, `{cursor}`, `{revision,changed}`, 20s timeout, no task payload. Unchanged heartbeat does not trigger full sync.
- Only enabled and verified cloud workspaces may communicate; local writes remain durable on failure.

## Review Focus
- Mutation arrives between the final pending check and sync completion: queue must drain it.
- Cloud commit races listener setup, crashes, reconnect or response cancellation: no lost updates or leaked waiters.
- Pause, logout, credential/account changes during long waits: stale responses cannot affect a new workspace.
- Failed/offline requests and large/paged histories: retry without a busy loop, truncation or perpetual successful-idle sync.
- Same-device echo and empty heartbeat: no notification/sync feedback loop.

### Task 1: API notification channel
- [x] Add workspace notification listener/wait endpoint; publish only real committed mutations.
- [x] Validate authentication, headers and cursor; clean up aborts, listener shutdown and reconnect.
- [x] Tests: two waiters/process listener, isolation, rollback/replay/conflicts, race, timeout and cancellation.
- Own files: API task-sprite module/controller/service and new notification service/tests; relevant local reverse-proxy documentation only.

### Task 2: Desktop queue and receiver
- [x] Replace five-minute sync thread with signal-driven upload worker plus metadata notification receiver.
- [x] Signal every task mutation, retain in-flight signals, retry failures with bounded backoff; preserve local-only opt-in.
- [x] Settings show automatic change sync; keep first consent and pause/disable, remove permanent manual-sync button.
- [x] Rust/frontend tests for queue/retry/mutation coverage/metadata protocol and settings controls.
- Own files: desktop src-tauri sync_http/new sync worker/lib/tests, sync_store only necessary cursor access, SyncSettings and tests.

### Task 3: Miniapp queue and receiver
- [x] Reliable generation-safe upload queue and one foreground long-wait loop; startup/show/network recovery catch up.
- [x] Remove task-list/insights periodic sync calls, retain UI clocks; remove persistent manual sync controls.
- [x] Tests: in-flight local edits, heartbeats, remote change, offline recovery, hide/show, account/logout isolation.
- Own files: miniapp runtime/new receiver helpers/tests, app lifecycle and business page synchronization wiring.

### Task 4: Integration and delivery
- [x] Independent scoped review, address blockers; run API/miniapp/frontend/Rust checks and bundle-size checks.
- [x] Update local Docker service preserving volumes; verify two authenticated clients propagate a temporary fixture without timers and idle heartbeats do not sync.
- [x] Sign/package with existing stable agent, graceful update running app, verify real authorization and tasks retained.
- [x] Native WeChat/desktop verification, screenshots and final QA/ledger. No company-server deployment.

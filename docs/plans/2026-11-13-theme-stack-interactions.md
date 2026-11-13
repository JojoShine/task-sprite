# Theme, task stack and focused interactions

User authorized refinements to existing UI. Execute inline in the independent repository.

1. Persist theme system/light/dark in Settings JSON with a backward-compatible system default and native validation. Apply resolved theme to both windows, subscribe to system changes, and provide immediate three-way settings control. Verify legacy JSON, persistence/rejection, system change and override behavior.
2. Replace floating week popover with a dedicated editor subview: choose day, then click a large AM/PM option to commit and return; back/Escape cancels, clear removes both date/time. Keep editor draft and priority intact. Preserve existing rolling-week boundaries and legacy values. Verify cancellation, half-day restrictions and draft restoration.
3. Render multiple tasks as up to three visual paper layers with accessible previous/next controls, position indicator and task deadline. Empty state remains one invitation. Preserve focus-first order, completed-task exclusion and tap response. Verify cycling, live task removal, and hidden hint behavior.
4. Fit the empty task state into the available area with no vertical scrolling or rubber band; keep long task lists/settings scrollable. Use adaptive illustration size and compact layout at minimum height. Centralize theme surfaces for both main window and transparent pet bubble; no dark full-window background behind pet.

Verification: frontend/Rust suites, native build/signature, empty-state wheel and minimum-window visual check, light/dark/system theme and restart, full-view time choice/draft retention, multi-task visual preview using isolated fixtures (no demo tasks in user DB). Review complete patch before delivery.

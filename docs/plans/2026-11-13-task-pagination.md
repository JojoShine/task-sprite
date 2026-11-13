# Compact task pagination and overdue bubbles

User asked shorter cards, larger text, no scroll with up/down paging and about three tasks per page, plus explicit priority for overdue tasks. Asked whether paging refers to panel or pet; absent a reply after independent overdue work, proceed with stated assumption: panel has three per page, pet retains a compact one-task stacked bubble. Adapt if steered.

- Flatten panel grouping to a paginated overdue-first list, retain statuses/actions, three per page and disabled bounds. Clamp when tasks disappear and reset on tab or overdue-set changes.
- Reduce card padding, put metadata and actions on one row, title18px/meta14px. Compact companion footer on list view. Responsive minimum-window treatment preserves paging and accessible task controls.
- Show explicit overdue bubble label, elapsed days or same-day expiry, plus distinct priority metadata. Overdue outranks focused future task; new expiry returns manual bubble selection to the overdue front. Respect hint/quiet/reduced-motion preferences.
- Verify tests for paging/clamp and overdue/focus/new deadline. Check actual four test tasks in native app and small-window isolated geometry. Preserve all task records/settings.

# Desktop usability revision

Goal: implement the user's twelve desktop changes on the existing v0.2.1.
Execution: direct implementation; independent UI and native window domains run in parallel to reduce elapsed time. No deployment or real task fixtures.

1. Editor: afternoon selected by default, one date click commits; morning selectable before date. Sticky save and append-only timestamped task chain. Verify editor/date behavior.
2. Workflow: independent idle/working/waiting modes and steps in additive local SQLite table; preserve existing Task wire schema and task/license identity. Existing cloud contract supports only one focus, so local concurrent execution and chains must survive cloud focus changes. Verify concurrency, timing pause during waiting, persistence, and sync retention.
3. Panel/settings: six cards where height permits, progress filter and execution/waiting controls; orange for one calendar day before due, red overdue; priority badges. Move pet selection/previews to settings, visible reminder settings and quit. Verify action wiring and build.
4. Native/pet: robot default, compact pet and counts, single click opens panel; pinned preference; 2h before deadline then every 30m, transient reminders close after20s without closing manually opened or pinned panels. Larger macOS status icon. Verify scheduler and pin behavior.
5. Integrate: full frontend/native suites once, build a local signed app, copy only scoped changes back to desktop project and deliver actual app path. Preserve signing identity and credentials.

Contracts: Snapshot.workflows?: Record<string, TaskWorkflow>; TaskWorkflow={state:'idle'|'working'|'waiting',steps:TaskStep[]}; TaskStep={id,content,createdAt}. Settings.panelPinned?:boolean. api.execution(id,state), api.appendStep(id,content) both return Snapshot. Native commands set_task_execution and append_task_step. User-visible in-progress includes working and waiting; waiting time does not accumulate active effort. Chains and parallel modes are local in this release; existing task content and selected cloud focus still sync.

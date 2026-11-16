import type { Snapshot, Task, TaskWorkflow } from './types';
export function taskWorkflow(snapshot: Snapshot, task: Task): TaskWorkflow {
  const saved = snapshot.workflows?.[task.id];
  if (task.status === 'completed') return { state: 'idle', steps: saved?.steps ?? [] };
  return saved ?? { state: snapshot.settings.focusId === task.id ? 'working' : 'idle', steps: [] };
}

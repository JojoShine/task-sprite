use super::*;

fn input(title: &str) -> TaskInput {
    TaskInput { id: None, title: title.into(), description: String::new(), category: None,
        priority: "med".into(), status: "todo".into(), due_date: None, due_time: None }
}

#[test]
fn workflow_focus_switch_keeps_both_tasks_working() {
    let mut store = Store::memory().unwrap();
    let first = store.save_task(input("First")).unwrap();
    let second = store.save_task(input("Second")).unwrap();
    store.set_focus(Some(first.id.clone())).unwrap();
    store.set_focus(Some(second.id.clone())).unwrap();
    store.pause_task(&first.id).unwrap();
    assert_eq!(store.snapshot().unwrap().settings.focus_id, Some(second.id));
}

#[test]
fn workflow_waiting_closes_effort_and_pause_is_independent() {
    let mut store = Store::memory().unwrap();
    let first = store.save_task(input("First")).unwrap();
    let second = store.save_task(input("Second")).unwrap();
    store.set_task_execution(&first.id, "working").unwrap();
    store.append_task_step(&first.id, "  Started research  ").unwrap();
    store.set_task_execution(&first.id, "waiting").unwrap();
    store.append_task_step(&first.id, "Waiting for reply").unwrap();
    store.set_task_execution(&second.id, "working").unwrap();
    store.pause_task(&first.id).unwrap();
    let snapshot = store.snapshot().unwrap();
    assert_eq!(snapshot.workflows[&first.id].state, "idle");
    assert_eq!(snapshot.workflows[&second.id].state, "working");
    assert_eq!(snapshot.settings.focus_id, Some(second.id));
    assert_eq!(snapshot.tasks.iter().find(|t| t.id == first.id).unwrap().activity_log.iter().map(|e|e.action.as_str()).collect::<Vec<_>>(), vec!["started", "paused"]);
    assert_eq!(snapshot.workflows[&first.id].steps[0].content, "Started research");
    store.set_task_execution(&first.id, "working").unwrap();
    assert_eq!(store.snapshot().unwrap().tasks.iter().find(|t|t.id==first.id).unwrap().activity_log.last().unwrap().action,"resumed");
}

#[test]
fn workflow_chain_is_append_only_persistent_and_completed_reopened_idle() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workflows.db");
    let mut store = Store::open(&path).unwrap();
    let task = store.save_task(input("Persistent")).unwrap();
    assert!(store.append_task_step(&task.id, "Idle cannot append").is_err());
    store.set_task_execution(&task.id, "working").unwrap();
    assert!(store.append_task_step(&task.id, "   ").is_err());
    assert!(store.append_task_step(&task.id, &"x".repeat(2001)).is_err());
    assert!(store.set_task_execution(&task.id, "unknown").is_err());
    store.append_task_step(&task.id, "First").unwrap();
    let first = store.snapshot().unwrap().workflows[&task.id].steps[0].clone();
    store.append_task_step(&task.id, "Second").unwrap();
    drop(store);
    let mut store = Store::open(&path).unwrap();
    assert_eq!(store.snapshot().unwrap().workflows[&task.id].steps[0], first);
    let mut edit = input("Persistent"); edit.id=Some(task.id.clone()); edit.status="completed".into();
    store.save_task(edit.clone()).unwrap();
    assert_eq!(store.snapshot().unwrap().workflows[&task.id].state,"idle");
    assert!(store.append_task_step(&task.id,"Completed cannot append").is_err());
    assert!(store.set_task_execution(&task.id,"working").is_err());
    edit.status="todo".into(); store.save_task(edit).unwrap();
    let snapshot=store.snapshot().unwrap();
    assert_eq!(snapshot.workflows[&task.id].state,"idle");
    assert_eq!(snapshot.workflows[&task.id].steps.len(),2);
    assert_eq!(snapshot.workflows[&task.id].steps[0],first);
    store.delete_task(&task.id).unwrap();
    let rows:i64=store.conn.query_row("SELECT count(*) FROM task_workflows",[],|r|r.get(0)).unwrap();
    assert_eq!(rows,0);
}

#[test]
fn workflow_defaults_preserve_saved_preferences_and_legacy_focus() {
    let store=Store::memory().unwrap();
    let mut settings=serde_json::to_value(Settings::default()).unwrap();
    settings["pet"]=serde_json::json!("shiba");settings.as_object_mut().unwrap().remove("panelPinned");
    let saved:Settings=serde_json::from_value(settings).unwrap();
    assert!(!saved.panel_pinned);assert_eq!(saved.pet,"shiba");
    assert_eq!(store.snapshot().unwrap().settings.pet,"robot");
    let mut store=store;
    let task=store.save_task(input("Legacy")).unwrap();
    store.set_focus(Some(task.id.clone())).unwrap();
    store.conn.execute("DELETE FROM task_workflows",[]).unwrap();
    assert_eq!(store.snapshot().unwrap().workflows[&task.id].state,"working");
    store.conn.execute("UPDATE tasks SET activity_log=?1 WHERE id=?2",params![serde_json::to_string(&vec![ActivityEvent::new("paused", "2026-11-16T00:00:00Z")]).unwrap(), task.id]).unwrap();
    assert_eq!(store.snapshot().unwrap().workflows[&task.id].state,"idle");
}

#[test]
fn workflow_sync_roundtrip_preserves_parallel_work_and_chain() {
    use crate::sync_store::*;
    let mut store=Store::memory().unwrap();store.sync_link("a").unwrap();store.sync_enable().unwrap();
    let first=store.save_task(input("First")).unwrap();
    let second=store.save_task(input("Second")).unwrap();
    store.set_focus(Some(first.id.clone())).unwrap();store.append_task_step(&first.id,"Local chain").unwrap();
    store.set_focus(Some(second.id.clone())).unwrap();store.set_task_execution(&second.id,"waiting").unwrap();
    let before=store.snapshot().unwrap();
    let request=store.sync_request().unwrap();
    assert_eq!(request.mutations.iter().filter(|m|m.task.as_ref().unwrap().in_progress).count(),2);
    let mut changes=Vec::new();let mut results=Vec::new();
    for mutation in request.mutations {
        let mut remote=mutation.task.clone().unwrap();remote.in_progress=mutation.task_id==first.id;remote.execution_state=None;remote.follow_ups=None;
        changes.push(Change{task_id:mutation.task_id.clone(),revision:1,deleted:false,task:Some(remote)});
        results.push(MutationResult{mutation_id:mutation.mutation_id,task_id:mutation.task_id,status:"accepted".into(),revision:Some(1),reason:None,remote:None,active_task:None});
    }
    store.sync_apply(SyncResponse{results,changes,cursor:1,has_more:false}).unwrap();
    let after=store.snapshot().unwrap();
    assert_eq!(after.workflows,before.workflows);
    for task in &before.tasks {assert_eq!(after.tasks.iter().find(|t|t.id==task.id).unwrap().activity_log,task.activity_log);}
}

#[test]
fn workflow_waiting_survives_unrelated_settings_and_explicit_focus_resumes() {
    let mut store=Store::memory().unwrap();
    let task=store.save_task(input("Wait")).unwrap();
    store.set_focus(Some(task.id.clone())).unwrap();
    store.set_task_execution(&task.id,"waiting").unwrap();
    let mut settings=store.snapshot().unwrap().settings;settings.panel_pinned=true;
    store.set_settings(settings).unwrap();
    let snapshot=store.snapshot().unwrap();
    assert_eq!(snapshot.workflows[&task.id].state,"waiting");
    assert_eq!(snapshot.tasks[0].activity_log.len(),2);
    assert!(snapshot.settings.panel_pinned);
    store.set_focus(Some(task.id.clone())).unwrap();
    let snapshot=store.snapshot().unwrap();
    assert_eq!(snapshot.workflows[&task.id].state,"working");
    assert_eq!(snapshot.tasks[0].activity_log.last().unwrap().action,"resumed");
}

#[test]
fn workflow_cloud_completion_preserves_chain_and_remote_delete_cascades() {
    use crate::sync_store::*;
    let mut store=Store::memory().unwrap();store.sync_link("a").unwrap();store.sync_enable().unwrap();
    let task=store.save_task(input("Cloud finish")).unwrap();
    store.set_focus(Some(task.id.clone())).unwrap();store.append_task_step(&task.id,"Persistent chain").unwrap();
    let request=store.sync_request().unwrap();let sent=&request.mutations[0];
    let change=Change{task_id:task.id.clone(),revision:1,deleted:false,task:sent.task.clone()};
    store.sync_apply(SyncResponse{results:vec![MutationResult{mutation_id:sent.mutation_id.clone(),task_id:task.id.clone(),status:"accepted".into(),revision:Some(1),reason:None,remote:None,active_task:None}],changes:vec![change],cursor:1,has_more:false}).unwrap();
    let mut remote=sent.task.clone().unwrap();remote.in_progress=false;remote.task.status="completed".into();remote.task.completed_at=Some(Utc::now().to_rfc3339());
    store.sync_apply(SyncResponse{results:vec![],changes:vec![Change{task_id:task.id.clone(),revision:2,deleted:false,task:Some(remote)}],cursor:2,has_more:false}).unwrap();
    let snapshot=store.snapshot().unwrap();
    assert_eq!(snapshot.workflows[&task.id].state,"idle");
    assert_eq!(snapshot.workflows[&task.id].steps.len(),1);
    assert_eq!(snapshot.tasks[0].activity_log.last().unwrap().action,"completed");
    // A completion history seeded during download is an ordinary next upload.
    let request=store.sync_request().unwrap();
    if let Some(sent)=request.mutations.first() {
        store.sync_apply(SyncResponse{results:vec![MutationResult{mutation_id:sent.mutation_id.clone(),task_id:task.id.clone(),status:"accepted".into(),revision:Some(3),reason:None,remote:None,active_task:None}],changes:vec![Change{task_id:task.id.clone(),revision:3,deleted:false,task:sent.task.clone()}],cursor:3,has_more:false}).unwrap();
    }
    store.sync_apply(SyncResponse{results:vec![],changes:vec![Change{task_id:task.id.clone(),revision:4,deleted:true,task:None}],cursor:4,has_more:false}).unwrap();
    assert!(store.snapshot().unwrap().workflows.is_empty());
}

#[test]
fn workflow_delete_record_is_scoped_persistent_and_keeps_task_unchanged() {
    let dir=tempfile::tempdir().unwrap();let path=dir.path().join("delete-record.db");
    let mut store=Store::open(&path).unwrap();
    let task=store.save_task(input("Long-term tracking")).unwrap();
    let other=store.save_task(input("Other task")).unwrap();
    store.set_task_execution(&task.id,"working").unwrap();
    store.append_task_step(&task.id,"First update").unwrap();
    store.append_task_step(&task.id,"Second update").unwrap();
    store.set_task_execution(&task.id,"waiting").unwrap();
    let before=store.snapshot().unwrap();let steps=&before.workflows[&task.id].steps;
    assert!(store.delete_task_step(&other.id,&steps[0].id).is_err());
    assert!(store.delete_task_step(&task.id,"missing").is_err());
    store.delete_task_step(&task.id,&steps[0].id).unwrap();
    drop(store);let mut store=Store::open(&path).unwrap();let after=store.snapshot().unwrap();
    assert_eq!(after.workflows[&task.id].state,"waiting");
    assert_eq!(after.workflows[&task.id].steps,vec![steps[1].clone()]);
    assert_eq!(serde_json::to_value(&after.tasks).unwrap(),serde_json::to_value(&before.tasks).unwrap());
    assert_eq!(serde_json::to_value(&after.settings).unwrap(),serde_json::to_value(&before.settings).unwrap());
    let mut edit=input("Long-term tracking");edit.id=Some(task.id.clone());edit.status="completed".into();store.save_task(edit).unwrap();
    store.delete_task_step(&task.id,&steps[1].id).unwrap();
    assert!(store.snapshot().unwrap().workflows[&task.id].steps.is_empty());
}

#[test]
fn workflow_card_pin_and_window_pin_persist_independently() {
    let mut store=Store::memory().unwrap();let mut settings=store.snapshot().unwrap().settings;
    settings.card_pinned=true;settings.panel_pinned=false;store.set_settings(settings).unwrap();
    let mut settings=store.snapshot().unwrap().settings;
    assert!(settings.card_pinned);assert!(crate::windows::hide_on_blur(settings.panel_pinned,false));
    settings.panel_pinned=true;store.set_settings(settings).unwrap();
    let mut settings=store.snapshot().unwrap().settings;assert!(settings.card_pinned && settings.panel_pinned);
    settings.card_pinned=false;store.set_settings(settings).unwrap();
    let settings=store.snapshot().unwrap().settings;
    assert!(!settings.card_pinned);assert!(settings.panel_pinned);assert!(!crate::windows::hide_on_blur(settings.panel_pinned,false));
}
#[test]
fn workflow_legacy_fixed_card_migrates_without_pinning_task_window() {
    let dir=tempfile::tempdir().unwrap();let path=dir.path().join("separate-pins.db");
    let mut store=Store::open(&path).unwrap();let task=store.save_task(input("Preserved task")).unwrap();
    let identity=store.local_identity().unwrap().user_id;
    let mut legacy=serde_json::to_value(store.snapshot().unwrap().settings).unwrap();
    legacy.as_object_mut().unwrap().remove("cardPinned");legacy["panelPinned"]=serde_json::json!(true);
    store.conn.execute("UPDATE settings SET payload=?1",[legacy.to_string()]).unwrap();
    drop(store);let store=Store::open(&path).unwrap();let snapshot=store.snapshot().unwrap();
    assert!(snapshot.settings.card_pinned);assert!(!snapshot.settings.panel_pinned);
    assert_eq!(snapshot.tasks[0].id,task.id);assert_eq!(store.local_identity().unwrap().user_id,identity);
}

#[test]
fn workflow_explicit_cloud_wait_and_pause_replace_local_execution() {
    use crate::sync_store::*;
    let mut store=Store::memory().unwrap(); store.sync_link("a").unwrap(); store.sync_enable().unwrap();
    let task=store.save_task(input("Remote state")).unwrap();store.set_focus(Some(task.id.clone())).unwrap();
    let request=store.sync_request().unwrap();let m=&request.mutations[0];
    let mut remote=m.task.clone().unwrap();remote.in_progress=true;remote.execution_state=Some("waiting".into());
    store.sync_apply(SyncResponse{results:vec![MutationResult{mutation_id:m.mutation_id.clone(),task_id:task.id.clone(),status:"accepted".into(),revision:Some(1),reason:None,remote:None,active_task:None}],changes:vec![Change{task_id:task.id.clone(),revision:1,deleted:false,task:Some(remote.clone())}],cursor:1,has_more:false}).unwrap();
    assert_eq!(store.snapshot().unwrap().workflows[&task.id].state,"waiting");
    remote.in_progress=false;remote.execution_state=Some("idle".into());
    store.sync_apply(SyncResponse{results:vec![],changes:vec![Change{task_id:task.id.clone(),revision:2,deleted:false,task:Some(remote)}],cursor:2,has_more:false}).unwrap();
    assert_eq!(store.snapshot().unwrap().workflows[&task.id].state,"idle");
    assert!(store.sync_request().unwrap().mutations.is_empty());
}

#[test]
fn workflow_followups_upload_and_remote_delete_are_idempotent() {
    use crate::sync_store::*;
    let mut store=Store::memory().unwrap();store.sync_link("a").unwrap();store.sync_enable().unwrap();
    let task=store.save_task(input("Shared chain")).unwrap();store.set_focus(Some(task.id.clone())).unwrap();store.append_task_step(&task.id,"等待对方确认").unwrap();
    let request=store.sync_request().unwrap();let m=&request.mutations[0];
    assert_eq!(m.task.as_ref().unwrap().follow_ups.as_ref().unwrap().len(),1);
    store.sync_apply(SyncResponse{results:vec![MutationResult{mutation_id:m.mutation_id.clone(),task_id:task.id.clone(),status:"accepted".into(),revision:Some(1),reason:None,remote:None,active_task:None}],changes:vec![Change{task_id:task.id.clone(),revision:1,deleted:false,task:m.task.clone()}],cursor:1,has_more:false}).unwrap();
    assert!(store.sync_request().unwrap().mutations.is_empty());
    let mut remote=m.task.clone().unwrap();remote.follow_ups=Some(vec![]);
    store.sync_apply(SyncResponse{results:vec![],changes:vec![Change{task_id:task.id.clone(),revision:2,deleted:false,task:Some(remote)}],cursor:2,has_more:false}).unwrap();
    assert!(store.snapshot().unwrap().workflows[&task.id].steps.is_empty());
    assert!(store.sync_request().unwrap().mutations.is_empty());
}

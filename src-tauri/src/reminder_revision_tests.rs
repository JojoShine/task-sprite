use crate::{reminders::{deliver, plan}, store::{Store, TaskInput}, windows::{PanelLifecycle, hide_on_blur}};
use chrono::{DateTime, FixedOffset};
fn now(s: &str) -> DateTime<FixedOffset> { DateTime::parse_from_rfc3339(&format!("{s}:00+08:00")).unwrap() }
fn task(store: &mut Store, date: &str, time: Option<&str>) -> String {
    store.save_task(TaskInput {id:None,title:"截止任务".into(),description:String::new(),priority:"med".into(),status:"todo".into(),due_date:Some(date.into()),due_time:time.map(str::to_owned), category:None}).unwrap().id
}
fn store() -> Store {
    let mut s = Store::memory().unwrap();
    let mut settings = s.snapshot().unwrap().settings;
    settings.summary_time = "22:00".into();
    s.set_settings(settings).unwrap();
    s
}
#[test]
fn deadlines_start_two_hours_early_repeat_half_hour_and_continue_overdue() {
    for (deadline, before, first, second) in [("12:00","09:59","10:00","10:30"),("17:00","14:59","15:00","15:30")] {
        let mut s=store(); task(&mut s,"2026-11-16",Some(deadline));
        assert!(plan(&s,now(&format!("2026-11-16T{before}"))).unwrap().is_none());
        assert!(deliver(&mut s,now(&format!("2026-11-16T{first}")), |_|Ok(())).unwrap());
        assert!(plan(&s,now(&format!("2026-11-16T{first}"))).unwrap().is_none());
        assert!(deliver(&mut s,now(&format!("2026-11-16T{second}")), |_|Ok(())).unwrap());
        assert!(plan(&s,now("2026-11-17T10:00")).unwrap().is_some());
    }
}
#[test]
fn date_only_uses_afternoon_deadline_and_completed_tasks_are_ignored() {
    let mut s=store(); let id=task(&mut s,"2026-11-16",None);
    assert!(plan(&s,now("2026-11-16T14:59")).unwrap().is_none());
    assert!(plan(&s,now("2026-11-16T15:00")).unwrap().is_some());
    let t=s.snapshot().unwrap().tasks.into_iter().find(|t|t.id==id).unwrap();
    s.save_task(TaskInput{id:Some(t.id),title:t.title,description:t.description,priority:t.priority,status:"completed".into(),due_date:t.due_date,due_time:t.due_time,category:t.category}).unwrap();
    assert!(plan(&s,now("2026-11-16T15:00")).unwrap().is_none());
}
#[test]
fn quiet_snooze_and_notifications_apply_to_repeating_deadlines() {
    let mut s=store();let id=task(&mut s,"2026-11-16",Some("17:00"));
    s.snooze(&id,30,now("2026-11-16T15:00")).unwrap();
    assert!(plan(&s,now("2026-11-16T15:29")).unwrap().is_none());
    assert!(deliver(&mut s,now("2026-11-16T15:30"), |_|Ok(())).unwrap());
    assert!(plan(&s,now("2026-11-16T15:59")).unwrap().is_none());
    assert!(plan(&s,now("2026-11-16T16:00")).unwrap().is_some());
    assert!(plan(&s,now("2026-11-16T23:30")).unwrap().is_none());
    let mut st=s.snapshot().unwrap().settings;st.notifications=false;s.set_settings(st).unwrap();
    assert!(plan(&s,now("2026-11-17T10:00")).unwrap().is_none());
}
#[test]
fn only_unclaimed_reminder_panel_can_auto_close() {
    let mut state=PanelLifecycle::default();
    assert!(state.open_reminder(true,false).is_none());
    assert!(state.open_reminder(false,true).is_none());
    let token=state.open_reminder(false,false).unwrap();
    assert!(state.should_close(token,false,false));
    assert!(!state.should_close(token,true,false));
    assert!(!state.should_close(token,false,true));
    state.interact();assert!(!state.should_close(token,false,false));
    let next=state.open_reminder(false,false).unwrap();
    assert!(!state.should_close(token,false,false));assert!(state.should_close(next,false,false));
    assert!(hide_on_blur(false,false));assert!(!hide_on_blur(true,false));assert!(!hide_on_blur(false,true));
}

#[test]
fn windows_card_prevents_automatic_task_window_without_overriding_disabled_cards() {
    use crate::windows::reminder_uses_card;
    assert!(reminder_uses_card(true,true,true,true));
    assert!(!reminder_uses_card(true,false,true,true));
    assert!(!reminder_uses_card(true,true,false,true));
    assert!(!reminder_uses_card(true,true,true,false));
    assert!(!reminder_uses_card(false,true,true,true));
}

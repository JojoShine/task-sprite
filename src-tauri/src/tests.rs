use super::reminders::*;
use super::store::*;
use super::windows::*;
use chrono::{DateTime, FixedOffset};
fn now(s: &str) -> DateTime<FixedOffset> {
    DateTime::parse_from_str(&format!("{s}+08:00"), "%Y-%m-%d %H:%M%:z").unwrap()
}
fn input(title: &str, date: Option<&str>) -> TaskInput {
    TaskInput {
        id: None,
        title: title.into(),
        description: String::new(),
        priority: "med".into(),
        status: "todo".into(),
        due_date: date.map(str::to_owned),
        due_time: None,
    }
}
#[test]
fn tasks_and_role_survive_reopen() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("tasks.db");
    {
        let mut s = Store::open(&p).unwrap();
        s.save_task(input("写报告", Some("2026-11-13"))).unwrap();
        let mut settings = s.snapshot().unwrap().settings;
        settings.pet = "ghost".into();
        s.set_settings(settings).unwrap();
    }
    let s = Store::open(&p).unwrap();
    assert_eq!(s.snapshot().unwrap().tasks[0].title, "写报告");
    assert_eq!(s.snapshot().unwrap().settings.pet, "ghost");
}
#[test]
fn invalid_task_is_not_persisted() {
    let mut s = Store::memory().unwrap();
    assert!(s.save_task(input("  ", None)).is_err());
    assert!(s.save_task(input("a", Some("2026-02-30"))).is_err());
    let mut i = input("a", None);
    i.priority = "urgent".into();
    assert!(s.save_task(i).is_err());
    assert!(s.snapshot().unwrap().tasks.is_empty());
}
#[test]
fn completing_clears_focus_and_snooze_and_restoring_clears_timestamp() {
    let mut s = Store::memory().unwrap();
    let t = s.save_task(input("报告", None)).unwrap();
    s.set_focus(Some(t.id.clone())).unwrap();
    s.snooze(&t.id, 30, now("2026-11-13 10:00")).unwrap();
    let mut i = input("报告", None);
    i.id = Some(t.id.clone());
    i.status = "completed".into();
    let done = s.save_task(i.clone()).unwrap();
    assert!(done.completed_at.is_some());
    assert_eq!(s.snapshot().unwrap().settings.focus_id, None);
    assert!(s.snoozes().unwrap().is_empty());
    i.status = "todo".into();
    assert_eq!(s.save_task(i).unwrap().completed_at, None);
}
#[test]
fn due_date_can_be_cleared() {
    let mut s = Store::memory().unwrap();
    let t = s.save_task(input("任务", Some("2026-11-13"))).unwrap();
    let mut i = input("任务", None);
    i.id = Some(t.id);
    assert_eq!(s.save_task(i).unwrap().due_date, None);
}
#[test]
fn future_database_version_is_rejected_without_deletion() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("tasks.db");
    let c = rusqlite::Connection::open(&p).unwrap();
    c.pragma_update(None, "user_version", 99).unwrap();
    drop(c);
    assert!(Store::open(&p).is_err());
    assert!(p.exists());
}
#[test]
fn daily_summary_deduplicates_across_reopen() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("tasks.db");
    {
        let mut s = Store::open(&p).unwrap();
        s.save_task(input("报告", Some("2026-11-12"))).unwrap();
        let n = plan(&s, now("2026-11-13 09:05")).unwrap().unwrap();
        assert_eq!(n.task_ids.len(), 1);
        s.record_delivery(&n).unwrap();
        assert!(plan(&s, now("2026-11-13 09:06")).unwrap().is_none());
    }
    assert!(plan(&Store::open(&p).unwrap(), now("2026-11-13 10:00"))
        .unwrap()
        .is_none());
}
#[test]
fn quiet_hours_defer_snooze_until_allowed() {
    let mut s = Store::memory().unwrap();
    let t = s.save_task(input("任务", None)).unwrap();
    s.snooze(&t.id, 30, now("2026-11-13 22:50")).unwrap();
    assert!(plan(&s, now("2026-11-13 23:30")).unwrap().is_none());
    assert!(plan(&s, now("2026-11-14 07:59")).unwrap().is_none());
    assert_eq!(
        plan(&s, now("2026-11-14 08:00")).unwrap().unwrap().task_ids,
        vec![t.id]
    );
}
#[test]
fn no_tasks_no_notification_and_sleep_does_not_catch_up_history() {
    let mut s = Store::memory().unwrap();
    assert!(plan(&s, now("2026-11-13 10:00")).unwrap().is_none());
    s.save_task(input("过期", Some("2026-11-10"))).unwrap();
    let n = plan(&s, now("2026-11-15 10:00")).unwrap().unwrap();
    assert_eq!(n.summary_day.as_deref(), Some("2026-11-15"));
}
#[test]
fn equal_quiet_bounds_disable_quiet_interval() {
    assert!(!is_quiet(540, 540, 540));
    assert!(is_quiet(60, 1380, 480));
    assert!(!is_quiet(600, 1380, 480));
}
#[test]
fn invalid_settings_or_snooze_leave_data_intact() {
    let mut s = Store::memory().unwrap();
    let mut st = s.snapshot().unwrap().settings;
    st.pet = "dragon".into();
    assert!(s.set_settings(st).is_err());
    assert_eq!(s.snapshot().unwrap().settings.pet, "shiba");
    assert!(s.snooze("unknown", 30, now("2026-11-13 10:00")).is_err());
}
#[test]
fn window_clamping_handles_small_and_negative_monitor() {
    let a = Rect {
        x: -1200.,
        y: 0.,
        w: 1200.,
        h: 800.,
    };
    let r = clamp(
        Rect {
            x: -1500.,
            y: 900.,
            w: 260.,
            h: 200.,
        },
        a,
    );
    assert_eq!((r.x, r.y), (-1200., 600.));
    let small = clamp(
        Rect {
            x: 0.,
            y: 0.,
            w: 380.,
            h: 570.,
        },
        Rect {
            x: 0.,
            y: 0.,
            w: 320.,
            h: 480.,
        },
    );
    assert_eq!((small.w, small.h), (320., 480.));
    let p = panel_position(
        Rect {
            x: 1100.,
            y: 600.,
            w: 260.,
            h: 200.,
        },
        Rect {
            x: 0.,
            y: 0.,
            w: 1440.,
            h: 900.,
        },
    );
    assert!(p.x + p.w <= 1440.);
    assert!(p.y + p.h <= 900.);
}
#[test]
fn absolute_snooze_survives_fall_back_and_timezone_change() {
    let mut s = Store::memory().unwrap();
    let t = s.save_task(input("绝对时间提醒", None)).unwrap();
    let mut st = s.snapshot().unwrap().settings;
    st.quiet_start = "00:00".into();
    st.quiet_end = "00:00".into();
    s.set_settings(st).unwrap();
    let before = chrono::DateTime::parse_from_rfc3339("2026-11-01T01:45:00-04:00").unwrap();
    s.snooze(&t.id, 30, before).unwrap();
    assert_eq!(
        s.snoozes().unwrap()[0].1.to_rfc3339(),
        "2026-11-01T06:15:00+00:00"
    );
    let after = chrono::DateTime::parse_from_rfc3339("2026-11-01T01:20:00-05:00").unwrap();
    assert!(plan(&s, after).unwrap().is_some());
}
#[test]
fn failed_notification_submission_keeps_reminders_pending() {
    let mut s = Store::memory().unwrap();
    let t = s
        .save_task(input("提醒未送达", Some("2026-11-12")))
        .unwrap();
    s.snooze(&t.id, 30, now("2026-11-13 08:00")).unwrap();
    assert!(deliver(&mut s, now("2026-11-13 09:00"), |_| Err(
        "系统禁止通知".into()
    ))
    .is_err());
    assert!(!s.delivered("2026-11-13").unwrap());
    assert_eq!(s.snoozes().unwrap().len(), 1);
    assert!(deliver(&mut s, now("2026-11-13 09:01"), |_| Ok(())).unwrap());
    assert!(s.snoozes().unwrap().is_empty());
    assert!(s.delivered("2026-11-13").unwrap());
}

#[test]
fn half_day_deadline_is_saved_validated_and_reminded_once() {
    let mut s = Store::memory().unwrap();
    let raw = serde_json::json!({"title":"下午交稿","description":"","priority":"med","status":"todo","dueDate":"2026-11-13","dueTime":"17:00"});
    let i: TaskInput = serde_json::from_value(raw.clone()).unwrap();
    let task = s.save_task(i).unwrap();
    assert_eq!(serde_json::to_value(&task).unwrap()["dueTime"], "17:00");
    let summary = plan(&s, now("2026-11-13 09:00")).unwrap().unwrap();
    s.record_delivery(&summary).unwrap();
    assert!(plan(&s, now("2026-11-13 16:59")).unwrap().is_none());
    assert!(deliver(&mut s, now("2026-11-13 17:00"), |_| Err("failed".into())).is_err());
    assert!(deliver(&mut s, now("2026-11-13 17:01"), |_| Ok(())).unwrap());
    assert!(plan(&s, now("2026-11-13 17:02")).unwrap().is_none());
    for (date, time) in [(Some("2026-11-13"), "13:00"), (None, "12:00")] {
        let mut bad = raw.clone();
        bad["dueDate"] = serde_json::json!(date);
        bad["dueTime"] = serde_json::json!(time);
        let invalid: TaskInput = serde_json::from_value(bad).unwrap();
        assert!(s.save_task(invalid).is_err());
    }
}
#[test]
fn local_identity_survives_reopen_and_differs_between_installations() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("identity.db");
    let s = Store::open(&p).unwrap();
    let identity: String = s
        .conn
        .query_row("SELECT user_id FROM local_identity WHERE id=1", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert!(uuid::Uuid::parse_str(&identity).is_ok());
    drop(s);
    let s = Store::open(&p).unwrap();
    let again: String = s
        .conn
        .query_row("SELECT user_id FROM local_identity WHERE id=1", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(identity, again);
    let other = Store::memory().unwrap();
    let other_id: String = other
        .conn
        .query_row("SELECT user_id FROM local_identity WHERE id=1", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_ne!(identity, other_id);
}
#[test]
fn version_one_migration_preserves_tasks_settings_and_creates_backup() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("legacy.db");
    let conn = rusqlite::Connection::open(&p).unwrap();
    conn.execute_batch("CREATE TABLE tasks(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,priority TEXT NOT NULL,status TEXT NOT NULL,due_date TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed_at TEXT); CREATE TABLE settings(id INTEGER PRIMARY KEY,payload TEXT NOT NULL); PRAGMA user_version=1;").unwrap();
    conn.execute("INSERT INTO tasks VALUES('legacy','保留任务','','med','todo','2026-11-12','2026-11-01','2026-11-01',NULL)", []).unwrap();
    let mut st = Settings::default();
    st.pet = "ghost".into();
    conn.execute(
        "INSERT INTO settings VALUES(1,?1)",
        [serde_json::to_string(&st).unwrap()],
    )
    .unwrap();
    drop(conn);
    let s = Store::open(&p).unwrap();
    assert_eq!(s.snapshot().unwrap().tasks[0].title, "保留任务");
    assert_eq!(s.snapshot().unwrap().settings.pet, "ghost");
    assert_eq!(
        serde_json::to_value(&s.snapshot().unwrap().tasks[0]).unwrap()["dueTime"],
        serde_json::Value::Null
    );
    assert_eq!(
        s.conn
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        2
    );
    assert!(std::fs::read_dir(d.path())
        .unwrap()
        .filter_map(|e| e.ok())
        .any(|e| e.file_name().to_string_lossy().contains("backup")));
}

#[test]
fn menu_panel_uses_one_logical_coordinate_space_across_displays() {
    // AppKit points: 1440pt Retina main + 1280pt external at 1x.
    let r = cocoa_menu_position(
        900.,
        2600.,
        Rect {
            x: 1440.,
            y: 0.,
            w: 1280.,
            h: 878.,
        },
    );
    assert!(r.x >= 1440.);
    assert_eq!(r.x + r.w, 2720.);
    assert_eq!(r.y, 30.);
    // A display above the primary has a negative top-left y.
    let above = cocoa_menu_position(
        900.,
        600.,
        Rect {
            x: 0.,
            y: 900.,
            w: 1280.,
            h: 778.,
        },
    );
    assert_eq!(above.y, -770.);
}

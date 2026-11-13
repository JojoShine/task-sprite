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

#[test]
fn theme_defaults_for_legacy_settings_and_persists_with_validation() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("theme.db");
    let mut s = Store::open(&p).unwrap();
    let mut legacy = serde_json::to_value(Settings::default()).unwrap();
    legacy.as_object_mut().unwrap().remove("theme");
    s.conn
        .execute(
            "UPDATE settings SET payload=?1 WHERE id=1",
            [legacy.to_string()],
        )
        .unwrap();
    assert_eq!(
        serde_json::to_value(s.snapshot().unwrap().settings).unwrap()["theme"],
        "system"
    );
    let mut raw = serde_json::to_value(s.snapshot().unwrap().settings).unwrap();
    raw["theme"] = serde_json::json!("dark");
    let dark: Settings = serde_json::from_value(raw.clone()).unwrap();
    s.set_settings(dark).unwrap();
    drop(s);
    let mut s = Store::open(&p).unwrap();
    assert_eq!(
        serde_json::to_value(s.snapshot().unwrap().settings).unwrap()["theme"],
        "dark"
    );
    raw["theme"] = serde_json::json!("unknown");
    let invalid: Settings = serde_json::from_value(raw).unwrap();
    assert!(s.set_settings(invalid).is_err());
    assert_eq!(
        serde_json::to_value(s.snapshot().unwrap().settings).unwrap()["theme"],
        "dark"
    );
}

#[test]
fn panels_stay_inside_common_screen_work_areas() {
    for (width, height) in [
        (1024., 600.),
        (1280., 720.),
        (1366., 768.),
        (1440., 900.),
        (1920., 1080.),
        (2560., 1440.),
    ] {
        let work = Rect {
            x: 0.,
            y: 24.,
            w: width,
            h: height - 72.,
        };
        let pet = Rect {
            x: width - 320.,
            y: work.y + work.h - 250.,
            w: 300.,
            h: 230.,
        };
        let beside = panel_position(pet, work);
        let from_menu = cocoa_menu_position(
            height,
            width - 100.,
            Rect {
                x: 0.,
                y: 48.,
                w: width,
                h: height - 72.,
            },
        );
        for panel in [beside, from_menu] {
            assert!(panel.x >= work.x && panel.y >= work.y, "{width}x{height}");
            assert!(
                panel.x + panel.w <= work.x + work.w && panel.y + panel.h <= work.y + work.h,
                "{width}x{height}"
            );
            assert!(panel.w >= 420. && panel.h >= 500., "{width}x{height}");
        }
    }
}


#[test]
fn pet_panel_prefers_above_when_it_fits_and_otherwise_uses_a_free_side() {
    use crate::windows::{panel_position, Rect};
    let area = Rect { x: 0., y: 24., w: 1440., h: 828. };
    let pet = Rect { x: 600., y: 600., w: 300., h: 230. };
    let panel = panel_position(pet, area);
    assert_eq!(panel.x + panel.w / 2., pet.x + pet.w / 2.);
    assert!(panel.y + panel.h <= pet.y + 90.);
    let lower = Rect { x: 0., y: 24., w: 1280., h: 648. };
    let panel = panel_position(Rect { y: 440., ..pet }, lower);
    assert_eq!((panel.w, panel.h), (440., 620.));
    assert!(panel.x + panel.w + 12. <= pet.x + 60.);
    assert!(panel.y >= lower.y && panel.y + panel.h <= lower.y + lower.h);
}


#[test]
fn csv_exports_every_task_attribute_and_handles_spreadsheet_text() {
    let mut s = Store::memory().unwrap();
    let mut first = input("=HYPERLINK(恶意公式)", Some("2026-11-14"));
    first.description = "一行,带逗号\n第二行\"引号\"".into();
    first.priority = "high".into();
    first.due_time = Some("17:00".into());
    let todo = s.save_task(first).unwrap();
    s.set_focus(Some(todo.id.clone())).unwrap();
    let mut done = input("已完成的中文任务", None);
    done.status = "completed".into();
    s.save_task(done).unwrap();
    let snap = s.snapshot().unwrap();
    let csv = crate::export::tasks_csv(&snap);
    assert!(csv.starts_with("\u{feff}\"任务ID\",\"任务标题\",\"任务说明\",\"优先级\",\"状态\",\"创建时间\",\"更新时间\",\"计划完成日期\",\"计划完成时段\",\"计划完成时间\",\"实际完成时间\",\"是否当前任务\"\r\n"));
    assert!(csv.contains(&format!("\"{}\",\"'=HYPERLINK(恶意公式)\"", todo.id)));
    assert!(csv.contains("\"一行,带逗号\n第二行\"\"引号\"\"\""));
    assert!(csv.contains("\"高\",\"待办\""));
    assert!(csv.contains("\"2026-11-14\",\"17:00\",\"2026-11-14 17:00\""));
    assert!(csv.contains("\"已完成的中文任务\""));
    assert!(csv.contains("\"已完成\""));
    assert!(csv.contains("\"是\"\r\n"));
    for task in snap.tasks {
        let created = chrono::DateTime::parse_from_rfc3339(&task.created_at).unwrap().with_timezone(&chrono::Local).format("%Y-%m-%d %H:%M:%S %:z").to_string();
        assert!(csv.contains(&created));
    }
}
#[test]
fn empty_csv_still_contains_all_column_headers() {
    let csv = crate::export::tasks_csv(&Store::memory().unwrap().snapshot().unwrap());
    assert_eq!(csv.matches("\r\n").count(), 1);
    assert!(csv.contains("计划完成时间"));
}



#[test]
fn panel_placement_avoids_the_character_at_edges_corners_and_screen_center() {
    use crate::windows::{panel_layout, Rect};
    for (width, height, offset_x, offset_y) in [
        (800., 1000., 0., 24.), (1024., 600., 0., 24.), (1280., 720., 0., 24.),
        (1366., 768., 0., 24.), (1440., 900., 0., 24.),
        (1920., 1080., -1920., 24.), (2560., 1440., 0., -1440.),
    ] {
        let area = Rect { x: offset_x, y: offset_y, w: width, h: height - 72. };
        for x in [area.x, area.x + (area.w - 300.) / 2., area.x + area.w - 300.] {
            for y in [area.y, area.y + (area.h - 230.) / 2., area.y + area.h - 230.] {
                let original = Rect { x, y, w: 300., h: 230. };
                let (pet, panel) = panel_layout(original, area);
                let body = Rect { x: pet.x + 60., y: pet.y + 61., w: 180., h: 167. };
                assert!(panel.x >= area.x && panel.y >= area.y, "{width}x{height} at {x},{y}");
                assert!(panel.x + panel.w <= area.x + area.w && panel.y + panel.h <= area.y + area.h);
                assert!(panel.w >= 420. && panel.h >= 500.);
                assert!(panel.x + panel.w + 12. <= body.x || body.x + body.w + 12. <= panel.x || panel.y + panel.h + 12. <= body.y || body.y + body.h + 12. <= panel.y, "overlap at {width}x{height}, {x},{y}: {pet:?} {panel:?}");
                assert!(pet.x >= area.x && pet.x + pet.w <= area.x + area.w);
                assert_eq!(pet.y, original.y);
                let (again, panel_again) = panel_layout(pet, area);
                assert_eq!((again.x, again.y), (pet.x, pet.y));
                assert_eq!((panel_again.x, panel_again.y, panel_again.w, panel_again.h), (panel.x, panel.y, panel.w, panel.h));
            }
        }
    }
}
#[test]
fn top_corner_panels_use_the_free_side_without_moving_the_pet() {
    use crate::windows::{panel_layout, Rect};
    let area = Rect { x: 0., y: 24., w: 1440., h: 828. };
    let left = Rect { x: 0., y: 24., w: 300., h: 230. };
    let (pet, panel) = panel_layout(left, area);
    assert_eq!(pet.x, left.x);
    assert!(panel.x >= left.x + 240. + 12.);
    let right = Rect { x: area.w - 300., ..left };
    let (pet, panel) = panel_layout(right, area);
    assert_eq!(pet.x, right.x);
    assert!(panel.x + panel.w + 12. <= right.x + 60.);
}


#[test]
fn tray_panel_collision_is_detected_only_near_the_character() {
    use crate::windows::{panel_clear_of_pet, Rect};
    let panel = Rect { x: 900., y: 32., w: 440., h: 620. };
    let top_pet = Rect { x: 1000., y: 24., w: 300., h: 230. };
    assert!(!panel_clear_of_pet(panel, top_pet));
    assert!(panel_clear_of_pet(panel, Rect { x: 100., ..top_pet }));
    assert!(panel_clear_of_pet(panel, Rect { y: 700., ..top_pet }));
}


#[test]
fn deleting_a_task_permanently_clears_its_focus_and_reminders_across_restart() {
    let d = tempfile::tempdir().unwrap(); let path = d.path().join("delete.db");
    let mut s = Store::open(&path).unwrap();
    let mut i = input("直接删除的任务", Some("2026-11-13")); i.due_time = Some("17:00".into());
    let task = s.save_task(i).unwrap();
    s.set_focus(Some(task.id.clone())).unwrap();
    s.snooze(&task.id, 30, now("2026-11-13 08:00")).unwrap();
    s.conn.execute("INSERT INTO deadline_delivered VALUES(?1,?2)", rusqlite::params![task.id,"2026-11-13T17:00"]).unwrap();
    s.delete_task(&task.id).unwrap();
    assert!(s.snapshot().unwrap().tasks.is_empty());
    assert_eq!(s.snapshot().unwrap().settings.focus_id, None);
    assert!(s.snoozes().unwrap().is_empty());
    assert!(!s.deadline_delivered(&task.id, "2026-11-13T17:00").unwrap());
    assert!(plan(&s, now("2026-11-13 18:00")).unwrap().is_none());
    assert!(!crate::export::tasks_csv(&s.snapshot().unwrap()).contains(&task.id));
    assert_eq!(s.conn.query_row("SELECT COUNT(*) FROM tasks",[],|r|r.get::<_,i64>(0)).unwrap(),0);
    drop(s);
    assert!(Store::open(&path).unwrap().snapshot().unwrap().tasks.is_empty());
}
#[test]
fn deleting_completed_tasks_leaves_other_tasks_and_their_reminders_unchanged() {
    let mut s = Store::memory().unwrap();
    let mut i = input("完成后直接删除", None); i.status = "completed".into();
    let done = s.save_task(i).unwrap();
    let remaining = s.save_task(input("保留这条任务", None)).unwrap();
    s.set_focus(Some(remaining.id.clone())).unwrap();
    s.snooze(&remaining.id, 30, now("2026-11-13 10:00")).unwrap();
    s.delete_task(&done.id).unwrap();
    assert!(s.delete_task("missing").is_err());
    let snap = s.snapshot().unwrap();
    assert_eq!(snap.tasks.len(),1);
    assert_eq!(serde_json::to_value(&snap.tasks[0]).unwrap(),serde_json::to_value(&remaining).unwrap());
    assert_eq!(snap.settings.focus_id, Some(remaining.id));
    assert_eq!(s.snoozes().unwrap().len(),1);
}

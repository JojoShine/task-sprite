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
        category: None,
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
    // Daily summary stays deduplicated while overdue tasks may repeat.
    assert!(plan(&Store::open(&p).unwrap(), now("2026-11-13 10:00"))
        .unwrap().unwrap().summary_day.is_none());
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
    assert!(n.summary_day.is_none());
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
    assert_eq!(s.snapshot().unwrap().settings.pet, "robot");
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
        740.,
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
    assert!(!s.delivered("2026-11-13").unwrap());
}

#[test]
fn half_day_deadline_is_saved_validated_and_reminded_once() {
    let mut s = Store::memory().unwrap();
    let raw = serde_json::json!({"title":"下午交稿","description":"","priority":"med","status":"todo","dueDate":"2026-11-13","dueTime":"17:00"});
    let i: TaskInput = serde_json::from_value(raw.clone()).unwrap();
    let task = s.save_task(i).unwrap();
    assert_eq!(serde_json::to_value(&task).unwrap()["dueTime"], "17:00");
    assert!(plan(&s, now("2026-11-13 09:00")).unwrap().is_none());
    assert!(deliver(&mut s, now("2026-11-13 15:00"), |_| Ok(())).unwrap());
    assert!(plan(&s, now("2026-11-13 15:29")).unwrap().is_none());
    assert!(deliver(&mut s, now("2026-11-13 15:30"), |_| Ok(())).unwrap());
    assert!(plan(&s, now("2026-11-13 16:59")).unwrap().is_some());
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
        5
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
        Rect { x: 2588., y: 878., w: 24., h: 22. },
        Rect {
            x: 1440.,
            y: 0.,
            w: 1280.,
            h: 878.,
        },
        740.,
    );
    assert!(r.x >= 1440.);
    assert_eq!(r.x + r.w, 2720.);
    assert_eq!(r.y, 24.);
    // A display above the primary has a negative top-left y.
    let above = cocoa_menu_position(
        900.,
        Rect { x: 588., y: 1678., w: 24., h: 22. },
        Rect {
            x: 0.,
            y: 900.,
            w: 1280.,
            h: 778.,
        },
        740.,
    );
    assert_eq!(above.y, -776.);
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
        let beside = panel_position(pet, work, 740.);
        let from_menu = cocoa_menu_position(
            height,
            Rect { x: width - 112., y: height - 24., w: 24., h: 24. },
            Rect {
                x: 0.,
                y: 48.,
                w: width,
                h: height - 72.,
            },
            740.,
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
    let panel = panel_position(pet, area, 740.);
    assert_eq!(panel.x + panel.w / 2., pet.x + pet.w / 2.);
    assert!(panel.y + panel.h <= pet.y + 90.);
    let lower = Rect { x: 0., y: 24., w: 1280., h: 648. };
    let panel = panel_position(Rect { y: 440., ..pet }, lower, 740.);
    assert_eq!((panel.w, panel.h), (440., 648.));
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
    assert!(csv.starts_with("\u{feff}\"任务ID\",\"任务标题\",\"任务说明\",\"优先级\",\"状态\",\"创建时间\",\"更新时间\",\"计划完成日期\",\"计划完成时段\",\"计划完成时间\",\"开始时间\",\"实际完成时间\",\"任务用时（分钟）\",\"任务用时（时:分）\",\"任务标签\",\"是否当前任务\",\"任务活动历史\"\r\n"));
    assert!(csv.contains(&format!("\"{}\",\"'=HYPERLINK(恶意公式)\"", todo.id)));
    assert!(csv.contains("\"一行,带逗号\n第二行\"\"引号\"\"\""));
    assert!(csv.contains("\"高\",\"待办\""));
    assert!(csv.contains("\"2026-11-14\",\"17:00\",\"2026-11-14 17:00\""));
    assert!(csv.contains("\"已完成的中文任务\""));
    assert!(csv.contains("\"已完成\""));
    assert!(csv.contains("\"是\",\"["));
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
                let (pet, panel) = panel_layout(original, area, 740.);
                let body = Rect { x: pet.x + 60., y: pet.y + 61., w: 180., h: 167. };
                assert!(panel.x >= area.x && panel.y >= area.y, "{width}x{height} at {x},{y}");
                assert!(panel.x + panel.w <= area.x + area.w && panel.y + panel.h <= area.y + area.h);
                assert!(panel.w >= 420. && panel.h >= 500.);
                assert!(panel.x + panel.w + 12. <= body.x || body.x + body.w + 12. <= panel.x || panel.y + panel.h + 12. <= body.y || body.y + body.h + 12. <= panel.y, "overlap at {width}x{height}, {x},{y}: {pet:?} {panel:?}");
                assert!(pet.x >= area.x && pet.x + pet.w <= area.x + area.w);
                assert_eq!(pet.y, original.y);
                let (again, panel_again) = panel_layout(pet, area, 740.);
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
    let (pet, panel) = panel_layout(left, area, 740.);
    assert_eq!(pet.x, left.x);
    assert!(panel.x >= left.x + 240. + 12.);
    let right = Rect { x: area.w - 300., ..left };
    let (pet, panel) = panel_layout(right, area, 740.);
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
    let remaining = s.snapshot().unwrap().tasks.into_iter().find(|task| task.id == remaining.id).unwrap();
    s.snooze(&remaining.id, 30, now("2026-11-13 10:00")).unwrap();
    s.delete_task(&done.id).unwrap();
    assert!(s.delete_task("missing").is_err());
    let snap = s.snapshot().unwrap();
    assert_eq!(snap.tasks.len(),1);
    assert_eq!(serde_json::to_value(&snap.tasks[0]).unwrap(),serde_json::to_value(&remaining).unwrap());
    assert_eq!(snap.settings.focus_id, Some(remaining.id));
    assert_eq!(s.snoozes().unwrap().len(),1);
}

#[test]
fn mac_panel_is_anchored_below_the_status_item_and_clamped_to_its_screen() {
    let visible = Rect { x: 0., y: 48., w: 1440., h: 830. };
    let middle = cocoa_menu_position(900., Rect { x: 1000., y: 878., w: 24., h: 22. }, visible, 740.);
    assert_eq!((middle.x, middle.y, middle.w, middle.h), (792., 24., 440., 740.));
    let right = cocoa_menu_position(900., Rect { x: 1416., y: 878., w: 24., h: 22. }, visible, 740.);
    assert_eq!((right.x, right.y), (1000., 24.));
    let left = cocoa_menu_position(900., Rect { x: 0., y: 878., w: 24., h: 22. }, visible, 740.);
    assert_eq!((left.x, left.y), (0., 24.));
}

#[test]
fn mac_panel_stays_below_a_revealed_auto_hidden_menu_bar() {
    let panel = cocoa_menu_position(900., Rect { x: 1000., y: 878., w: 24., h: 22. }, Rect { x: 0., y: 48., w: 1440., h: 852. }, 740.);
    assert_eq!(panel.y, 24.);
}


#[test]
fn resizing_task_card_preserves_the_pet_feet_and_panel_clearance() {
    use crate::windows::{resized_pet, panel_position, panel_clear_of_pet, Rect};
    let area = Rect { x: 0., y: 0., w: 1440., h: 900. };
    let original = Rect { x: 900., y: 600., w: 300., h: 230. };
    let taller = resized_pet(original, 450., area);
    assert_eq!(taller.h, 450.);
    assert_eq!(taller.y + taller.h, original.y + original.h);
    assert_eq!(taller.y + taller.h - 169., original.y + 61.);
    let restored = resized_pet(taller, 230., area);
    assert_eq!(restored.y, original.y);
    assert!(panel_clear_of_pet(panel_position(taller, area, 740.), taller));
    let near_top = resized_pet(Rect { y: 10., ..original }, 450., area);
    assert_eq!(near_top.y, 0.);
}


#[test]
fn all_task_history_and_current_work_survive_reopen_and_remain_exportable() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("tasks.sqlite3");
    let (pending_id, oldest_id) = {
        let mut store = Store::open(&path).unwrap();
        let pending = store.save_task(input("退出重开仍然要做的任务", Some("2026-11-14"))).unwrap();
        store.set_focus(Some(pending.id.clone())).unwrap();
        let mut oldest = String::new();
        for index in 0..20 {
            let mut task = input(&format!("保留历史任务{index}"), None);
            task.status = "completed".into();
            let task = store.save_task(task).unwrap();
            if index == 0 { oldest = task.id; }
        }
        (pending.id, oldest)
    };
    let store = Store::open(&path).unwrap();
    let snapshot = store.snapshot().unwrap();
    assert_eq!(snapshot.tasks.len(), 21);
    assert_eq!(snapshot.tasks.iter().filter(|task| task.status == "completed").count(), 20);
    assert_eq!(snapshot.settings.focus_id, Some(pending_id.clone()));
    assert!(snapshot.tasks.iter().any(|task|task.id == pending_id && task.status == "todo"));
    let csv = crate::export::tasks_csv(&snapshot);
    assert!(csv.contains(&oldest_id));
    assert!(csv.contains("保留历史任务0"));
    assert_eq!(csv.lines().count(),22);
}


#[test]
fn focus_switch_preserves_parallel_work_after_reopen() {
    let dir=tempfile::tempdir().unwrap();let path=dir.path().join("tasks.sqlite3");
    let (first,second)={
        let mut store=Store::open(&path).unwrap();
        let first=store.save_task(input("并行任务一",None)).unwrap();
        let second=store.save_task(input("并行任务二",None)).unwrap();
        store.set_focus(Some(first.id.clone())).unwrap();
        store.set_focus(Some(second.id.clone())).unwrap();
        assert_eq!(store.snapshot().unwrap().workflows[&first.id].state,"working");
        (first,second)
    };
    let mut store=Store::open(&path).unwrap();
    assert_eq!(store.snapshot().unwrap().settings.focus_id,Some(second.id.clone()));
    store.pause_task(&first.id).unwrap();
    assert_eq!(store.snapshot().unwrap().workflows[&second.id].state,"working");
    assert_eq!(store.snapshot().unwrap().settings.focus_id,Some(second.id));
}

#[test]
fn task_timing_starts_once_survives_restart_and_reopening_preserves_history() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("timing.db");
    let mut store = Store::open(&path).unwrap();
    let task = store.save_task(input("计时任务", None)).unwrap();
    assert!(serde_json::to_value(&task).unwrap()["startedAt"].is_null());
    store.set_focus(Some(task.id.clone())).unwrap();
    let started = serde_json::to_value(&store.snapshot().unwrap().tasks[0]).unwrap()["startedAt"].clone();
    assert!(started.is_string());
    store.set_focus(Some(task.id.clone())).unwrap();
    let mut edit = input("编辑计时任务", None);
    edit.id = Some(task.id.clone());
    store.save_task(edit.clone()).unwrap();
    drop(store);
    let mut store = Store::open(&path).unwrap();
    assert_eq!(serde_json::to_value(&store.snapshot().unwrap().tasks[0]).unwrap()["startedAt"], started);
    edit.status = "completed".into();
    let completed = store.save_task(edit.clone()).unwrap();
    assert_eq!(serde_json::to_value(&completed).unwrap()["startedAt"], started);
    assert!(completed.completed_at.is_some());
    let completion = completed.completed_at;
    assert_eq!(store.save_task(edit.clone()).unwrap().completed_at, completion);
    edit.status = "todo".into();
    let restored = store.save_task(edit).unwrap();
    assert!(restored.completed_at.is_none());
    assert_eq!(serde_json::to_value(restored).unwrap()["startedAt"], started);
}

#[test]
fn csv_exports_start_finish_and_elapsed_minutes_without_inventing_history() {
    let mut store = Store::memory().unwrap();
    let task = store.save_task(input("已计时", None)).unwrap();
    store.set_focus(Some(task.id.clone())).unwrap();
    assert!(serde_json::to_value(&store.snapshot().unwrap().tasks[0]).unwrap()["startedAt"].is_string());
    store.conn.execute("UPDATE tasks SET activity_log='[]',started_at='2026-11-13T01:00:00Z',completed_at='2026-11-13T02:02:03Z',status='completed' WHERE id=?1", [&task.id]).unwrap();
    let mut legacy = input("直接完成", None);
    legacy.status = "completed".into();
    store.save_task(legacy).unwrap();
    let csv = crate::export::tasks_csv(&store.snapshot().unwrap());
    assert!(csv.contains("\"开始时间\""));
    assert!(csv.contains("\"任务用时（分钟）\""));
    assert!(csv.contains("\"62\",\"01:02\""));
    let unstarted = csv.lines().find(|line| line.contains("直接完成")).unwrap();
    assert!(unstarted.contains("\"\",\"\",\"否\""));
}

#[test]
fn version_two_migration_preserves_tasks_and_unknown_start_times() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("version-two.db");
    let mut store = Store::open(&path).unwrap();
    let task = store.save_task(input("旧版任务", None)).unwrap();
    store.set_focus(Some(task.id.clone())).unwrap();
    store.conn.execute_batch("ALTER TABLE tasks DROP COLUMN activity_log; ALTER TABLE tasks DROP COLUMN category; ALTER TABLE tasks DROP COLUMN started_at; PRAGMA user_version=2;").unwrap();
    drop(store);
    let store = Store::open(&path).unwrap();
    let snapshot = store.snapshot().unwrap();
    assert_eq!(snapshot.tasks[0].id, task.id);
    assert_eq!(snapshot.settings.focus_id, Some(task.id));
    assert!(serde_json::to_value(&snapshot.tasks[0]).unwrap()["startedAt"].is_null());
    assert!(std::fs::read_dir(dir.path()).unwrap().filter_map(|e| e.ok()).any(|e| e.file_name().to_string_lossy().contains("backup")));
}

#[test]
fn sync_queue_survives_restart_and_keeps_edits_made_during_upload() {
    use crate::sync_store::*;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("sync.db");
    let mut store = Store::open(&path).unwrap();
    store.sync_link("account-one").unwrap();
    store.sync_enable().unwrap();
    let task = store.save_task(input("original", None)).unwrap();
    let request = store.sync_request().unwrap();
    assert_eq!(request.mutations.len(), 1);
    drop(store);
    let mut store = Store::open(&path).unwrap();
    assert_eq!(store.sync_request().unwrap().mutations[0].mutation_id, request.mutations[0].mutation_id);
    let mut edited = input("edited during upload", None); edited.id = Some(task.id.clone());
    store.save_task(edited).unwrap();
    store.sync_apply(SyncResponse { results: vec![MutationResult { mutation_id: request.mutations[0].mutation_id.clone(), task_id: task.id.clone(), status: "accepted".into(), revision: Some(1), reason: None, remote: None, active_task: None }], changes: vec![Change { task_id: task.id.clone(), revision: 1, deleted: false, task: request.mutations[0].task.clone() }], cursor: 1, has_more: false }).unwrap();
    assert_eq!(store.snapshot().unwrap().tasks[0].title, "edited during upload");
    let next = store.sync_request().unwrap();
    assert_eq!(next.mutations[0].base_revision, 1);
    assert_ne!(next.mutations[0].mutation_id, request.mutations[0].mutation_id);
    store.delete_task(&task.id).unwrap();
    assert!(store.sync_request().unwrap().mutations[0].deleted);
}
#[test]
fn legacy_rejection_retries_local_edit_and_synced_deletion_preserves_preferences() {
    use crate::sync_store::*;
    let mut store = Store::memory().unwrap();
    store.sync_link("account-one").unwrap();store.sync_enable().unwrap();
    let task = store.save_task(input("local", None)).unwrap();
    store.set_focus(Some(task.id.clone())).unwrap();
    let request = store.sync_request().unwrap();
    let remote = Change { task_id: task.id.clone(), revision: 2, deleted: true, task: None };
    store.sync_apply(SyncResponse { results: vec![MutationResult { mutation_id: request.mutations[0].mutation_id.clone(), task_id: task.id.clone(), status: "conflict".into(), revision: None, reason: Some("revision_changed".into()), remote: Some(remote.clone()), active_task: None }], changes: vec![remote], cursor: 2, has_more: false }).unwrap();
    assert_eq!(store.snapshot().unwrap().tasks.len(), 1);
    let retry = store.sync_request().unwrap().mutations.remove(0);
    assert_ne!(retry.mutation_id, request.mutations[0].mutation_id);
    assert_eq!(retry.base_revision, 2);
    assert!(store.sync_status().unwrap().conflicts.is_empty());
    let deleted = Change { task_id: task.id.clone(), revision: 4, deleted: true, task: None };
    store.sync_apply(SyncResponse { results: vec![MutationResult { mutation_id: retry.mutation_id, task_id: task.id.clone(), status: "accepted".into(), revision: Some(3), reason: None, remote: None, active_task: None }], changes: vec![deleted], cursor: 4, has_more: false }).unwrap();
    let snapshot = store.snapshot().unwrap();
    assert!(snapshot.tasks.is_empty());assert!(snapshot.settings.focus_id.is_none());
    assert_eq!(snapshot.settings.pet, "robot");
    assert!(store.sync_link("different-account").is_err());
}
#[test]
fn first_sync_creates_a_readable_backup_before_merging_existing_tasks() {
    let dir=tempfile::tempdir().unwrap();let path=dir.path().join("tasks.db");
    let mut store=Store::open(&path).unwrap();store.save_task(input("keep me",None)).unwrap();
    store.sync_link("account-one").unwrap();store.sync_enable().unwrap();
    let backup=std::fs::read_dir(dir.path()).unwrap().map(|entry|entry.unwrap().path()).find(|path|path.to_string_lossy().contains("before-sync")).unwrap();
    let connection=rusqlite::Connection::open(backup).unwrap();
    assert_eq!(connection.query_row("SELECT title FROM tasks",[],|row|row.get::<_,String>(0)).unwrap(),"keep me");
}
#[test]
fn unacknowledged_edit_survives_downloads_then_newer_cloud_revision_wins() {
    use crate::sync_store::*;
    let mut store=Store::memory().unwrap();store.sync_link("a").unwrap();store.sync_enable().unwrap();
    let task=store.save_task(input("local",None)).unwrap();let sent=store.sync_request().unwrap();
    let mut remote_task=task.clone();remote_task.title="cloud v1".into();
    let remote=Change{task_id:task.id.clone(),revision:1,deleted:false,task:Some(SyncTask{task:remote_task.clone(),in_progress:false,execution_state:None,follow_ups:None})};
    store.sync_apply(SyncResponse{results:vec![MutationResult{mutation_id:sent.mutations[0].mutation_id.clone(),task_id:task.id.clone(),status:"conflict".into(),revision:None,reason:Some("revision_changed".into()),remote:Some(remote.clone()),active_task:None}],changes:vec![remote],cursor:1,has_more:false}).unwrap();
    remote_task.title="cloud v2".into();
    store.sync_apply(SyncResponse{results:vec![],changes:vec![Change{task_id:task.id.clone(),revision:2,deleted:false,task:Some(SyncTask{task:remote_task,in_progress:false,execution_state:None,follow_ups:None})}],cursor:2,has_more:false}).unwrap();
    assert_eq!(store.snapshot().unwrap().tasks[0].title,"local");
    let sent=store.sync_request().unwrap().mutations.remove(0);
    let mut newest=sent.task.unwrap(); newest.task.title="cloud v3".into();
    store.sync_apply(SyncResponse { results: vec![MutationResult { mutation_id: sent.mutation_id, task_id: task.id.clone(), status: "accepted".into(), revision: Some(3), reason: None, remote: None, active_task: None }], changes: vec![Change { task_id: task.id, revision: 4, deleted: false, task: Some(newest) }], cursor: 4, has_more: false }).unwrap();
    assert_eq!(store.snapshot().unwrap().tasks[0].title,"cloud v3");
}
#[test]
fn active_conflict_keeps_a_new_offline_task_in_the_queue() {
    use crate::sync_store::*;
    let mut store=Store::memory().unwrap();store.sync_link("a").unwrap();store.sync_enable().unwrap();
    let task=store.save_task(input("offline work",None)).unwrap();store.set_focus(Some(task.id.clone())).unwrap();let sent=store.sync_request().unwrap();
    let mut active=task.clone();active.id="cloud-active".into();active.title="cloud work".into();
    let active=Change{task_id:active.id.clone(),revision:1,deleted:false,task:Some(SyncTask{task:active,in_progress:true,execution_state:None,follow_ups:None})};
    store.sync_apply(SyncResponse{results:vec![MutationResult{mutation_id:sent.mutations[0].mutation_id.clone(),task_id:task.id.clone(),status:"conflict".into(),revision:None,reason:Some("another_task_in_progress".into()),remote:Some(Change{task_id:task.id.clone(),revision:0,deleted:true,task:None}),active_task:Some(active.clone())}],changes:vec![active],cursor:1,has_more:false}).unwrap();
    let snapshot=store.snapshot().unwrap();
    assert!(snapshot.tasks.iter().any(|t|t.title=="offline work"));
    assert_eq!(snapshot.workflows[&task.id].state,"working");
    assert_eq!(snapshot.workflows["cloud-active"].state,"working");
    let request=store.sync_request().unwrap();let pending=request.mutations.iter().find(|m|m.task_id==task.id).unwrap();assert!(!pending.deleted);assert!(pending.task.as_ref().unwrap().in_progress);
}
#[test]
fn task_labels_survive_reopen_and_csv_and_old_tasks_remain_unlabelled() {
    let d=tempfile::tempdir().unwrap();let path=d.path().join("labels.db");
    let mut store=Store::open(&path).unwrap();let old=store.save_task(input("old",None)).unwrap();
    let mut next=input("work",None);next.category=Some("work".into());let work=store.save_task(next).unwrap();
    drop(store);let store=Store::open(&path).unwrap();let snapshot=store.snapshot().unwrap();
    assert!(snapshot.tasks.iter().find(|t|t.id==old.id).unwrap().category.is_none());
    assert_eq!(snapshot.tasks.iter().find(|t|t.id==work.id).unwrap().category.as_deref(),Some("work"));
    assert!(crate::export::tasks_csv(&snapshot).contains("\"任务标签\""));
}
#[test]
fn invalid_task_label_is_rejected_and_batch_creation_is_atomic() {
    let mut store=Store::memory().unwrap();let mut invalid=input("bad",None);invalid.category=Some("finance".into());
    assert!(store.save_task(invalid).is_err());
    assert!(store.save_tasks(vec![input("one",None),input("",None)]).is_err());assert!(store.snapshot().unwrap().tasks.is_empty());
    store.save_tasks(vec![input("one",None),input("two",None)]).unwrap();assert_eq!(store.snapshot().unwrap().tasks.len(),2);
}
#[test]
fn version_three_migration_preserves_timing_and_focus_before_adding_labels() {
    let dir=tempfile::tempdir().unwrap();let path=dir.path().join("version-three.db");
    let mut store=Store::open(&path).unwrap();let task=store.save_task(input("original work",None)).unwrap();store.set_focus(Some(task.id.clone())).unwrap();
    let started=store.snapshot().unwrap().tasks[0].started_at.clone();
    store.conn.execute_batch("ALTER TABLE tasks DROP COLUMN activity_log; ALTER TABLE tasks DROP COLUMN category; PRAGMA user_version=3;").unwrap();drop(store);
    let store=Store::open(&path).unwrap();let snapshot=store.snapshot().unwrap();
    assert_eq!(snapshot.tasks[0].started_at,started);assert_eq!(snapshot.settings.focus_id,Some(task.id));assert!(snapshot.tasks[0].category.is_none());
}

#[test]
fn activation_does_not_enable_sync_and_pause_preserves_workspace_tasks() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("activation.db");
    let mut store = Store::open(&path).unwrap();
    store.save_task(input("Local only", None)).unwrap();
    assert!(!store.sync_is_enabled().unwrap());
    store.sync_link("workspace-a").unwrap();
    assert!(!store.sync_is_enabled().unwrap());
    store.sync_enable().unwrap();
    assert!(store.sync_is_enabled().unwrap());
    store.sync_disable().unwrap();
    assert!(!store.sync_is_enabled().unwrap());
    drop(store);
    let store = Store::open(&path).unwrap();
    let status = store.sync_status().unwrap();
    assert!(!status.enabled);
    assert_eq!(status.account_id.as_deref(), Some("workspace-a"));
    assert_eq!(store.snapshot().unwrap().tasks.len(), 1);
    assert!(store.sync_link("workspace-b").unwrap_err().contains("工作空间"));
}
#[test]
fn sync_signals_survive_an_inflight_drain() {
    use std::sync::atomic::Ordering;
    crate::sync_http::signal();
    assert!(crate::sync_http::PENDING.swap(false, Ordering::AcqRel));
    crate::sync_http::signal();
    assert!(crate::sync_http::PENDING.swap(false, Ordering::AcqRel));
    assert!(!crate::sync_http::PENDING.swap(false, Ordering::AcqRel));
}
#[test]
fn license_activation_request_uses_stable_installation_and_workspace_fence() {
    let request = crate::sync_http::activation_body(" ts-abcd-abcd-abcd-abcd-abcd-abcd ", "installation-id", Some("workspace-a")).unwrap();
    assert_eq!(request["code"], "TS-ABCD-ABCD-ABCD-ABCD-ABCD-ABCD");
    assert_eq!(request["installationId"], "installation-id");
    assert_eq!(request["expectedAccountId"], "workspace-a");
    assert!(crate::sync_http::activation_body("invalid", "installation-id", None).is_err());
}

#[test]
fn pause_during_license_check_withholds_upload_batch_and_keeps_it_for_resume() {
    let directory = tempfile::tempdir().unwrap();
    let mut store = Store::open(&directory.path().join("pause.db")).unwrap();
    store.sync_link("workspace").unwrap();
    store.sync_enable().unwrap();
    store.save_task(input("Keep pending", None)).unwrap();
    let before = store.sync_request_if_enabled().unwrap().unwrap();
    assert_eq!(before.mutations.len(), 1);
    // The license HTTP response arrives after the user pauses synchronization.
    store.sync_disable().unwrap();
    assert!(store.sync_request_if_enabled().unwrap().is_none());
    assert_eq!(store.snapshot().unwrap().tasks.len(), 1);
    store.sync_enable().unwrap();
    let resumed = store.sync_request_if_enabled().unwrap().unwrap();
    assert_eq!(resumed.mutations[0].mutation_id, before.mutations[0].mutation_id);
}

#[test]
fn activity_history_records_start_and_completion() {
    let mut store=Store::memory().unwrap();
    let task=store.save_task(input("history",None)).unwrap();
    store.set_focus(Some(task.id.clone())).unwrap();
    let mut done=input("history",None); done.id=Some(task.id); done.status="completed".into();
    let saved=store.save_task(done).unwrap();
    let json=serde_json::to_value(saved).unwrap();
    assert_eq!(json["activityLog"][0]["action"],"started");
    assert_eq!(json["activityLog"][1]["action"],"completed");
}


#[test]
fn activity_pause_releases_focus_resumes_and_survives_reopen() {
    let dir=tempfile::tempdir().unwrap(); let path=dir.path().join("history.db");
    let mut store=Store::open(&path).unwrap();
    let first=store.save_task(input("first",None)).unwrap();
    let second=store.save_task(input("second",None)).unwrap();
    assert!(store.pause_task(&first.id).is_err());
    store.set_focus(Some(first.id.clone())).unwrap();
    let started=store.snapshot().unwrap().tasks.iter().find(|t|t.id==first.id).unwrap().started_at.clone();
    assert!(store.pause_task(&second.id).is_err());
    store.pause_task(&first.id).unwrap();
    assert!(store.snapshot().unwrap().settings.focus_id.is_none());
    assert!(store.pause_task(&first.id).is_err());
    store.set_focus(Some(second.id.clone())).unwrap();
    assert_eq!(store.snapshot().unwrap().workflows[&second.id].state,"working");
    store.pause_task(&second.id).unwrap();
    drop(store);
    let mut store=Store::open(&path).unwrap();
    store.set_focus(Some(first.id.clone())).unwrap();
    store.set_focus(Some(first.id.clone())).unwrap();
    let snapshot=store.snapshot().unwrap();let task=snapshot.tasks.iter().find(|t|t.id==first.id).unwrap();
    assert_eq!(task.started_at,started);
    assert_eq!(task.activity_log.iter().map(|e|e.action.as_str()).collect::<Vec<_>>(),vec!["started","paused","resumed"]);
    for event in &task.activity_log {uuid::Uuid::parse_str(&event.id).unwrap();chrono::DateTime::parse_from_rfc3339(&event.at).unwrap();}
}

#[test]
fn csv_activity_intervals_exclude_pauses_and_sum_reopen_cycles() {
    let mut store=Store::memory().unwrap();let task=store.save_task(input("timed",None)).unwrap();
    let events=serde_json::json!([
      {"id":"a","action":"started","at":"2026-11-13T01:00:00Z"},
      {"id":"b","action":"paused","at":"2026-11-13T01:10:00Z"},
      {"id":"c","action":"resumed","at":"2026-11-13T02:00:00Z"},
      {"id":"d","action":"completed","at":"2026-11-13T02:05:00Z"},
      {"id":"e","action":"reopened","at":"2026-11-13T03:00:00Z"},
      {"id":"f","action":"resumed","at":"2026-11-13T04:00:00Z"},
      {"id":"g","action":"paused","at":"2026-11-13T04:02:03Z"}]);
    store.conn.execute("UPDATE tasks SET activity_log=?1,started_at='2026-11-13T01:00:00Z' WHERE id=?2",rusqlite::params![events.to_string(),task.id]).unwrap();
    let csv=crate::export::tasks_csv(&store.snapshot().unwrap());
    assert!(csv.contains("\"15\",\"00:15\""));
    assert!(csv.contains("任务活动历史"));assert!(csv.contains("paused"));assert!(csv.contains("reopened"));
}

#[test]
fn version_four_upgrade_preserves_fields_and_seeds_only_known_history() {
    let dir=tempfile::tempdir().unwrap();let path=dir.path().join("v4.db");
    let mut store=Store::open(&path).unwrap();let task=store.save_task(input("legacy",None)).unwrap();
    store.conn.execute("UPDATE tasks SET started_at='2026-11-13T01:00:00Z',completed_at='2026-11-13T02:00:00Z',status='completed' WHERE id=?1",[&task.id]).unwrap();
    let mut expected=serde_json::to_value(&store.snapshot().unwrap().tasks[0]).unwrap(); expected.as_object_mut().unwrap().remove("activityLog");
    store.conn.execute_batch("ALTER TABLE tasks DROP COLUMN activity_log; PRAGMA user_version=4;").unwrap();
    drop(store);
    let mut store=Store::open(&path).unwrap();let old=store.snapshot().unwrap().tasks.remove(0);
    let mut actual=serde_json::to_value(&old).unwrap(); actual.as_object_mut().unwrap().remove("activityLog"); assert_eq!(actual,expected);
    assert_eq!(old.started_at.as_deref(),Some("2026-11-13T01:00:00Z"));
    assert_eq!(old.completed_at.as_deref(),Some("2026-11-13T02:00:00Z"));assert!(old.activity_log.is_empty());
    let mut edit=input("legacy",None);edit.id=Some(task.id);store.save_task(edit).unwrap();
    let updated=store.snapshot().unwrap().tasks.remove(0);
    assert_eq!(updated.activity_log.iter().map(|e|e.action.as_str()).collect::<Vec<_>>(),vec!["started","completed","reopened"]);
    assert_eq!(updated.activity_log[0].at,"2026-11-13T01:00:00Z");assert_eq!(updated.activity_log[1].at,"2026-11-13T02:00:00Z");
}


#[test]
fn sync_roundtrip_preserves_pause_history_and_remote_legacy_edits_cannot_erase_it() {
    use crate::sync_store::*;
    let mut source=Store::memory().unwrap();source.sync_link("a").unwrap();source.sync_enable().unwrap();
    let task=source.save_task(input("synced",None)).unwrap();source.set_focus(Some(task.id.clone())).unwrap();source.pause_task(&task.id).unwrap();
    let request=source.sync_request().unwrap();let synced=request.mutations[0].task.clone().unwrap();
    assert_eq!(synced.task.activity_log.len(),2);assert!(!synced.in_progress);
    let mut target=Store::memory().unwrap();target.sync_link("a").unwrap();target.sync_enable().unwrap();
    let change=Change{task_id:task.id.clone(),revision:1,deleted:false,task:Some(synced.clone())};
    target.sync_apply(SyncResponse{results:vec![],changes:vec![change],cursor:1,has_more:false}).unwrap();
    assert_eq!(target.snapshot().unwrap().tasks[0].activity_log,synced.task.activity_log);
    let mut legacy=synced.clone();legacy.task.activity_log.clear();legacy.task.started_at=None;
    target.sync_apply(SyncResponse{results:vec![],changes:vec![Change{task_id:task.id,revision:2,deleted:false,task:Some(legacy)}],cursor:2,has_more:false}).unwrap();
    assert_eq!(target.snapshot().unwrap().tasks[0].activity_log,synced.task.activity_log);
    assert_eq!(target.snapshot().unwrap().tasks[0].started_at,synced.task.started_at);
}

#[test]
fn completing_reopening_and_resuming_append_without_resetting_prior_intervals() {
    let mut store=Store::memory().unwrap();let task=store.save_task(input("cycles",None)).unwrap();
    store.set_focus(Some(task.id.clone())).unwrap();let first=store.snapshot().unwrap().tasks[0].started_at.clone();
    let mut edit=input("cycles",None); edit.id=Some(task.id.clone());edit.status="completed".into();
    store.save_task(edit.clone()).unwrap();store.save_task(edit.clone()).unwrap();
    edit.status="todo".into();store.save_task(edit.clone()).unwrap();store.save_task(edit.clone()).unwrap();
    assert!(store.snapshot().unwrap().settings.focus_id.is_none());
    store.set_focus(Some(task.id.clone())).unwrap();edit.status="completed".into();store.save_task(edit).unwrap();
    let snapshot=store.snapshot().unwrap();let saved=&snapshot.tasks[0];
    assert_eq!(saved.started_at,first);
    assert_eq!(saved.activity_log.iter().map(|e|e.action.as_str()).collect::<Vec<_>>(),vec!["started","completed","reopened","resumed","completed"]);
}


#[test]
fn legacy_completion_caps_trailing_active_history_and_reopen_retains_the_completion() {
    let mut store=Store::memory().unwrap();let task=store.save_task(input("legacy timing",None)).unwrap();
    let events=serde_json::json!([
      {"id":"started-event","action":"started","at":"2026-11-13T01:00:00Z"},
      {"id":"paused-event","action":"paused","at":"2026-11-13T01:10:00Z"},
      {"id":"resumed-event","action":"resumed","at":"2026-11-13T02:00:00Z"}]);
    store.conn.execute("UPDATE tasks SET activity_log=?1,started_at='2026-11-13T01:00:00Z',completed_at='2026-11-13T02:05:00Z',status='completed' WHERE id=?2",rusqlite::params![events.to_string(),task.id]).unwrap();
    let csv=crate::export::tasks_csv(&store.snapshot().unwrap());
    assert!(csv.contains("\"15\",\"00:15\""));
    let mut reopen=input("legacy timing",None);reopen.id=Some(task.id.clone());
    let saved=store.save_task(reopen.clone()).unwrap();
    assert_eq!(saved.activity_log.iter().map(|e|e.action.as_str()).collect::<Vec<_>>(),vec!["started","paused","resumed","completed","reopened"]);
    assert_eq!(saved.activity_log[3].at,"2026-11-13T02:05:00Z");
    store.save_task(reopen).unwrap();
    let csv=crate::export::tasks_csv(&store.snapshot().unwrap());
    assert!(csv.contains("\"15\",\"00:15\""));
    assert_eq!(store.snapshot().unwrap().tasks[0].activity_log.len(),5);
}

#[test]
fn reopening_history_with_an_existing_completion_does_not_duplicate_it() {
    let mut store=Store::memory().unwrap();let task=store.save_task(input("existing completion",None)).unwrap();
    let events=serde_json::json!([
      {"id":"started-event","action":"started","at":"2026-11-13T01:00:00Z"},
      {"id":"completed-event","action":"completed","at":"2026-11-13T01:10:00Z"}]);
    store.conn.execute("UPDATE tasks SET activity_log=?1,started_at='2026-11-13T01:00:00Z',completed_at='2026-11-13T01:10:00Z',status='completed' WHERE id=?2",rusqlite::params![events.to_string(),task.id]).unwrap();
    let mut reopen=input("existing completion",None);reopen.id=Some(task.id);
    let saved=store.save_task(reopen).unwrap();
    assert_eq!(saved.activity_log.iter().map(|e|e.action.as_str()).collect::<Vec<_>>(),vec!["started","completed","reopened"]);
}


#[test]
fn sync_retains_remote_causal_history_when_the_clock_moves_backwards() {
    use crate::sync_store::*;
    let mut source=Store::memory().unwrap();source.sync_link("a").unwrap();source.sync_enable().unwrap();
    let task=source.save_task(input("clock movement",None)).unwrap();
    let events=serde_json::json!([
        {"id":"start","action":"started","at":"2026-11-13T10:00:00Z"},
        {"id":"pause","action":"paused","at":"2026-11-13T09:55:00Z"}]);
    source.conn.execute("UPDATE tasks SET activity_log=?1,started_at='2026-11-13T10:00:00Z' WHERE id=?2",rusqlite::params![events.to_string(),task.id]).unwrap();
    let request=source.sync_request().unwrap();let synced=request.mutations[0].task.clone().unwrap();
    let mut target=Store::memory().unwrap();target.sync_link("a").unwrap();target.sync_enable().unwrap();
    let change=Change{task_id:task.id.clone(),revision:1,deleted:false,task:Some(synced.clone())};
    target.sync_apply(SyncResponse{results:vec![],changes:vec![change],cursor:1,has_more:false}).unwrap();
    // An unchanged second download exercises merging with the existing local log.
    let change=Change{task_id:task.id,revision:2,deleted:false,task:Some(synced.clone())};
    target.sync_apply(SyncResponse{results:vec![],changes:vec![change],cursor:2,has_more:false}).unwrap();
    let snapshot=target.snapshot().unwrap();
    assert_eq!(snapshot.tasks[0].activity_log,synced.task.activity_log);
    assert!(crate::export::tasks_csv(&snapshot).contains("\"0\",\"00:00\""));
}

#[test]
fn oversized_task_history_returns_an_explicit_sync_error_and_keeps_all_events() {
    let mut store=Store::memory().unwrap();store.sync_link("a").unwrap();store.sync_enable().unwrap();
    let task=store.save_task(input("long history",None)).unwrap();
    let events:Vec<_>=(0..1000).map(|index|serde_json::json!({"id":uuid::Uuid::new_v4().to_string(),"action":if index%2==0 {"resumed"} else {"paused"},"at":"2026-11-13T01:00:00Z"})).collect();
    store.conn.execute("UPDATE tasks SET activity_log=?1 WHERE id=?2",rusqlite::params![serde_json::to_string(&events).unwrap(),task.id]).unwrap();
    let result=store.sync_request();
    assert!(result.is_err());assert!(result.err().unwrap().contains("历史"));
    assert_eq!(store.snapshot().unwrap().tasks[0].activity_log.len(),1000);
    assert_eq!(store.sync_status().unwrap().pending,1);
}


#[test]
fn accepting_remote_paused_state_preserves_parallel_local_active_history() {
    use crate::sync_store::*;
    let mut store=Store::memory().unwrap();store.sync_link("a").unwrap();store.sync_enable().unwrap();
    let task=store.save_task(input("local interval",None)).unwrap();store.set_focus(Some(task.id.clone())).unwrap();
    let request=store.sync_request().unwrap();let mut remote=request.mutations[0].task.clone().unwrap();
    remote.in_progress=false;remote.execution_state=None;remote.task.activity_log.push(crate::store::ActivityEvent::new("paused",&chrono::Utc::now().to_rfc3339()));
    let local=crate::store::ActivityEvent::new("resumed","2099-11-13T01:00:00Z");
    let mut log=store.snapshot().unwrap().tasks.remove(0).activity_log;log.push(local.clone());
    store.conn.execute("UPDATE tasks SET activity_log=?1 WHERE id=?2",rusqlite::params![serde_json::to_string(&log).unwrap(),task.id]).unwrap();
    // Apply an accepted response for the exact upload, followed by the newer
    // authoritative paused task. Local-only history must remain visible.
    let change=Change{task_id:task.id.clone(),revision:1,deleted:false,task:Some(remote)};
    store.sync_apply(SyncResponse{results:vec![MutationResult{mutation_id:request.mutations[0].mutation_id.clone(),task_id:task.id.clone(),status:"accepted".into(),revision:Some(1),reason:None,remote:None,active_task:None}],changes:vec![change],cursor:1,has_more:false}).unwrap();
    // A newer remote revision arrives when the pending local history is accepted.
    let request=store.sync_request().unwrap();let sent=request.mutations.iter().find(|m|m.task_id==task.id).unwrap();
    let mut authoritative=sent.task.clone().unwrap();authoritative.in_progress=false;authoritative.execution_state=None;
    authoritative.task.activity_log.retain(|e|e.id!=local.id);
    authoritative.task.activity_log.push(crate::store::ActivityEvent::new("paused",&chrono::Utc::now().to_rfc3339()));
    let remote=Change{task_id:task.id.clone(),revision:2,deleted:false,task:Some(authoritative)};
    store.sync_apply(SyncResponse{results:vec![MutationResult{mutation_id:sent.mutation_id.clone(),task_id:task.id.clone(),status:"accepted".into(),revision:Some(1),reason:None,remote:None,active_task:None}],changes:vec![remote],cursor:2,has_more:false}).unwrap();
    let snapshot=store.snapshot().unwrap();let saved=&snapshot.tasks[0];
    assert!(saved.activity_log.iter().any(|e|e.id==local.id));
    assert_eq!(saved.activity_log.last().unwrap().action,"resumed");
    assert_eq!(snapshot.workflows[&task.id].state,"working");
    assert!(snapshot.settings.focus_id.is_none());
}

#[test]
fn downloaded_remote_active_state_resumes_after_retained_local_pause() {
    use crate::sync_store::*;
    let mut store=Store::memory().unwrap();store.sync_link("a").unwrap();store.sync_enable().unwrap();
    let task=store.save_task(input("remote active",None)).unwrap();
    store.set_focus(Some(task.id.clone())).unwrap();store.pause_task(&task.id).unwrap();
    let request=store.sync_request().unwrap();let sent=&request.mutations[0];
    let mut remote=sent.task.clone().unwrap();remote.in_progress=true;remote.execution_state=None;remote.task.activity_log.truncate(1);
    let local=store.snapshot().unwrap().tasks.remove(0);let paused=local.activity_log[1].clone();
    let remote=Change{task_id:task.id.clone(),revision:1,deleted:false,task:Some(remote)};
    let before=chrono::Utc::now();
    store.sync_apply(SyncResponse{results:vec![MutationResult{mutation_id:sent.mutation_id.clone(),task_id:task.id.clone(),status:"accepted".into(),revision:Some(1),reason:None,remote:None,active_task:None}],changes:vec![remote],cursor:1,has_more:false}).unwrap();
    let after=chrono::Utc::now();
    let snapshot=store.snapshot().unwrap();let saved=&snapshot.tasks[0];
    assert_eq!(snapshot.settings.focus_id.as_deref(),Some(task.id.as_str()));
    assert_eq!(saved.started_at,local.started_at);
    assert_eq!(saved.activity_log.iter().map(|e|e.action.as_str()).collect::<Vec<_>>(),vec!["started","paused","resumed"]);
    assert_eq!(saved.activity_log[1],paused);
    let resumed=chrono::DateTime::parse_from_rfc3339(&saved.activity_log[2].at).unwrap().with_timezone(&chrono::Utc);
    assert!(resumed>=before && resumed<=after);
}

#[test]
fn settings_license_summary_survives_reopen_without_device_secrets() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("license-summary.db");
    let mut store = Store::open(&path).unwrap();
    store.save_task(input("Keep my task", None)).unwrap();
    store.sync_link("workspace-a").unwrap();
    let license = crate::sync_store::LicenseStatus { account_id:"workspace-a".into(), code_hint:"••••-ABCD".into(), expires_at:"2027-11-14T00:00:00Z".into(), device_limit:3, devices_used:1 };
    store.sync_cache_license(Some(&license)).unwrap();
    store.sync_enable().unwrap();
    drop(store);
    let store = Store::open(&path).unwrap();
    let status = store.sync_status().unwrap();
    assert!(status.bound);
    assert!(status.enabled);
    assert_eq!(status.license.unwrap().code_hint,"••••-ABCD");
    let raw:String=store.conn.query_row("SELECT payload FROM sync_license WHERE id=1",[],|row|row.get(0)).unwrap();
    assert!(!raw.contains("token"));
    store.sync_cache_license(None).unwrap();
    assert!(!store.sync_status().unwrap().bound);
    assert_eq!(store.snapshot().unwrap().tasks.len(),1);
}
#[test]
fn settings_license_summary_cannot_cross_the_existing_workspace() {
    let dir=tempfile::tempdir().unwrap();let store=Store::open(&dir.path().join("summary.db")).unwrap();
    store.sync_link("workspace-a").unwrap();
    let other=crate::sync_store::LicenseStatus {account_id:"workspace-b".into(),code_hint:"••••-OTHER".into(),expires_at:"2027-11-14T00:00:00Z".into(),device_limit:3,devices_used:1};
    assert!(store.sync_cache_license(Some(&other)).is_err());
    assert!(!store.sync_status().unwrap().bound);
}

#[test]
fn legacy_activation_stays_visible_when_credentials_are_temporarily_locked() {
    let dir=tempfile::tempdir().unwrap();let path=dir.path().join("legacy-summary.db");
    let store=Store::open(&path).unwrap();store.sync_link("workspace-a").unwrap();store.sync_enable().unwrap();
    store.sync_cache_activation("workspace-a").unwrap();store.sync_disable().unwrap();drop(store);
    let store=Store::open(&path).unwrap();let status=store.sync_status().unwrap();
    assert!(status.bound);assert!(status.license.is_none());assert!(!status.enabled);
    assert!(store.sync_cache_activation("workspace-b").is_err());
    store.sync_cache_license(None).unwrap();assert!(!store.sync_status().unwrap().bound);
}

#[test]
fn credential_recovery_failures_keep_original_sync_consent_and_tasks() {
    let dir=tempfile::tempdir().unwrap();let mut store=Store::open(&dir.path().join("recovery.db")).unwrap();
    store.save_task(input("Original task",None)).unwrap();store.sync_link("workspace-a").unwrap();store.sync_cache_activation("workspace-a").unwrap();store.sync_enable().unwrap();
    let credential=crate::sync_credentials::Credential{account:"workspace-a".into(),token:"private-test-token".into(),license:Some(crate::sync_store::LicenseStatus{account_id:"workspace-a".into(),code_hint:"••••-ABCD".into(),expires_at:"2027-11-14T00:00:00Z".into(),device_limit:3,devices_used:1})};
    assert!(crate::sync_http::persist_activation(&store,&credential,|_|Err("simulated protected-write failure".into())).is_err());
    assert!(store.sync_is_enabled().unwrap());assert!(store.sync_status().unwrap().bound);
    store.conn.execute_batch("CREATE TRIGGER fail_license BEFORE INSERT ON sync_license BEGIN SELECT RAISE(ABORT,'simulated metadata failure'); END;").unwrap();
    let mut secret_saved=false;
    assert!(crate::sync_http::persist_activation(&store,&credential,|_|{secret_saved=true;Ok(())}).is_err());
    assert!(secret_saved);assert!(store.sync_is_enabled().unwrap());assert!(store.sync_status().unwrap().bound);
    assert_eq!(store.snapshot().unwrap().tasks.len(),1);
    assert_eq!(store.sync_status().unwrap().account_id.as_deref(),Some("workspace-a"));
}
#[test]
fn missing_new_credential_keeps_enabled_legacy_activation_during_upgrade() {
    for credential in [Ok(None),Err("old secret unavailable".into()),Ok(Some(crate::sync_credentials::Credential{account:"workspace-a".into(),token:"private-test-token".into(),license:None}))] {
        let dir=tempfile::tempdir().unwrap();let store=Store::open(&dir.path().join("upgrade.db")).unwrap();
        store.sync_link("workspace-a").unwrap();store.sync_enable().unwrap();
        crate::sync_credentials::restore_summary(&store,credential).unwrap();
        assert!(store.sync_status().unwrap().bound);assert!(store.sync_is_enabled().unwrap());
    }
}
#[test]
fn absent_credential_does_not_activate_local_only_installation() {
    let dir=tempfile::tempdir().unwrap();let store=Store::open(&dir.path().join("local.db")).unwrap();
    crate::sync_credentials::restore_summary(&store,Ok(None)).unwrap();assert!(!store.sync_status().unwrap().bound);
}

#[test]
fn panel_height_follows_content_and_keeps_its_anchor_inside_the_screen() {
    use crate::windows::{Rect,fitted_panel};
    let area=Rect{x:0.,y:24.,w:1440.,h:876.};
    let original=Rect{x:300.,y:24.,w:440.,h:740.};
    let short=fitted_panel(original,320.,area,false);
    assert_eq!((short.y,short.h),(24.,320.));
    let above_pet=fitted_panel(original,320.,area,true);
    assert_eq!(above_pet.y+above_pet.h,original.y+original.h);
    assert_eq!(fitted_panel(original,100.,area,false).h,260.);
    assert_eq!(fitted_panel(original,1200.,area,false).h,740.);
}

#[derive(Debug, Clone, Copy)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}
pub fn clamp(r: Rect, a: Rect) -> Rect {
    let w = r.w.min(a.w);
    let h = r.h.min(a.h);
    Rect {
        x: r.x.max(a.x).min(a.x + a.w - w),
        y: r.y.max(a.y).min(a.y + a.h - h),
        w,
        h,
    }
}
#[cfg(any(not(target_os = "macos"), test))]
fn pet_footprint(p: Rect) -> Rect {
    // Covers the rendered sprite element and the full pedestal in the 300×230 pet window.
    Rect { x: p.x + 60., y: p.y + 61., w: 180., h: 167. }
}
#[cfg(any(not(target_os = "macos"), test))]
pub fn panel_position(p: Rect, a: Rect) -> Rect {
    let body = pet_footprint(p);
    let gap = 12.;
    let w = 440_f64.min(a.w);
    let h = 620_f64.min(a.h);
    let x = p.x + p.w / 2. - w / 2.;
    let above_h = (body.y - gap - a.y).min(h);
    let below_y = body.y + body.h + gap;
    let left_w = (body.x - gap - a.x).min(w);
    let right_x = body.x + body.w + gap;
    let right_w = (a.x + a.w - right_x).min(w);
    let above = Rect { x, y: body.y - gap - above_h, w, h: above_h };
    let left = Rect { x: body.x - gap - left_w, y: body.y + body.h - h, w: left_w, h };
    let right = Rect { x: right_x, y: body.y + body.h - h, w: right_w, h };
    let below = Rect { x, y: below_y, w, h: (a.y + a.h - below_y).min(h) };
    let sides = if body.x - a.x >= a.x + a.w - body.x - body.w { [left, right] } else { [right, left] };
    for candidate in [above, sides[0], sides[1], below] {
        if candidate.w >= 420. && candidate.h >= 500. {
            return clamp(candidate, a);
        }
    }
    // At a cramped screen center, reserve the larger side; panel_layout lets the pet step aside.
    clamp(Rect { x: if left_w >= right_w { a.x } else { a.x + a.w - w }, y: body.y + body.h - h, w, h }, a)
}
#[cfg(any(not(target_os = "macos"), test))]
pub fn panel_layout(p: Rect, a: Rect) -> (Rect, Rect) {
    let panel = panel_position(p, a);
    let body = pet_footprint(p);
    if panel_clear_of_pet(panel, p) { return (p, panel); }
    let x = if panel.x + panel.w / 2. <= body.x + body.w / 2. {
        panel.x + panel.w + 12. - 60.
    } else {
        panel.x - 12. - 240.
    };
    let pet = clamp(Rect { x, ..p }, a);
    (pet, panel_position(pet, a))
}

#[cfg(any(not(target_os = "macos"), test))]
pub fn panel_clear_of_pet(panel: Rect, pet: Rect) -> bool {
    let body = pet_footprint(pet);
    panel.x + panel.w + 12. <= body.x
        || body.x + body.w + 12. <= panel.x
        || panel.y + panel.h + 12. <= body.y
        || body.y + body.h + 12. <= panel.y
}

#[cfg(any(target_os = "macos", test))]
pub fn cocoa_menu_position(primary_height: f64, status: Rect, visible: Rect) -> Rect {
    // AppKit uses global logical points with a bottom-left origin.
    let area = Rect {
        x: visible.x,
        y: primary_height - visible.y - visible.h,
        w: visible.w,
        h: visible.h,
    };
    clamp(
        Rect {
            x: status.x + status.w / 2. - 220.,
            y: area.y.max(primary_height - status.y) + 8.,
            w: 440.,
            h: 620.,
        },
        area,
    )
}

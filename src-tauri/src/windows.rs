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
pub fn fitted_panel(p: Rect, height: f64, area: Rect, anchor_bottom: bool) -> Rect {
    let h = height.max(260.).min(740.).min(area.h);
    clamp(Rect { y: if anchor_bottom { p.y + p.h - h } else { p.y }, h, ..p }, area)
}
#[cfg(any(not(target_os = "macos"), test))]
fn pet_footprint(p: Rect) -> Rect {
    // The sprite and pedestal stay anchored to the bottom as the task card grows.
    Rect { x: p.x + 60., y: p.y + p.h - 169., w: 180., h: 167. }
}
#[cfg(any(not(target_os = "macos"), test))]
pub fn panel_position(p: Rect, a: Rect, height: f64) -> Rect {
    let body = pet_footprint(p);
    let gap = 12.;
    let w = 440_f64.min(a.w);
    let h = height.max(260.).min(740.).min(a.h);
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
        if candidate.w >= 420. && candidate.h >= 500_f64.min(h) {
            return clamp(candidate, a);
        }
    }
    // At a cramped screen center, reserve the larger side; panel_layout lets the pet step aside.
    clamp(Rect { x: if left_w >= right_w { a.x } else { a.x + a.w - w }, y: body.y + body.h - h, w, h }, a)
}
#[cfg(any(not(target_os = "macos"), test))]
pub fn panel_layout(p: Rect, a: Rect, height: f64) -> (Rect, Rect) {
    let panel = panel_position(p, a, height);
    let body = pet_footprint(p);
    if panel_clear_of_pet(panel, p) { return (p, panel); }
    let x = if panel.x + panel.w / 2. <= body.x + body.w / 2. {
        panel.x + panel.w + 12. - 60.
    } else {
        panel.x - 12. - 240.
    };
    let pet = clamp(Rect { x, ..p }, a);
    (pet, panel_position(pet, a, height))
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
pub fn cocoa_menu_position(primary_height: f64, status: Rect, visible: Rect, height: f64) -> Rect {
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
            y: area.y.max(primary_height - status.y) + 2.,
            w: 440.,
            h: height.max(260.).min(740.),
        },
        area,
    )
}


pub fn resized_pet(p: Rect, height: f64, area: Rect) -> Rect {
    clamp(Rect { y: p.y + p.h - height, h: height, ..p }, area)
}

/// Only the window opened by a particular reminder owns its close timer.
#[derive(Default)]
pub struct PanelLifecycle {
    generation: u64,
    automatic: Option<u64>,
}
impl PanelLifecycle {
    pub fn interact(&mut self) {
        self.generation += 1;
        self.automatic = None;
    }
    pub fn open_reminder(&mut self, visible: bool, pinned: bool) -> Option<u64> {
        if visible || pinned { return None; }
        self.generation += 1;
        self.automatic = Some(self.generation);
        self.automatic
    }
    pub fn should_close(&self, token: u64, pinned: bool, exporting: bool) -> bool {
        !pinned && !exporting && self.automatic == Some(token)
    }
}
pub fn hide_on_blur(pinned: bool, exporting: bool) -> bool { !pinned && !exporting }

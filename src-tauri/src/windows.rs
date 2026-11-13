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
pub fn panel_position(p: Rect, a: Rect) -> Rect {
    let w = 460.;
    let h = 700.;
    let x = if p.x + p.w + 12. + w <= a.x + a.w {
        p.x + p.w + 12.
    } else {
        p.x - w - 12.
    };
    clamp(
        Rect {
            x,
            y: p.y + p.h - h,
            w,
            h,
        },
        a,
    )
}

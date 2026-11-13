# Week planning, menu bar and local identity

Goal: preserve the independent companion while making planning easier and preparing an identity for later WeChat binding. User authorized implementation; execute inline in the independent repository.

1. Deadline data and rules: add nullable dueTime (12:00/17:00), preserve date-only legacy tasks, migrate SQLite1→2 with backup. Test Monday morning/afternoon,17:00 rollover, month/year/leap boundaries, same-day overdue and acknowledged reminder deduplication.
2. Replace month calendar with a compact eight-day view of a seven-day rolling interval. Start at the current AM/PM period;17:00 and later start tomorrow AM; end seven calendar days later in the same period. No-date remains available. Test selection, clear, legacy values and viewport fit.
3. Generate a persistent random local user UUID independent of preferences; expose read-only identity and copy in settings. Test persistence, uniqueness, migration preservation. No account, cloud service or sync stub. Document future QR approval/session mapping and first-upload/reconciliation contract.
4. macOS accessory activation policy plus LSUIElement; transparent monochrome template menu icon. Left click opens a panel beneath the menu-bar icon; right click retains menu actions including quit. Keep Windows system tray path. Test screen clamping and inspect native menu/Dock behavior.
5. Refine the selected ivory note design: restrained graphite/olive palette, smaller character switcher, clearer titles and task hierarchy, cohesive hover/pressed states; retain large readable text and two-line input. Native visual acceptance.

Verification: frontend suite, Rust suite, production macOS bundle, complete signature verification, native opening/date/identity checks. Review the complete patch before delivery; preserve existing data and ghost selection.

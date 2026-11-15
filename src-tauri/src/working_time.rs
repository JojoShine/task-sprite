use chrono::{DateTime, Utc};

// Fixed UTC+8 windows apply on every calendar day, independent of host timezone.
pub(super) fn milliseconds(start: DateTime<Utc>, end: DateTime<Utc>) -> i64 {
    let (start, end) = (start.timestamp_millis(), end.timestamp_millis());
    if end <= start { return 0; }
    const DAY: i64 = 86_400_000;
    const OFFSET: i64 = 8 * 3_600_000;
    let mut midnight = (start + OFFSET).div_euclid(DAY) * DAY - OFFSET;
    let mut total = 0;
    while midnight < end {
        for (from, to) in [(510, 720), (840, 1080)] {
            total += (end.min(midnight + to * 60_000) - start.max(midnight + from * 60_000)).max(0);
        }
        midnight += DAY;
    }
    total
}

// A clock rollback can overlap previously finished activity. Count its union once.
pub(super) fn active_milliseconds(mut intervals: Vec<(DateTime<Utc>, DateTime<Utc>)>) -> i64 {
    intervals.retain(|(start, end)| end > start);
    intervals.sort_unstable_by_key(|(start, _)| *start);
    let mut merged: Vec<(DateTime<Utc>, DateTime<Utc>)> = Vec::new();
    for (start, end) in intervals {
        if let Some(previous) = merged.last_mut() {
            if start <= previous.1 {
                previous.1 = previous.1.max(end);
                continue;
            }
        }
        merged.push((start, end));
    }
    merged.into_iter().map(|(start, end)| milliseconds(start, end)).sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn negative_epoch_and_timezone_offsets_use_the_same_beijing_windows() {
        let parse = |value: &str| DateTime::parse_from_rfc3339(value).unwrap().with_timezone(&Utc);
        assert_eq!(milliseconds(parse("1969-12-31T08:00:00+08:00"),parse("1969-12-31T18:30:00+08:00")),27_000_000);
        assert_eq!(milliseconds(parse("2026-11-14T03:50:00Z"),parse("2026-11-14T06:10:00Z")),1_200_000);
    }
}

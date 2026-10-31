use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Manager, State, WebviewWindow};
use windows::Win32::Foundation::POINT;
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

#[derive(serde::Deserialize, serde::Serialize, Clone, Copy, Debug, Default)]
pub struct IslandRect {
    #[serde(default)]
    pub left: i32,
    #[serde(default)]
    pub top: i32,
    #[serde(default)]
    pub right: i32,
    #[serde(default)]
    pub bottom: i32,
    #[serde(default)]
    pub x: i32,
    #[serde(default)]
    pub y: i32,
    #[serde(default)]
    pub width: i32,
    #[serde(default)]
    pub height: i32,
}

impl IslandRect {
    pub fn normalized_bounds(&self) -> (i32, i32, i32, i32) {
        let left = if self.left != 0 || self.right != 0 {
            self.left
        } else {
            self.x
        };
        let top = if self.top != 0 || self.bottom != 0 {
            self.top
        } else {
            self.y
        };
        let right = if self.right != 0 {
            self.right
        } else {
            left + self.width
        };
        let bottom = if self.bottom != 0 {
            self.bottom
        } else {
            top + self.height
        };
        (left, top, right, bottom)
    }
}

pub struct CursorMonitorState {
    pub active_bounds: Mutex<IslandRect>,
    pub is_locked_interactive: AtomicBool,
    pub currently_ignoring: AtomicBool,
}

impl CursorMonitorState {
    pub fn new() -> Self {
        Self {
            active_bounds: Mutex::new(IslandRect::default()),
            is_locked_interactive: AtomicBool::new(false),
            currently_ignoring: AtomicBool::new(true),
        }
    }
}

/// Computes physical screen coordinates for dynamic island hit-testing.
/// Converts logical CSS client bounds from WebView2 into physical screen coordinates
/// using the window's physical position and DPI scale factor.
pub fn calculate_screen_hit_bounds(
    bounds: &IslandRect,
    win_x: i32,
    win_y: i32,
    win_w: i32,
    scale: f64,
) -> (i32, i32, i32, i32) {
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let (mut raw_left, raw_top, mut raw_right, raw_bottom) = bounds.normalized_bounds();

    // If only width/height was sent (left and right unset or 0), horizontally center within window width
    if raw_right > raw_left && (bounds.left == 0 && bounds.right == 0 && bounds.x == 0) {
        let logical_win_w = (win_w as f64 / scale).round() as i32;
        let w = raw_right - raw_left;
        raw_left = (logical_win_w - w) / 2;
        raw_right = raw_left + w;
    }

    if raw_right > raw_left && raw_bottom > raw_top {
        // Client-relative coordinates scaled by DPI scale factor to physical pixels
        let scaled_left = (raw_left as f64 * scale).round() as i32;
        let scaled_top = (raw_top as f64 * scale).round() as i32;
        let scaled_right = (raw_right as f64 * scale).round() as i32;
        let scaled_bottom = (raw_bottom as f64 * scale).round() as i32;

        (
            win_x + scaled_left,
            win_y + scaled_top,
            win_x + scaled_right,
            win_y + scaled_bottom,
        )
    } else {
        // Fallback default pill rect: 140x40 logical, scaled and centered horizontally
        let pill_w = (140.0 * scale).round() as i32;
        let pill_h = (40.0 * scale).round() as i32;
        let pill_left = win_x + (win_w - pill_w) / 2;
        (pill_left, win_y, pill_left + pill_w, win_y + pill_h)
    }
}

pub fn spawn_cursor_monitor(app_handle: AppHandle, state: Arc<CursorMonitorState>) {
    std::thread::Builder::new()
        .name("winisle-cursor-monitor".into())
        .spawn(move || {
            use tauri::Emitter;
            let mut pt = POINT::default();
            let mut last_auto_compact = std::time::Instant::now();
            loop {
                // If interactive lock is active (e.g. Isle Assistant or modal open)
                if state.is_locked_interactive.load(Ordering::Relaxed) {
                    if state.currently_ignoring.load(Ordering::Relaxed) {
                        if let Some(win) = app_handle.get_webview_window("main") {
                            crate::window_decorations::set_click_through(&win, false);
                            state.currently_ignoring.store(false, Ordering::Relaxed);
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    continue;
                }

                let get_cursor_res = unsafe { GetCursorPos(&mut pt) };
                if get_cursor_res.is_err() {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    continue;
                }

                let Some(win) = app_handle.get_webview_window("main") else {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    continue;
                };

                let scale = win.scale_factor().unwrap_or(1.0);
                let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };

                // Compute screen coordinates for hit testing
                let (win_x, win_y, win_w, _win_h) = if let Ok(pos) = win.outer_position() {
                    let size = win.outer_size().unwrap_or_default();
                    (pos.x, pos.y, size.width as i32, size.height as i32)
                } else {
                    let fallback_w = (740.0 * scale).round() as i32;
                    let fallback_h = (340.0 * scale).round() as i32;
                    (0, 0, fallback_w, fallback_h)
                };

                let (screen_left, screen_top, screen_right, screen_bottom) = {
                    let bounds = state.active_bounds.lock().unwrap();
                    calculate_screen_hit_bounds(&bounds, win_x, win_y, win_w, scale)
                };

                // Scaled buffers for distant cursor throttling (150ms for near 0% CPU)
                let buffer_y_bottom = (80.0 * scale).round() as i32;
                let buffer_y_top = (40.0 * scale).round() as i32;
                let buffer_x = (100.0 * scale).round() as i32;

                let is_far_away = pt.y > (screen_bottom + buffer_y_bottom)
                    || pt.y < (screen_top - buffer_y_top)
                    || pt.x < (screen_left - buffer_x)
                    || pt.x > (screen_right + buffer_x);

                if is_far_away {
                    if !state.currently_ignoring.load(Ordering::Relaxed) {
                        crate::window_decorations::set_click_through(&win, true);
                        state.currently_ignoring.store(true, Ordering::Relaxed);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(150));
                    continue;
                }

                // Hit test with DPI-scaled safety margins: left-28, right+28, top-6, bottom+24
                let margin_left = (28.0 * scale).round() as i32;
                let margin_right = (28.0 * scale).round() as i32;
                let margin_top = (6.0 * scale).round() as i32;
                let margin_bottom = (24.0 * scale).round() as i32;

                let is_inside = pt.x >= (screen_left - margin_left)
                    && pt.x <= (screen_right + margin_right)
                    && pt.y >= (screen_top - margin_top)
                    && pt.y <= (screen_bottom + margin_bottom);

                // Tab bar top-zone auto-compact detection:
                // Only trigger auto-compact if cursor is distinctly far outside the island (at least 60px past island boundaries)
                let tab_zone_y = (36.0 * scale).round() as i32;
                let tab_margin_x = (60.0 * scale).round() as i32;
                if pt.y <= tab_zone_y
                    && (pt.x < screen_left - tab_margin_x || pt.x > screen_right + tab_margin_x)
                {
                    if last_auto_compact.elapsed() > std::time::Duration::from_millis(1500) {
                        let _ = app_handle.emit("request_auto_compact", ());
                        last_auto_compact = std::time::Instant::now();
                    }
                }

                let currently_ignoring = state.currently_ignoring.load(Ordering::Relaxed);

                if is_inside && currently_ignoring {
                    crate::window_decorations::set_click_through(&win, false);
                    state.currently_ignoring.store(false, Ordering::Relaxed);
                } else if !is_inside && !currently_ignoring {
                    crate::window_decorations::set_click_through(&win, true);
                    state.currently_ignoring.store(true, Ordering::Relaxed);
                }

                // High precision 16ms sleep (60 FPS) when cursor is in the active band
                std::thread::sleep(std::time::Duration::from_millis(16));
            }
        })
        .expect("Failed to spawn cursor monitor thread");
}

#[command]
pub fn update_island_bounds(
    rect: IslandRect,
    state: State<'_, Arc<CursorMonitorState>>,
) -> Result<(), String> {
    let mut bounds = state.active_bounds.lock().map_err(|e| e.to_string())?;
    *bounds = rect;
    Ok(())
}

#[command]
pub fn set_interactive_lock(
    locked: bool,
    state: State<'_, Arc<CursorMonitorState>>,
    window: WebviewWindow,
) -> Result<(), String> {
    state.is_locked_interactive.store(locked, Ordering::Relaxed);
    if locked {
        crate::window_decorations::set_click_through(&window, false);
        state.currently_ignoring.store(false, Ordering::Relaxed);
    }
    Ok(())
}

#[command]
pub fn set_click_through(
    ignore: bool,
    window: WebviewWindow,
    state: State<'_, Arc<CursorMonitorState>>,
) -> Result<(), String> {
    state.currently_ignoring.store(ignore, Ordering::Relaxed);
    crate::window_decorations::set_click_through(&window, ignore);
    Ok(())
}

#[command]
pub fn set_ignore_mouse_events(
    ignore: bool,
    window: WebviewWindow,
    state: State<'_, Arc<CursorMonitorState>>,
) -> Result<(), String> {
    set_click_through(ignore, window, state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_island_rect_normalization_ltrb() {
        let rect = IslandRect {
            left: 20,
            top: 10,
            right: 220,
            bottom: 50,
            ..Default::default()
        };
        assert_eq!(rect.normalized_bounds(), (20, 10, 220, 50));
    }

    #[test]
    fn test_island_rect_normalization_xywh() {
        let rect = IslandRect {
            x: 100,
            y: 0,
            width: 150,
            height: 38,
            ..Default::default()
        };
        assert_eq!(rect.normalized_bounds(), (100, 0, 250, 38));
    }

    #[test]
    fn test_calculate_screen_hit_bounds_100_percent() {
        let bounds = IslandRect {
            left: 310,
            top: 0,
            right: 430,
            bottom: 34,
            ..Default::default()
        };
        let (left, top, right, bottom) = calculate_screen_hit_bounds(&bounds, 590, 0, 740, 1.0);
        assert_eq!((left, top, right, bottom), (900, 0, 1020, 34));
    }

    #[test]
    fn test_calculate_screen_hit_bounds_125_percent() {
        let bounds = IslandRect {
            left: 310,
            top: 0,
            right: 430,
            bottom: 34,
            ..Default::default()
        };
        let (left, top, right, bottom) = calculate_screen_hit_bounds(&bounds, 498, 0, 925, 1.25);
        assert_eq!((left, top, right, bottom), (886, 0, 1036, 43));
        assert_eq!(right - left, 150); // 120 * 1.25 = 150
    }

    #[test]
    fn test_calculate_screen_hit_bounds_150_percent() {
        let bounds = IslandRect {
            left: 300,
            top: 0,
            right: 440,
            bottom: 34,
            ..Default::default()
        };
        let (left, top, right, bottom) = calculate_screen_hit_bounds(&bounds, 725, 0, 1110, 1.5);
        assert_eq!((left, top, right, bottom), (1175, 0, 1385, 51));
        assert_eq!(right - left, 210); // 140 * 1.5 = 210
    }

    #[test]
    fn test_calculate_screen_hit_bounds_200_percent() {
        let bounds = IslandRect {
            left: 300,
            top: 0,
            right: 440,
            bottom: 34,
            ..Default::default()
        };
        let (left, top, right, bottom) = calculate_screen_hit_bounds(&bounds, 1180, 0, 1480, 2.0);
        assert_eq!((left, top, right, bottom), (1780, 0, 2060, 68));
        assert_eq!(right - left, 280); // 140 * 2.0 = 280
    }

    #[test]
    fn test_calculate_screen_hit_bounds_fallback_pill() {
        let bounds = IslandRect::default();
        let (left, top, right, bottom) = calculate_screen_hit_bounds(&bounds, 725, 0, 1110, 1.5);
        // Fallback pill: 140x40 * 1.5 = 210x60 centered in 1110px width
        assert_eq!((left, top, right, bottom), (1175, 0, 1385, 60));
    }

    #[test]
    fn test_calculate_screen_hit_bounds_negative_monitor_coordinates() {
        let bounds = IslandRect {
            left: 310,
            top: 0,
            right: 430,
            bottom: 34,
            ..Default::default()
        };
        // Secondary monitor placed to left of primary monitor (win_x = -1330)
        let (left, top, right, bottom) = calculate_screen_hit_bounds(&bounds, -1330, 0, 740, 1.0);
        assert_eq!((left, top, right, bottom), (-1020, 0, -900, 34));
    }
}

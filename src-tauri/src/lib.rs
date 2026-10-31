use std::sync::Arc;
use tauri::Manager;

pub mod ai;
pub mod audio;
pub mod cursor;
pub mod hardware;
pub mod media;
pub mod screenshot;
pub mod tray;

#[cfg(target_os = "windows")]
pub mod window_decorations {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::OnceLock;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMNCRP_DISABLED, DWMWA_BORDER_COLOR,
        DWMWA_NCRENDERING_POLICY, DWMWA_WINDOW_CORNER_PREFERENCE,
        DWMWCP_DONOTROUND, DWM_WINDOW_CORNER_PREFERENCE,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CallWindowProcW, DefWindowProcW, GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos,
        GWLP_WNDPROC, GWL_EXSTYLE, GWL_STYLE, HTTRANSPARENT, MA_NOACTIVATEANDEAT, STYLESTRUCT,
        SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WM_MOUSEACTIVATE, WM_NCACTIVATE,
        WM_NCCALCSIZE, WM_NCHITTEST, WM_NCPAINT, WM_STYLECHANGING, WNDPROC, WS_BORDER, WS_CAPTION,
        WS_DLGFRAME, WS_EX_LAYERED, WS_EX_TRANSPARENT, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_POPUP,
        WS_SYSMENU, WS_THICKFRAME, WS_VISIBLE,
    };

    #[repr(C)]
    #[allow(non_snake_case)]
    struct MARGINS {
        cxLeftWidth: i32,
        cxRightWidth: i32,
        cyTopHeight: i32,
        cyBottomHeight: i32,
    }

    extern "system" {
        fn DwmExtendFrameIntoClientArea(
            hwnd: HWND,
            pmarinset: *const MARGINS,
        ) -> windows::core::HRESULT;
    }

    static PREV_WNDPROC: OnceLock<WNDPROC> = OnceLock::new();
    pub static IS_IGNORING_MOUSE: AtomicBool = AtomicBool::new(true);

    unsafe extern "system" fn frameless_subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            // Prevent Windows/tao from ever setting caption, borders, or title bar buttons
            WM_STYLECHANGING => {
                if wparam.0 == GWL_STYLE.0 as usize {
                    let p_style = lparam.0 as *mut STYLESTRUCT;
                    if !p_style.is_null() {
                        (*p_style).styleNew &= !(WS_CAPTION.0
                            | WS_THICKFRAME.0
                            | WS_MINIMIZEBOX.0
                            | WS_MAXIMIZEBOX.0
                            | WS_SYSMENU.0
                            | WS_BORDER.0
                            | WS_DLGFRAME.0);
                        (*p_style).styleNew |= WS_POPUP.0 | WS_VISIBLE.0;
                    }
                    return LRESULT(0);
                }
            }
            // Non-client area calculation: 0 pixels allocated, making client area fill 100% of the window
            WM_NCCALCSIZE => {
                return LRESULT(0);
            }
            // Non-client painting: suppress completely (no window frame, no title bar, no shadow)
            WM_NCPAINT => {
                return LRESULT(0);
            }
            // Non-client activation: prevent active/inactive frame repainting
            WM_NCACTIVATE => {
                return LRESULT(1);
            }
            // Prevent stealing foreground focus from Chrome when click-through is active
            WM_MOUSEACTIVATE => {
                if IS_IGNORING_MOUSE.load(Ordering::Relaxed) {
                    return LRESULT(MA_NOACTIVATEANDEAT as isize);
                }
            }
            // Dynamic hit-testing: pass mouse events through when cursor is outside the dynamic island
            WM_NCHITTEST => {
                if IS_IGNORING_MOUSE.load(Ordering::Relaxed) {
                    return LRESULT(HTTRANSPARENT as isize);
                }
            }
            _ => {}
        }

        if let Some(&Some(prev_proc)) = PREV_WNDPROC.get() {
            CallWindowProcW(Some(prev_proc), hwnd, msg, wparam, lparam)
        } else {
            DefWindowProcW(hwnd, msg, wparam, lparam)
        }
    }

    pub fn apply_frameless_styles(hwnd: HWND) {
        unsafe {
            // 1. Install our custom Win32 Window Procedure Subclass
            let current_wndproc = GetWindowLongPtrW(hwnd, GWLP_WNDPROC);
            if current_wndproc != frameless_subclass_proc as *const () as usize as isize {
                let prev = std::mem::transmute::<isize, WNDPROC>(current_wndproc);
                let _ = PREV_WNDPROC.set(prev);
                SetWindowLongPtrW(
                    hwnd,
                    GWLP_WNDPROC,
                    frameless_subclass_proc as *const () as usize as isize,
                );
            }

            // 2. Strip all caption, borders, minimize/maximize buttons, and enforce WS_POPUP
            let mut style = GetWindowLongPtrW(hwnd, GWL_STYLE);
            style &= !(WS_CAPTION.0 as isize
                | WS_THICKFRAME.0 as isize
                | WS_MINIMIZEBOX.0 as isize
                | WS_MAXIMIZEBOX.0 as isize
                | WS_SYSMENU.0 as isize
                | WS_BORDER.0 as isize
                | WS_DLGFRAME.0 as isize);
            style |= (WS_POPUP.0 as isize) | (WS_VISIBLE.0 as isize);
            SetWindowLongPtrW(hwnd, GWL_STYLE, style);

            // 3. Ensure WS_EX_LAYERED is set for transparency and initial click-through
            let mut ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            ex_style |= (WS_EX_LAYERED.0 as isize) | (WS_EX_TRANSPARENT.0 as isize);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style);

            // 4. Extend glass frame across entire client area (-1 margins) for true alpha transparency
            let margins = MARGINS {
                cxLeftWidth: -1,
                cxRightWidth: -1,
                cyTopHeight: -1,
                cyBottomHeight: -1,
            };
            let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);

            // 5. Disable DWM Non-Client Rendering completely
            let ncrp = DWMNCRP_DISABLED.0 as u32;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_NCRENDERING_POLICY,
                &ncrp as *const _ as *const _,
                std::mem::size_of::<u32>() as u32,
            );

            // 6. Disable Windows 11 window corner rounding
            let corner_pref = DWMWCP_DONOTROUND;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &corner_pref as *const _ as *const _,
                std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
            );

            // 7. Remove 1px DWM accent border
            let border_color: u32 = 0xFFFFFFFE;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_BORDER_COLOR,
                &border_color as *const _ as *const _,
                std::mem::size_of::<u32>() as u32,
            );

            // 8. Trigger non-client frame recalculation
            let _ = SetWindowPos(
                hwnd,
                HWND(std::ptr::null_mut()),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
            );
        }
    }

    pub fn set_click_through(win: &tauri::WebviewWindow, ignore: bool) {
        IS_IGNORING_MOUSE.store(ignore, Ordering::Relaxed);
        if let Ok(raw_hwnd) = win.hwnd() {
            let hwnd = HWND(raw_hwnd.0);
            unsafe {
                let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                let new_ex_style = if ignore {
                    ex_style | (WS_EX_TRANSPARENT.0 as isize) | (WS_EX_LAYERED.0 as isize)
                } else {
                    (ex_style & !(WS_EX_TRANSPARENT.0 as isize)) | (WS_EX_LAYERED.0 as isize)
                };
                if new_ex_style != ex_style {
                    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_ex_style);
                }
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub mod window_decorations {
    pub fn set_click_through(win: &tauri::WebviewWindow, ignore: bool) {
        let _ = win.set_ignore_cursor_events(ignore);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    unsafe {
        // Prevent Windows from ghosting the frameless overlay and showing "(Not Responding)" title bar
        windows::Win32::UI::WindowsAndMessaging::DisableProcessWindowsGhosting();
    }

    let cursor_state = Arc::new(cursor::CursorMonitorState::new());
    let cursor_state_clone = cursor_state.clone();

    tauri::Builder::default()
        .manage(cursor_state)
        .invoke_handler(tauri::generate_handler![
            cursor::update_island_bounds,
            cursor::set_interactive_lock,
            cursor::set_click_through,
            cursor::set_ignore_mouse_events,
            audio::get_volume,
            audio::set_volume,
            audio::get_mute,
            audio::set_mute,
            hardware::get_brightness,
            hardware::set_brightness,
            hardware::get_battery_status,
            screenshot::get_system_screenshot,
            media::get_system_media,
            media::send_system_media_command,
            ai::ask_bynara_ai,
        ])
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                // Ensure window decorations and native shadows are disabled
                let _ = window.set_decorations(false);
                let _ = window.set_shadow(false);

                // Center window horizontally at top: 0 of primary monitor
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let screen_size = monitor.size();
                    let scale_factor = monitor.scale_factor();
                    let logical_width = 740.0;
                    let screen_logical_width = screen_size.width as f64 / scale_factor;
                    let target_x = ((screen_logical_width - logical_width) / 2.0).round();
                    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                        x: target_x,
                        y: 0.0,
                    }));
                }

                // Reveal window
                let _ = window.show();

                // Apply Win32 frameless subclass and Dwm transparency AFTER show so tao cannot override it
                #[cfg(target_os = "windows")]
                {
                    if let Ok(raw_hwnd) = window.hwnd() {
                        let hwnd = windows::Win32::Foundation::HWND(raw_hwnd.0);
                        window_decorations::apply_frameless_styles(hwnd);
                    }
                }

                // Initial click-through configuration: ignore cursor events outside island
                window_decorations::set_click_through(&window, true);
            }

            // Spawn the adaptive cursor monitor thread
            cursor::spawn_cursor_monitor(app.handle().clone(), cursor_state_clone);

            // Start the native Windows CoreAudio volume listener
            audio::start_audio_listener(app.handle().clone());

            // Start the native Windows GSMTC media listener
            media::spawn_media_monitor(app.handle().clone());

            // Initialize system tray icon, context menu, and Alt+Q hotkey
            let _ = tray::setup_tray(app.handle());
            tray::spawn_global_hotkey(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running WinIsle application");
}

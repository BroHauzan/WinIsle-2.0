use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_NOREPEAT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetMessageW, PeekMessageW, TranslateMessage, MSG, PM_NOREMOVE, WM_HOTKEY,
};

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let toggle_island = MenuItemBuilder::with_id("toggle_island", "Toggle Dynamic Island").build(app)?;
    let open_assistant = MenuItemBuilder::with_id("open_assistant", "Open Assistant (Alt+Q)").build(app)?;
    let optimize_ram = MenuItemBuilder::with_id("optimize_ram", "Optimize RAM (<50MB)").build(app)?;
    let always_on_top = CheckMenuItemBuilder::with_id("always_on_top", "Always on Top")
        .checked(true)
        .build(app)?;
    let run_on_startup = CheckMenuItemBuilder::with_id("run_on_startup", "Run on Windows Startup")
        .checked(true)
        .build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let exit_app = MenuItemBuilder::with_id("exit_app", "Exit WinIsle").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&toggle_island)
        .item(&open_assistant)
        .item(&optimize_ram)
        .item(&always_on_top)
        .item(&run_on_startup)
        .item(&separator)
        .item(&exit_app)
        .build()?;

    let icon = app
        .default_window_icon()
        .cloned()
        .unwrap_or_else(|| tauri::include_image!("icons/icon.ico"));

    let _tray = TrayIconBuilder::with_id("winisle_tray")
        .icon(icon)
        .tooltip("WinIsle — Dynamic Island")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                "toggle_island" => {
                    if let Some(window) = app.get_webview_window("main") {
                        if let Ok(visible) = window.is_visible() {
                            if visible {
                                let _ = window.hide();
                                crate::memory::trim_process_tree_memory();
                            } else {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                                crate::memory::trim_process_tree_memory();
                            }
                        }
                    }
                }
                "optimize_ram" => {
                    crate::memory::trim_process_tree_memory();
                }
                "open_assistant" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("toggle_isle_assistant", ());
                }
                "always_on_top" => {
                    if let Some(window) = app.get_webview_window("main") {
                        if let Ok(is_top) = window.is_always_on_top() {
                            let _ = window.set_always_on_top(!is_top);
                        }
                    }
                }
                "run_on_startup" => {
                    #[cfg(target_os = "windows")]
                    {
                        let _ = std::process::Command::new("powershell")
                            .args(["-NoProfile", "-Command", "
                                $runKey = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
                                $exe = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
                                Set-ItemProperty -Path $runKey -Name 'WinIsle' -Value ('\"' + $exe + '\"')
                                Set-ItemProperty -Path $runKey -Name 'IsleDynamicIsland' -Value ('\"' + $exe + '\"')
                                $startup = [System.Environment]::GetFolderPath('Startup')
                                if (Test-Path $startup) {
                                    $wsh = New-Object -ComObject WScript.Shell
                                    $sc = $wsh.CreateShortcut((Join-Path $startup 'WinIsle.lnk'))
                                    $sc.TargetPath = $exe
                                    $sc.Save()
                                }
                            "])
                            .spawn();
                    }
                }
                "exit_app" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(visible) = window.is_visible() {
                        if visible {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

pub fn spawn_global_hotkey(app: AppHandle) {
    std::thread::Builder::new()
        .name("winisle-hotkey".into())
        .spawn(move || {
            let hotkey_alt_q = 1;
            let hotkey_alt_h = 2;
            let modifiers: HOT_KEY_MODIFIERS = MOD_ALT | MOD_NOREPEAT;
            let vk_q = 0x51u32; // 'Q'
            let vk_h = 0x48u32; // 'H'

            unsafe {
                // Ensure thread has an initialized message queue
                let mut dummy_msg = MSG::default();
                let _ = PeekMessageW(&mut dummy_msg, None, 0, 0, PM_NOREMOVE);

                let _ = RegisterHotKey(None, hotkey_alt_q, modifiers, vk_q);
                let _ = RegisterHotKey(None, hotkey_alt_h, modifiers, vk_h);

                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                    if msg.message == WM_HOTKEY {
                        if msg.wParam.0 == hotkey_alt_q as usize {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                            let _ = app.emit("toggle_isle_assistant", ());
                        } else if msg.wParam.0 == hotkey_alt_h as usize {
                            let _ = app.emit("toggle_compact_mode", ());
                        }
                    }
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }

                let _ = UnregisterHotKey(None, hotkey_alt_q);
                let _ = UnregisterHotKey(None, hotkey_alt_h);
            }
        })
        .expect("failed to spawn hotkey thread");
}

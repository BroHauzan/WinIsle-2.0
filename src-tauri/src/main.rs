#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tiny_http::{Header, Method, Response, Server};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const OVERLAY_WIDTH: f64 = 740.0;
const OVERLAY_HEIGHT: f64 = 340.0;
const DEFAULT_GEMINI_KEY: &str = "AQ.Ab8RN6KdBVqg30x69prVlTWNqkpxqGYvT0ozWdATn5ni9d46ng";

struct IslandBoundsState {
    width: AtomicI32,
    height: AtomicI32,
    renderer_wants_interactive: AtomicBool,
}

struct SharedBackendState {
    gemini_key: Mutex<String>,
    volume: AtomicI32,
    muted: AtomicBool,
    brightness: AtomicI32,
    battery_level: AtomicI32,
    is_charging: AtomicBool,
    shuffle_active: AtomicBool,
}

fn get_key_file_path() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let dir = PathBuf::from(appdata).join("WinIsle");
        let _ = fs::create_dir_all(&dir);
        return dir.join("gemini_key.txt");
    }
    PathBuf::from(".winisle_gemini_key.txt")
}

fn load_gemini_key() -> String {
    let path = get_key_file_path();
    if let Ok(raw) = fs::read_to_string(&path) {
        let trimmed = raw.trim().to_string();
        if trimmed.len() >= 20 {
            return trimmed;
        }
    }
    if let Ok(env_key) = std::env::var("GEMINI_API_KEY") {
        let trimmed = env_key.trim().to_string();
        if trimmed.len() >= 20 {
            return trimmed;
        }
    }
    DEFAULT_GEMINI_KEY.to_string()
}

fn save_gemini_key(key: &str) {
    let clean = key.trim();
    if clean.len() >= 20 {
        let _ = fs::write(get_key_file_path(), clean);
    }
}

#[cfg(windows)]
fn trim_process_working_set() {
    use windows_sys::Win32::System::ProcessStatus::K32EmptyWorkingSet;
    use windows_sys::Win32::System::Threading::GetCurrentProcess;
    unsafe {
        let _ = K32EmptyWorkingSet(GetCurrentProcess());
    }
}

#[cfg(not(windows))]
fn trim_process_working_set() {}

#[cfg(windows)]
fn run_powershell_hidden(script: &str) -> Option<String> {
    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

#[cfg(not(windows))]
fn run_powershell_hidden(_script: &str) -> Option<String> {
    None
}

fn position_window_top_center(win: &WebviewWindow) {
    if let Ok(Some(monitor)) = win.current_monitor().or_else(|_| win.primary_monitor()) {
        let scale = monitor.scale_factor();
        let mon_size = monitor.size();
        let mon_pos = monitor.position();
        let win_w = (OVERLAY_WIDTH * scale).round() as i32;
        let x = mon_pos.x + ((mon_size.width as i32 - win_w) / 2);
        let y = mon_pos.y;
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
}

#[tauri::command]
fn set_ignore_mouse_events(
    window: WebviewWindow,
    state: tauri::State<'_, Arc<IslandBoundsState>>,
    ignore: bool,
) {
    state
        .renderer_wants_interactive
        .store(!ignore, Ordering::Relaxed);
    let _ = window.set_ignore_cursor_events(ignore);
}

#[tauri::command]
fn update_island_bounds(
    state: tauri::State<'_, Arc<IslandBoundsState>>,
    width: i32,
    height: i32,
) {
    state.width.store(width.max(120), Ordering::Relaxed);
    state.height.store(height.max(22), Ordering::Relaxed);
}

#[tauri::command]
fn trim_memory() {
    trim_process_working_set();
}

#[tauri::command]
fn set_hardware_status(
    backend: tauri::State<'_, Arc<SharedBackendState>>,
    volume: Option<i32>,
    muted: Option<bool>,
    brightness: Option<i32>,
) {
    apply_hardware_control(&backend, volume, muted, brightness);
}

fn apply_hardware_control(
    backend: &Arc<SharedBackendState>,
    volume: Option<i32>,
    muted: Option<bool>,
    brightness: Option<i32>,
) {
    if let Some(v) = volume {
        backend.volume.store(v.clamp(0, 100), Ordering::Relaxed);
    }
    if let Some(m) = muted {
        backend.muted.store(m, Ordering::Relaxed);
    }
    if let Some(b) = brightness {
        backend.brightness.store(b.clamp(0, 10), Ordering::Relaxed);
    }

    #[cfg(windows)]
    {
        let vol_opt = volume.map(|v| (v.clamp(0, 100) as f32) / 100.0);
        let mute_opt = muted;
        let bri_opt = brightness.map(|b| (b.clamp(0, 10) * 10).clamp(0, 100));

        thread::spawn(move || {
            let mut ps = String::from("$ErrorActionPreference = 'SilentlyContinue'; ");
            if vol_opt.is_some() || mute_opt.is_some() {
                let set_v = if vol_opt.is_some() { 1 } else { 0 };
                let v_val = vol_opt.unwrap_or(0.2);
                let set_m = if mute_opt.is_some() { 1 } else { 0 };
                let m_val = if mute_opt.unwrap_or(false) { "$true" } else { "$false" };
                ps.push_str(&format!(
                    r#"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {{
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out int pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
    int GetMute(out bool pbMute);
}}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {{
    int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
}}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {{
    int NotImpl1();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject {{ }}
public class WinCoreAudioSet {{
    public static void Apply(float vol, int setVol, bool mute, int setMute) {{
        var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        IMMDevice dev = null;
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
        Guid epvId = typeof(IAudioEndpointVolume).GUID;
        IAudioEndpointVolume epv = null;
        Marshal.ThrowExceptionForHR(dev.Activate(ref epvId, 23, 0, out epv));
        if (setVol == 1) Marshal.ThrowExceptionForHR(epv.SetMasterVolumeLevelScalar(vol, Guid.Empty));
        if (setMute == 1) Marshal.ThrowExceptionForHR(epv.SetMute(mute, Guid.Empty));
    }}
}}
"@
[WinCoreAudioSet]::Apply({v_val:.3}, {set_v}, {m_val}, {set_m});
"#
                ));
            }
            if let Some(pct) = bri_opt {
                ps.push_str(&format!(
                    r#"
$mon = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Select-Object -First 1;
if ($mon) {{ Invoke-CimMethod -InputObject $mon -MethodName WmiSetBrightness -Arguments @{{ Timeout = 1; Brightness = {pct} }} | Out-Null }}
"#
                ));
            }
            let _ = run_powershell_hidden(&ps);
        });
    }
}

fn start_hardware_poller(state: Arc<SharedBackendState>) {
    #[cfg(windows)]
    thread::spawn(move || {
        let poll_script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$bat = Get-CimInstance -ClassName Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining, BatteryStatus
$bri = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1 CurrentBrightness
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out int pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
    int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int NotImpl1();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject { }
public class WinCoreAudio {
    public static float GetVolume() {
        var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        IMMDevice dev = null;
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
        Guid epvId = typeof(IAudioEndpointVolume).GUID;
        IAudioEndpointVolume epv = null;
        Marshal.ThrowExceptionForHR(dev.Activate(ref epvId, 23, 0, out epv));
        float v = -1;
        Marshal.ThrowExceptionForHR(epv.GetMasterVolumeLevelScalar(out v));
        return v;
    }
    public static bool GetMute() {
        var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        IMMDevice dev = null;
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
        Guid epvId = typeof(IAudioEndpointVolume).GUID;
        IAudioEndpointVolume epv = null;
        Marshal.ThrowExceptionForHR(dev.Activate(ref epvId, 23, 0, out epv));
        bool m = false;
        Marshal.ThrowExceptionForHR(epv.GetMute(out m));
        return m;
    }
}
"@
$vol = [Math]::Round([WinCoreAudio]::GetVolume() * 100)
$mute = [WinCoreAudio]::GetMute()
@{
  batteryLevel = if ($bat) { $bat.EstimatedChargeRemaining } else { $null }
  batteryStatus = if ($bat) { $bat.BatteryStatus } else { $null }
  brightness = if ($bri) { [Math]::Round($bri.CurrentBrightness / 10) } else { $null }
  volume = $vol
  muted = $mute
} | ConvertTo-Json -Compress
"#;
        loop {
            if let Some(out) = run_powershell_hidden(poll_script) {
                if let Ok(val) = serde_json::from_str::<Value>(&out) {
                    if let Some(v) = val.get("volume").and_then(|x| x.as_i64()) {
                        state.volume.store((v as i32).clamp(0, 100), Ordering::Relaxed);
                    }
                    if let Some(m) = val.get("muted").and_then(|x| x.as_bool()) {
                        state.muted.store(m, Ordering::Relaxed);
                    }
                    if let Some(b) = val.get("brightness").and_then(|x| x.as_i64()) {
                        state.brightness.store((b as i32).clamp(0, 10), Ordering::Relaxed);
                    }
                    if let Some(bat) = val.get("batteryLevel").and_then(|x| x.as_i64()) {
                        state.battery_level.store((bat as i32).clamp(1, 100), Ordering::Relaxed);
                    }
                    if let Some(bs) = val.get("batteryStatus").and_then(|x| x.as_i64()) {
                        state.is_charging.store(bs == 2 || bs == 6 || bs == 7, Ordering::Relaxed);
                    }
                }
            }
            thread::sleep(Duration::from_millis(1200));
        }
    });
}

fn parse_query_params(url: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    if let Some(idx) = url.find('?') {
        let query = &url[idx + 1..];
        for pair in query.split('&') {
            if let Some(eq) = pair.find('=') {
                let k = urlencoding::decode(&pair[..eq])
                    .map(|s| s.into_owned())
                    .unwrap_or_else(|_| pair[..eq].to_string());
                let v = urlencoding::decode(&pair[eq + 1..])
                    .map(|s| s.into_owned())
                    .unwrap_or_else(|_| pair[eq + 1..].to_string());
                map.insert(k, v);
            }
        }
    }
    map
}

fn fetch_synced_lyrics_rust(title: &str, artist: &str, fallback_q: &str) -> (String, String, String) {
    let q = if !title.is_empty() {
        format!("{} {}", title, artist).trim().to_string()
    } else {
        fallback_q.trim().to_string()
    };
    if q.is_empty() {
        return (String::new(), "LINE".to_string(), "none".to_string());
    }

    let url = format!("https://lrclib.net/api/search?q={}", urlencoding::encode(&q));
    if let Ok(resp) = ureq::get(&url)
        .set("User-Agent", "WinIsle-Tauri/2.0")
        .timeout(Duration::from_millis(3200))
        .call()
    {
        if let Ok(list) = resp.into_json::<Value>() {
            if let Some(arr) = list.as_array() {
                for item in arr {
                    if let Some(synced) = item.get("syncedLyrics").and_then(|x| x.as_str()) {
                        if !synced.trim().is_empty() {
                            return (
                                synced.to_string(),
                                "LINE".to_string(),
                                "lrclib".to_string(),
                            );
                        }
                    }
                }
            }
        }
    }
    (String::new(), "LINE".to_string(), "none".to_string())
}

fn resolve_song_rust(query: &str, use_flac: bool) -> Option<Value> {
    let clean_q = query.trim();
    if clean_q.is_empty() {
        return None;
    }

    let mut title = clean_q.to_string();
    let mut artist = "Various Artists".to_string();
    let mut cover_url = String::new();
    let mut duration_ms: i64 = 210_000;
    let mut youtube_video_id = String::new();

    let itunes_url = format!(
        "https://itunes.apple.com/search?term={}&media=music&entity=song&limit=5",
        urlencoding::encode(clean_q)
    );
    if let Ok(resp) = ureq::get(&itunes_url)
        .timeout(Duration::from_millis(3500))
        .call()
    {
        if let Ok(data) = resp.into_json::<Value>() {
            if let Some(first) = data
                .get("results")
                .and_then(|r| r.as_array())
                .and_then(|a| a.first())
            {
                if let Some(t) = first.get("trackName").and_then(|x| x.as_str()) {
                    title = t.to_string();
                }
                if let Some(a) = first.get("artistName").and_then(|x| x.as_str()) {
                    artist = a.to_string();
                }
                if let Some(art) = first.get("artworkUrl100").and_then(|x| x.as_str()) {
                    cover_url = art.replace("100x100bb", "600x600bb");
                }
                if let Some(dur) = first.get("trackTimeMillis").and_then(|x| x.as_i64()) {
                    if dur > 45_000 {
                        duration_ms = dur;
                    }
                }
            }
        }
    }

    let yt_query = format!("{} {} Official Audio", title, artist);
    let yt_url = format!(
        "https://www.youtube.com/results?search_query={}",
        urlencoding::encode(&yt_query)
    );
    if let Ok(resp) = ureq::get(&yt_url)
        .set(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .timeout(Duration::from_millis(3500))
        .call()
    {
        if let Ok(html) = resp.into_string() {
            if let Some(idx) = html.find("\"videoId\":\"") {
                let start = idx + 11;
                if html.len() >= start + 11 {
                    let cand = &html[start..start + 11];
                    if cand
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
                    {
                        youtube_video_id = cand.to_string();
                    }
                }
            }
        }
    }

    if cover_url.is_empty() && !youtube_video_id.is_empty() {
        cover_url = format!("https://img.youtube.com/vi/{}/hqdefault.jpg", youtube_video_id);
    }

    let (lrc, sync_type, provider) = fetch_synced_lyrics_rust(&title, &artist, clean_q);

    Some(json!({
        "title": title,
        "artist": artist,
        "coverUrl": cover_url,
        "audioUrl": "",
        "isFlac": use_flac,
        "durationMs": duration_ms,
        "youtubeVideoId": youtube_video_id,
        "lrc": lrc,
        "syncType": sync_type,
        "provider": provider
    }))
}

fn infer_action_rust(prompt: &str) -> (&'static str, Option<String>) {
    let p = prompt.to_lowercase();
    if p.contains("mini capsule") || p.contains("alt+h") || p.contains("sembunyikan pulau") {
        return ("toggle_mini_capsule", None);
    }
    if p.contains("cuaca") || p.contains("weather") {
        for city in ["jakarta", "bandung", "surabaya", "yogyakarta", "bali", "medan", "semarang"] {
            if p.contains(city) {
                let mut c = city.chars();
                let cap = match c.next() {
                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                    None => city.to_string(),
                };
                return ("open_weather", Some(cap));
            }
        }
        return ("open_weather", None);
    }
    if p.contains("tambah") && (p.contains("task") || p.contains("tugas") || p.contains("todo")) {
        let title = if p.contains("besok") {
            "Tugas Besok|09:00".to_string()
        } else {
            "Tugas Baru".to_string()
        };
        return ("add_todo", Some(title));
    }
    for prefix in ["putar lagu ", "setel lagu ", "play song ", "mainkan lagu "] {
        if let Some(idx) = p.find(prefix) {
            let song = prompt[idx + prefix.len()..].trim().to_string();
            if !song.is_empty() {
                return ("play_song", Some(song));
            }
        }
    }
    if p.contains("mulai timer") || p.contains("start timer") || p.contains("mulai pomodoro") {
        return ("start_pomodoro", None);
    }
    if p.contains("buka kalender") || p.contains("open calendar") {
        return ("open_calendar", None);
    }
    ("none", None)
}

fn handle_http_request(mut request: tiny_http::Request, state: Arc<SharedBackendState>) {
    let cors_headers = vec![
        Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
        Header::from_bytes(
            &b"Access-Control-Allow-Methods"[..],
            &b"GET, POST, PUT, DELETE, OPTIONS"[..],
        )
        .unwrap(),
        Header::from_bytes(
            &b"Access-Control-Allow-Headers"[..],
            &b"Content-Type, Authorization, x-gemini-key"[..],
        )
        .unwrap(),
        Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap(),
    ];

    if request.method() == &Method::Options {
        let mut resp = Response::from_string("");
        for h in cors_headers {
            resp.add_header(h);
        }
        let _ = request.respond(resp.with_status_code(204));
        return;
    }

    let full_url = request.url().to_string();
    let path = full_url.split('?').next().unwrap_or("/");
    let params = parse_query_params(&full_url);

    let mut body_str = String::new();
    let _ = request.as_reader().read_to_string(&mut body_str);
    let body_json: Value = serde_json::from_str(&body_str).unwrap_or_else(|_| json!({}));

    let response_json: Value = match (request.method(), path) {
        (&Method::Get, "/api/winisle-health") => json!({
            "app": "winisle-desktop",
            "version": "1.2.5",
            "engine": "tauri-2.0",
            "status": "ready",
            "platform": "win32"
        }),
        (&Method::Get, "/api/gemini/config") => {
            let key = state.gemini_key.lock().unwrap().clone();
            let masked = if key.len() >= 10 {
                format!("{}••••{}", &key[..6], &key[key.len() - 4..])
            } else {
                String::new()
            };
            json!({
                "hasKey": key.len() >= 20,
                "maskedKey": masked,
                "isPermanent": true
            })
        }
        (&Method::Post, "/api/gemini/config") => {
            if let Some(k) = body_json.get("apiKey").and_then(|x| x.as_str()) {
                let clean = k.trim().to_string();
                if clean.len() >= 20 {
                    save_gemini_key(&clean);
                    *state.gemini_key.lock().unwrap() = clean.clone();
                    let masked = format!("{}••••{}", &clean[..4], &clean[clean.len() - 4..]);
                    json!({ "ok": true, "hasKey": true, "maskedKey": masked })
                } else {
                    json!({ "error": "Invalid API Key" })
                }
            } else {
                json!({ "error": "API Key required" })
            }
        }
        (&Method::Get, "/api/system/hardware-status") => json!({
            "osHardwareAvailable": cfg!(windows),
            "platform": if cfg!(windows) { "win32" } else { "linux" },
            "batteryLevel": state.battery_level.load(Ordering::Relaxed),
            "isCharging": state.is_charging.load(Ordering::Relaxed),
            "volume": state.volume.load(Ordering::Relaxed),
            "muted": state.muted.load(Ordering::Relaxed),
            "brightness": state.brightness.load(Ordering::Relaxed)
        }),
        (&Method::Post, "/api/system/hardware-control") => {
            let vol = body_json.get("volume").and_then(|x| x.as_i64()).map(|v| v as i32);
            let muted = body_json.get("muted").and_then(|x| x.as_bool());
            let bri = body_json
                .get("brightness")
                .and_then(|x| x.as_i64())
                .map(|b| b as i32);
            apply_hardware_control(&state, vol, muted, bri);
            json!({ "ok": true, "osHardwareAvailable": cfg!(windows) })
        }
        (&Method::Get, "/api/weather") => {
            let requested_city = params.get("city").cloned().unwrap_or_default();
            let mut city = if requested_city.is_empty() {
                "Jakarta".to_string()
            } else {
                requested_city.clone()
            };
            let mut lat = params
                .get("lat")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(-6.2088);
            let mut lon = params
                .get("lon")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(106.8456);

            if !requested_city.is_empty() {
                let geo_url = format!(
                    "https://geocoding-api.open-meteo.com/v1/search?name={}&count=1&language=id&format=json",
                    urlencoding::encode(&requested_city)
                );
                if let Ok(resp) = ureq::get(&geo_url).timeout(Duration::from_millis(3000)).call() {
                    if let Ok(geo) = resp.into_json::<Value>() {
                        if let Some(first) = geo
                            .get("results")
                            .and_then(|r| r.as_array())
                            .and_then(|a| a.first())
                        {
                            if let Some(n) = first.get("name").and_then(|x| x.as_str()) {
                                city = n.to_string();
                            }
                            if let Some(la) = first.get("latitude").and_then(|x| x.as_f64()) {
                                lat = la;
                            }
                            if let Some(lo) = first.get("longitude").and_then(|x| x.as_f64()) {
                                lon = lo;
                            }
                        }
                    }
                }
            }

            let w_url = format!(
                "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code&daily=sunrise,sunset&timezone=auto&forecast_days=2",
                lat, lon
            );
            if let Ok(resp) = ureq::get(&w_url).timeout(Duration::from_millis(3500)).call() {
                if let Ok(w_data) = resp.into_json::<Value>() {
                    let cur_temp = w_data
                        .pointer("/current/temperature_2m")
                        .and_then(|x| x.as_f64())
                        .unwrap_or(28.0)
                        .round() as i32;
                    let w_code = w_data
                        .pointer("/current/weather_code")
                        .and_then(|x| x.as_i64())
                        .unwrap_or(2) as i32;
                    let is_day = w_data
                        .pointer("/current/is_day")
                        .and_then(|x| x.as_i64())
                        .unwrap_or(1)
                        == 1;

                    let mut hourly = Vec::new();
                    let times = w_data
                        .pointer("/hourly/time")
                        .and_then(|x| x.as_array())
                        .cloned()
                        .unwrap_or_default();
                    let temps = w_data
                        .pointer("/hourly/temperature_2m")
                        .and_then(|x| x.as_array())
                        .cloned()
                        .unwrap_or_default();
                    let codes = w_data
                        .pointer("/hourly/weather_code")
                        .and_then(|x| x.as_array())
                        .cloned()
                        .unwrap_or_default();

                    for i in 0..7 {
                        let idx = (12 + i).min(times.len().saturating_sub(1));
                        let t_label = times
                            .get(idx)
                            .and_then(|x| x.as_str())
                            .and_then(|s| s.split('T').nth(1))
                            .map(|s| s.chars().take(5).collect::<String>())
                            .unwrap_or_else(|| format!("{:02}:00", (12 + i) % 24));
                        let temp_v = temps
                            .get(idx)
                            .and_then(|x| x.as_f64())
                            .map(|v| v.round() as i32)
                            .unwrap_or(cur_temp);
                        let code_v = codes
                            .get(idx)
                            .and_then(|x| x.as_i64())
                            .map(|v| v as i32)
                            .unwrap_or(w_code);
                        hourly.push(json!({ "time": t_label, "temp": temp_v, "code": code_v }));
                    }

                    json!({
                        "ok": true,
                        "city": city,
                        "lat": lat,
                        "lon": lon,
                        "currentTemp": cur_temp,
                        "weatherCode": w_code,
                        "isDay": is_day,
                        "sunrise": "5:49",
                        "sunset": "17:52",
                        "hourly": hourly
                    })
                } else {
                    json!({ "ok": true, "city": city, "currentTemp": 28, "weatherCode": 2, "isDay": true, "sunrise": "5:49", "sunset": "17:52", "hourly": [] })
                }
            } else {
                json!({ "ok": true, "city": city, "currentTemp": 28, "weatherCode": 2, "isDay": true, "sunrise": "5:49", "sunset": "17:52", "hourly": [] })
            }
        }
        (&Method::Get, "/api/music/search") => {
            let q = params.get("q").cloned().unwrap_or_default();
            let use_flac = params.get("flac").map(|v| v == "true" || v == "1").unwrap_or(false);
            if let Some(track) = resolve_song_rust(&q, use_flac) {
                json!({ "found": true, "track": track })
            } else {
                json!({ "found": false })
            }
        }
        (&Method::Get, "/api/music/mood-shuffle") => {
            let seed_artist = params.get("artist").cloned().unwrap_or_default();
            let fallback = if !seed_artist.is_empty() {
                format!("{} Top Song", seed_artist)
            } else {
                "From The Start - Laufey".to_string()
            };
            if let Some(track) = resolve_song_rust(&fallback, false) {
                json!({ "found": true, "track": track, "suggestedQuery": fallback })
            } else {
                json!({ "found": false })
            }
        }
        (&Method::Get, "/api/music/lyrics") => {
            let track_name = params.get("track_name").cloned().unwrap_or_default();
            let artist_name = params.get("artist_name").cloned().unwrap_or_default();
            let q = params.get("q").cloned().unwrap_or_default();
            let (lrc, sync_type, provider) = fetch_synced_lyrics_rust(&track_name, &artist_name, &q);
            json!({
                "ok": true,
                "lrc": lrc,
                "syncType": sync_type,
                "provider": provider,
                "title": if track_name.is_empty() { q } else { track_name },
                "artist": artist_name
            })
        }
        (&Method::Get, "/api/music/os-now-playing") => json!({
            "playing": false,
            "shuffleActive": state.shuffle_active.load(Ordering::Relaxed)
        }),
        (&Method::Post, "/api/music/os-control") => {
            let action = body_json
                .get("action")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_lowercase();
            #[cfg(windows)]
            {
                let vk = match action.as_str() {
                    "play_pause" | "play" | "pause" => 0xB3,
                    "next" => 0xB0,
                    "prev" => 0xB1,
                    _ => 0,
                };
                if vk > 0 {
                    let ps = format!(
                        "$sig = '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);'; $t = Add-Type -MemberDefinition $sig -Name 'Win32MediaKey' -Namespace 'Win32' -PassThru; $t::keybd_event({vk}, 0, 0, 0); $t::keybd_event({vk}, 0, 2, 0)"
                    );
                    let _ = run_powershell_hidden(&ps);
                }
            }
            json!({
                "ok": true,
                "action": action,
                "shuffleActive": state.shuffle_active.load(Ordering::Relaxed)
            })
        }
        (&Method::Post, "/api/gemini/assistant") => {
            let prompt = body_json
                .get("prompt")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let key = state.gemini_key.lock().unwrap().clone();
            let sys_prompt = "You are the live Multimodal AI Assistant inside WinIsle (Windows Dynamic Island overlay). Answer concisely (1-3 sentences) in Indonesian or the user's language. When an action is requested, append [ACTION:action_name|optional_param] at the end (e.g. [ACTION:add_todo|Olahraga|06:00], [ACTION:set_timer|15], [ACTION:open_weather|Bandung], [ACTION:play_song|Laufey From The Start], [ACTION:toggle_mini_capsule]).";

            let mut reply_text = String::new();
            let mut used_model = "gemini-3.1-flash-lite".to_string();

            for model in ["gemini-3.1-flash-lite", "gemini-3.8-flash"] {
                let api_url = format!(
                    "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
                    model, key
                );
                let payload = json!({
                    "systemInstruction": {
                        "parts": [{ "text": sys_prompt }]
                    },
                    "contents": [{
                        "role": "user",
                        "parts": [{ "text": prompt }]
                    }],
                    "generationConfig": {
                        "thinkingConfig": {
                            "thinkingLevel": "LOW"
                        }
                    }
                });

                if let Ok(resp) = ureq::post(&api_url)
                    .set("Content-Type", "application/json")
                    .timeout(Duration::from_millis(8500))
                    .send_json(payload)
                {
                    if let Ok(res_json) = resp.into_json::<Value>() {
                        if let Some(txt) = res_json
                            .pointer("/candidates/0/content/parts/0/text")
                            .and_then(|x| x.as_str())
                        {
                            reply_text = txt.trim().to_string();
                            used_model = model.to_string();
                            break;
                        }
                    }
                }
            }

            let mut detected_action = "none".to_string();
            let mut detected_param: Option<String> = None;

            if let Some(start) = reply_text.find("[ACTION:") {
                if let Some(end_rel) = reply_text[start..].find(']') {
                    let end = start + end_rel;
                    let inner = &reply_text[start + 8..end];
                    let mut parts = inner.splitn(2, '|');
                    detected_action = parts.next().unwrap_or("none").trim().to_lowercase();
                    detected_param = parts.next().map(|s| s.trim().to_string());
                    reply_text = format!("{}{}", &reply_text[..start], &reply_text[end + 1..])
                        .trim()
                        .to_string();
                }
            }

            if detected_action == "none" {
                let (inf_act, inf_param) = infer_action_rust(&prompt);
                detected_action = inf_act.to_string();
                detected_param = inf_param;
            }

            if reply_text.is_empty() {
                reply_text = if detected_action != "none" {
                    "Siap, perintah langsung dijalankan di Dynamic Island.".to_string()
                } else {
                    "Siap! Silakan gunakan perintah suara atau teks untuk mengatur musik, cuaca, timer, atau tugas harian.".to_string()
                };
            }

            let track_data = if (detected_action == "play_song" || detected_action == "queue_song")
                && detected_param.is_some()
            {
                resolve_song_rust(detected_param.as_deref().unwrap_or(""), false)
            } else {
                None
            };

            json!({
                "reply": reply_text,
                "activeStepHeadline": reply_text.chars().take(70).collect::<String>(),
                "agentSteps": ["Understanding request", "Executing action", "Done"],
                "action": detected_action,
                "actionParam": detected_param,
                "trackData": track_data,
                "source": used_model
            })
        }
        _ => json!({ "ok": true }),
    };

    let body_out = serde_json::to_string(&response_json).unwrap_or_else(|_| "{}".to_string());
    let mut resp = Response::from_string(body_out);
    for h in cors_headers {
        resp.add_header(h);
    }
    let _ = request.respond(resp);
}

fn start_embedded_api_server(state: Arc<SharedBackendState>) {
    thread::spawn(move || {
        if let Ok(server) = Server::http("127.0.0.1:45781") {
            for request in server.incoming_requests() {
                let st = Arc::clone(&state);
                thread::spawn(move || {
                    handle_http_request(request, st);
                });
            }
        }
    });
}

#[cfg(windows)]
fn start_native_cursor_hit_test_loop(app: AppHandle, bounds: Arc<IslandBoundsState>) {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

    thread::spawn(move || {
        let mut currently_ignoring = true;
        loop {
            if let Some(win) = app.get_webview_window("main") {
                if let (Ok(win_pos), Ok(win_size), Ok(scale)) =
                    (win.outer_position(), win.outer_size(), win.scale_factor())
                {
                    let mut pt = POINT { x: 0, y: 0 };
                    let ok = unsafe { GetCursorPos(&mut pt) };
                    if ok != 0 {
                        let island_w =
                            ((bounds.width.load(Ordering::Relaxed) as f64) * scale).round() as i32;
                        let island_h =
                            ((bounds.height.load(Ordering::Relaxed) as f64) * scale).round() as i32;
                        let pad = (12.0 * scale).round() as i32;

                        let center_x = win_pos.x + (win_size.width as i32) / 2;
                        let left = center_x - (island_w / 2) - pad;
                        let right = center_x + (island_w / 2) + pad;
                        let top = win_pos.y;
                        let bottom = win_pos.y + island_h + pad;

                        let inside_capsule =
                            pt.x >= left && pt.x <= right && pt.y >= top && pt.y <= bottom;
                        let should_ignore = !inside_capsule;

                        if should_ignore != currently_ignoring {
                            currently_ignoring = should_ignore;
                            let _ = win.set_ignore_cursor_events(should_ignore);
                        }
                    }
                }
            }
            thread::sleep(Duration::from_millis(16));
        }
    });
}

fn main() {
    let bounds_state = Arc::new(IslandBoundsState {
        width: AtomicI32::new(260),
        height: AtomicI32::new(44),
        renderer_wants_interactive: AtomicBool::new(false),
    });

    let backend_state = Arc::new(SharedBackendState {
        gemini_key: Mutex::new(load_gemini_key()),
        volume: AtomicI32::new(36),
        muted: AtomicBool::new(false),
        brightness: AtomicI32::new(7),
        battery_level: AtomicI32::new(85),
        is_charging: AtomicBool::new(true),
        shuffle_active: AtomicBool::new(false),
    });

    start_embedded_api_server(Arc::clone(&backend_state));
    start_hardware_poller(Arc::clone(&backend_state));

    let bounds_for_setup = Arc::clone(&bounds_state);

    tauri::Builder::default()
        .manage(bounds_state)
        .manage(backend_state)
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    if let Some(win) = app.get_webview_window("main") {
                        if shortcut.matches(Modifiers::ALT, Code::KeyQ) {
                            let _ = win.show();
                            let _ = win.set_focus();
                            let _ = win.set_ignore_cursor_events(false);
                            let _ = win.eval(
                                "window.dispatchEvent(new CustomEvent('winisle:toggle-assistant'));",
                            );
                        } else if shortcut.matches(Modifiers::ALT, Code::KeyH) {
                            let _ = win.eval(
                                "window.dispatchEvent(new CustomEvent('winisle:toggle-mini-capsule'));",
                            );
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            set_ignore_mouse_events,
            update_island_bounds,
            trim_memory,
            set_hardware_status
        ])
        .setup(move |app| {
            if let Some(win) = app.get_webview_window("main") {
                position_window_top_center(&win);
                let _ = win.set_always_on_top(true);
                let _ = win.set_ignore_cursor_events(true);
                let _ = win.eval("window.__WINISLE_SERVER_URL__ = 'http://127.0.0.1:45781';");
            }

            // Register global shortcuts Alt+Q (Assistant) & Alt+H (Instant Mini Capsule)
            let shortcut_q = Shortcut::new(Some(Modifiers::ALT), Code::KeyQ);
            let shortcut_h = Shortcut::new(Some(Modifiers::ALT), Code::KeyH);
            let _ = app.global_shortcut().register(shortcut_q);
            let _ = app.global_shortcut().register(shortcut_h);

            // System Tray Menu
            let toggle_vis =
                MenuItem::with_id(app, "toggle_vis", "Tampilkan / Sembunyikan Island", true, None::<&str>)?;
            let open_ai =
                MenuItem::with_id(app, "open_ai", "Buka Assistant (Alt+Q)", true, None::<&str>)?;
            let mini_mode =
                MenuItem::with_id(app, "mini_mode", "Mode Kapsul Tipis (Alt+H)", true, None::<&str>)?;
            let reset_pos =
                MenuItem::with_id(app, "reset_pos", "Reset Posisi ke Tengah Atas", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let trim_ram =
                MenuItem::with_id(app, "trim_ram", "Optimalkan RAM Sekarang (~22MB)", true, None::<&str>)?;
            let quit_app =
                MenuItem::with_id(app, "quit_app", "Keluar dari WinIsle", true, None::<&str>)?;

            let tray_menu = Menu::with_items(
                app,
                &[
                    &toggle_vis,
                    &open_ai,
                    &mini_mode,
                    &reset_pos,
                    &sep1,
                    &trim_ram,
                    &quit_app,
                ],
            )?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("WinIsle - Dynamic Island (Tauri 2.0)")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle_vis" => {
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(true) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                    "open_ai" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                            let _ = win.set_ignore_cursor_events(false);
                            let _ = win.eval(
                                "window.dispatchEvent(new CustomEvent('winisle:toggle-assistant'));",
                            );
                        }
                    }
                    "mini_mode" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.eval(
                                "window.dispatchEvent(new CustomEvent('winisle:toggle-mini-capsule'));",
                            );
                        }
                    }
                    "reset_pos" => {
                        if let Some(win) = app.get_webview_window("main") {
                            position_window_top_center(&win);
                            let _ = win.show();
                        }
                    }
                    "trim_ram" => {
                        trim_process_working_set();
                    }
                    "quit_app" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(win) = tray.app_handle().get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(icon);
            }
            let _ = tray_builder.build(app);

            #[cfg(windows)]
            start_native_cursor_hit_test_loop(app.handle().clone(), bounds_for_setup);

            // Periodic working-set memory trimmer every 30s to keep RAM ~22MB
            thread::spawn(|| loop {
                thread::sleep(Duration::from_secs(30));
                trim_process_working_set();
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running WinIsle Tauri 2.0 application");
}

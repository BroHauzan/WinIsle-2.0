use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{command, AppHandle, Emitter};

fn cached_media_info() -> &'static Mutex<Option<SystemMediaInfo>> {
    static CACHE: OnceLock<Mutex<Option<SystemMediaInfo>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct SystemMediaInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub is_playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub source_app: String,
    pub shuffle_active: bool,
    pub cover_url: Option<String>,
}

#[cfg(target_os = "windows")]
mod win_media {
    use super::*;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession,
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };
    use windows::Storage::Streams::DataReader;

    fn get_system_100ns() -> i64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        if let Ok(duration) = SystemTime::now().duration_since(UNIX_EPOCH) {
            let secs = duration.as_secs() as i64 + 11_644_473_600;
            let subsec_100ns = (duration.subsec_nanos() / 100) as i64;
            secs * 10_000_000 + subsec_100ns
        } else {
            0
        }
    }

    fn is_browser_app(raw_app: &str) -> bool {
        let lower = raw_app.to_lowercase();
        lower.contains("chrome")
            || lower.contains("msedge")
            || lower.contains("edge")
            || lower.contains("brave")
            || lower.contains("firefox")
            || lower.contains("opera")
            || lower.contains("vivaldi")
    }

    fn clean_source_app(raw_app: &str, raw_title: &str, raw_album: &str) -> String {
        let lower_app = raw_app.to_lowercase();
        let lower_title = raw_title.to_lowercase();
        let lower_album = raw_album.to_lowercase();
        if lower_app.contains("spotify") || lower_title.contains("spotify") {
            "Spotify".to_string()
        } else if lower_app.contains("youtube")
            || lower_app.contains("ytm")
            || lower_title.contains("youtube music")
            || lower_album.contains("youtube music")
        {
            "YouTube Music".to_string()
        } else if lower_app.contains("apple") || lower_app.contains("itunes") {
            "Apple Music".to_string()
        } else if is_browser_app(&lower_app) {
            "YouTube Music".to_string()
        } else if !raw_app.is_empty() {
            raw_app
                .split('\\')
                .last()
                .unwrap_or(raw_app)
                .trim_end_matches(".exe")
                .to_string()
        } else {
            "Music".to_string()
        }
    }

    fn is_non_music_title_or_artist(title: &str, artist: &str) -> bool {
        let combined = format!("{} {}", title.to_lowercase(), artist.to_lowercase());
        let blocked = [
            "google ai studio",
            "ai studio",
            "aistudio",
            "winisle",
            "github",
            "whatsapp",
            "discord",
            "telegram",
            "bandicam",
            "obs studio",
            "localhost",
            "127.0.0.1",
            ".mp4",
            ".webm",
            ".mov",
            ".mkv",
            ".avi",
            "new tab",
            "untitled",
            "google chrome",
            "microsoft edge",
            "chatgpt",
            "claude",
            "gemini",
            "stack overflow",
            "docs.google",
            "drive.google",
            "mail.google",
            "facebook",
            "instagram",
            "twitter",
            "x.com",
            "tiktok",
        ];
        blocked.iter().any(|kw| combined.contains(kw))
    }

    fn clean_song_and_artist(raw_title: &str, raw_artist: &str) -> (String, String) {
        let mut title = raw_title.trim().to_string();
        let suffixes = [
            " - YouTube Music",
            " - YouTube",
            " - Google Chrome",
            " - Microsoft Edge",
            " - Brave",
            " - Mozilla Firefox",
            " - Spotify",
            " | YouTube Music",
            " | YouTube",
        ];
        for s in suffixes.iter() {
            if title.len() > s.len() && title.to_lowercase().ends_with(&s.to_lowercase()) {
                let new_len = title.len() - s.len();
                title = title[..new_len].trim().to_string();
            }
        }

        let mut artist = raw_artist.trim().to_string();
        if artist.to_lowercase().ends_with(" - topic") && artist.len() > 8 {
            let new_len = artist.len() - 8;
            artist = artist[..new_len].trim().to_string();
        }
        if artist.eq_ignore_ascii_case("google chrome")
            || artist.eq_ignore_ascii_case("microsoft edge")
            || artist.eq_ignore_ascii_case("various artists")
            || artist.eq_ignore_ascii_case("unknown artist")
        {
            artist.clear();
        }

        // If artist is empty and title has "Artist - Song Title", split cleanly
        if artist.is_empty() {
            if let Some(idx) = title.find(" - ") {
                let left = title[..idx].trim().to_string();
                let right = title[idx + 3..].trim().to_string();
                if !left.is_empty() && !right.is_empty() {
                    artist = left;
                    title = right;
                }
            }
        }

        (title, artist)
    }

    fn extract_thumbnail_base64(
        session: &GlobalSystemMediaTransportControlsSession,
        is_browser: bool,
    ) -> Option<String> {
        let async_props = session.TryGetMediaPropertiesAsync().ok()?;
        let props = async_props.get().ok()?;
        let thumb_ref = props.Thumbnail().ok()?;

        let async_stream = thumb_ref.OpenReadAsync().ok()?;
        let stream = async_stream.get().ok()?;
        let size = stream.Size().ok()? as u32;
        // Skip tiny browser app-icon placeholders (< 14KB in Chrome/Edge) so official song cover art is used
        let min_bytes = if is_browser { 14_000 } else { 512 };
        if size < min_bytes || size > 2_000_000 {
            return None;
        }
        let content_type = stream.ContentType().ok()?.to_string();
        let reader = DataReader::CreateDataReader(&stream).ok()?;
        let async_load = reader.LoadAsync(size).ok()?;
        let _ = async_load.get().ok()?;
        let mut bytes = vec![0u8; size as usize];
        reader.ReadBytes(&mut bytes).ok()?;

        let mime = if content_type.starts_with("image/") {
            content_type
        } else {
            "image/jpeg".to_string()
        };

        use base64::engine::general_purpose::STANDARD;
        use base64::Engine;
        Some(format!("data:{};base64,{}", mime, STANDARD.encode(&bytes)))
    }

    pub fn query_current_media() -> Result<Option<SystemMediaInfo>, String> {
        let async_mgr = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| format!("GSMTC RequestAsync error: {}", e))?;
        let mgr = async_mgr
            .get()
            .map_err(|e| format!("GSMTC manager error: {}", e))?;

        if let Ok(session) = mgr.GetCurrentSession() {
            if let Ok(Some(info)) = extract_session_info(&session) {
                return Ok(Some(info));
            }
        }

        if let Ok(sessions) = mgr.GetSessions() {
            let count = sessions.Size().unwrap_or(0);
            for i in 0..count {
                if let Ok(session) = sessions.GetAt(i) {
                    if let Ok(Some(info)) = extract_session_info(&session) {
                        return Ok(Some(info));
                    }
                }
            }
        }

        Ok(None)
    }

    fn extract_session_info(
        session: &GlobalSystemMediaTransportControlsSession,
    ) -> Result<Option<SystemMediaInfo>, String> {
        let raw_app_id = session
            .SourceAppUserModelId()
            .map(|s| s.to_string())
            .unwrap_or_default();
        let is_browser = is_browser_app(&raw_app_id);

        let playback_info = match session.GetPlaybackInfo() {
            Ok(info) => info,
            Err(_) => return Ok(None),
        };

        let status = playback_info
            .PlaybackStatus()
            .unwrap_or(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed);

        let is_playing = status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;

        if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed
            || status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped
        {
            return Ok(None);
        }

        let shuffle_active = playback_info
            .IsShuffleActive()
            .ok()
            .and_then(|boxed| boxed.Value().ok())
            .unwrap_or(false);

        let async_props = session
            .TryGetMediaPropertiesAsync()
            .map_err(|e| e.to_string())?;
        let media_props = async_props.get().map_err(|e| e.to_string())?;

        let raw_title = media_props
            .Title()
            .map(|s| s.to_string())
            .unwrap_or_default();
        let raw_artist = media_props
            .Artist()
            .map(|s| s.to_string())
            .unwrap_or_default();
        let album = media_props
            .AlbumTitle()
            .map(|s| s.to_string())
            .unwrap_or_default();

        if raw_title.trim().is_empty() {
            return Ok(None);
        }

        if is_non_music_title_or_artist(&raw_title, &raw_artist) {
            return Ok(None);
        }

        let (title, artist) = clean_song_and_artist(&raw_title, &raw_artist);
        if title.is_empty() {
            return Ok(None);
        }

        // If from a browser and there is still no artist metadata, it is a generic webpage tab, not a music track
        if is_browser && artist.is_empty() {
            return Ok(None);
        }

        let source_app = clean_source_app(&raw_app_id, &raw_title, &album);

        let mut position_ms: u64 = 0;
        let mut duration_ms: u64 = 0;

        if let Ok(timeline) = session.GetTimelineProperties() {
            let base_pos = timeline
                .Position()
                .map(|p| (p.Duration / 10_000).max(0) as u64)
                .unwrap_or(0);
            let mut current_pos = base_pos;

            if is_playing {
                if let Ok(last_updated) = timeline.LastUpdatedTime() {
                    let now_100ns = get_system_100ns();
                    if now_100ns > last_updated.UniversalTime {
                        let elapsed_ms = (now_100ns - last_updated.UniversalTime) / 10_000;
                        if elapsed_ms > 0 && elapsed_ms < 43_200_000 {
                            current_pos = base_pos + elapsed_ms as u64;
                        }
                    }
                }
            }

            if let Ok(end) = timeline.EndTime() {
                duration_ms = (end.Duration / 10_000).max(0) as u64;
                if duration_ms > 0 {
                    current_pos = current_pos.min(duration_ms);
                }
            }

            position_ms = current_pos;
        }

        // Ignore short clips (< 35s) from browsers (e.g. short screen recordings or UI sounds)
        if is_browser && duration_ms > 0 && duration_ms < 35_000 {
            return Ok(None);
        }

        let cover_url = extract_thumbnail_base64(session, is_browser);

        Ok(Some(SystemMediaInfo {
            title,
            artist,
            album,
            is_playing,
            position_ms,
            duration_ms,
            source_app,
            shuffle_active,
            cover_url,
        }))
    }

    pub fn send_media_control(action: &str, target_shuffle: Option<bool>) -> Result<(), String> {
        let async_mgr = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| e.to_string())?;
        let mgr = async_mgr.get().map_err(|e| e.to_string())?;

        let session = mgr.GetCurrentSession().map_err(|e| e.to_string())?;

        match action {
            "play_pause" | "toggle" => {
                let op = session
                    .TryTogglePlayPauseAsync()
                    .map_err(|e| e.to_string())?;
                let _ = op.get();
            }
            "play" => {
                let op = session.TryPlayAsync().map_err(|e| e.to_string())?;
                let _ = op.get();
            }
            "pause" => {
                let op = session.TryPauseAsync().map_err(|e| e.to_string())?;
                let _ = op.get();
            }
            "next" => {
                let op = session.TrySkipNextAsync().map_err(|e| e.to_string())?;
                let _ = op.get();
            }
            "prev" | "previous" => {
                let op = session.TrySkipPreviousAsync().map_err(|e| e.to_string())?;
                let _ = op.get();
            }
            "shuffle" => {
                if let Some(target) = target_shuffle {
                    let op = session
                        .TryChangeShuffleActiveAsync(target)
                        .map_err(|e| e.to_string())?;
                    let _ = op.get();
                }
            }
            _ => return Err(format!("Unknown media action: {}", action)),
        }

        Ok(())
    }
}

#[command]
pub fn get_system_media() -> Result<Option<SystemMediaInfo>, String> {
    Ok(cached_media_info().lock().unwrap().clone())
}

#[command]
pub fn send_system_media_command(
    action: String,
    target_shuffle: Option<bool>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        win_media::send_media_control(&action, target_shuffle)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (action, target_shuffle);
        Ok(())
    }
}

pub fn spawn_media_monitor(app_handle: AppHandle) {
    let running = Arc::new(AtomicBool::new(true));

    std::thread::Builder::new()
        .name("winisle-media-monitor".into())
        .spawn(move || {
            #[cfg(target_os = "windows")]
            unsafe {
                use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }

            let mut last_info: Option<SystemMediaInfo> = None;

            while running.load(Ordering::Relaxed) {
                #[cfg(target_os = "windows")]
                {
                    if let Ok(current) = win_media::query_current_media() {
                        *cached_media_info().lock().unwrap() = current.clone();

                        let should_emit = match (&last_info, &current) {
                            (None, Some(_)) => true,
                            (Some(_), None) => true,
                            (Some(a), Some(b)) => {
                                a.title != b.title
                                    || a.artist != b.artist
                                    || a.is_playing != b.is_playing
                                    || a.shuffle_active != b.shuffle_active
                                    || a.cover_url != b.cover_url
                                    // Position jump > 2.5s
                                    || (a.position_ms as i64 - b.position_ms as i64).abs() > 2500
                            }
                            (None, None) => false,
                        };

                        if should_emit {
                            let _ = app_handle.emit("system_media_changed", &current);
                            last_info = current;
                        }
                    }
                }

                // Poll every 1000ms for responsiveness with zero CPU overhead
                std::thread::sleep(std::time::Duration::from_millis(1000));
            }
        })
        .expect("Failed to spawn system media monitor thread");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_query_current_media_does_not_hang() {
        println!("Calling get_system_media...");
        let res = get_system_media();
        println!("get_system_media result: {:?}", res);
    }
}


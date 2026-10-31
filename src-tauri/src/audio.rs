use windows::core::{implement, Result, GUID, PCWSTR};
use windows::Win32::Media::Audio::Endpoints::{
    IAudioEndpointVolume, IAudioEndpointVolumeCallback, IAudioEndpointVolumeCallback_Impl,
};
use windows::Win32::Media::Audio::{
    eConsole, eMultimedia, eRender, AUDIO_VOLUME_NOTIFICATION_DATA, DEVICE_STATE,
    EDataFlow, ERole, IMMDevice, IMMDeviceEnumerator, IMMNotificationClient,
    IMMNotificationClient_Impl, MMDeviceEnumerator,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, CLSCTX_INPROC_SERVER,
    COINIT_MULTITHREADED,
};
use windows::Win32::UI::Shell::PropertiesSystem::PROPERTYKEY;
use tauri::{AppHandle, Emitter};

pub const WINISLE_CONTEXT_GUID: GUID = GUID::from_u128(0x11111111_2222_3333_4444_555555555555);

#[derive(serde::Serialize, Clone, Debug)]
pub struct VolumePayload {
    pub volume: u32,
    pub muted: bool,
    pub is_self: bool,
}

#[implement(IAudioEndpointVolumeCallback)]
pub struct AudioEndpointVolumeCallback {
    app_handle: AppHandle,
}

impl AudioEndpointVolumeCallback {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }
}

impl IAudioEndpointVolumeCallback_Impl for AudioEndpointVolumeCallback_Impl {
    fn OnNotify(&self, pnotify: *mut AUDIO_VOLUME_NOTIFICATION_DATA) -> Result<()> {
        if pnotify.is_null() {
            return Ok(());
        }

        unsafe {
            let data = *pnotify;
            let volume = (data.fMasterVolume * 100.0).round().clamp(0.0, 100.0) as u32;
            let muted = data.bMuted.as_bool();
            let is_self = data.guidEventContext == WINISLE_CONTEXT_GUID;

            let payload = VolumePayload {
                volume,
                muted,
                is_self,
            };

            let _ = self.app_handle.emit("volume_changed", payload);
        }

        Ok(())
    }
}

#[implement(IMMNotificationClient)]
pub struct AudioNotificationClient {
    device_change_sender: crossbeam_channel::Sender<()>,
}

impl AudioNotificationClient {
    pub fn new(device_change_sender: crossbeam_channel::Sender<()>) -> Self {
        Self { device_change_sender }
    }
}

impl IMMNotificationClient_Impl for AudioNotificationClient_Impl {
    fn OnDeviceStateChanged(&self, _pwstrdeviceid: &PCWSTR, _dwnewstate: DEVICE_STATE) -> Result<()> {
        Ok(())
    }
    fn OnDeviceAdded(&self, _pwstrdeviceid: &PCWSTR) -> Result<()> {
        Ok(())
    }
    fn OnDeviceRemoved(&self, _pwstrdeviceid: &PCWSTR) -> Result<()> {
        Ok(())
    }
    fn OnDefaultDeviceChanged(&self, flow: EDataFlow, role: ERole, _pwstrdefaultdeviceid: &PCWSTR) -> Result<()> {
        if flow.0 == 0 && (role.0 == 0 || role.0 == 1) {
            let _ = self.device_change_sender.try_send(());
        }
        Ok(())
    }
    fn OnPropertyValueChanged(&self, _pwstrdeviceid: &PCWSTR, _key: &PROPERTYKEY) -> Result<()> {
        Ok(())
    }
}

fn get_audio_endpoint() -> std::result::Result<IAudioEndpointVolume, String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| format!("Failed to create MMDeviceEnumerator: {e}"))?;
        let device: IMMDevice = match enumerator.GetDefaultAudioEndpoint(eRender, eConsole) {
            Ok(d) => d,
            Err(_) => enumerator
                .GetDefaultAudioEndpoint(eRender, eMultimedia)
                .map_err(|e| format!("Failed to get default audio endpoint: {e}"))?,
        };
        device
            .Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
            .map_err(|e| format!("Failed to activate IAudioEndpointVolume: {e}"))
    }
}

#[tauri::command]
pub fn get_volume() -> std::result::Result<u32, String> {
    let endpoint = get_audio_endpoint()?;
    unsafe {
        let vol = endpoint
            .GetMasterVolumeLevelScalar()
            .map_err(|e| format!("GetMasterVolumeLevelScalar failed: {e}"))?;
        Ok((vol * 100.0).round().clamp(0.0, 100.0) as u32)
    }
}

#[tauri::command]
pub fn set_volume(volume: u32) -> std::result::Result<(), String> {
    let endpoint = get_audio_endpoint()?;
    let clamped = (volume.clamp(0, 100) as f32) / 100.0f32;
    unsafe {
        endpoint
            .SetMasterVolumeLevelScalar(clamped, &WINISLE_CONTEXT_GUID)
            .map_err(|e| format!("SetMasterVolumeLevelScalar failed: {e}"))?;
        Ok(())
    }
}

#[tauri::command]
pub fn get_mute() -> std::result::Result<bool, String> {
    let endpoint = get_audio_endpoint()?;
    unsafe {
        let muted = endpoint
            .GetMute()
            .map_err(|e| format!("GetMute failed: {e}"))?;
        Ok(muted.as_bool())
    }
}

#[tauri::command]
pub fn set_mute(muted: bool) -> std::result::Result<(), String> {
    let endpoint = get_audio_endpoint()?;
    unsafe {
        endpoint
            .SetMute(muted, &WINISLE_CONTEXT_GUID)
            .map_err(|e| format!("SetMute failed: {e}"))?;
        Ok(())
    }
}

pub fn start_audio_listener(app_handle: AppHandle) {
    std::thread::Builder::new()
        .name("winisle-audio-listener".into())
        .spawn(move || {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }

            let (tx, rx) = crossbeam_channel::bounded::<()>(4);

            let enumerator: IMMDeviceEnumerator = match unsafe {
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_INPROC_SERVER)
            } {
                Ok(e) => e,
                Err(err) => {
                    eprintln!("[WinIsle Audio] Failed to create MMDeviceEnumerator: {:?}", err);
                    return;
                }
            };

            let notif_client: IMMNotificationClient = AudioNotificationClient::new(tx).into();
            let _ = unsafe { enumerator.RegisterEndpointNotificationCallback(&notif_client) };

            let mut current_endpoint: Option<IAudioEndpointVolume> = None;
            let mut current_callback: Option<IAudioEndpointVolumeCallback> = None;

            let rebind = |endpoint: &mut Option<IAudioEndpointVolume>,
                          callback: &mut Option<IAudioEndpointVolumeCallback>| {
                unsafe {
                    if let (Some(ep), Some(cb)) = (endpoint.as_ref(), callback.as_ref()) {
                        let _ = ep.UnregisterControlChangeNotify(cb);
                    }
                    *endpoint = None;
                    *callback = None;

                    let device = match enumerator.GetDefaultAudioEndpoint(eRender, eConsole) {
                        Ok(d) => d,
                        Err(_) => match enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                            Ok(d) => d,
                            Err(_) => return,
                        },
                    };

                    if let Ok(ep) = device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) {
                        let cb: IAudioEndpointVolumeCallback =
                            AudioEndpointVolumeCallback::new(app_handle.clone()).into();
                        let _ = ep.RegisterControlChangeNotify(&cb);

                        let vol = ep.GetMasterVolumeLevelScalar().unwrap_or(0.0);
                        let muted = ep.GetMute().unwrap_or(windows::Win32::Foundation::BOOL(0));

                        let _ = app_handle.emit(
                            "volume_changed",
                            VolumePayload {
                                volume: (vol * 100.0).round().clamp(0.0, 100.0) as u32,
                                muted: muted.as_bool(),
                                is_self: false,
                            },
                        );

                        *endpoint = Some(ep);
                        *callback = Some(cb);
                    }
                }
            };

            // Initial binding
            rebind(&mut current_endpoint, &mut current_callback);

            // Rebind loop with 150ms debounce
            while let Ok(()) = rx.recv() {
                std::thread::sleep(std::time::Duration::from_millis(150));
                while rx.try_recv().is_ok() {}
                rebind(&mut current_endpoint, &mut current_callback);
            }

            // Cleanup on thread termination
            unsafe {
                if let (Some(ep), Some(cb)) = (current_endpoint.as_ref(), current_callback.as_ref()) {
                    let _ = ep.UnregisterControlChangeNotify(cb);
                }
                let _ = enumerator.UnregisterEndpointNotificationCallback(&notif_client);
                CoUninitialize();
            }
        })
        .expect("Failed to spawn audio listener thread");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_volume_payload_contract() {
        let payload = VolumePayload {
            volume: 75,
            muted: false,
            is_self: true,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"volume\":75"));
        assert!(json.contains("\"muted\":false"));
        assert!(json.contains("\"is_self\":true"));
    }

    #[test]
    fn test_context_guid_equality() {
        let expected = GUID::from_u128(0x11111111_2222_3333_4444_555555555555);
        assert_eq!(WINISLE_CONTEXT_GUID, expected);
    }

    #[test]
    fn test_scalar_clamping() {
        let clamp_vol = |v: u32| (v.clamp(0, 100) as f32) / 100.0f32;
        assert_eq!(clamp_vol(0), 0.0);
        assert_eq!(clamp_vol(50), 0.5);
        assert_eq!(clamp_vol(100), 1.0);
        assert_eq!(clamp_vol(150), 1.0);
    }
}

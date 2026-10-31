use windows::core::{BSTR, VARIANT};
use windows::Win32::Devices::Display::{
    DestroyPhysicalMonitors, GetMonitorBrightness, GetNumberOfPhysicalMonitorsFromHMONITOR,
    GetPhysicalMonitorsFromHMONITOR, SetMonitorBrightness, PHYSICAL_MONITOR,
};
use windows::Win32::Foundation::{BOOL, LPARAM};
use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, HDC, HMONITOR};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::System::Wmi::{
    IWbemClassObject, IWbemLocator, WbemLocator, WBEM_FLAG_FORWARD_ONLY,
    WBEM_FLAG_RETURN_WBEM_COMPLETE, WBEM_GENERIC_FLAG_TYPE,
};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct BatteryInfo {
    pub percentage: u32,
    pub is_charging: bool,
}

#[tauri::command]
pub fn get_battery_status() -> Result<BatteryInfo, String> {
    unsafe {
        let mut status = SYSTEM_POWER_STATUS::default();
        if GetSystemPowerStatus(&mut status).is_ok() {
            if status.BatteryLifePercent <= 100 {
                let is_charging = status.ACLineStatus == 1 || (status.BatteryFlag & 8) != 0;
                Ok(BatteryInfo {
                    percentage: status.BatteryLifePercent as u32,
                    is_charging,
                })
            } else {
                Err("Desktop without battery (BatteryLifePercent = 255)".to_string())
            }
        } else {
            Err("Failed to query Win32 GetSystemPowerStatus".to_string())
        }
    }
}

// --- WMI Brightness Engine (Laptops / Internal Panels) ---

fn get_wmi_brightness() -> Option<u32> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let locator: IWbemLocator = CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER).ok()?;
        let services = locator
            .ConnectServer(&BSTR::from(r"ROOT\WMI"), None, None, None, 0, None, None)
            .ok()?;
        let query = BSTR::from("SELECT CurrentBrightness FROM WmiMonitorBrightness WHERE Active = TRUE");
        let enumerator = services
            .ExecQuery(
                &BSTR::from("WQL"),
                &query,
                WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_WBEM_COMPLETE,
                None,
            )
            .ok()?;

        let mut objects = [None; 1];
        let mut returned = 0u32;
        if enumerator.Next(2000, &mut objects, &mut returned).is_err() || returned == 0 {
            return None;
        }

        let obj = objects[0].as_ref()?;
        let mut var = VARIANT::default();
        obj.Get(&BSTR::from("CurrentBrightness"), 0, &mut var, None, None)
            .ok()?;

        var.to_string().trim().parse::<u32>().ok()
    }
}

fn set_wmi_brightness(target_pct: u8) -> bool {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let locator: IWbemLocator = match CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER) {
            Ok(loc) => loc,
            Err(_) => return false,
        };
        let services = match locator.ConnectServer(&BSTR::from(r"ROOT\WMI"), None, None, None, 0, None, None) {
            Ok(s) => s,
            Err(_) => return false,
        };

        let query = BSTR::from("SELECT * FROM WmiMonitorBrightnessMethods WHERE Active = TRUE");
        let enumerator = match services.ExecQuery(
            &BSTR::from("WQL"),
            &query,
            WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_WBEM_COMPLETE,
            None,
        ) {
            Ok(e) => e,
            Err(_) => return false,
        };

        let mut objects = [None; 1];
        let mut returned = 0u32;
        if enumerator.Next(2000, &mut objects, &mut returned).is_err() || returned == 0 {
            return false;
        }

        let monitor_obj = match objects[0].as_ref() {
            Some(o) => o,
            None => return false,
        };

        let mut path_var = VARIANT::default();
        if monitor_obj.Get(&BSTR::from("__PATH"), 0, &mut path_var, None, None).is_err() {
            return false;
        }
        let obj_path = path_var.to_string();

        let mut class_obj: Option<IWbemClassObject> = None;
        if services
            .GetObject(
                &BSTR::from("WmiMonitorBrightnessMethods"),
                WBEM_FLAG_RETURN_WBEM_COMPLETE,
                None,
                Some(&mut class_obj),
                None,
            )
            .is_err()
        {
            return false;
        }
        let class_obj = match class_obj {
            Some(c) => c,
            None => return false,
        };

        let mut in_sig: Option<IWbemClassObject> = None;
        if class_obj
            .GetMethod(&BSTR::from("WmiSetBrightness"), 0, &mut in_sig, std::ptr::null_mut())
            .is_err()
        {
            return false;
        }
        let in_sig = match in_sig {
            Some(s) => s,
            None => return false,
        };

        let in_params = match in_sig.SpawnInstance(0) {
            Ok(p) => p,
            Err(_) => return false,
        };

        let timeout_var = VARIANT::from(1i32);
        let _ = in_params.Put(&BSTR::from("Timeout"), 0, &timeout_var, 0);

        let bri_var = VARIANT::from(target_pct);
        let _ = in_params.Put(&BSTR::from("Brightness"), 0, &bri_var, 0);

        services
            .ExecMethod(
                &BSTR::from(obj_path),
                &BSTR::from("WmiSetBrightness"),
                WBEM_GENERIC_FLAG_TYPE(0),
                None,
                &in_params,
                None,
                None,
            )
            .is_ok()
    }
}

// --- DXVA2 DDC/CI Engine (External Desktop Monitors) ---

unsafe extern "system" fn dxva_get_brightness_enum(
    h_monitor: HMONITOR,
    _hdc: HDC,
    _rect: *mut windows::Win32::Foundation::RECT,
    lparam: LPARAM,
) -> BOOL {
    let result_ptr = lparam.0 as *mut Option<u32>;
    let mut count = 0u32;
    if GetNumberOfPhysicalMonitorsFromHMONITOR(h_monitor, &mut count).is_ok() && count > 0 {
        let mut phys = vec![PHYSICAL_MONITOR::default(); count as usize];
        if GetPhysicalMonitorsFromHMONITOR(h_monitor, &mut phys).is_ok() {
            for pm in &phys {
                let mut min_b = 0u32;
                let mut cur_b = 0u32;
                let mut max_b = 0u32;
                if GetMonitorBrightness(pm.hPhysicalMonitor, &mut min_b, &mut cur_b, &mut max_b) != 0 {
                    if max_b > min_b {
                        let pct =
                            (((cur_b - min_b) as f64 * 100.0) / ((max_b - min_b) as f64)).round() as u32;
                        *result_ptr = Some(pct.clamp(0, 100));
                        let _ = DestroyPhysicalMonitors(&phys);
                        return BOOL(0);
                    }
                }
            }
            let _ = DestroyPhysicalMonitors(&phys);
        }
    }
    BOOL(1)
}

fn get_dxva_brightness() -> Option<u32> {
    unsafe {
        let mut result: Option<u32> = None;
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(dxva_get_brightness_enum),
            LPARAM(&mut result as *mut _ as isize),
        );
        result
    }
}

unsafe extern "system" fn dxva_set_brightness_enum(
    h_monitor: HMONITOR,
    _hdc: HDC,
    _rect: *mut windows::Win32::Foundation::RECT,
    lparam: LPARAM,
) -> BOOL {
    let state = lparam.0 as *mut (u32, bool);
    let target_pct = (*state).0;
    let mut count = 0u32;
    if GetNumberOfPhysicalMonitorsFromHMONITOR(h_monitor, &mut count).is_ok() && count > 0 {
        let mut phys = vec![PHYSICAL_MONITOR::default(); count as usize];
        if GetPhysicalMonitorsFromHMONITOR(h_monitor, &mut phys).is_ok() {
            for pm in &phys {
                let mut min_b = 0u32;
                let mut cur_b = 0u32;
                let mut max_b = 0u32;
                if GetMonitorBrightness(pm.hPhysicalMonitor, &mut min_b, &mut cur_b, &mut max_b) != 0 {
                    let new_b =
                        min_b + (((target_pct as f64 * (max_b - min_b) as f64) / 100.0).round() as u32);
                    if SetMonitorBrightness(pm.hPhysicalMonitor, new_b) != 0 {
                        (*state).1 = true;
                    }
                }
            }
            let _ = DestroyPhysicalMonitors(&phys);
        }
    }
    BOOL(1)
}

fn set_dxva_brightness(target_pct: u32) -> bool {
    unsafe {
        let mut state = (target_pct, false);
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(dxva_set_brightness_enum),
            LPARAM(&mut state as *mut _ as isize),
        );
        state.1
    }
}

#[tauri::command]
pub fn get_brightness() -> Result<u32, String> {
    // 1. Try WMI laptop panel
    if let Some(b) = get_wmi_brightness() {
        return Ok(b.clamp(0, 100));
    }
    // 2. Try DXVA2 DDC/CI monitor
    if let Some(b) = get_dxva_brightness() {
        return Ok(b.clamp(0, 100));
    }
    Err("Display hardware does not support WMI or DDC/CI brightness control".to_string())
}

#[tauri::command]
pub fn set_brightness(level: u32) -> Result<(), String> {
    let clamped = level.clamp(0, 100);
    let wmi_ok = set_wmi_brightness(clamped as u8);
    let dxva_ok = set_dxva_brightness(clamped);

    if wmi_ok || dxva_ok {
        Ok(())
    } else {
        Err("DDC/CI communication not supported on this display".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_battery_info_serialization() {
        let info = BatteryInfo {
            percentage: 95,
            is_charging: true,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"percentage\":95"));
        assert!(json.contains("\"is_charging\":true"));
    }

    #[test]
    fn test_brightness_clamping() {
        let clamp_b = |b: u32| b.clamp(0, 100);
        assert_eq!(clamp_b(0), 0);
        assert_eq!(clamp_b(75), 75);
        assert_eq!(clamp_b(100), 100);
        assert_eq!(clamp_b(150), 100);
    }

    #[test]
    fn test_desktop_battery_status_filtering() {
        let filter_battery = |percent: u8| -> Option<u32> {
            if percent <= 100 {
                Some(percent as u32)
            } else {
                None
            }
        };

        assert_eq!(filter_battery(85), Some(85));
        assert_eq!(filter_battery(255), None);
    }
}

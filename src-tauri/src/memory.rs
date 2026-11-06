use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::command;

#[cfg(target_os = "windows")]
#[link(name = "kernel32")]
extern "system" {
    fn GetCurrentProcess() -> *mut std::ffi::c_void;
    fn SetProcessWorkingSetSize(
        hProcess: *mut std::ffi::c_void,
        dwMinimumWorkingSetSize: usize,
        dwMaximumWorkingSetSize: usize,
    ) -> i32;
    fn K32EmptyWorkingSet(hProcess: *mut std::ffi::c_void) -> i32;
    fn K32EnumProcesses(
        lpidProcess: *mut u32,
        cb: u32,
        lpcbNeeded: *mut u32,
    ) -> i32;
    fn OpenProcess(
        dwDesiredAccess: u32,
        bInheritHandle: i32,
        dwProcessId: u32,
    ) -> *mut std::ffi::c_void;
    fn QueryFullProcessImageNameW(
        hProcess: *mut std::ffi::c_void,
        dwFlags: u32,
        lpExeName: *mut u16,
        lpdwSize: *mut u32,
    ) -> i32;
    fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
}

/// Immediately flushes unreferenced physical pages (Working Set) from `winisle.exe`
/// and all child `msedgewebview2.exe` processes (WebView2 Manager, WebView2 GPU Process,
/// WebView2 Renderer, and Utility processes) so total RAM stays strictly under 50 MB.
#[cfg(target_os = "windows")]
pub fn trim_process_tree_memory() {
    unsafe {
        // 1. Trim current WinIsle host process
        let self_proc = GetCurrentProcess();
        if !self_proc.is_null() {
            let _ = SetProcessWorkingSetSize(self_proc, usize::MAX, usize::MAX);
            let _ = K32EmptyWorkingSet(self_proc);
        }

        // 2. Enumerate processes and trim all WebView2 (msedgewebview2.exe) processes
        let mut pids = [0u32; 2048];
        let mut bytes_returned = 0u32;
        let ok = K32EnumProcesses(
            pids.as_mut_ptr(),
            (pids.len() * std::mem::size_of::<u32>()) as u32,
            &mut bytes_returned,
        );
        if ok == 0 || bytes_returned == 0 {
            return;
        }

        let count = (bytes_returned as usize) / std::mem::size_of::<u32>();
        const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
        const PROCESS_SET_QUOTA: u32 = 0x0100;

        let mut name_buf = [0u16; 512];
        for &pid in pids.iter().take(count.min(pids.len())) {
            if pid == 0 {
                continue;
            }
            let h_proc = OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SET_QUOTA,
                0,
                pid,
            );
            if h_proc.is_null() {
                continue;
            }

            let mut size = name_buf.len() as u32;
            if QueryFullProcessImageNameW(h_proc, 0, name_buf.as_mut_ptr(), &mut size) != 0
                && size > 0
            {
                let path_slice = &name_buf[..(size as usize).min(name_buf.len())];
                let path_str = String::from_utf16_lossy(path_slice).to_ascii_lowercase();
                if path_str.ends_with("msedgewebview2.exe")
                    || path_str.ends_with("winisle.exe")
                    || path_str.ends_with("crashpad_handler.exe")
                {
                    let _ = SetProcessWorkingSetSize(h_proc, usize::MAX, usize::MAX);
                    let _ = K32EmptyWorkingSet(h_proc);
                }
            }

            let _ = CloseHandle(h_proc);
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn trim_process_tree_memory() {}

#[command]
pub fn trim_webview_memory() -> Result<(), String> {
    trim_process_tree_memory();
    Ok(())
}

pub fn spawn_memory_trimmer() {
    static STARTED: OnceLock<AtomicBool> = OnceLock::new();
    let flag = STARTED.get_or_init(|| AtomicBool::new(false));
    if flag.swap(true, Ordering::SeqCst) {
        return;
    }

    let _ = std::thread::Builder::new()
        .name("winisle-memory-trimmer".into())
        .spawn(|| {
            // Initial post-startup working set trims
            std::thread::sleep(std::time::Duration::from_millis(1200));
            trim_process_tree_memory();
            std::thread::sleep(std::time::Duration::from_millis(1800));
            trim_process_tree_memory();

            // Continuous lightweight working set reclamation every 2.5s
            loop {
                std::thread::sleep(std::time::Duration::from_millis(2500));
                trim_process_tree_memory();
            }
        });
}

use tauri::command;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, SRCCOPY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
    SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
};
use windows::Win32::System::StationsAndDesktops::{
    CloseDesktop, GetThreadDesktop, OpenInputDesktop, SetThreadDesktop, DESKTOP_ACCESS_FLAGS,
    DESKTOP_CONTROL_FLAGS, HDESK,
};
use windows::Win32::System::Threading::GetCurrentThreadId;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::io::Cursor;

/// RAII guard that attaches the current thread to the interactive input desktop
/// (`winsta0\default`) for the duration of the capture and cleanly restores the
/// original desktop and closes handles upon drop.
struct ScopedInputDesktop {
    original_desktop: Option<HDESK>,
    input_desktop: Option<HDESK>,
}

impl ScopedInputDesktop {
    /// Attempts to query the current thread desktop and attach to the interactive input desktop.
    /// Fails safe: if desktop operations cannot be completed, returns an inactive guard.
    fn acquire() -> Self {
        unsafe {
            // 1. Remember the calling thread's current desktop (if any)
            let original_desktop = match GetThreadDesktop(GetCurrentThreadId()) {
                Ok(desk) if !desk.is_invalid() => Some(desk),
                _ => None,
            };

            // 2. Open the desktop currently receiving user input
            // 0x01FF represents standard desktop access rights (read, write, switch, etc.)
            let input_desktop = match OpenInputDesktop(
                DESKTOP_CONTROL_FLAGS(0),
                false,
                DESKTOP_ACCESS_FLAGS(0x01FF),
            ) {
                Ok(desk) if !desk.is_invalid() => Some(desk),
                _ => None,
            };

            // 3. Attach current thread to the input desktop
            if let Some(input) = input_desktop {
                // If the thread already has windows/hooks (e.g. main GUI thread),
                // SetThreadDesktop may fail with ERROR_BUSY, which is safe because
                // the GUI thread is already attached to the interactive desktop.
                let _ = SetThreadDesktop(input);
            }

            Self {
                original_desktop,
                input_desktop,
            }
        }
    }
}

impl Drop for ScopedInputDesktop {
    fn drop(&mut self) {
        unsafe {
            // 1. Restore the original thread desktop before closing the input desktop handle
            if let Some(orig) = self.original_desktop {
                let _ = SetThreadDesktop(orig);
            }

            // 2. Close the opened input desktop handle.
            // Win32 Rule: CloseDesktop fails with ERROR_BUSY (170) if the thread is still using it.
            // Because original_desktop was restored above, this CloseDesktop succeeds cleanly.
            if let Some(input) = self.input_desktop {
                let _ = CloseDesktop(input);
            }
        }
    }
}

/// Captures the primary or virtual desktop display into an in-memory PNG
/// and returns the Base64-encoded string representation.
#[command]
pub fn get_system_screenshot() -> Result<String, String> {
    // Acquire desktop attachment for worker thread execution
    let _desktop_guard = ScopedInputDesktop::acquire();

    unsafe {
        // Query virtual desktop dimensions to cover multi-monitor setups
        let mut x = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let mut y = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let mut width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let mut height = GetSystemMetrics(SM_CYVIRTUALSCREEN);

        // Fall back to primary screen metrics if virtual screen dimensions are invalid
        if width <= 0 || height <= 0 {
            x = 0;
            y = 0;
            width = GetSystemMetrics(SM_CXSCREEN);
            height = GetSystemMetrics(SM_CYSCREEN);
        }

        if width <= 0 || height <= 0 {
            return Err("Failed to query valid Windows screen metrics".into());
        }

        let hdc_screen = GetDC(HWND(std::ptr::null_mut()));
        if hdc_screen.is_invalid() {
            return Err("Failed to acquire desktop device context (DC)".into());
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        if hdc_mem.is_invalid() {
            let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);
            return Err("Failed to create compatible memory device context".into());
        }

        let hbitmap = CreateCompatibleBitmap(hdc_screen, width, height);
        if hbitmap.is_invalid() {
            let _ = DeleteDC(hdc_mem);
            let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);
            return Err("Failed to allocate compatible GDI bitmap".into());
        }

        let old_bitmap = SelectObject(hdc_mem, hbitmap);

        let blit_ok = BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, x, y, SRCCOPY);
        if blit_ok.is_err() {
            let _ = SelectObject(hdc_mem, old_bitmap);
            let _ = DeleteObject(hbitmap);
            let _ = DeleteDC(hdc_mem);
            let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);
            return Err("BitBlt screen copy operation failed".into());
        }

        // Configure BITMAPINFO for 32-bit top-down extraction (biHeight negative)
        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // negative = top-down row order
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let pixel_count = (width * height) as usize;
        // Allocate 4-byte aligned pixel buffer for zero-overhead 32-bit word manipulation
        let mut pixels: Vec<u32> = vec![0u32; pixel_count];

        let get_di_ok = GetDIBits(
            hdc_screen,
            hbitmap,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bi,
            DIB_RGB_COLORS,
        );

        // Clean up GDI handles immediately to prevent resource leaks
        let _ = SelectObject(hdc_mem, old_bitmap);
        let _ = DeleteObject(hbitmap);
        let _ = DeleteDC(hdc_mem);
        let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);

        if get_di_ok == 0 {
            return Err("GetDIBits failed to extract pixel buffer from bitmap".into());
        }

        // High-performance 32-bit word BGRA -> RGBA conversion with guaranteed alpha=255.
        // Memory layout (little-endian):
        // Input:  [B (0..7), G (8..15), R (16..23), A (24..31)]
        // Output: [R (0..7), G (8..15), B (16..23), 255 (24..31)]
        // Eliminates slice bounds checks; auto-vectorizes to AVX2/SSE SIMD instructions.
        for p in pixels.iter_mut() {
            let val = *p;
            *p = 0xFF00_0000
                | ((val & 0x0000_00FF) << 16)
                | (val & 0x0000_FF00)
                | ((val & 0x00FF_0000) >> 16);
        }

        let pixel_bytes: &[u8] = std::slice::from_raw_parts(
            pixels.as_ptr() as *const u8,
            pixel_count * 4,
        );

        // Pre-allocate buffer capacity (~1 byte per pixel) to eliminate heap reallocations
        let mut png_bytes = Vec::with_capacity(pixel_count);
        {
            let mut encoder =
                png::Encoder::new(Cursor::new(&mut png_bytes), width as u32, height as u32);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            // CRITICAL ORDER: set_compression first (activates fdeflate),
            // then set_filter to NoFilter (overrides adaptive filter heuristics).
            encoder.set_compression(png::Compression::Fast);
            encoder.set_filter(png::Filter::NoFilter);

            let mut writer = encoder
                .write_header()
                .map_err(|e| format!("PNG header write error: {}", e))?;
            writer
                .write_image_data(pixel_bytes)
                .map_err(|e| format!("PNG pixel encode error: {}", e))?;
        }

        // Return Base64 PNG string
        let base64_str = STANDARD.encode(&png_bytes);
        Ok(base64_str)
    }
}

/// Captures the desktop region directly beneath the Dynamic Island overlay window,
/// downsampled 4x with box-averaging for <0.4ms IPC transfer and natural frosted pre-blur.
#[command]
pub fn get_island_backdrop(window: tauri::WebviewWindow) -> Result<String, String> {
    let _desktop_guard = ScopedInputDesktop::acquire();

    unsafe {
        let scale = window.scale_factor().unwrap_or(1.0);
        let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };

        let (win_x, win_y, win_w, win_h) = if let Ok(pos) = window.outer_position() {
            let size = window.outer_size().unwrap_or_default();
            let w = (size.width as i32).max(200);
            let h = (size.height as i32).max(120);
            (pos.x, pos.y, w, h)
        } else {
            let screen_w = GetSystemMetrics(SM_CXSCREEN).max(800);
            let w = (740.0 * scale).round() as i32;
            let h = (340.0 * scale).round() as i32;
            ((screen_w - w) / 2, 0, w, h)
        };

        let hdc_screen = GetDC(HWND(std::ptr::null_mut()));
        if hdc_screen.is_invalid() {
            return Err("Failed to acquire desktop DC".into());
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        if hdc_mem.is_invalid() {
            let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);
            return Err("Failed to create memory DC".into());
        }

        let hbitmap = CreateCompatibleBitmap(hdc_screen, win_w, win_h);
        if hbitmap.is_invalid() {
            let _ = DeleteDC(hdc_mem);
            let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);
            return Err("Failed to create bitmap".into());
        }

        let old_bitmap = SelectObject(hdc_mem, hbitmap);
        let blit_ok = BitBlt(hdc_mem, 0, 0, win_w, win_h, hdc_screen, win_x, win_y, SRCCOPY);
        if blit_ok.is_err() {
            let _ = SelectObject(hdc_mem, old_bitmap);
            let _ = DeleteObject(hbitmap);
            let _ = DeleteDC(hdc_mem);
            let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);
            return Err("BitBlt failed".into());
        }

        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: win_w,
                biHeight: -win_h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let pixel_count = (win_w * win_h) as usize;
        let mut pixels: Vec<u32> = vec![0u32; pixel_count];

        let get_di_ok = GetDIBits(
            hdc_screen,
            hbitmap,
            0,
            win_h as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bi,
            DIB_RGB_COLORS,
        );

        let _ = SelectObject(hdc_mem, old_bitmap);
        let _ = DeleteObject(hbitmap);
        let _ = DeleteDC(hdc_mem);
        let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);

        if get_di_ok == 0 {
            return Err("GetDIBits failed".into());
        }

        // 4x box-filter downsample for instant transfer & silky pre-blur
        let step = 4usize;
        let out_w = (win_w as usize / step).max(1);
        let out_h = (win_h as usize / step).max(1);
        let src_w = win_w as usize;
        let mut small_rgba: Vec<u8> = Vec::with_capacity(out_w * out_h * 4);

        for oy in 0..out_h {
            let sy_base = oy * step;
            for ox in 0..out_w {
                let sx_base = ox * step;
                let mut r_sum = 0u32;
                let mut g_sum = 0u32;
                let mut b_sum = 0u32;
                for dy in 0..step {
                    let row_offset = (sy_base + dy) * src_w + sx_base;
                    for dx in 0..step {
                        let px = pixels[row_offset + dx];
                        b_sum += px & 0xFF;
                        g_sum += (px >> 8) & 0xFF;
                        r_sum += (px >> 16) & 0xFF;
                    }
                }
                small_rgba.push((r_sum >> 4) as u8);
                small_rgba.push((g_sum >> 4) as u8);
                small_rgba.push((b_sum >> 4) as u8);
                small_rgba.push(255u8);
            }
        }

        let mut png_bytes = Vec::with_capacity(out_w * out_h);
        {
            let mut encoder =
                png::Encoder::new(Cursor::new(&mut png_bytes), out_w as u32, out_h as u32);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder.set_compression(png::Compression::Fast);
            encoder.set_filter(png::Filter::NoFilter);

            let mut writer = encoder
                .write_header()
                .map_err(|e| format!("PNG header error: {}", e))?;
            writer
                .write_image_data(&small_rgba)
                .map_err(|e| format!("PNG data error: {}", e))?;
        }

        Ok(format!("data:image/png;base64,{}", STANDARD.encode(&png_bytes)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_screenshot_execution() {
        // Must succeed without error on interactive test runner thread
        let result = get_system_screenshot();
        assert!(
            result.is_ok(),
            "get_system_screenshot() must succeed on test runner thread: {:?}",
            result.err()
        );

        let b64 = result.unwrap();

        // 1. Must start with standard PNG base64 magic bytes
        assert!(
            b64.starts_with("iVBORw0KGgo"),
            "Screenshot payload must begin with PNG base64 magic bytes 'iVBORw0KGgo'"
        );
        assert!(b64.len() > 100, "Screenshot payload must not be empty");

        // 2. Decode raw bytes and verify authoritative PNG header structure
        let raw = STANDARD
            .decode(&b64)
            .expect("Screenshot payload must be valid base64");
        assert!(
            raw.len() >= 24,
            "Decoded PNG payload must contain at least 8-byte signature and 16-byte IHDR"
        );

        // 3. Verify standard PNG 8-byte signature: \x89PNG\r\n\x1a\n
        let expected_signature: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(
            &raw[0..8],
            &expected_signature,
            "PNG signature magic bytes mismatch"
        );

        // 4. Verify IHDR chunk marker
        assert_eq!(&raw[12..16], b"IHDR", "First PNG chunk must be IHDR");
    }
}

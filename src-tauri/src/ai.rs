/**
 * Native AI Bridge for Tauri 2.0 Desktop Application
 * Executes HTTPS requests to the AI Router using native system curl.exe (CREATE_NO_WINDOW)
 * to bypass WebView2 CORS restrictions and prevent UI thread freezes.
 */

#[tauri::command]
pub async fn ask_bynara_ai(
    base_url: String,
    api_key: String,
    payload_json: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let trimmed_base = base_url.trim().trim_end_matches('/');
        let endpoint = if trimmed_base.ends_with("/chat/completions") {
            trimmed_base.to_string()
        } else {
            format!("{}/chat/completions", trimmed_base)
        };

        let mut cmd = std::process::Command::new("curl.exe");
        cmd.args([
            "-s",
            "-S",
            "--max-time",
            "25",
            "-X",
            "POST",
            &endpoint,
            "-H",
            "Content-Type: application/json",
            "-H",
            &format!("Authorization: Bearer {}", api_key.trim()),
            "--data-binary",
            "@-",
        ])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn curl.exe: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            use std::io::Write;
            stdin
                .write_all(payload_json.as_bytes())
                .map_err(|e| format!("Failed to write request body: {}", e))?;
        }

        let output = child
            .wait_with_output()
            .map_err(|e| format!("Failed to read response: {}", e))?;

        if !output.status.success() {
            let err_str = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(format!("curl error: {}", err_str));
        }

        let body = String::from_utf8_lossy(&output.stdout).to_string();
        if body.trim().is_empty() {
            return Err("Empty response from AI router".to_string());
        }
        Ok(body)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

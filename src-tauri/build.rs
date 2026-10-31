fn main() {
    tauri_build::build();

    #[cfg(windows)]
    {
        if let Ok(out_dir) = std::env::var("OUT_DIR") {
            let res_path = std::path::Path::new(&out_dir).join("libresource.a");
            if res_path.exists() {
                println!("cargo:rustc-link-arg={}", res_path.display());
            }
        }
    }
}

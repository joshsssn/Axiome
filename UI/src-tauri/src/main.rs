#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;
use std::sync::Mutex;

// In release mode, use the Tauri sidecar API.
// In dev mode, we spawn Python directly (the PyInstaller sidecar can't find
// its _internal/ folder when Tauri copies only the .exe to target/debug/).
#[cfg(not(debug_assertions))]
use tauri::api::process::{Command, CommandEvent};

/// Holds the API child process handle so we can kill it on exit.
struct ApiState {
    #[cfg(debug_assertions)]
    child: Mutex<Option<std::process::Child>>,
    #[cfg(not(debug_assertions))]
    child: Mutex<Option<tauri::api::process::CommandChild>>,
}

fn main() {
    tauri::Builder::default()
        .manage(ApiState {
            child: Mutex::new(None),
        })
        .setup(|app| {
            // -- Dev mode: start Python API directly --
            #[cfg(debug_assertions)]
            {
                let api_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .parent().unwrap()   // UI/
                    .parent().unwrap()   // project root
                    .join("API");

                // Try venv310 first, then venv, then .venv
                let python = ["venv310", "venv", ".venv"]
                    .iter()
                    .map(|v| api_dir.join(v).join("Scripts").join("python.exe"))
                    .find(|p| p.exists())
                    .unwrap_or_else(|| std::path::PathBuf::from("python"));

                println!("[dev] Starting API server from {:?}", api_dir);
                println!("[dev] Using Python: {:?}", python);

                let child = std::process::Command::new(&python)
                    .args(["-m", "uvicorn", "app.main:app", "--reload", "--port", "8742"])
                    .current_dir(&api_dir)
                    .spawn()
                    .expect("Failed to start API server. Is Python venv set up?");

                println!("[dev] API server started (PID {})", child.id());

                let state: tauri::State<ApiState> = app.state();
                *state.child.lock().unwrap() = Some(child);
            }

            // -- Release mode: use PyInstaller sidecar --
            #[cfg(not(debug_assertions))]
            {
                let (mut rx, child) = Command::new_sidecar("axiome-api")
                    .expect("failed to create sidecar command")
                    .spawn()
                    .expect("failed to spawn sidecar");

                let state: tauri::State<ApiState> = app.state();
                *state.child.lock().unwrap() = Some(child);

                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => println!("[api] {}", line),
                            CommandEvent::Stderr(line) => eprintln!("[api] {}", line),
                            _ => {}
                        }
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::Destroyed = event.event() {
                let state: tauri::State<ApiState> = event.window().state();
                // Take the child out of the mutex immediately so the guard
                // is dropped before `state`, avoiding lifetime issues.
                let child_opt = state.child.lock().unwrap().take();

                #[cfg(debug_assertions)]
                {
                    if let Some(child) = child_opt {
                        // Kill the entire process tree on Windows
                        let pid = child.id();
                        let _ = std::process::Command::new("taskkill")
                            .args(["/PID", &pid.to_string(), "/T", "/F"])
                            .output();
                        println!("[dev] Killed API process tree (PID {})", pid);
                    }
                }

                #[cfg(not(debug_assertions))]
                {
                    if let Some(child) = child_opt {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

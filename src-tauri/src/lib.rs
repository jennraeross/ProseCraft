use tauri::AppHandle;
#[cfg(desktop)]
use tauri::Emitter;
#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectMenuEntry {
    id: String,
    name: String,
}

#[tauri::command]
fn update_project_menu(
    app: AppHandle,
    projects: Vec<ProjectMenuEntry>,
    active_project_id: String,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let menu = app
            .menu()
            .and_then(|menu| menu.get("file-menu"))
            .ok_or_else(|| "File menu is unavailable".to_string())?;
        let submenu = match menu {
            MenuItemKind::Submenu(submenu) => submenu,
            _ => return Err("File menu has an invalid type".to_string()),
        };

        while submenu.items().map_err(|error| error.to_string())?.len() > 7 {
            submenu.remove_at(7).map_err(|error| error.to_string())?;
        }

        for project in projects {
            let title = if project.id == active_project_id {
                format!("✓ {}", project.name)
            } else {
                project.name
            };
            let item = MenuItem::with_id(
                &app,
                format!("switch-project-{}", project.id),
                title,
                true,
                None::<&str>,
            )
            .map_err(|error| error.to_string())?;
            submenu.append(&item).map_err(|error| error.to_string())?;
        }
    }
    #[cfg(not(desktop))]
    let _ = (app, projects, active_project_id);

    Ok(())
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncDirEntry {
    name: String,
    is_directory: bool,
}

/// Lists `path`, returning an empty list when it does not exist yet.
#[tauri::command]
fn sync_list_dir(path: String) -> Result<Vec<SyncDirEntry>, String> {
    let dir = std::path::Path::new(&path);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        entries.push(SyncDirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            is_directory: file_type.is_dir(),
        });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

#[tauri::command]
fn sync_read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|error| error.to_string())
}

/// Writes text, creating parent directories as needed.
#[tauri::command]
fn sync_write_text(path: String, content: String) -> Result<(), String> {
    let target = std::path::Path::new(&path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::write(target, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn sync_create_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|error| error.to_string())
}

/// Removes a file or directory tree; a missing path is not an error.
#[tauri::command]
fn sync_remove(path: String) -> Result<(), String> {
    let target = std::path::Path::new(&path);
    if !target.exists() {
        return Ok(());
    }
    if target.is_dir() {
        std::fs::remove_dir_all(target).map_err(|error| error.to_string())
    } else {
        std::fs::remove_file(target).map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn sync_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let settings =
                    MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
                let quit = PredefinedMenuItem::quit(app, Some("Quit ProseCraft"))?;
                let app_menu = Submenu::with_items(app, "ProseCraft", true, &[&settings, &quit])?;

                let new_scene =
                    MenuItem::with_id(app, "new-scene", "New Scene", true, Some("CmdOrCtrl+N"))?;
                let new_project =
                    MenuItem::with_id(app, "new-project", "New Project…", true, None::<&str>)?;
                let project_settings = MenuItem::with_id(
                    app,
                    "project-settings",
                    "Project Settings…",
                    true,
                    None::<&str>,
                )?;
                let export = MenuItem::with_id(
                    app,
                    "export-document",
                    "Export Scene…",
                    true,
                    Some("CmdOrCtrl+Shift+E"),
                )?;
                let publish = MenuItem::with_id(
                    app,
                    "publish-manuscript",
                    "Publish Manuscript…",
                    true,
                    Some("CmdOrCtrl+Shift+P"),
                )?;
                let file_menu = Submenu::with_id(app, "file-menu", "File", true)?;
                let file_separator = PredefinedMenuItem::separator(app)?;
                file_menu.append(&new_scene)?;
                file_menu.append(&new_project)?;
                file_menu.append(&project_settings)?;
                file_menu.append(&export)?;
                file_menu.append(&publish)?;
                file_menu.append(&file_separator)?;
                let projects_label =
                    MenuItem::with_id(app, "projects-label", "Projects", false, None::<&str>)?;
                file_menu.append(&projects_label)?;
                let undo = PredefinedMenuItem::undo(app, Some("Undo"))?;
                let redo = PredefinedMenuItem::redo(app, Some("Redo"))?;
                let separator = PredefinedMenuItem::separator(app)?;
                let cut = PredefinedMenuItem::cut(app, Some("Cut"))?;
                let copy = PredefinedMenuItem::copy(app, Some("Copy"))?;
                let paste = PredefinedMenuItem::paste(app, Some("Paste"))?;
                let select_all = PredefinedMenuItem::select_all(app, Some("Select All"))?;
                let edit_menu = Submenu::with_items(
                    app,
                    "Edit",
                    true,
                    &[&undo, &redo, &separator, &cut, &copy, &paste, &select_all],
                )?;

                let menu = Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu])?;
                app.set_menu(menu)?;
            }
            Ok(())
        });

    #[cfg(desktop)]
    let builder = builder.on_menu_event(|app, event| {
        let event_name = match event.id().as_ref() {
            "settings" => Some("prosecraft:open-settings"),
            "project-settings" => Some("prosecraft:open-project-settings"),
            "new-scene" => Some("prosecraft:new-scene"),
            "export-document" => Some("prosecraft:export-document"),
            "publish-manuscript" => Some("prosecraft:open-publish"),
            "new-project" => Some("prosecraft:new-project"),
            _ => None,
        };
        if let Some(event_name) = event_name {
            if let Err(error) = app.emit(event_name, ()) {
                eprintln!("Could not handle application menu event: {error}");
            }
        } else if let Some(project_id) = event.id().as_ref().strip_prefix("switch-project-") {
            if let Err(error) = app.emit("prosecraft:switch-project", project_id.to_string()) {
                eprintln!("Could not handle project switching menu event: {error}");
            }
        }
    });

    builder
        .invoke_handler(tauri::generate_handler![
            greet,
            update_project_menu,
            sync_list_dir,
            sync_read_text,
            sync_write_text,
            sync_create_dir,
            sync_remove,
            sync_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("prosecraft-sync-{name}-{nanos}"))
    }

    #[test]
    fn sync_commands_round_trip() {
        let dir = temp_dir("round-trip");
        let root = dir.to_string_lossy().to_string();
        let project = format!("{root}/projects/p1");

        sync_create_dir(project.clone()).unwrap();
        sync_write_text(format!("{project}/project.enc"), "ciphertext".into()).unwrap();
        assert_eq!(
            sync_read_text(format!("{project}/project.enc")).unwrap(),
            "ciphertext"
        );
        assert!(sync_exists(format!("{project}/project.enc")).unwrap());

        let entries = sync_list_dir(format!("{root}/projects")).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "p1");
        assert!(entries[0].is_directory);

        sync_remove(project.clone()).unwrap();
        assert!(!sync_exists(project).unwrap());
        assert!(sync_list_dir(format!("{root}/projects")).unwrap().is_empty());
        sync_remove(dir.to_string_lossy().to_string()).unwrap();
    }

    #[test]
    fn sync_commands_tolerate_missing_paths() {
        let missing = temp_dir("missing");
        let path = missing.to_string_lossy().to_string();
        assert!(sync_list_dir(path.clone()).unwrap().is_empty());
        assert!(!sync_exists(path.clone()).unwrap());
        sync_remove(path.clone()).unwrap();
    }
}

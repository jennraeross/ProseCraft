use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;
use tauri::AppHandle;
#[cfg(desktop)]
use tauri::Emitter;
#[cfg(desktop)]
use tauri::menu::{CheckMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectMenuEntry {
    id: String,
    name: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemFontFamily {
    family: String,
    monospaced: bool,
}

#[tauri::command]
fn list_system_font_families() -> Vec<SystemFontFamily> {
    static CACHE: OnceLock<Vec<SystemFontFamily>> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let mut database = fontdb::Database::new();
            database.load_system_fonts();

            let mut families: HashMap<String, (String, bool)> = HashMap::new();
            for face in database.faces() {
                for (family, _) in &face.families {
                    let family = family.trim();
                    if family.is_empty() {
                        continue;
                    }
                    families
                        .entry(family.to_lowercase())
                        .and_modify(|(_, monospaced)| *monospaced |= face.monospaced)
                        .or_insert_with(|| (family.to_string(), face.monospaced));
                }
            }

            let mut result: Vec<SystemFontFamily> = families
                .into_values()
                .map(|(family, monospaced)| SystemFontFamily { family, monospaced })
                .collect();
            result.sort_by_key(|a| a.family.to_lowercase());
            result
        })
        .clone()
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

#[tauri::command]
fn set_typewriter_menu_checked(app: AppHandle, checked: bool) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let menu = app
            .menu()
            .ok_or_else(|| "Application menu is unavailable".to_string())?;
        let view_menu = menu
            .get("view-menu")
            .ok_or_else(|| "View menu is unavailable".to_string())?;
        let view_submenu = match view_menu {
            MenuItemKind::Submenu(submenu) => submenu,
            _ => return Err("View menu has an invalid type".to_string()),
        };
        let item = view_submenu
            .get("typewriter-mode")
            .ok_or_else(|| "Typewriter menu item is unavailable".to_string())?;
        match item {
            MenuItemKind::Check(check_item) => check_item
                .set_checked(checked)
                .map_err(|error| error.to_string()),
            _ => Err("Typewriter menu item has an invalid type".to_string()),
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, checked);
        Ok(())
    }
}

#[tauri::command]
fn set_fade_paragraphs_menu_checked(app: AppHandle, checked: bool) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let menu = app
            .menu()
            .ok_or_else(|| "Application menu is unavailable".to_string())?;
        let view_menu = menu
            .get("view-menu")
            .ok_or_else(|| "View menu is unavailable".to_string())?;
        let view_submenu = match view_menu {
            MenuItemKind::Submenu(submenu) => submenu,
            _ => return Err("View menu has an invalid type".to_string()),
        };
        let item = view_submenu
            .get("fade-other-paragraphs")
            .ok_or_else(|| "Fade paragraphs menu item is unavailable".to_string())?;
        match item {
            MenuItemKind::Check(check_item) => check_item
                .set_checked(checked)
                .map_err(|error| error.to_string()),
            _ => Err("Fade paragraphs menu item has an invalid type".to_string()),
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, checked);
        Ok(())
    }
}

#[tauri::command]
fn set_zen_mode_menu_checked(app: AppHandle, checked: bool) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let menu = app
            .menu()
            .ok_or_else(|| "Application menu is unavailable".to_string())?;
        let view_menu = menu
            .get("view-menu")
            .ok_or_else(|| "View menu is unavailable".to_string())?;
        let view_submenu = match view_menu {
            MenuItemKind::Submenu(submenu) => submenu,
            _ => return Err("View menu has an invalid type".to_string()),
        };
        let item = view_submenu
            .get("zen-mode")
            .ok_or_else(|| "Zen mode menu item is unavailable".to_string())?;
        match item {
            MenuItemKind::Check(check_item) => check_item
                .set_checked(checked)
                .map_err(|error| error.to_string()),
            _ => Err("Zen mode menu item has an invalid type".to_string()),
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, checked);
        Ok(())
    }
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

const MAX_RESEARCH_FILE_BYTES: u64 = 200 * 1024 * 1024;

fn research_root(root: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(root);
    if !path.is_absolute() || !path.exists() || !path.is_dir() {
        return Err("The research files folder is unavailable.".to_string());
    }
    Ok(path)
}

fn validate_research_component(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty()
        || value == "."
        || value == ".."
        || value.contains('/')
        || value.contains('\\')
        || value.contains('\0')
    {
        return Err(format!("Invalid {label}."));
    }
    Ok(())
}

fn research_destination(
    root: &str,
    project_folder: &str,
    storage_key: &str,
) -> Result<PathBuf, String> {
    validate_research_component(project_folder, "project folder")?;
    let relative = Path::new(storage_key);
    let components: Vec<Component> = relative.components().collect();
    if relative.is_absolute()
        || !storage_key.starts_with("research/")
        || storage_key.contains('\\')
        || components.len() != 3
        || components[0].as_os_str().to_string_lossy() != "research"
    {
        return Err("Invalid research file path.".to_string());
    }
    for component in components {
        match component {
            Component::Normal(_) => {}
            _ => return Err("Invalid research file path.".to_string()),
        }
    }
    Ok(research_root(root)?.join(project_folder).join(relative))
}

#[tauri::command]
fn research_prepare_project_folder(root: String, project_folder: String) -> Result<String, String> {
    validate_research_component(&project_folder, "project folder")?;
    let folder = research_root(&root)?.join(&project_folder);
    std::fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    Ok(folder.to_string_lossy().to_string())
}

#[tauri::command]
fn research_import_file(
    root: String,
    project_folder: String,
    storage_key: String,
    source_path: String,
) -> Result<u64, String> {
    let source = PathBuf::from(&source_path);
    if !source.is_file() {
        return Err("The selected file could not be read.".to_string());
    }
    let metadata = std::fs::metadata(&source).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_RESEARCH_FILE_BYTES {
        return Err("Research files must be 200 MB or smaller.".to_string());
    }
    let destination = research_destination(&root, &project_folder, &storage_key)?;
    if destination.exists() {
        return Err("That research file already exists.".to_string());
    }
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::copy(&source, &destination).map_err(|error| error.to_string())?;
    Ok(metadata.len())
}

#[tauri::command]
fn research_file_path(
    root: String,
    project_folder: String,
    storage_key: String,
) -> Result<String, String> {
    let destination = research_destination(&root, &project_folder, &storage_key)?;
    if !destination.is_file() {
        return Err("That research file is no longer in the project folder.".to_string());
    }
    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
fn research_open_file(
    root: String,
    project_folder: String,
    storage_key: String,
) -> Result<(), String> {
    let destination = research_destination(&root, &project_folder, &storage_key)?;
    if !destination.is_file() {
        return Err("That research file is no longer in the project folder.".to_string());
    }
    tauri_plugin_opener::open_path(&destination, None::<&str>).map_err(|error| error.to_string())
}

#[tauri::command]
fn research_delete_file(
    root: String,
    project_folder: String,
    storage_key: String,
) -> Result<(), String> {
    let destination = research_destination(&root, &project_folder, &storage_key)?;
    if destination.exists() {
        std::fs::remove_file(&destination).map_err(|error| error.to_string())?;
    }
    if let Some(parent) = destination.parent() {
        let is_empty = std::fs::read_dir(parent)
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(false);
        if is_empty && parent.file_name().and_then(|name| name.to_str()) != Some("research") {
            let _ = std::fs::remove_dir(parent);
        }
    }
    Ok(())
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
                let typewriter_mode = CheckMenuItem::with_id(
                    app,
                    "typewriter-mode",
                    "Typewriter Mode",
                    true,
                    false,
                    None::<&str>,
                )?;
                let fade_other_paragraphs = CheckMenuItem::with_id(
                    app,
                    "fade-other-paragraphs",
                    "Fade Other Paragraphs",
                    true,
                    false,
                    None::<&str>,
                )?;
                let zen_mode =
                    CheckMenuItem::with_id(app, "zen-mode", "Zen Mode", true, false, None::<&str>)?;
                let view_menu = Submenu::with_id_and_items(
                    app,
                    "view-menu",
                    "View",
                    true,
                    &[&typewriter_mode, &fade_other_paragraphs, &zen_mode],
                )?;

                let menu = Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &view_menu])?;
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
            "typewriter-mode" => Some("prosecraft:toggle-typewriter"),
            "fade-other-paragraphs" => Some("prosecraft:toggle-fade-paragraphs"),
            "zen-mode" => Some("prosecraft:toggle-zen-mode"),
            _ => None,
        };
        if let Some(event_name) = event_name {
            if let Err(error) = app.emit(event_name, ()) {
                eprintln!("Could not handle application menu event: {error}");
            }
        } else if let Some(project_id) = event.id().as_ref().strip_prefix("switch-project-")
            && let Err(error) = app.emit("prosecraft:switch-project", project_id.to_string())
        {
            eprintln!("Could not handle project switching menu event: {error}");
        }
    });

    builder
        .invoke_handler(tauri::generate_handler![
            greet,
            update_project_menu,
            set_typewriter_menu_checked,
            set_fade_paragraphs_menu_checked,
            set_zen_mode_menu_checked,
            list_system_font_families,
            sync_list_dir,
            sync_read_text,
            sync_write_text,
            sync_create_dir,
            sync_remove,
            sync_exists,
            research_prepare_project_folder,
            research_import_file,
            research_file_path,
            research_open_file,
            research_delete_file
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
        assert!(
            sync_list_dir(format!("{root}/projects"))
                .unwrap()
                .is_empty()
        );
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

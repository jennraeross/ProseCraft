use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
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

        while submenu.items().map_err(|error| error.to_string())?.len() > 8 {
            submenu.remove_at(8).map_err(|error| error.to_string())?;
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

#[cfg(desktop)]
fn find_menu_item(menu: &Menu<tauri::Wry>, id: &str) -> Option<MenuItemKind<tauri::Wry>> {
    if let Some(item) = menu.get(id) {
        return Some(item);
    }
    if let Ok(items) = menu.items() {
        for item in items {
            if let MenuItemKind::Submenu(submenu) = item {
                if let Some(found) = submenu.get(id) {
                    return Some(found);
                }
                if let Ok(children) = submenu.items() {
                    for child in children {
                        if let MenuItemKind::Submenu(nested) = child
                            && let Some(found) = nested.get(id)
                        {
                            return Some(found);
                        }
                    }
                }
            }
        }
    }
    None
}

/// Update the native menu labels after an interface language change.
#[tauri::command]
fn set_menu_labels(
    app: AppHandle,
    labels: Vec<(String, String)>,
    edit_labels: Vec<String>,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let menu = app
            .menu()
            .ok_or_else(|| "Application menu is unavailable".to_string())?;
        for (id, text) in labels {
            let Some(item) = find_menu_item(&menu, &id) else {
                continue;
            };
            let result = match item {
                MenuItemKind::MenuItem(item) => item.set_text(text),
                MenuItemKind::Check(item) => item.set_text(text),
                MenuItemKind::Icon(item) => item.set_text(text),
                MenuItemKind::Predefined(item) => item.set_text(text),
                MenuItemKind::Submenu(item) => item.set_text(text),
            };
            result.map_err(|error| error.to_string())?;
        }

        // Predefined items have generated ids, so update them in menu order and
        // skip separators (which have no text).
        if !edit_labels.is_empty()
            && let Some(MenuItemKind::Submenu(edit_menu)) = menu.get("edit-menu")
        {
            let mut remaining = edit_labels.into_iter();
            for item in edit_menu.items().unwrap_or_default() {
                if let MenuItemKind::Predefined(predefined) = item {
                    let current = predefined.text().unwrap_or_default();
                    if current.trim().is_empty() {
                        continue;
                    }
                    let Some(label) = remaining.next() else {
                        break;
                    };
                    predefined
                        .set_text(label)
                        .map_err(|error| error.to_string())?;
                }
            }
        }

        Ok(())
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, labels, edit_labels);
        Ok(())
    }
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

/// Renames a file, replacing the destination when it already exists. Used to
/// swap the single encrypted sync file into place after a complete write.
#[tauri::command]
fn sync_rename(from: String, to: String) -> Result<(), String> {
    let source = std::path::Path::new(&from);
    let target = std::path::Path::new(&to);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    if !source.exists() {
        return Err(format!("Missing file: {from}"));
    }
    // std::fs::rename replaces the destination atomically on Unix. Windows
    // refuses to replace an existing file, so remove it first there.
    #[cfg(windows)]
    if target.exists() {
        std::fs::remove_file(target).map_err(|error| error.to_string())?;
    }
    std::fs::rename(source, target).map_err(|error| error.to_string())
}

const MAX_RESEARCH_FILE_BYTES: u64 = 200 * 1024 * 1024;
const MAX_IMPORT_FILE_BYTES: u64 = 100 * 1024 * 1024;
const MAX_RESEARCH_MARKDOWN_PREVIEW_BYTES: u64 = 2 * 1024 * 1024;

/// Reads a user-selected import file into memory. The dialog plugin supplies
/// the path, so no directory-wide read scope is required.
#[tauri::command]
fn read_import_file(path: String) -> Result<tauri::ipc::Response, String> {
    let source = PathBuf::from(&path);
    if !source.is_file() {
        return Err("The selected file could not be read.".to_string());
    }
    let metadata = std::fs::metadata(&source).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_IMPORT_FILE_BYTES {
        return Err("Import files must be 100 MB or smaller.".to_string());
    }
    let bytes = std::fs::read(&source).map_err(|error| error.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

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
fn research_read_markdown(
    root: String,
    project_folder: String,
    storage_key: String,
) -> Result<String, String> {
    let destination = research_destination(&root, &project_folder, &storage_key)?;
    if destination
        .extension()
        .and_then(|extension| extension.to_str())
        .is_none_or(|extension| {
            !extension.eq_ignore_ascii_case("md") && !extension.eq_ignore_ascii_case("markdown")
        })
    {
        return Err("Only Markdown research files can be previewed.".to_string());
    }
    if !destination.is_file() {
        return Err("That research file is no longer in the project folder.".to_string());
    }
    let metadata = std::fs::metadata(&destination).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_RESEARCH_MARKDOWN_PREVIEW_BYTES {
        return Err("Markdown files must be 2 MB or smaller to preview.".to_string());
    }
    std::fs::read_to_string(destination)
        .map_err(|error| format!("Could not read that Markdown file as UTF-8: {error}"))
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

const OAUTH_LOOPBACK_TIMEOUT: Duration = Duration::from_secs(300);

const OAUTH_SUCCESS_HTML: &str = r#"<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>ProseCraft connected</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.5;">
<h1>ProseCraft is connected</h1>
<p>You can close this tab and return to the app.</p>
</body>
</html>"#;

const OAUTH_ERROR_HTML: &str = r#"<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>ProseCraft could not connect</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.5;">
<h1>ProseCraft could not connect</h1>
<p>Return to the app and try again.</p>
</body>
</html>"#;

const OAUTH_NOT_FOUND_HTML: &str = r#"<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>ProseCraft</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.5;">
<p>This page is only used while connecting ProseCraft to Google Drive.</p>
</body>
</html>"#;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OAuthCallback {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    cancelled: bool,
}

impl OAuthCallback {
    fn empty() -> Self {
        Self {
            code: None,
            state: None,
            error: None,
            cancelled: false,
        }
    }
}

/// The receiver for the loopback listener currently waiting for Google's
/// redirect, plus a flag the UI can set to stop waiting.
static OAUTH_CALLBACK_RX: Mutex<Option<Receiver<OAuthCallback>>> = Mutex::new(None);
static OAUTH_CANCEL: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                let high = (bytes[index + 1] as char).to_digit(16);
                let low = (bytes[index + 2] as char).to_digit(16);
                if let (Some(high), Some(low)) = (high, low) {
                    decoded.push((high * 16 + low) as u8);
                    index += 3;
                } else {
                    decoded.push(b'%');
                    index += 1;
                }
            }
            b'+' => {
                decoded.push(b' ');
                index += 1;
            }
            byte => {
                decoded.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&decoded).to_string()
}

fn parse_query_params(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter(|pair| !pair.is_empty())
        .map(|pair| {
            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            (percent_decode(key), percent_decode(value))
        })
        .collect()
}

/// Pulls the OAuth result out of the first line of an HTTP request. Requests
/// without a `code` or `error` (for example a favicon request) return `None` so
/// the listener can keep waiting for Google's redirect.
fn parse_callback_request(request: &str) -> Option<OAuthCallback> {
    let target = request.lines().next()?.split_whitespace().nth(1)?;
    let (_, query) = target.split_once('?')?;
    let params = parse_query_params(query);

    if let Some(error) = params.get("error").cloned() {
        let description = params
            .get("error_description")
            .filter(|value| !value.is_empty())
            .cloned();
        return Some(OAuthCallback {
            error: Some(description.unwrap_or(error)),
            ..OAuthCallback::empty()
        });
    }

    let code = params
        .get("code")
        .filter(|value| !value.is_empty())?
        .clone();
    Some(OAuthCallback {
        code: Some(code),
        state: params.get("state").cloned(),
        ..OAuthCallback::empty()
    })
}

fn read_http_request(stream: &mut TcpStream) -> std::io::Result<String> {
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 1024];
    loop {
        let read = stream.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.windows(4).any(|window| window == b"\r\n\r\n") || buffer.len() > 16 * 1024 {
            break;
        }
    }
    Ok(String::from_utf8_lossy(&buffer).to_string())
}

fn write_http_response(stream: &mut TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn cancel_loopback_session() {
    if let Ok(mut cancel) = OAUTH_CANCEL.lock()
        && let Some(flag) = cancel.take()
    {
        flag.store(true, Ordering::Relaxed);
    }
    if let Ok(mut receiver) = OAUTH_CALLBACK_RX.lock() {
        receiver.take();
    }
}

/// Binds a temporary loopback server on `127.0.0.1` and returns its port. The
/// server waits for Google's authorization redirect and hands the result to
/// `oauth_wait_for_callback`.
#[tauri::command]
fn oauth_start_loopback() -> Result<u16, String> {
    cancel_loopback_session();

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;

    let (sender, receiver) = mpsc::channel();
    let cancelled = Arc::new(AtomicBool::new(false));
    let thread_cancelled = Arc::clone(&cancelled);

    std::thread::spawn(move || {
        let deadline = Instant::now() + OAUTH_LOOPBACK_TIMEOUT;
        let mut listener_failed = false;
        while !thread_cancelled.load(Ordering::Relaxed) && Instant::now() < deadline {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let request = match read_http_request(&mut stream) {
                        Ok(request) => request,
                        Err(_) => continue,
                    };
                    match parse_callback_request(&request) {
                        Some(callback) => {
                            let body = if callback.error.is_some() {
                                OAUTH_ERROR_HTML
                            } else {
                                OAUTH_SUCCESS_HTML
                            };
                            write_http_response(&mut stream, "200 OK", body);
                            let _ = sender.send(callback);
                            return;
                        }
                        None => {
                            write_http_response(&mut stream, "404 Not Found", OAUTH_NOT_FOUND_HTML)
                        }
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(_) => {
                    listener_failed = true;
                    break;
                }
            }
        }

        if !thread_cancelled.load(Ordering::Relaxed) {
            let message = if listener_failed {
                "The Google Drive authorization listener stopped unexpectedly."
            } else {
                "Timed out waiting for Google Drive authorization."
            };
            let _ = sender.send(OAuthCallback {
                error: Some(message.to_string()),
                ..OAuthCallback::empty()
            });
        }
    });

    *OAUTH_CALLBACK_RX
        .lock()
        .map_err(|error| error.to_string())? = Some(receiver);
    *OAUTH_CANCEL.lock().map_err(|error| error.to_string())? = Some(cancelled);

    Ok(port)
}

fn wait_for_callback() -> Result<OAuthCallback, String> {
    let receiver = OAUTH_CALLBACK_RX
        .lock()
        .map_err(|error| error.to_string())?
        .take()
        .ok_or_else(|| "No Google Drive authorization is in progress.".to_string())?;
    let cancelled = OAUTH_CANCEL
        .lock()
        .ok()
        .and_then(|cancel| cancel.as_ref().cloned());

    let deadline = Instant::now() + OAUTH_LOOPBACK_TIMEOUT + Duration::from_secs(10);
    loop {
        if cancelled
            .as_ref()
            .is_some_and(|flag| flag.load(Ordering::Relaxed))
        {
            return Ok(OAuthCallback {
                cancelled: true,
                ..OAuthCallback::empty()
            });
        }

        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Ok(OAuthCallback {
                error: Some("Timed out waiting for Google Drive authorization.".to_string()),
                ..OAuthCallback::empty()
            });
        }

        match receiver.recv_timeout(remaining.min(Duration::from_millis(250))) {
            Ok(callback) => return Ok(callback),
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => {
                return Ok(OAuthCallback {
                    error: Some(
                        "The Google Drive authorization listener stopped unexpectedly.".to_string(),
                    ),
                    ..OAuthCallback::empty()
                });
            }
        }
    }
}

/// Blocks until the browser redirects to the loopback server, the user cancels,
/// or the timeout elapses.
#[tauri::command]
async fn oauth_wait_for_callback() -> Result<OAuthCallback, String> {
    tauri::async_runtime::spawn_blocking(wait_for_callback)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
fn oauth_cancel_loopback() {
    cancel_loopback_session();
}

const ZOTERO_HOST: &str = "127.0.0.1:23119";
const ZOTERO_PORT: u16 = 23119;
const ZOTERO_TIMEOUT: Duration = Duration::from_secs(5);
const ZOTERO_MAX_RESPONSE_BYTES: usize = 5 * 1024 * 1024;
const ZOTERO_MAX_PATH_LEN: usize = 4096;

fn validate_zotero_path(path: &str) -> Result<(), String> {
    if !path.starts_with('/') || path.starts_with("//") {
        return Err("Zotero request path must start with a single '/'.".to_string());
    }
    if path.len() > ZOTERO_MAX_PATH_LEN {
        return Err("Zotero request path is too long.".to_string());
    }
    if !path.bytes().all(|b| {
        b.is_ascii_alphanumeric()
            || matches!(
                b,
                b'-' | b'.'
                    | b'_'
                    | b'~'
                    | b'/'
                    | b'?'
                    | b'&'
                    | b'='
                    | b'+'
                    | b'%'
                    | b':'
                    | b'@'
                    | b'!'
                    | b'$'
                    | b'\''
                    | b'('
                    | b')'
                    | b'*'
                    | b','
                    | b';'
            )
    }) {
        return Err("Zotero request path contains disallowed characters.".to_string());
    }
    Ok(())
}

fn find_header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|window| window == b"\r\n\r\n")
}

fn parse_http_headers(header_bytes: &[u8]) -> Result<(u16, Option<usize>, bool), String> {
    let header_str = std::str::from_utf8(header_bytes)
        .map_err(|_| "Zotero returned invalid HTTP headers.".to_string())?;
    let mut lines = header_str.split("\r\n");
    let status_line = lines
        .next()
        .ok_or_else(|| "Zotero returned an empty HTTP response.".to_string())?;
    let mut status_parts = status_line.split_whitespace();
    let version = status_parts.next().unwrap_or_default();
    if !version.starts_with("HTTP/") {
        return Err("Zotero returned a malformed HTTP status line.".to_string());
    }
    let status_code = status_parts
        .next()
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| "Zotero returned an invalid HTTP status code.".to_string())?;

    let mut content_length: Option<usize> = None;
    let mut is_chunked = false;
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            let name_lower = name.trim().to_ascii_lowercase();
            let value_trim = value.trim();
            if name_lower == "content-length"
                && let Ok(len) = value_trim.parse::<usize>()
            {
                content_length = Some(len);
            } else if name_lower == "transfer-encoding"
                && value_trim.to_ascii_lowercase().contains("chunked")
            {
                is_chunked = true;
            }
        }
    }

    Ok((status_code, content_length, is_chunked))
}

enum ChunkedDecode {
    Incomplete,
    Complete(Vec<u8>),
}

fn decode_chunked_body(raw: &[u8]) -> Result<ChunkedDecode, String> {
    let mut out = Vec::new();
    let mut pos = 0;

    loop {
        let Some(rel_crlf) = raw[pos..].windows(2).position(|w| w == b"\r\n") else {
            return Ok(ChunkedDecode::Incomplete);
        };
        let size_line = std::str::from_utf8(&raw[pos..pos + rel_crlf])
            .map_err(|_| "Invalid chunked encoding from Zotero.".to_string())?;
        let size_hex = size_line.split(';').next().unwrap_or_default().trim();
        let chunk_size = usize::from_str_radix(size_hex, 16)
            .map_err(|_| "Invalid chunk size from Zotero.".to_string())?;
        pos += rel_crlf + 2;

        if chunk_size == 0 {
            if raw.len() < pos + 2 {
                return Ok(ChunkedDecode::Incomplete);
            }
            return Ok(ChunkedDecode::Complete(out));
        }

        if out.len().saturating_add(chunk_size) > ZOTERO_MAX_RESPONSE_BYTES {
            return Err("Zotero response exceeded 5 MB limit.".to_string());
        }

        if raw.len() < pos + chunk_size + 2 {
            return Ok(ChunkedDecode::Incomplete);
        }
        out.extend_from_slice(&raw[pos..pos + chunk_size]);
        if &raw[pos + chunk_size..pos + chunk_size + 2] != b"\r\n" {
            return Err("Malformed chunk terminator from Zotero.".to_string());
        }
        pos += chunk_size + 2;
    }
}

fn map_zotero_io_error(error: std::io::Error) -> String {
    match error.kind() {
        std::io::ErrorKind::ConnectionRefused => {
            "Zotero is not running (connection refused on 127.0.0.1:23119).".to_string()
        }
        std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock => {
            "Zotero request timed out after 5s.".to_string()
        }
        _ => format!("Could not reach Zotero: {error}"),
    }
}

fn perform_zotero_request_to(addr: std::net::SocketAddr, path: &str) -> Result<String, String> {
    validate_zotero_path(path)?;

    let deadline = Instant::now() + ZOTERO_TIMEOUT;
    let mut stream = TcpStream::connect_timeout(&addr, ZOTERO_TIMEOUT).map_err(map_zotero_io_error)?;
    stream
        .set_write_timeout(Some(ZOTERO_TIMEOUT))
        .map_err(map_zotero_io_error)?;
    stream
        .set_read_timeout(Some(ZOTERO_TIMEOUT))
        .map_err(map_zotero_io_error)?;

    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {ZOTERO_HOST}\r\nUser-Agent: ProseCraft\r\nAccept: application/json, text/plain, */*\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(map_zotero_io_error)?;

    let mut raw = Vec::new();
    let mut chunk = [0u8; 8192];
    let mut parsed_headers: Option<(usize, u16, Option<usize>, bool)> = None;

    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("Zotero request timed out after 5s.".to_string());
        }
        let _ = stream.set_read_timeout(Some(remaining));

        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(read_len) => {
                if raw.len().saturating_add(read_len) > ZOTERO_MAX_RESPONSE_BYTES {
                    return Err("Zotero response exceeded 5 MB limit.".to_string());
                }
                raw.extend_from_slice(&chunk[..read_len]);

                if parsed_headers.is_none()
                    && let Some(header_end) = find_header_end(&raw)
                {
                    let (status, content_length, is_chunked) =
                        parse_http_headers(&raw[..header_end])?;
                    if let Some(len) = content_length
                        && len > ZOTERO_MAX_RESPONSE_BYTES
                    {
                        return Err("Zotero response exceeded 5 MB limit.".to_string());
                    }
                    parsed_headers = Some((header_end + 4, status, content_length, is_chunked));
                }

                if let Some((body_start, _, content_length, is_chunked)) = parsed_headers {
                    let body_slice = &raw[body_start..];
                    if is_chunked {
                        if matches!(decode_chunked_body(body_slice)?, ChunkedDecode::Complete(_)) {
                            break;
                        }
                    } else if let Some(len) = content_length
                        && body_slice.len() >= len
                    {
                        break;
                    }
                }
            }
            Err(error) => return Err(map_zotero_io_error(error)),
        }
    }

    let (body_start, status, content_length, is_chunked) = match parsed_headers {
        Some(headers) => headers,
        None => {
            let header_end = find_header_end(&raw)
                .ok_or_else(|| "Zotero returned an incomplete HTTP response.".to_string())?;
            let (status, content_length, is_chunked) = parse_http_headers(&raw[..header_end])?;
            (header_end + 4, status, content_length, is_chunked)
        }
    };

    let body_raw = &raw[body_start..];
    let body_bytes = if is_chunked {
        match decode_chunked_body(body_raw)? {
            ChunkedDecode::Complete(decoded) => decoded,
            ChunkedDecode::Incomplete => {
                return Err("Zotero closed the connection before completing chunked body.".to_string());
            }
        }
    } else if let Some(len) = content_length {
        if body_raw.len() < len {
            return Err("Zotero closed the connection before sending the full response.".to_string());
        }
        body_raw[..len].to_vec()
    } else {
        body_raw.to_vec()
    };

    if body_bytes.len() > ZOTERO_MAX_RESPONSE_BYTES {
        return Err("Zotero response exceeded 5 MB limit.".to_string());
    }

    if (200..300).contains(&status) {
        String::from_utf8(body_bytes)
            .map_err(|_| "Zotero response was not valid UTF-8.".to_string())
    } else {
        let message = String::from_utf8_lossy(&body_bytes).trim().to_string();
        if message.is_empty() {
            Err(format!("HTTP {status}"))
        } else {
            Err(format!("HTTP {status}: {message}"))
        }
    }
}

/// Forwards a GET request exclusively to Zotero's local HTTP server on `127.0.0.1:23119`.
#[tauri::command]
async fn zotero_request(path: String) -> Result<String, String> {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], ZOTERO_PORT));
    tauri::async_runtime::spawn_blocking(move || perform_zotero_request_to(addr, &path))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    if (std::env::var_os("APPIMAGE").is_some() || std::env::var_os("APPDIR").is_some())
        && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
    {
        // SAFETY: this runs at app startup before Tauri creates any threads.
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let settings =
                    MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
                // A plain item instead of the predefined one, which stays greyed out on some Linux desktops.
                let quit =
                    MenuItem::with_id(app, "quit", "Quit ProseCraft", true, Some("CmdOrCtrl+Q"))?;
                let shortcuts_item = MenuItem::with_id(
                    app,
                    "keyboard-shortcuts",
                    "Keyboard Shortcuts",
                    true,
                    Some("CmdOrCtrl+/"),
                )?;
                let app_menu =
                    Submenu::with_items(app, "ProseCraft", true, &[&settings, &shortcuts_item, &quit])?;

                let new_scene =
                    MenuItem::with_id(app, "new-scene", "New Scene", true, Some("CmdOrCtrl+N"))?;
                let new_project =
                    MenuItem::with_id(app, "new-project", "New Project…", true, None::<&str>)?;
                let import_epub =
                    MenuItem::with_id(app, "import-epub", "Import EPUB…", true, None::<&str>)?;
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
                file_menu.append(&import_epub)?;
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
        if event.id().as_ref() == "quit" {
            app.exit(0);
            return;
        }
        let event_name = match event.id().as_ref() {
            "settings" => Some("prosecraft:open-settings"),
            "project-settings" => Some("prosecraft:open-project-settings"),
            "new-scene" => Some("prosecraft:new-scene"),
            "export-document" => Some("prosecraft:export-document"),
            "publish-manuscript" => Some("prosecraft:open-publish"),
            "new-project" => Some("prosecraft:new-project"),
            "import-epub" => Some("prosecraft:import-epub"),
            "typewriter-mode" => Some("prosecraft:toggle-typewriter"),
            "fade-other-paragraphs" => Some("prosecraft:toggle-fade-paragraphs"),
            "zen-mode" => Some("prosecraft:toggle-zen-mode"),
            "keyboard-shortcuts" => Some("prosecraft:toggle-shortcuts"),
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
            set_menu_labels,
            read_import_file,
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
            sync_rename,
            research_prepare_project_folder,
            research_import_file,
            research_file_path,
            research_read_markdown,
            research_open_file,
            research_delete_file,
            oauth_start_loopback,
            oauth_wait_for_callback,
            oauth_cancel_loopback,
            zotero_request
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

    #[test]
    fn sync_rename_replaces_the_destination() {
        let dir = temp_dir("rename");
        let source = dir.join("bundle.tmp").to_string_lossy().to_string();
        let target = dir.join("bundle.prosecraft").to_string_lossy().to_string();

        sync_write_text(source.clone(), "new contents".into()).unwrap();
        sync_write_text(target.clone(), "old contents".into()).unwrap();
        sync_rename(source.clone(), target.clone()).unwrap();

        assert!(!sync_exists(source).unwrap());
        assert_eq!(sync_read_text(target).unwrap(), "new contents");
        sync_remove(dir.to_string_lossy().to_string()).unwrap();
    }

    #[test]
    fn read_import_file_validates_the_selected_path() {
        let missing = temp_dir("import-missing").join("book.epub");
        assert!(read_import_file(missing.to_string_lossy().to_string()).is_err());

        let dir = temp_dir("import-ok");
        std::fs::create_dir_all(&dir).unwrap();
        let book = dir.join("book.epub");
        std::fs::write(&book, b"epub bytes").unwrap();
        assert!(read_import_file(book.to_string_lossy().to_string()).is_ok());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn research_markdown_preview_reads_only_small_markdown_files() {
        let root = temp_dir("research-markdown");
        let folder = root.join("project").join("research").join("docs");
        std::fs::create_dir_all(&folder).unwrap();
        let markdown = folder.join("notes.md");
        std::fs::write(&markdown, "# Notes\n").unwrap();

        assert_eq!(
            research_read_markdown(
                root.to_string_lossy().to_string(),
                "project".into(),
                "research/docs/notes.md".into()
            )
            .unwrap(),
            "# Notes\n"
        );
        assert!(
            research_read_markdown(
                root.to_string_lossy().to_string(),
                "project".into(),
                "research/docs/notes.txt".into()
            )
            .is_err()
        );
        // The editor previews `.markdown` files too (`openResearchFile`).
        let long_extension = folder.join("draft.markdown");
        std::fs::write(&long_extension, "# Draft\n").unwrap();
        assert_eq!(
            research_read_markdown(
                root.to_string_lossy().to_string(),
                "project".into(),
                "research/docs/draft.markdown".into()
            )
            .unwrap(),
            "# Draft\n"
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn loopback_callback_parses_percent_encoded_code() {
        let callback = parse_callback_request(
            "GET /?code=4%2Fabc%2D123&state=xyz HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
        )
        .unwrap();
        assert_eq!(callback.code.as_deref(), Some("4/abc-123"));
        assert_eq!(callback.state.as_deref(), Some("xyz"));
        assert!(callback.error.is_none());
        assert!(!callback.cancelled);
    }

    #[test]
    fn loopback_callback_reports_denied_authorization() {
        let callback = parse_callback_request(
            "GET /?error=access_denied&error_description=User+denied+access HTTP/1.1\r\n\r\n",
        )
        .unwrap();
        assert_eq!(callback.error.as_deref(), Some("User denied access"));
        assert!(callback.code.is_none());
    }

    #[test]
    fn loopback_callback_ignores_unrelated_requests() {
        assert!(parse_callback_request("GET /favicon.ico HTTP/1.1\r\n\r\n").is_none());
    }

    #[test]
    fn zotero_path_validation_allows_safe_paths_and_rejects_unsafe() {
        assert!(validate_zotero_path("/connector/ping").is_ok());
        assert!(validate_zotero_path("/api/users/0/items?q=hello%20world&format=csljson&limit=25").is_ok());
        assert!(validate_zotero_path("/better-bibtex/cayw?format=json").is_ok());

        assert!(validate_zotero_path("http://evil.com/").is_err());
        assert!(validate_zotero_path("//evil.com/path").is_err());
        assert!(validate_zotero_path("/bad path").is_err());
        assert!(validate_zotero_path("/bad\r\nHost: evil.com").is_err());
        assert!(validate_zotero_path("/bad#frag").is_err());
    }

    #[test]
    fn zotero_request_handles_chunked_200_and_403_over_loopback() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();

        let handle = std::thread::spawn(move || {
            for idx in 0..2 {
                let (mut stream, _) = listener.accept().unwrap();
                let req = read_http_request(&mut stream).unwrap();
                assert!(req.contains("Host: 127.0.0.1:23119\r\n"));
                assert!(req.contains("User-Agent: ProseCraft\r\n"));
                if idx == 0 {
                    let resp = concat!(
                        "HTTP/1.1 200 OK\r\n",
                        "Transfer-Encoding: chunked\r\n",
                        "Content-Type: application/json\r\n",
                        "\r\n",
                        "2\r\n[]\r\n",
                        "0\r\n\r\n"
                    );
                    stream.write_all(resp.as_bytes()).unwrap();
                } else {
                    let body = "Local API is not enabled";
                    let resp = format!(
                        "HTTP/1.1 403 Forbidden\r\nContent-Length: {}\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    stream.write_all(resp.as_bytes()).unwrap();
                }
            }
        });

        let ok_res = perform_zotero_request_to(addr, "/api/users/0/items?q=&format=csljson&limit=25");
        assert_eq!(ok_res.unwrap(), "[]");

        let err_res = perform_zotero_request_to(addr, "/api/users/0/items?q=test&format=csljson&limit=25");
        assert_eq!(err_res.unwrap_err(), "HTTP 403: Local API is not enabled");

        handle.join().unwrap();
    }
}

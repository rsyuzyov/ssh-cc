use std::fs::{File, OpenOptions};
use std::io::{Write, BufRead, BufReader};
use std::process::Command;
use serde::{Serialize, Deserialize};
use std::path::Path;

// Функция для удаления двойных пустых строк из конфига
fn clean_config_file(config_path: &str) -> Result<(), String> {
    let file = File::open(config_path)
        .map_err(|e| format!("Не удалось открыть файл: {}", e))?;
    
    let reader = BufReader::new(file);
    let mut lines = Vec::new();
    let mut prev_empty = false;
    
    for line in reader.lines() {
        let line = line.map_err(|e| format!("Ошибка чтения строки: {}", e))?;
        let is_empty = line.trim().is_empty();
        
        // Пропускаем, если текущая и предыдущая строки пустые
        if is_empty && prev_empty {
            continue;
        }
        
        lines.push(line);
        prev_empty = is_empty;
    }
    
    // Записываем очищенный конфиг
    let mut file = File::create(config_path)
        .map_err(|e| format!("Не удалось создать файл: {}", e))?;
    
    for line in lines {
        writeln!(file, "{}", line)
            .map_err(|e| format!("Не удалось записать строку: {}", e))?;
    }
    
    Ok(())
}

#[derive(Serialize, Deserialize)]
struct SSHPaths {
    config: String,
    public_key: String,
    private_key: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct SSHServer {
    name: String,
    hostname: String,
    user: String,
    identity_file: Option<String>,
}

#[tauri::command]
fn get_ssh_paths() -> SSHPaths {
    let home_dir = std::env::var("USERPROFILE")
        .unwrap_or_else(|_| "C:\\Users\\Default".to_string());
    
    SSHPaths {
        config: format!("{}/.ssh/config", home_dir),
        public_key: format!("{}/.ssh/id_rsa.pub", home_dir),
        private_key: format!("{}/.ssh/id_rsa", home_dir),
    }
}

#[tauri::command]
fn add_ssh_config(
    server_name: String,
    hostname: String,
    username: String,
    config_path: String,
    public_key_path: String,
) -> Result<String, String> {
    // Создаем директорию если её нет
    if let Some(parent) = std::path::Path::new(&config_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Не удалось создать директорию: {}", e))?;
    }
    
    // Получаем путь к приватному ключу из публичного (убираем .pub)
    let private_key_path = if public_key_path.ends_with(".pub") {
        public_key_path.trim_end_matches(".pub").to_string()
    } else {
        public_key_path.clone()
    };
    
    // Формируем конфигурацию
    let ssh_config = format!(
        "\n\nHost {}\n  HostName {}\n  User {}\n  IdentityFile {}\n",
        server_name, hostname, username, private_key_path
    );
    
    // Открываем файл для добавления или создаем новый
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&config_path)
        .map_err(|e| format!("Не удалось открыть файл: {}", e))?;
    
    // Записываем конфигурацию
    file.write_all(ssh_config.as_bytes())
        .map_err(|e| format!("Не удалось записать конфигурацию: {}", e))?;
    
    // Очищаем двойные пустые строки
    clean_config_file(&config_path)?;
    
    Ok(format!("Конфигурация для {} успешно добавлена!", server_name))
}

#[tauri::command]
fn parse_ssh_config(config_path: String) -> Result<Vec<SSHServer>, String> {
    // Проверяем существование файла
    if !Path::new(&config_path).exists() {
        return Ok(Vec::new());
    }
    
    let file = File::open(&config_path)
        .map_err(|e| format!("Не удалось открыть файл конфигурации: {}", e))?;
    
    let reader = BufReader::new(file);
    let mut servers = Vec::new();
    let mut current_host: Option<String> = None;
    let mut current_hostname: Option<String> = None;
    let mut current_user: Option<String> = None;
    let mut current_identity: Option<String> = None;
    
    for line in reader.lines() {
        let line = line.map_err(|e| format!("Ошибка чтения строки: {}", e))?;
        let trimmed = line.trim();
        
        // Пропускаем комментарии и пустые строки
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        
        // Парсим строки конфигурации
        if trimmed.starts_with("Host ") {
            // Сохраняем предыдущий хост если он был
            if let (Some(name), Some(hostname), Some(user)) = (&current_host, &current_hostname, &current_user) {
                servers.push(SSHServer {
                    name: name.clone(),
                    hostname: hostname.clone(),
                    user: user.clone(),
                    identity_file: current_identity.clone(),
                });
            }
            
            // Начинаем новый хост
            current_host = Some(trimmed[5..].trim().to_string());
            current_hostname = None;
            current_user = None;
            current_identity = None;
        } else if current_host.is_some() {
            // Парсим параметры хоста
            if trimmed.starts_with("HostName ") {
                current_hostname = Some(trimmed[9..].trim().to_string());
            } else if trimmed.starts_with("User ") {
                current_user = Some(trimmed[5..].trim().to_string());
            } else if trimmed.starts_with("IdentityFile ") {
                current_identity = Some(trimmed[13..].trim().to_string());
            }
        }
    }
    
    // Не забываем последний хост
    if let (Some(name), Some(hostname), Some(user)) = (current_host, current_hostname, current_user) {
        servers.push(SSHServer {
            name,
            hostname,
            user,
            identity_file: current_identity,
        });
    }
    
    Ok(servers)
}

#[tauri::command]
fn remove_ssh_config(
    server_name: String,
    config_path: String,
) -> Result<String, String> {
    // Проверяем существование файла
    if !Path::new(&config_path).exists() {
        return Err("Файл конфигурации не найден".to_string());
    }
    
    // Читаем весь файл
    let file = File::open(&config_path)
        .map_err(|e| format!("Не удалось открыть файл: {}", e))?;
    
    let reader = BufReader::new(file);
    let mut new_lines = Vec::new();
    let mut skip_block = false;
    
    for line in reader.lines() {
        let line = line.map_err(|e| format!("Ошибка чтения строки: {}", e))?;
        let trimmed = line.trim();
        
        // Определяем начало нового блока Host
        if trimmed.starts_with("Host ") {
            let host_name = trimmed[5..].trim().to_string();
            skip_block = host_name == server_name;
        }
        
        // Если это не блок удаляемого сервера, сохраняем строку
        if !skip_block {
            new_lines.push(line);
        } else if trimmed.is_empty() {
            // Если строка пустая в блоке удаления, сбрасываем флаг
            skip_block = false;
        }
    }
    
    // Записываем обновлённый конфиг
    let mut file = File::create(&config_path)
        .map_err(|e| format!("Не удалось создать файл: {}", e))?;
    
    for line in new_lines {
        writeln!(file, "{}", line)
            .map_err(|e| format!("Не удалось записать строку: {}", e))?;
    }
    
    // Очищаем двойные пустые строки
    clean_config_file(&config_path)?;
    
    Ok(format!("Сервер {} удалён из конфигурации", server_name))
}

#[tauri::command]
fn save_ssh_paths(
    app: tauri::AppHandle,
    config: String,
    public_key: String,
    private_key: String,
) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;
    
    let store = app.store("settings.json")
        .map_err(|e| format!("Ошибка доступа к хранилищу: {}", e))?;
    
    store.set("config_path", serde_json::json!(config));
    store.set("public_key_path", serde_json::json!(public_key));
    store.set("private_key_path", serde_json::json!(private_key));
    
    store.save()
        .map_err(|e| format!("Ошибка сохранения: {}", e))?;
    
    Ok("Настройки сохранены".to_string())
}

#[tauri::command]
fn load_ssh_paths(app: tauri::AppHandle) -> Result<SSHPaths, String> {
    use tauri_plugin_store::StoreExt;
    
    let store = app.store("settings.json")
        .map_err(|e| format!("Ошибка доступа к хранилищу: {}", e))?;
    
    let home_dir = std::env::var("USERPROFILE")
        .unwrap_or_else(|_| "C:\\Users\\Default".to_string());
    
    let config = store.get("config_path")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| format!("{}/.ssh/config", home_dir));
    
    let public_key = store.get("public_key_path")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| format!("{}/.ssh/id_rsa.pub", home_dir));
    
    let private_key = store.get("private_key_path")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| format!("{}/.ssh/id_rsa", home_dir));
    
    Ok(SSHPaths {
        config,
        public_key,
        private_key,
    })
}

#[tauri::command]
fn open_powershell_with_command(command: String) -> Result<String, String> {
    // Открываем новое окно PowerShell с командой на переднем плане
    let ps_command = format!(
        "Start-Process powershell -ArgumentList '-NoExit', '-Command', '{}' -WindowStyle Normal",
        command.replace("'", "''")
    );
    
    Command::new("powershell.exe")
        .args(&[
            "-WindowStyle", "Hidden",
            "-Command",
            &ps_command
        ])
        .spawn()
        .map_err(|e| format!("Не удалось открыть PowerShell: {}", e))?;
    
    Ok("PowerShell открыт".to_string())
}

#[tauri::command]
fn verify_ssh_connection(
    server_name: String,
    config_path: String,
) -> Result<bool, String> {
    // Выполняем команду SSH для проверки подключения
    let output = Command::new("ssh")
        .args(&[
            "-F", &config_path,
            &server_name,
            "echo 'Connection successful'"
        ])
        .output()
        .map_err(|e| format!("Ошибка выполнения SSH: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    Ok(stdout.contains("Connection successful"))
}

#[tauri::command]
fn execute_ssh_command(
    server_name: String,
    command: String,
    config_path: String,
) -> Result<String, String> {
    // Выполняем команду на удаленном сервере
    let output = Command::new("ssh")
        .args(&[
            "-F", &config_path,
            &server_name,
            &command
        ])
        .output()
        .map_err(|e| format!("Ошибка выполнения SSH: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    
    if !stderr.is_empty() {
        return Err(stderr);
    }
    
    Ok(stdout)
}

#[tauri::command]
fn execute_terminal_command(command: String) -> Result<String, String> {
    // Определяем команду в зависимости от ОС
    let (shell, shell_arg) = if cfg!(target_os = "windows") {
        ("powershell.exe", "-Command")
    } else {
        ("bash", "-c")
    };
    
    // Выполняем команду
    let output = Command::new(shell)
        .arg(shell_arg)
        .arg(&command)
        .output()
        .map_err(|e| format!("Ошибка выполнения команды: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    
    if !stderr.is_empty() && !output.status.success() {
        return Err(stderr);
    }
    
    Ok(if !stdout.is_empty() { stdout } else { stderr })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_ssh_paths,
            add_ssh_config,
            remove_ssh_config,
            open_powershell_with_command,
            verify_ssh_connection,
            execute_ssh_command,
            execute_terminal_command,
            parse_ssh_config,
            save_ssh_paths,
            load_ssh_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

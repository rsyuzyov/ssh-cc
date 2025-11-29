use std::fs::{File, OpenOptions};
use std::io::{Write, BufRead, BufReader};
use std::process::Command;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct SSHPaths {
    config: String,
    public_key: String,
    private_key: String,
}

#[tauri::command]
fn get_ssh_paths() -> SSHPaths {
    let home_dir = std::env::var("USERPROFILE")
        .unwrap_or_else(|_| "C:\\Users\\Default".to_string());
    
    SSHPaths {
        config: format!("{}/.ssh/claude_config", home_dir),
        public_key: format!("{}/.ssh/claude.pub", home_dir),
        private_key: format!("{}/.ssh/claude", home_dir),
    }
}

#[tauri::command]
fn add_ssh_config(
    server_name: String,
    hostname: String,
    username: String,
    config_path: String,
    private_key_path: String,
) -> Result<String, String> {
    // Проверяем существует ли файл
    let file_exists = std::path::Path::new(&config_path).exists();
    
    // Создаем директорию если её нет
    if let Some(parent) = std::path::Path::new(&config_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Не удалось создать директорию: {}", e))?;
    }
    
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
    
    Ok(format!("Конфигурация для {} успешно добавлена!", server_name))
}

#[tauri::command]
fn open_powershell_with_command(command: String) -> Result<String, String> {
    // Открываем новое окно PowerShell с командой
    Command::new("powershell.exe")
        .args(&[
            "-NoExit",
            "-Command",
            &command
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_ssh_paths,
            add_ssh_config,
            open_powershell_with_command,
            verify_ssh_connection,
            execute_ssh_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

# Скрипт для добавления встроенного терминала в App.tsx

$file = "C:\temp\ssh-cc\src\App.tsx"
$content = Get-Content $file -Raw

# 1. Заменяем импорты
$content = $content -replace 'import \{ Terminal,', 'import { Terminal as TerminalIcon,'
$content = $content -replace "import \{ open \} from '@tauri-apps/plugin-shell';", "import TerminalComponent from './Terminal';"

# 2. Добавляем состояние терминала после строки showSettings
$content = $content -replace '(const \[showSettings, setShowSettings\] = useState\(false\);)', "`$1`n  `n  // Terminal state`n  const [showTerminal, setShowTerminal] = useState(false);`n  const [terminalCommand, setTerminalCommand] = useState('');"

# 3. Заменяем функцию addServer - открываем встроенный терминал вместо внешнего PowerShell
$oldAddServer = @'
      // Открываем PowerShell с командой копирования ключа
      const keyCommand = `type "${publicKeyPath}" | ssh ${server.user}@${server.host} "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"`;
      await invoke('open_powershell_with_command', { command: keyCommand });
'@

$newAddServer = @'
      // Открываем встроенный терминал с командой копирования ключа
      const keyCommand = `type "${publicKeyPath}" | ssh ${server.user}@${server.host} "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"`;
      setTerminalCommand(keyCommand);
      setShowTerminal(true);
'@

$content = $content -replace [regex]::Escape($oldAddServer), $newAddServer

# 4. Заменяем все Terminal на TerminalIcon в JSX
$content = $content -replace '<Terminal ', '<TerminalIcon '
$content = $content -replace '</Terminal>', '</TerminalIcon>'

# 5. Добавляем модальное окно терминала после return и перед div max-w-7xl
$terminalModal = @'
      {/* Terminal Modal */}
      {showTerminal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="bg-slate-900 rounded-2xl border border-purple-500/30 shadow-2xl w-full max-w-4xl h-[600px] flex flex-col">
            <div className="p-4 border-b border-purple-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TerminalIcon className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-bold text-white">SSH Terminal</h3>
              </div>
              <button
                onClick={() => setShowTerminal(false)}
                className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
              >
                <XCircle className="w-5 h-5 text-red-400" />
              </button>
            </div>
            <div className="flex-1 p-4">
              <TerminalComponent 
                command={terminalCommand} 
                onClose={() => setShowTerminal(false)} 
              />
            </div>
            <div className="p-4 border-t border-purple-500/30 bg-slate-800/50">
              <p className="text-purple-200 text-sm">
                💡 Введите пароль для подключения к серверу. После успешного выполнения команды нажмите "Проверить подключение" на сервере.
              </p>
            </div>
          </div>
        </div>
      )}

'@

$content = $content -replace '(<div className="max-w-7xl mx-auto">)', "$terminalModal`$1"

# Сохраняем
Set-Content -Path $file -Value $content -NoNewline

Write-Host "✅ App.tsx успешно обновлен с встроенным терминалом!"

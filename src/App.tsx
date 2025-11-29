import React, { useState } from 'react';
import { Terminal as TerminalIcon, Server, Play, Plus, CheckCircle, XCircle, Activity, Zap, Key, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import TerminalComponent from './Terminal';

export default function SSHDashboard() {
  const [servers, setServers] = useState([]);
  
  const [newServer, setNewServer] = useState({ host: '', user: 'root', name: '', publicKey: '' });
  const [commandInput, setCommandInput] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [selectedServers, setSelectedServers] = useState(new Set());
  const [executing, setExecuting] = useState(false);
  const [savedSequences, setSavedSequences] = useState([]);
  const [sequenceName, setSequenceName] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Terminal state
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalCommand, setTerminalCommand] = useState('');
  
  const [configPath, setConfigPath] = useState('');
  const [privateKeyPath, setPrivateKeyPath] = useState('');
  const [defaultPublicKey, setDefaultPublicKey] = useState('');

  // Функция для загрузки серверов из конфига
  const loadServersFromConfig = async (path: string) => {
    if (!path) return;
    
    try {
      const parsedServers = await invoke('parse_ssh_config', { configPath: path });
      const serversWithIds = (parsedServers as any[]).map((server, index) => ({
        id: Date.now() + index,
        name: server.name,
        host: server.hostname,
        user: server.user,
        identityFile: server.identity_file || null,
        status: 'configured',
        lastUsed: null
      }));
      setServers(serversWithIds);
      
      if (serversWithIds.length === 0) {
        console.log('Конфиг файл пуст или не найден. Вы можете добавить серверы вручную.');
      }
    } catch (error) {
      console.error('Ошибка загрузки серверов:', error);
    }
  };

  // Загружаем пути при монтировании
  React.useEffect(() => {
    const initializeApp = async () => {
      try {
        // Загружаем сохранённые пути из хранилища
        const paths: any = await invoke('load_ssh_paths');
        
        setConfigPath(paths.config);
        setPrivateKeyPath(paths.private_key);
        
        let publicKeyToUse = paths.public_key;
        
        // Если публичный ключ не сохранён, ищем первый .pub файл в ~/.ssh/
        if (!publicKeyToUse) {
          try {
            const homeDir = await invoke('execute_terminal_command', { 
              command: 'echo $env:USERPROFILE' 
            });
            const sshDir = `${homeDir.toString().trim()}/.ssh`;
            
            // Ищем все .pub файлы
            const pubFiles: string = await invoke('execute_terminal_command', {
              command: `Get-ChildItem "${sshDir}" -Filter *.pub | Select-Object -First 1 -ExpandProperty FullName`
            });
            
            if (pubFiles && pubFiles.trim()) {
              publicKeyToUse = pubFiles.trim().replace(/\\/g, '/');
            } else {
              // Если не найдено, используем дефолтный путь
              publicKeyToUse = `${homeDir.toString().trim()}/.ssh/id_rsa.pub`;
            }
          } catch (err) {
            console.error('Ошибка поиска .pub файлов:', err);
            // Используем дефолтный путь
            const homeDir = 'C:\\Users\\' + (process.env.USERNAME || 'Default');
            publicKeyToUse = `${homeDir}/.ssh/id_rsa.pub`;
          }
        }
        
        setDefaultPublicKey(publicKeyToUse);
        setNewServer(prev => ({ ...prev, publicKey: publicKeyToUse }));
        
        // Загружаем серверы из конфига
        await loadServersFromConfig(paths.config);
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Ошибка инициализации:', error);
        // Если не удалось загрузить, используем дефолтные значения
        const homeDir = 'C:\\Users\\' + (process.env.USERNAME || 'Default');
        const defaultKey = `${homeDir}/.ssh/id_rsa.pub`;
        setDefaultPublicKey(defaultKey);
        setNewServer(prev => ({ ...prev, publicKey: defaultKey }));
        setIsInitialized(true);
      }
    };
    
    initializeApp();
  }, []);

  // Перезагружаем серверы при изменении пути к конфигу
  React.useEffect(() => {
    if (isInitialized && configPath) {
      loadServersFromConfig(configPath);
      // Автоматически сохраняем настройки
      invoke('save_ssh_paths', {
        config: configPath,
        publicKey: defaultPublicKey,
        privateKey: privateKeyPath
      }).catch(err => console.error('Ошибка сохранения:', err));
    }
  }, [configPath, isInitialized]);

  // Сохраняем публичный ключ при изменении
  React.useEffect(() => {
    if (isInitialized && defaultPublicKey) {
      invoke('save_ssh_paths', {
        config: configPath,
        publicKey: defaultPublicKey,
        privateKey: privateKeyPath
      }).catch(err => console.error('Ошибка сохранения:', err));
    }
  }, [defaultPublicKey, isInitialized]);

  // Сохраняем приватный ключ при изменении
  React.useEffect(() => {
    if (isInitialized) {
      invoke('save_ssh_paths', {
        config: configPath,
        publicKey: defaultPublicKey,
        privateKey: privateKeyPath
      }).catch(err => console.error('Ошибка сохранения:', err));
    }
  }, [privateKeyPath, isInitialized]);

  const addServer = async () => {
    if (!newServer.host) {
      alert('⚠️ Пожалуйста, укажите хост сервера');
      return;
    }
    
    // Если имя не указано, используем хост
    const serverName = newServer.name || newServer.host;
    
    const server = {
      id: Date.now(),
      name: serverName,
      host: newServer.host,
      user: newServer.user || 'root',
      publicKey: newServer.publicKey,
      status: 'configuring',
      lastUsed: null
    };
    
    setServers([...servers, server]);
    
    // Сохраняем публичный ключ как дефолтный
    setDefaultPublicKey(newServer.publicKey);
    
    // Очищаем форму, но оставляем публичный ключ
    setNewServer({ host: '', user: 'root', name: '', publicKey: newServer.publicKey });
    
    try {
      // Вызываем Tauri backend для добавления конфига
      await invoke('add_ssh_config', {
        serverName: server.name,
        hostname: server.host,
        username: server.user,
        configPath: configPath,
        privateKeyPath: privateKeyPath
      });
      
      // Открываем встроенный терминал с командой копирования ключа
      const keyCommand = `type "${server.publicKey}" | ssh ${server.user}@${server.host} "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"`;
      setTerminalCommand(keyCommand);
      setShowTerminal(true);
      
      setServers(prev => prev.map(s => 
        s.id === server.id ? {...s, status: 'pending_verification'} : s
      ));
      
    } catch (error) {
      console.error('Ошибка:', error);
      alert(`❌ Ошибка: ${error}`);
      setServers(prev => prev.filter(s => s.id !== server.id));
    }
  };

  const verifyConnection = async (server) => {
    setServers(prev => prev.map(s => 
      s.id === server.id ? {...s, status: 'verifying'} : s
    ));
    
    try {
      const result = await invoke('verify_ssh_connection', {
        serverName: server.name,
        configPath: configPath
      });
      
      if (result) {
        setServers(prev => prev.map(s => 
          s.id === server.id ? {...s, status: 'configured', lastUsed: new Date().toLocaleString()} : s
        ));
        alert(`✅ Сервер ${server.name} успешно настроен!`);
      } else {
        setServers(prev => prev.map(s => 
          s.id === server.id ? {...s, status: 'error'} : s
        ));
        alert(`❌ Не удалось подключиться к серверу ${server.name}`);
      }
    } catch (error) {
      setServers(prev => prev.map(s => 
        s.id === server.id ? {...s, status: 'error'} : s
      ));
      alert(`❌ Ошибка проверки: ${error}`);
    }
  };

  const deleteServer = async (serverId) => {
    const server = servers.find(s => s.id === serverId);
    if (!server) return;
    
    if (confirm(`Удалить сервер ${server.name} из списка и из конфигурации?`)) {
      try {
        // Удаляем из конфига
        await invoke('remove_ssh_config', {
          serverName: server.name,
          configPath: configPath
        });
        
        // Удаляем из списка
        setServers(prev => prev.filter(s => s.id !== serverId));
        
        // Убираем из выбранных
        const newSelection = new Set(selectedServers);
        newSelection.delete(serverId);
        setSelectedServers(newSelection);
      } catch (error) {
        console.error('Ошибка удаления сервера:', error);
        alert(`❌ Ошибка удаления из конфига: ${error}`);
      }
    }
  };

  const deleteSelectedServers = async () => {
    if (selectedServers.size === 0) {
      alert('⚠️ Выберите серверы для удаления');
      return;
    }
    
    const serverNames = servers
      .filter(s => selectedServers.has(s.id))
      .map(s => s.name)
      .join(', ');
    
    if (confirm(`Удалить выбранные серверы (${serverNames}) из списка и из конфигурации?`)) {
      for (const serverId of selectedServers) {
        const server = servers.find(s => s.id === serverId);
        if (server) {
          try {
            await invoke('remove_ssh_config', {
              serverName: server.name,
              configPath: configPath
            });
          } catch (error) {
            console.error(`Ошибка удаления сервера ${server.name}:`, error);
          }
        }
      }
      
      // Удаляем из списка
      setServers(prev => prev.filter(s => !selectedServers.has(s.id)));
      setSelectedServers(new Set());
    }
  };

  const toggleServerSelection = (serverId) => {
    const newSelection = new Set(selectedServers);
    if (newSelection.has(serverId)) {
      newSelection.delete(serverId);
    } else {
      newSelection.add(serverId);
    }
    setSelectedServers(newSelection);
  };

  const executeCommand = async () => {
    if (!commandInput.trim() || selectedServers.size === 0) return;
    
    setExecuting(true);
    const selectedServerList = servers.filter(s => selectedServers.has(s.id));
    
    const result = {
      id: Date.now(),
      command: commandInput,
      servers: selectedServerList.map(s => s.name),
      timestamp: new Date().toLocaleTimeString(),
      status: 'executing'
    };
    
    setCommandHistory([result, ...commandHistory]);
    const cmd = commandInput;
    setCommandInput('');
    
    try {
      // Выполняем команду на всех выбранных серверах
      for (const server of selectedServerList) {
        await invoke('execute_ssh_command', {
          serverName: server.name,
          command: cmd,
          configPath: configPath
        });
      }
      
      setCommandHistory(prev => 
        prev.map(h => h.id === result.id ? {...h, status: 'completed'} : h)
      );
    } catch (error) {
      alert(`❌ Ошибка выполнения: ${error}`);
    } finally {
      setExecuting(false);
    }
  };

  const saveSequence = () => {
    if (!sequenceName.trim() || commandHistory.length === 0) return;
    
    const sequence = {
      id: Date.now(),
      name: sequenceName,
      commands: commandHistory.slice(0, 5).map(h => h.command),
      created: new Date().toLocaleDateString()
    };
    
    setSavedSequences([...savedSequences, sequence]);
    setSequenceName('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
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
<div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <TerminalIcon className="w-12 h-12 text-purple-400" />
            <h1 className="text-5xl font-bold text-white">SSH Command Center</h1>
          </div>
          <p className="text-purple-200 text-lg">Управляйте своими серверами с элегантностью</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-purple-500/30 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Server className="w-6 h-6 text-purple-400" />
              Серверы
            </h2>
            
            {/* Настройка файла конфигурации */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Файл конфигурации SSH (например: ~/.ssh/config)"
                value={configPath}
                onChange={(e) => setConfigPath(e.target.value)}
                className="w-full px-4 py-2 bg-black/40 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400 font-mono text-sm"
              />
            </div>
            
            {/* Форма добавления сервера */}
            <div className="bg-black/30 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <input
                  type="text"
                  placeholder="Хост (IP или домен)"
                  value={newServer.host}
                  onChange={(e) => setNewServer({ ...newServer, host: e.target.value })}
                  onBlur={(e) => {
                    if (!newServer.name && e.target.value) {
                      setNewServer(prev => ({ ...prev, name: e.target.value }));
                    }
                  }}
                  className="px-4 py-2 bg-white/10 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400"
                />
                <input
                  type="text"
                  placeholder="User (root)"
                  value={newServer.user}
                  onChange={(e) => setNewServer({...newServer, user: e.target.value})}
                  className="px-4 py-2 bg-white/10 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400"
                />
                <input
                  type="text"
                  placeholder="Имя (опционально)"
                  value={newServer.name}
                  onChange={(e) => setNewServer({...newServer, name: e.target.value})}
                  className="px-4 py-2 bg-white/10 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400"
                />
              </div>
              <input
                type="text"
                placeholder="Публичный ключ (например: ~/.ssh/id_rsa.pub)"
                value={newServer.publicKey}
                onChange={(e) => setNewServer({...newServer, publicKey: e.target.value})}
                className="w-full px-4 py-2 bg-white/10 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400 font-mono text-sm mb-3"
              />
            </div>

            {/* Командная панель */}
            <div className="flex gap-3 mb-4">
              <button
                onClick={addServer}
                disabled={!newServer.host || !newServer.user || !newServer.publicKey}
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-all"
              >
                <Plus className="w-4 h-4" />
                Добавить сервер
              </button>
              <button
                onClick={deleteSelectedServers}
                disabled={selectedServers.size === 0}
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Удалить выбранные ({selectedServers.size})
              </button>
            </div>

            {/* Таблица серверов */}
            <div className="bg-black/30 rounded-xl overflow-hidden">{servers.length === 0 ? (
                <div className="p-8 text-center text-purple-300/50">
                  Нет серверов. Добавьте первый сервер!
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-black/50">
                    <tr className="text-purple-300 text-sm">
                      <th className="w-12 p-3 text-left"></th>
                      <th className="p-3 text-left">Имя</th>
                      <th className="p-3 text-left">Хост</th>
                      <th className="p-3 text-left">Ключ</th>
                      <th className="w-20 p-3 text-left">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.map(server => (
                      <tr
                        key={server.id}
                        className={`border-t border-purple-500/20 transition-all ${
                          server.status === 'configured'
                            ? selectedServers.has(server.id)
                              ? 'bg-purple-900/30'
                              : 'hover:bg-white/5 cursor-pointer'
                            : 'bg-yellow-500/10'
                        }`}
                        onClick={() => server.status === 'configured' && toggleServerSelection(server.id)}
                      >
                        <td className="p-3">
                          {server.status === 'configured' && (
                            <input
                              type="checkbox"
                              checked={selectedServers.has(server.id)}
                              onChange={() => {}}
                              className="w-4 h-4 rounded border-purple-400 bg-purple-900/30 accent-purple-500"
                            />
                          )}
                        </td>
                        <td className="p-3 text-white font-medium">{server.name}</td>
                        <td className="p-3 text-purple-200">{server.host}</td>
                        <td className="p-3 text-purple-300 font-mono text-xs">
                          {server.identityFile || server.publicKey || '-'}
                        </td>
                        <td className="p-3">
                          {server.status === 'configured' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full border border-green-500/30">
                              <CheckCircle className="w-3 h-3" />
                              OK
                            </span>
                          ) : server.status === 'pending_verification' ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                verifyConnection(server);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs rounded-full border border-yellow-500/30 hover:bg-yellow-500/30 transition-all"
                            >
                              <Key className="w-3 h-3" />
                              Проверить
                            </button>
                          ) : server.status === 'verifying' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full border border-purple-500/30">
                              <div className="w-3 h-3 animate-spin rounded-full border-2 border-purple-300 border-t-transparent"></div>
                            </span>
                          ) : server.status === 'error' ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                verifyConnection(server);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full border border-red-500/30 hover:bg-red-500/30 transition-all"
                            >
                              <XCircle className="w-3 h-3" />
                              Повтор
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-500/30">
                              <Activity className="w-3 h-3" />
                              ...
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-purple-500/30 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Zap className="w-6 h-6 text-yellow-400" />
              Сохраненные последовательности
            </h2>
            
            <div className="mb-4">
              <input
                type="text"
                placeholder="Имя последовательности"
                value={sequenceName}
                onChange={(e) => setSequenceName(e.target.value)}
                className="w-full px-4 py-2 bg-white/10 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400 mb-2"
              />
              <button
                onClick={saveSequence}
                disabled={!sequenceName.trim() || commandHistory.length === 0}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium text-sm transition-all"
              >
                Сохранить текущие команды
              </button>
            </div>

            <div className="space-y-2">
              {savedSequences.length === 0 ? (
                <p className="text-purple-300/50 text-sm text-center py-8">
                  Пока нет сохраненных последовательностей
                </p>
              ) : (
                savedSequences.map(seq => (
                  <div key={seq.id} className="bg-black/30 rounded-lg p-3 border border-purple-400/20">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-white font-medium text-sm">{seq.name}</h3>
                      <button className="text-purple-400 hover:text-purple-300">
                        <Play className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-purple-300/70 text-xs">{seq.commands.length} команд</p>
                    <p className="text-purple-300/50 text-xs">{seq.created}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-purple-500/30 shadow-2xl mb-8">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            <TerminalIcon className="w-6 h-6 text-green-400" />
            Выполнение команд
          </h2>
          
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              placeholder="Введите команду для выполнения на выбранных серверах..."
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && executeCommand()}
              className="flex-1 px-4 py-3 bg-black/40 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400 font-mono"
            />
            <button
              onClick={executeCommand}
              disabled={!commandInput.trim() || selectedServers.size === 0 || executing}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-all"
            >
              <Play className="w-5 h-5" />
              Выполнить
            </button>
          </div>
          
          <div className="text-purple-300 text-sm mb-4">
            {selectedServers.size === 0 ? (
              <p className="text-yellow-300">⚠️ Выберите хотя бы один сервер</p>
            ) : (
              <p>✓ Выбрано серверов: {selectedServers.size}</p>
            )}
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-purple-500/30 shadow-2xl">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-400" />
            История выполнения
          </h2>
          
          <div className="space-y-3">
            {commandHistory.length === 0 ? (
              <p className="text-purple-300/50 text-center py-8">
                История команд пуста. Выполните команду на серверах!
              </p>
            ) : (
              commandHistory.map(item => (
                <div key={item.id} className="bg-black/30 rounded-lg p-4 border border-purple-400/20">
                  <div className="flex items-start justify-between mb-2">
                    <code className="text-green-300 font-mono text-sm">{item.command}</code>
                    {item.status === 'completed' ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-purple-400 border-t-transparent"></div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-purple-300/70">
                    <span>🕐 {item.timestamp}</span>
                    <span>🖥️ {item.servers.join(', ')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

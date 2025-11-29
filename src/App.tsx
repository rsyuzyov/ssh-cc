import React, { useState } from 'react';
import { Terminal, Server, Play, Plus, CheckCircle, XCircle, Activity, Zap, Settings, Key, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';

export default function SSHDashboard() {
  const [servers, setServers] = useState([
    { id: 1, name: 'srv-hv1', host: 'srv-hv1.ag.local', user: 'root', status: 'configured', lastUsed: null }
  ]);
  
  const [newServer, setNewServer] = useState({ name: '', host: '', user: 'root' });
  const [commandInput, setCommandInput] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [selectedServers, setSelectedServers] = useState(new Set());
  const [executing, setExecuting] = useState(false);
  const [savedSequences, setSavedSequences] = useState([]);
  const [sequenceName, setSequenceName] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  
  const [configPath, setConfigPath] = useState('');
  const [publicKeyPath, setPublicKeyPath] = useState('');
  const [privateKeyPath, setPrivateKeyPath] = useState('');

  // Загружаем пути при монтировании
  React.useEffect(() => {
    invoke('get_ssh_paths').then((paths: any) => {
      setConfigPath(paths.config);
      setPublicKeyPath(paths.public_key);
      setPrivateKeyPath(paths.private_key);
    });
  }, []);

  const addServer = async () => {
    if (!newServer.name || !newServer.host) {
      alert('⚠️ Пожалуйста, заполните имя и хост сервера');
      return;
    }
    
    const server = {
      id: Date.now(),
      name: newServer.name,
      host: newServer.host,
      user: newServer.user || 'root',
      status: 'configuring',
      lastUsed: null
    };
    
    setServers([...servers, server]);
    setNewServer({ name: '', host: '', user: 'root' });
    
    try {
      // Вызываем Tauri backend для добавления конфига
      await invoke('add_ssh_config', {
        serverName: server.name,
        hostname: server.host,
        username: server.user,
        configPath: configPath,
        privateKeyPath: privateKeyPath
      });
      
      // Открываем PowerShell с командой копирования ключа
      const keyCommand = `type "${publicKeyPath}" | ssh ${server.user}@${server.host} "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"`;
      await invoke('open_powershell_with_command', { command: keyCommand });
      
      setServers(prev => prev.map(s => 
        s.id === server.id ? {...s, status: 'pending_verification'} : s
      ));
      
      alert(`✅ Конфигурация добавлена!\n\n🔑 PowerShell открыт с командой копирования ключа.\n\n👉 Введите пароль для ${server.user}@${server.host}\n\n✅ После ввода пароля нажмите "Проверить подключение"`);
      
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

  const deleteServer = (serverId) => {
    if (confirm('Удалить этот сервер из списка?')) {
      setServers(prev => prev.filter(s => s.id !== serverId));
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
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Terminal className="w-12 h-12 text-purple-400" />
            <h1 className="text-5xl font-bold text-white">SSH Command Center</h1>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="ml-4 p-3 bg-white/10 hover:bg-white/20 rounded-lg border border-purple-500/30 transition-all"
            >
              <Settings className="w-6 h-6 text-purple-400" />
            </button>
          </div>
          <p className="text-purple-200 text-lg">Управляйте своими серверами с элегантностью</p>
        </div>

        {showSettings && (
          <div className="mb-8 bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-purple-500/30 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Settings className="w-6 h-6 text-purple-400" />
              Настройки
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-purple-200 text-sm font-medium mb-2">
                  Файл конфигурации SSH
                </label>
                <input
                  type="text"
                  value={configPath}
                  onChange={(e) => setConfigPath(e.target.value)}
                  className="w-full px-4 py-2 bg-black/40 border border-purple-400/30 rounded-lg text-white focus:outline-none focus:border-purple-400 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-purple-200 text-sm font-medium mb-2">
                  Публичный ключ
                </label>
                <input
                  type="text"
                  value={publicKeyPath}
                  onChange={(e) => setPublicKeyPath(e.target.value)}
                  className="w-full px-4 py-2 bg-black/40 border border-purple-400/30 rounded-lg text-white focus:outline-none focus:border-purple-400 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-purple-200 text-sm font-medium mb-2">
                  Приватный ключ
                </label>
                <input
                  type="text"
                  value={privateKeyPath}
                  onChange={(e) => setPrivateKeyPath(e.target.value)}
                  className="w-full px-4 py-2 bg-black/40 border border-purple-400/30 rounded-lg text-white focus:outline-none focus:border-purple-400 font-mono text-sm"
                />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-purple-500/30 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Server className="w-6 h-6 text-purple-400" />
              Серверы
            </h2>
            
            <div className="bg-black/30 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <input
                  type="text"
                  placeholder="Имя (srv-test)"
                  value={newServer.name}
                  onChange={(e) => setNewServer({...newServer, name: e.target.value})}
                  className="px-4 py-2 bg-white/10 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400"
                />
                <input
                  type="text"
                  placeholder="Хост (IP или домен)"
                  value={newServer.host}
                  onChange={(e) => setNewServer({...newServer, host: e.target.value})}
                  className="px-4 py-2 bg-white/10 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400"
                />
                <input
                  type="text"
                  placeholder="User (root)"
                  value={newServer.user}
                  onChange={(e) => setNewServer({...newServer, user: e.target.value})}
                  className="px-4 py-2 bg-white/10 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400"
                />
              </div>
              <button
                onClick={addServer}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-all"
              >
                <Plus className="w-4 h-4" />
                Добавить сервер
              </button>
            </div>

            <div className="space-y-3">
              {servers.map(server => (
                <div
                  key={server.id}
                  className={`bg-black/30 rounded-xl p-4 border-2 transition-all ${
                    server.status === 'configured'
                      ? selectedServers.has(server.id)
                        ? 'border-purple-400 bg-purple-900/30 cursor-pointer'
                        : 'border-transparent hover:border-purple-400/50 cursor-pointer'
                      : 'border-yellow-500/30'
                  }`}
                  onClick={() => server.status === 'configured' && toggleServerSelection(server.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-white">{server.name}</h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteServer(server.id);
                          }}
                          className="p-1 hover:bg-red-500/20 rounded transition-all"
                          title="Удалить сервер"
                        >
                          <Trash2 className="w-4 h-4 text-red-400 hover:text-red-300" />
                        </button>
                        {server.status === 'configured' ? (
                          <span className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full border border-green-500/30">
                            <CheckCircle className="w-3 h-3" />
                            Настроен
                          </span>
                        ) : server.status === 'configuring' ? (
                          <span className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-500/30">
                            <Activity className="w-3 h-3" />
                            Настройка...
                          </span>
                        ) : server.status === 'pending_verification' ? (
                          <span className="flex items-center gap-1 px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs rounded-full border border-yellow-500/30">
                            <Key className="w-3 h-3" />
                            Ожидание проверки
                          </span>
                        ) : server.status === 'verifying' ? (
                          <span className="flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full border border-purple-500/30">
                            <div className="w-3 h-3 animate-spin rounded-full border-2 border-purple-300 border-t-transparent"></div>
                            Проверка...
                          </span>
                        ) : server.status === 'error' ? (
                          <span className="flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full border border-red-500/30">
                            <XCircle className="w-3 h-3" />
                            Ошибка
                          </span>
                        ) : null}
                      </div>
                      <div className="text-purple-200 text-sm space-y-1">
                        <p><span className="text-purple-400">User:</span> {server.user}</p>
                        <p><span className="text-purple-400">Host:</span> {server.host}</p>
                        {server.lastUsed && (
                          <p><span className="text-purple-400">Last used:</span> {server.lastUsed}</p>
                        )}
                      </div>
                      {(server.status === 'pending_verification' || server.status === 'error') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            verifyConnection(server);
                          }}
                          className="mt-3 text-sm bg-green-600/50 hover:bg-green-600/70 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all font-medium"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Проверить подключение
                        </button>
                      )}
                    </div>
                    {server.status === 'configured' && (
                      <input
                        type="checkbox"
                        checked={selectedServers.has(server.id)}
                        onChange={() => {}}
                        className="w-5 h-5 rounded border-purple-400 bg-purple-900/30 accent-purple-500"
                      />
                    )}
                  </div>
                </div>
              ))}
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
            <Terminal className="w-6 h-6 text-green-400" />
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

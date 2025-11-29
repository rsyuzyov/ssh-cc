import React, { useState } from 'react';
import { Terminal as TerminalIcon, Plus, CheckCircle, XCircle, Key, Trash2, Edit, FolderOpen, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import TerminalComponent from './Terminal';

interface Server {
  id: number;
  name: string;
  host: string;
  user: string;
  publicKey?: string;
  identityFile?: string | null;
  status: string;
  lastUsed: string | null;
}

export default function SSHDashboard() {
  const [servers, setServers] = useState<Server[]>([]);
  
  const [newServer, setNewServer] = useState({ host: '', user: 'root', name: '', publicKey: '' });
  const [editingServer, setEditingServer] = useState<{id: number, host: string, user: string, name: string, publicKey: string} | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  
  // Terminal state
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalCommand, setTerminalCommand] = useState('');
  
  const [configPath, setConfigPath] = useState('');
  const [privateKeyPath, setPrivateKeyPath] = useState('');
  const [defaultPublicKey, setDefaultPublicKey] = useState('');
  const [showKeyGenerationPrompt, setShowKeyGenerationPrompt] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);

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
        
        // Проверяем наличие SSH ключей
        const keysExist = await invoke('check_ssh_keys_exist');
        if (!keysExist) {
          setShowKeyGenerationPrompt(true);
        }
        
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
    
    // Вычисляем приватный ключ из публичного
    const privateKey = newServer.publicKey.endsWith('.pub') 
      ? newServer.publicKey.slice(0, -4) 
      : newServer.publicKey;
    
    const server = {
      id: Date.now(),
      name: serverName,
      host: newServer.host,
      user: newServer.user || 'root',
      publicKey: newServer.publicKey,
      identityFile: privateKey,
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
        publicKeyPath: server.publicKey
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

  const verifyConnection = async (server: Server) => {
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

  const deleteServer = async (serverId: number) => {
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
      } catch (error) {
        console.error('Ошибка удаления сервера:', error);
        alert(`❌ Ошибка удаления из конфига: ${error}`);
      }
    }
  };

  const openConfigFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: 'Выберите файл конфигурации SSH'
      });
      
      if (selected) {
        setConfigPath(selected as string);
      }
    } catch (error) {
      console.error('Ошибка открытия файла:', error);
    }
  };

  const generateSSHKey = async () => {
    setIsGeneratingKey(true);
    try {
      const homeDir = await invoke('execute_terminal_command', { 
        command: 'echo $env:USERPROFILE' 
      });
      const keyPath = `${homeDir.toString().trim()}/.ssh/id_rsa`;
      
      // Проверяем, существует ли ключ
      try {
        await invoke('generate_ssh_key', { keyPath: keyPath });
        const publicKeyPath = `${keyPath}.pub`;
        setDefaultPublicKey(publicKeyPath);
        setNewServer(prev => ({ ...prev, publicKey: publicKeyPath }));
        setShowKeyGenerationPrompt(false);
        alert('✅ SSH ключ успешно сгенерирован!');
      } catch (error: any) {
        if (error.includes('уже существует')) {
          // Ключ существует, спрашиваем о перезаписи
          if (confirm('Ключ уже существует. Удалить и создать новый?')) {
            await invoke('delete_ssh_key', { keyPath: keyPath });
            await invoke('generate_ssh_key', { keyPath: keyPath });
            const publicKeyPath = `${keyPath}.pub`;
            setDefaultPublicKey(publicKeyPath);
            setNewServer(prev => ({ ...prev, publicKey: publicKeyPath }));
            setShowKeyGenerationPrompt(false);
            alert('✅ SSH ключ успешно сгенерирован!');
          }
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Ошибка генерации ключа:', error);
      alert(`❌ Ошибка генерации ключа: ${error}`);
    } finally {
      setIsGeneratingKey(false);
    }
  };



  const startEditServer = (server: Server) => {
    setEditingServer({
      id: server.id,
      host: server.host,
      user: server.user,
      name: server.name,
      publicKey: server.publicKey || server.identityFile || defaultPublicKey
    });
  };

  const cancelEdit = () => {
    setEditingServer(null);
  };

  const saveEdit = async () => {
    if (!editingServer || !editingServer.host || !editingServer.user || !editingServer.publicKey) {
      alert('⚠️ Заполните все обязательные поля');
      return;
    }

    const oldServer = servers.find(s => s.id === editingServer.id);
    if (!oldServer) return;

    try {
      // Удаляем старую запись из конфига
      await invoke('remove_ssh_config', {
        serverName: oldServer.name,
        configPath: configPath
      });

      // Добавляем новую запись с обновленными данными
      await invoke('add_ssh_config', {
        serverName: editingServer.name || editingServer.host,
        hostname: editingServer.host,
        username: editingServer.user,
        configPath: configPath,
        publicKeyPath: editingServer.publicKey
      });

      // Вычисляем приватный ключ из публичного
      const privateKey = editingServer.publicKey.endsWith('.pub') 
        ? editingServer.publicKey.slice(0, -4) 
        : editingServer.publicKey;

      // Обновляем список серверов
      setServers(prev => prev.map(s => 
        s.id === editingServer!.id 
          ? { 
              ...s, 
              name: editingServer!.name || editingServer!.host,
              host: editingServer!.host,
              user: editingServer!.user,
              publicKey: editingServer!.publicKey,
              identityFile: privateKey
            }
          : s
      ));

      setEditingServer(null);
    } catch (error) {
      console.error('Ошибка редактирования сервера:', error);
      alert(`❌ Ошибка редактирования: ${error}`);
    }
  };



  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      {/* Key Generation Prompt Modal */}
      {showKeyGenerationPrompt && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="bg-slate-900 rounded-2xl border border-purple-500/30 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <Key className="w-8 h-8 text-yellow-400" />
              <h3 className="text-xl font-bold text-white">SSH ключи не найдены</h3>
            </div>
            <p className="text-purple-200 mb-6">
              В директории ~/.ssh не обнаружено SSH ключей. Хотите сгенерировать новый ключ для подключения к серверам?
            </p>
            <div className="flex gap-3">
              <button
                onClick={generateSSHKey}
                disabled={isGeneratingKey}
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
              >
                {isGeneratingKey ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Генерация...
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    Сгенерировать
                  </>
                )}
              </button>
              <button
                onClick={() => setShowKeyGenerationPrompt(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-all"
              >
                Позже
              </button>
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
            {/* Настройка файла конфигурации */}
            <div className="mb-6">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Файл конфигурации SSH (например: ~/.ssh/config)"
                  value={configPath}
                  onChange={(e) => setConfigPath(e.target.value)}
                  className="flex-1 px-4 py-2 bg-black/40 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400 font-mono text-sm"
                />
                <button
                  onClick={openConfigFile}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all flex items-center gap-2"
                  title="Открыть файл"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {/* Форма добавления/редактирования сервера */}
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 mb-6 border border-purple-500/30">
              {editingServer && (
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-yellow-300 text-sm flex items-center gap-2">
                    <Edit className="w-4 h-4" />
                    Редактирование сервера: {editingServer.name}
                  </span>
                  <button
                    onClick={cancelEdit}
                    className="text-purple-300 hover:text-purple-100 text-sm"
                  >
                    Отменить
                  </button>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <input
                  type="text"
                  placeholder="Хост (IP или домен)"
                  value={editingServer ? editingServer.host : newServer.host}
                  onChange={(e) => {
                    if (editingServer) {
                      setEditingServer({ ...editingServer, host: e.target.value });
                    } else {
                      setNewServer({ ...newServer, host: e.target.value });
                    }
                  }}
                  onBlur={(e) => {
                    if (!editingServer && !newServer.name && e.target.value) {
                      setNewServer(prev => ({ ...prev, name: e.target.value }));
                    }
                  }}
                  className="px-4 py-2 bg-white/10 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400"
                />
                <input
                  type="text"
                  placeholder="User (root)"
                  value={editingServer ? editingServer.user : newServer.user}
                  onChange={(e) => {
                    if (editingServer) {
                      setEditingServer({ ...editingServer, user: e.target.value });
                    } else {
                      setNewServer({...newServer, user: e.target.value});
                    }
                  }}
                  className="px-4 py-2 bg-white/10 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400"
                />
                <input
                  type="text"
                  placeholder="Имя (опционально)"
                  value={editingServer ? editingServer.name : newServer.name}
                  onChange={(e) => {
                    if (editingServer) {
                      setEditingServer({ ...editingServer, name: e.target.value });
                    } else {
                      setNewServer({...newServer, name: e.target.value});
                    }
                  }}
                  className="px-4 py-2 bg-white/10 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400"
                />
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Публичный ключ (например: ~/.ssh/id_rsa.pub)"
                  value={editingServer ? editingServer.publicKey : newServer.publicKey}
                  onChange={(e) => {
                    if (editingServer) {
                      setEditingServer({ ...editingServer, publicKey: e.target.value });
                    } else {
                      setNewServer({...newServer, publicKey: e.target.value});
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-white/10 border border-purple-400/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400 font-mono text-sm"
                />
                {editingServer ? (
                  <button
                    onClick={saveEdit}
                    className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-6 py-2 rounded-lg font-medium transition-all"
                  >
                    Сохранить
                  </button>
                ) : (
                  <>
                    <button
                      onClick={generateSSHKey}
                      disabled={isGeneratingKey}
                      className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-all"
                      title="Сгенерировать SSH ключ"
                    >
                      <RefreshCw className={`w-5 h-5 ${isGeneratingKey ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={addServer}
                      disabled={!newServer.host || !newServer.user || !newServer.publicKey}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-all"
                      title="Добавить сервер"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Таблица серверов */}
            <div className="bg-white/10 backdrop-blur-md rounded-xl overflow-hidden border border-purple-500/30">{servers.length === 0 ? (
                <div className="p-8 text-center text-purple-300/50">
                  Нет серверов. Добавьте первый сервер!
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-black/50">
                    <tr className="text-purple-300 text-sm">
                      <th className="p-3 text-left">Имя</th>
                      <th className="p-3 text-left">Хост</th>
                      <th className="p-3 text-left">Ключ</th>
                      <th className="w-20 p-3 text-left">Статус</th>
                      <th className="w-16 p-3 text-center"></th>
                      <th className="w-16 p-3 text-center"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.map(server => (
                      <tr
                        key={server.id}
                        className={`border-t border-purple-500/20 transition-all ${
                          server.status === 'configured'
                            ? 'hover:bg-white/5'
                            : 'bg-yellow-500/10'
                        }`}
                      >
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
                        <td className="p-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditServer(server);
                            }}
                            className="p-2 hover:bg-blue-500/20 rounded-lg transition-all"
                            title="Редактировать сервер"
                          >
                            <Edit className="w-4 h-4 text-blue-400 hover:text-blue-300" />
                          </button>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteServer(server.id);
                            }}
                            className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
                            title="Удалить сервер"
                          >
                            <Trash2 className="w-4 h-4 text-red-400 hover:text-red-300" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
      </div>
    </div>
  );
}

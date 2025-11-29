import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Copy, Check } from 'lucide-react';

interface TerminalProps {
  command?: string;
  onClose?: () => void;
}

export default function Terminal({ command, onClose }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Создаем терминал
    const term = new XTerm({
      cursorBlink: false,
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
        black: '#32344a',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#ad8ee6',
        cyan: '#449dab',
        white: '#787c99',
      },
    });

    // Добавляем аддон для автоматического размера
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Монтируем терминал
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Показываем инструкцию
    term.writeln('\x1b[1;36m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[1;36m║  SSH Key Installation - Manual Step Required                ║\x1b[0m');
    term.writeln('\x1b[1;36m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
    term.writeln('');
    term.writeln('\x1b[1;33m📋 Скопируйте команду ниже и выполните в PowerShell:\x1b[0m');
    term.writeln('');
    
    if (command) {
      // Разбиваем длинную команду на строки
      const maxWidth = 60;
      let remaining = command;
      while (remaining.length > 0) {
        const chunk = remaining.substring(0, maxWidth);
        term.writeln(`\x1b[1;32m${chunk}\x1b[0m`);
        remaining = remaining.substring(maxWidth);
      }
    }
    
    term.writeln('');
    term.writeln('\x1b[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
    term.writeln('');
    term.writeln('\x1b[33m📝 Инструкция:\x1b[0m');
    term.writeln('  1️⃣  Нажмите кнопку "Копировать команду" выше');
    term.writeln('  2️⃣  Откройте PowerShell (Win+X → Windows PowerShell)');
    term.writeln('  3️⃣  Вставьте команду (Ctrl+V) и нажмите Enter');
    term.writeln('  4️⃣  Введите пароль от сервера');
    term.writeln('  5️⃣  После успешного выполнения вернитесь сюда');
    term.writeln('  6️⃣  Закройте это окно и нажмите "Проверить подключение"');
    term.writeln('');
    term.writeln('\x1b[1;32m✨ После этого вы сможете подключаться без пароля!\x1b[0m');

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [command]);

  const copyCommand = () => {
    if (command) {
      navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative h-full w-full bg-[#1a1b26] rounded-lg overflow-hidden flex flex-col">
      <div className="p-3 border-b border-purple-500/30 flex items-center justify-between bg-slate-800/50">
        <span className="text-purple-200 text-sm font-medium">Команда для копирования</span>
        <button
          onClick={copyCommand}
          className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-lg transition-all text-white text-sm font-medium"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Скопировано!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Копировать команду
            </>
          )}
        </button>
      </div>
      <div ref={terminalRef} className="flex-1 p-2" />
    </div>
  );
}

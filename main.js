const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');

let jobs = {};          // Hashcat jobs
let johnProc = null;    // Huidige John-crack proces

const shellBin = process.platform === 'win32'
  ? 'C:\\Program Files\\Git\\bin\\sh.exe'
  : 'sh';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function broadcast(msg) {
  BrowserWindow.getAllWindows().forEach(w =>
    w.webContents.send('run-output', msg)
  );
}

/* ================= HASHCAT RUNNER ================= */

ipcMain.handle('run-script', async (_e, scriptText) => {
  if (!scriptText.includes('hashcat'))
    return { error: 'Script must include hashcat' };

  const id = Date.now().toString();

  const proc = spawn(shellBin, ['-lc', scriptText], {
    cwd: process.platform === 'win32' ? 'C:/Tools/Hashcat' : undefined,
    env: process.env
  });

  jobs[id] = { proc, state: 'running' };

  proc.stdout.on('data', d =>
    broadcast({ id, stream: 'stdout', data: d.toString() })
  );

  proc.stderr.on('data', d =>
    broadcast({ id, stream: 'stderr', data: d.toString() })
  );

  proc.on('close', (code, signal) => {
    jobs[id].state = 'done';
    broadcast({ id, stream: 'meta', data: `PROCESS_EXIT ${code} ${signal}\n` });
  });

  return { id };
});

/* ================= STOP BUTTON ================= */

ipcMain.handle('stop-script', async (_e, id) => {
  const job = jobs[id];

  // 1) Hashcat stoppen (zoals eerder)
  if (job && job.proc) {
    try {
      job.proc.kill('SIGTERM');
      setTimeout(() => {
        if (!job.proc.killed) {
          job.proc.kill('SIGKILL');
        }
      }, 2000);
    } catch (e) {
      // we geven de error mee, maar laten John-stop ook doorgaan
      console.error('Error stopping hashcat job:', e);
    }
  }

  // 2) John-proces ook stoppen als het nog draait
  if (johnProc && !johnProc.killed) {
    try {
      johnProc.kill('SIGTERM');
      setTimeout(() => {
        if (johnProc && !johnProc.killed) {
          johnProc.kill('SIGKILL');
        }
      }, 2000);
    } catch (e) {
      console.error('Error stopping john process:', e);
      return { error: String(e) };
    }
  }

  return { ok: true };
});

/* ================= HASHCAT --SHOW ================= */

ipcMain.handle('hashcat-show', async (_e, mode) => {
  const hashcatBin = process.platform === 'win32'
    ? '/c/Tools/Hashcat/hashcat.exe'
    : 'hashcat';

  const cmd = `${hashcatBin} --show -m ${mode} /tmp/hash.txt`;

  const res = spawnSync(shellBin, ['-lc', cmd], {
    encoding: 'utf8',
    cwd: process.platform === 'win32' ? 'C:/Tools/Hashcat' : undefined
  });

  return { stdout: res.stdout, stderr: res.stderr };
});

/* ================= JOHN FILE PICKER ================= */

ipcMain.handle('pick-and-extract', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile']
  });

  if (canceled || !filePaths[0]) return { canceled: true };

  const file = filePaths[0];

  let tool = null;
  let mode = null;

  if (file.endsWith('.pdf')) {
    tool = 'pdf2john.pl';
    mode = 'pdf';
  } 
  else if (file.endsWith('.docx') || file.endsWith('.xlsx') || file.endsWith('.pptx')) {
    tool = 'office2john.py';
    mode = 'office';
  }
  else if (file.endsWith('.zip')) {
    tool = 'zip2john.exe';
    mode = 'zip';
  }
  else if (file.endsWith('.rar')) {
    tool = 'rar2john.exe';
    mode = 'rar';
  }
  else if (file.endsWith('.gpg')) {
    tool = 'gpg2john.exe';
    mode = 'gpg';
  }
  else {
    return { error: 'Unsupported file' };
  }

  const johnPath = process.platform === 'win32'
    ? 'C:/Tools/John/run'
    : '/usr/bin';

  let cmd = '';

  // Interpreter kiezen
  if (tool.endsWith('.pl')) {
    cmd = `cd "${johnPath}" && perl ${tool} "${file}"`;
  } else if (tool.endsWith('.py')) {
    const py = process.platform === 'win32' ? 'python' : 'python3';
    cmd = `cd "${johnPath}" && ${py} ${tool} "${file}"`;
  } else {
    // .exe tools (zip2john.exe, rar2john.exe, gpg2john.exe, ...)
    if (process.platform === 'win32' && tool.endsWith('.exe')) {
      cmd = `cd "${johnPath}" && ./${tool} "${file}"`;
    } else {
      cmd = `cd "${johnPath}" && ${tool} "${file}"`;
    }
  }

  const res = spawnSync(shellBin, ['-lc', cmd], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });

  const out = (res.stdout || '') + (res.stderr || '');

  let hash = null;

  // 🔍 Hash zoeken
  if (out.trim().length > 0) {
    const lines = out
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    let hashLine = null;

    // 1) Eerst lijnen die met '$' beginnen (PDF/Office/GPG hashes)
    hashLine = lines.find(l => l.startsWith('$'));

    // 2) Als dat niet lukt, fallback naar eerste lijn met ':' die geen typische error is
    if (!hashLine) {
      const colonLines = lines.filter(l => l.includes(':'));
      hashLine = colonLines.find(l =>
        !l.toLowerCase().includes('command not found') &&
        !l.toLowerCase().includes('no such file or directory') &&
        !l.startsWith('sh:') &&
        !l.startsWith('bash:') &&
        !l.startsWith('/usr/bin/bash')
      );
    }

    if (hashLine) {
      hash = hashLine;
    }
  }

  return { stdout: out, hash, mode, cmd };
});


/* ================= JOHN CRACKER ================= */

ipcMain.handle('john-crack', async (_e, hash, mode, wordlistPath) => {
  try {
    const johnPath = process.platform === 'win32'
      ? 'C:/Tools/John/run'
      : '/usr/bin';

    const johnBin = process.platform === 'win32' ? './john.exe' : 'john';

    const hashFile = path.join(johnPath, 'hashcat_gui_john.txt');

    // 🔥 Voor PDF: alleen het deel na de laatste ":" naar file schrijven
    let hashToWrite = hash;
    if (mode === 'pdf' && typeof hash === 'string') {
      const idx = hash.lastIndexOf(':');
      if (idx !== -1) {
        hashToWrite = hash.slice(idx + 1).trim();
      }
    }

    fs.writeFileSync(hashFile, `${hashToWrite}\n`, { encoding: 'utf8' });

    // Zelfde wordlist als uit de GUI, anders fallback naar password.lst
    const wl = (wordlistPath && wordlistPath.trim())
      ? wordlistPath.trim()
      : path.join(johnPath, 'password.lst');

    // Formaat voor john bepalen
    let formatArg = '';
    if (mode === 'pdf') {
      formatArg = '--format=pdf';
    } else if (mode === 'office') {
      formatArg = '--format=office';
    } else if (mode === 'gpg') {
      formatArg = '--format=gpg';
    }

    const crackCmd =
      `cd "${johnPath}" && ${johnBin} ${formatArg} --wordlist="${wl}" "${hashFile}"`;

    return await new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const proc = spawn(shellBin, ['-lc', crackCmd], {
        cwd: johnPath,
        env: process.env
      });

      johnProc = proc; // zodat stop-knop hem kan killen

      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });

      proc.on('error', err => {
        johnProc = null;
        resolve({ error: String(err) });
      });

      proc.on('close', (code) => {
        johnProc = null;

        let password = null;

        try {
          const showCmd =
            `cd "${johnPath}" && ${johnBin} ${formatArg} --show "${hashFile}"`;
          const showRes = spawnSync(shellBin, ['-lc', showCmd], {
            cwd: johnPath,
            encoding: 'utf8'
          });

          if (showRes.stdout) {
            const line = showRes.stdout
              .split('\n')
              .find(l => l.includes(':'));
            if (line) {
              const parts = line.split(':');
              password = parts[parts.length - 1].trim();
            }
          }
        } catch (e) {
          stderr += '\n[john --show error] ' + String(e);
        }

        if (!password && stdout) {
          const line = stdout.split('\n').find(l => l.includes(':'));
          if (line) {
            const parts = line.split(':');
            password = parts[parts.length - 1].trim();
          }
        }

        resolve({ stdout, stderr, code, password });
      });
    });

  } catch (e) {
    return { error: String(e) };
  }
});

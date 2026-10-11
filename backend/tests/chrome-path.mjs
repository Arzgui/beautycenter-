import { accessSync, constants, statSync } from 'node:fs';
import path from 'node:path';

function executable(filename) {
  try { accessSync(filename, constants.X_OK); return statSync(filename).isFile(); }
  catch { return false; }
}

// Resolve before creating a database or starting a server. Never install a browser here.
export function resolveChrome({ platform = process.platform, env = process.env, isExecutable = executable } = {}) {
  const windows = platform === 'win32';
  const paths = windows ? path.win32 : path.posix;
  const searchPath = env.PATH || env.Path || '';
  const directories = searchPath.split(windows ? ';' : ':').filter(Boolean);
  const inPath = name => directories.map(directory => paths.join(directory, name));
  if (env.CHROME_PATH) {
    const candidates = /[\\/]/.test(env.CHROME_PATH) ? [env.CHROME_PATH] : inPath(env.CHROME_PATH);
    const found = candidates.find(isExecutable);
    if (found) return found;
    throw new Error('CHROME_PATH does not point to an executable Chrome/Chromium file. Set it to the browser executable path.');
  }
  const names = windows ? ['chrome.exe', 'chromium.exe'] : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'];
  const installed = windows
    ? [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean).flatMap(root => [
      paths.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      paths.join(root, 'Chromium', 'Application', 'chrome.exe'),
    ])
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  const found = [...names.flatMap(inPath), ...installed].find(isExecutable);
  if (found) return found;
  throw new Error('No Chrome/Chromium executable found. Set CHROME_PATH or run the browser CI job, which installs Chrome on its runner. No browser is installed automatically on this machine.');
}

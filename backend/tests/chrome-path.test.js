import { resolveChrome } from './chrome-path.mjs';

test('explicit Chrome path takes precedence, including spaces', () => {
  expect(resolveChrome({platform:'linux',env:{CHROME_PATH:'/test browser/chrome'},isExecutable:p=>p==='/test browser/chrome'})).toBe('/test browser/chrome');
});
test('invalid explicit Chrome path fails instead of silently choosing another browser', () => {
  expect(()=>resolveChrome({platform:'linux',env:{CHROME_PATH:'/missing',PATH:'/usr/bin'},isExecutable:p=>p==='/usr/bin/chromium'})).toThrow('CHROME_PATH');
});
test('Linux discovers Chromium on PATH', () => {
  expect(resolveChrome({platform:'linux',env:{PATH:'/custom/bin:/other'},isExecutable:p=>p==='/custom/bin/chromium'})).toBe('/custom/bin/chromium');
});
test('Linux discovers standard browser paths without PATH', () => {
  expect(resolveChrome({platform:'linux',env:{},isExecutable:p=>p==='/snap/bin/chromium'})).toBe('/snap/bin/chromium');
});
test('Windows discovers Chrome under Program Files', () => {
  const expected='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  expect(resolveChrome({platform:'win32',env:{PROGRAMFILES:'C:\\Program Files'},isExecutable:p=>p===expected})).toBe(expected);
});
test('browser command in CHROME_PATH is resolved from PATH', () => {
  expect(resolveChrome({platform:'linux',env:{CHROME_PATH:'chrome',PATH:'/ci/bin'},isExecutable:p=>p==='/ci/bin/chrome'})).toBe('/ci/bin/chrome');
});
test('missing browser gives an actionable error without Windows fallback on Linux', () => {
  const attempted=[];
  expect(()=>resolveChrome({platform:'linux',env:{},isExecutable:p=>{attempted.push(p);return false;}})).toThrow('No Chrome/Chromium executable found');
  expect(attempted.every(p=>!p.includes('C:'))).toBe(true);
});

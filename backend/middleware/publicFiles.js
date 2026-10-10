import path from 'node:path';
export function protectSourceFiles(req, res, next) {
  let pathname;
  try { pathname = path.posix.normalize(decodeURIComponent(req.path).replace(/\\/g, '/')); }
  catch { return res.sendStatus(400); }
  if (/^\/(backend|\.git|\.agents|\.codex|\.claude)(\/|$)/i.test(pathname)) return res.sendStatus(404);
  next();
}

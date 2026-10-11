import path from 'node:path';
export function protectSourceFiles(req, res, next) {
  let pathname;
  try { pathname = path.posix.normalize(decodeURIComponent(req.path).replace(/\\/g, '/')); }
  catch { return res.sendStatus(400); }
  if (/^\/(backend|\.git|\.agents|\.codex|\.claude)(\/|$)/i.test(pathname)) return res.sendStatus(404);
  // Only website assets may reach the static server rooted at the repository.
  if (pathname.includes('.') && !(
    /^\/[a-z0-9-]+\.html$/i.test(pathname) ||
    /^\/(service-worker\.js|manifest\.webmanifest|robots\.txt|sitemap\.xml)$/i.test(pathname) ||
    /^\/(assets|css|js)\/[a-z0-9_./-]+\.(css|js|webp|png|jpe?g|svg|ico|woff2?|ttf)$/i.test(pathname)
  )) return res.sendStatus(404);
  next();
}

// Dev-only Vite plugin: saves DialKit panel values to a JSON file so tuning survives reloads.
// GET  /__dial-values            -> { savedAt, panels: { [name]: values } }
// POST /__dial-values {name, values} -> merges that panel into the file
// The file is never imported by the app, so writing it doesn't trigger HMR.
import fs from 'node:fs';
import path from 'node:path';

export function dialValues({ file = 'dial-values.json', route = '/__dial-values' } = {}) {
  let abs;
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      return { panels: {} };
    }
  };

  return {
    name: 'dial-values',
    apply: 'serve',
    config: () => ({ server: { watch: { ignored: [`**/${file}`] } } }),
    configResolved(c) {
      abs = path.resolve(c.root, file);
    },
    configureServer(server) {
      server.middlewares.use(route, (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(read()));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const { name, values } = JSON.parse(body);
              const data = read();
              data.panels = { ...data.panels, [name]: values };
              data.savedAt = new Date().toISOString();
              // Write-then-rename, so a dev server killed mid-write can't leave a truncated file
              // (which the next save would read as empty and overwrite).
              fs.writeFileSync(`${abs}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
              fs.renameSync(`${abs}.tmp`, abs);
              res.end('ok');
            } catch (e) {
              res.statusCode = 400;
              res.end(String(e));
            }
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

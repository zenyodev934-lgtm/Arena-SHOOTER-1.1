// Tiny zero-dependency static file server WITH an upload endpoint.
// Usage: node server.js    (then open http://localhost:8080/upload.html)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb':  'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin':  'application/octet-stream',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.ogg':  'audio/ogg',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
};

// Whitelist of filenames we allow uploads to write — prevents writing anywhere.
const ALLOW_UPLOAD = new Set([
  'free_fire_new_peak_3d_model.glb',
  'map.glb',
  'map.gltf',
  'map.bin',
]);
// Also allow texture files alongside a gltf (png/jpg/bin) — saved as-is.
function isAllowedUpload(name) {
  if (ALLOW_UPLOAD.has(name)) return true;
  if (/^[\w.\-]+\.(png|jpg|jpeg|webp|bin)$/i.test(name)) return true;
  return false;
}

function send(res, code, body, type = 'text/plain') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(body);
}

function handleUpload(req, res) {
  const ctype = req.headers['content-type'] || '';
  const m = ctype.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!m) return send(res, 400, 'Missing multipart boundary');
  const boundary = '--' + (m[1] || m[2]).trim();

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(chunks);
    // Locate filename
    const head = buf.slice(0, Math.min(buf.length, 4096)).toString('latin1');
    const fnMatch = head.match(/filename="([^"]+)"/i);
    if (!fnMatch) return send(res, 400, 'No file in upload');
    let original = path.basename(fnMatch[1]);
    // If it is a .glb, force the expected name so the game picks it up
    let saveName = original;
    if (original.toLowerCase().endsWith('.glb')) {
      saveName = 'free_fire_new_peak_3d_model.glb';
    }
    if (!isAllowedUpload(saveName)) {
      return send(res, 400, 'File type not allowed: ' + saveName);
    }

    // Split parts by boundary and extract the file's binary content
    const bBuf = Buffer.from(boundary, 'latin1');
    let start = buf.indexOf(bBuf);
    if (start === -1) return send(res, 400, 'Malformed upload');
    start += bBuf.length;
    // After boundary, there's \r\n and part headers until \r\n\r\n
    const headerEnd = buf.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) return send(res, 400, 'Malformed upload headers');
    let dataStart = headerEnd + 4;
    // Find trailing boundary
    const endMarker = Buffer.from('\r\n' + boundary, 'latin1');
    let dataEnd = buf.indexOf(endMarker, dataStart);
    if (dataEnd === -1) {
      // Last boundary is usually --boundary--
      const last = Buffer.from('\r\n' + boundary + '--', 'latin1');
      dataEnd = buf.indexOf(last, dataStart);
    }
    if (dataEnd === -1) return send(res, 400, 'Malformed upload end');
    const fileData = buf.subarray(dataStart, dataEnd);

    const targetDir = path.join(__dirname, 'assets', 'models');
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, saveName);
    fs.writeFile(targetPath, fileData, (err) => {
      if (err) return send(res, 500, 'Write failed: ' + err.message);
      send(res, 200, `Saved ${saveName} (${fileData.length} bytes)`);
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/upload') {
    return handleUpload(req, res);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method not allowed');
  }

  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(__dirname, urlPath));
  if (!filePath.startsWith(__dirname)) return send(res, 403, 'Forbidden');

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, '404 Not Found: ' + urlPath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\n🎮  Arena SHOOTER 1.1 running at  http://localhost:${PORT}`);
console.log(`📤  Upload your map at              http://localhost:${PORT}/upload.html\n`);
});

'use strict';
/*
 * Demo sahifa: hamma narsa bitta HTML faylda (shriftlar ham), kompyuter oʻyinchilari bilan.
 * Ishlatish: node scripts/build-demo.js  →  dist/bura-demo.html
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let css = read('public/style.css').replace(/url\('\/fonts\/([^']+)'\)/g, function (_, name) {
  const b64 = fs.readFileSync(path.join(root, 'public', 'fonts', name)).toString('base64');
  return "url(data:font/woff2;base64," + b64 + ')';
});

let html = read('public/index.html')
  .replace(/<!--TG-->[\s\S]*?<!--\/TG-->\n?/, '')
  .replace(/<link rel="stylesheet"[^>]*>/, () => '<style>\n' + css + '\n</style>')
  .replace(/<script src="\/engine\.js[^"]*"><\/script>/, () => '<script>\n' + read('src/engine.js') + '\n</script>')
  .replace(/<script src="\/room\.js[^"]*"><\/script>/, () => '<script>\n' + read('src/room.js') + '\n</script>')
  .replace(/<script src="\/app\.js[^"]*"><\/script>/, () => '<script>window.BURA_DEMO = true;</script>\n<script>\n' + read('public/app.js') + '\n</script>')
  .replace('<title>Bura</title>', '<title>Bura — demo</title>')
  .replace(/^<!doctype html>/i, '<!DOCTYPE html>')
  .replace(', viewport-fit=cover', '');

if (/src="\/|href="\/(?!\/)/.test(html.replace(/href="#/g, ''))) throw new Error('Tashqi fayl havolasi qoldi');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'bura-demo.html');
fs.writeFileSync(out, html);
console.log('Tayyor:', out, Math.round(html.length / 1024) + ' KB');

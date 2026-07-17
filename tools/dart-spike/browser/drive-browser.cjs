// drive-browser.cjs -- THE DEMO. A Dart compiler, as JavaScript, in a real
// Chromium page, with no server doing the work and no filesystem anywhere.
//
// node was never the target. Sixteen rounds were spent on a stall that turned
// out to be node lacking 'self', which dart2js reaches its global through --
// and in a BROWSER, self IS the global. This gate runs in dart2js's native
// habitat, and it needs no shim at all.
//
// usage: node drive-browser.cjs <serve-dir> [port]
const { chromium } = require('playwright');
const { createServer } = require('http');
const { readFileSync, existsSync } = require('fs');
const { extname } = require('path');

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
                '.dill':'application/octet-stream' };

const ROOT = process.argv[2] || '.';
const PORT = parseInt(process.argv[3] || '8099', 10);

(async () => {
  const server = createServer((req, res) => {
    const f = ROOT + (req.url === '/' ? '/index.html' : req.url.split('?')[0]);
    if (!existsSync(f)) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  await new Promise(r => server.listen(PORT, r));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  [pageerror] ' + String(e).slice(0, 220)));
  page.on('console', m => { if (m.type() === 'error') console.log('  [console.error] ' + m.text().slice(0,160)); });
  await page.goto('http://127.0.0.1:' + PORT + '/index.html');
  try {
    await page.waitForFunction(() => window.__gxresult !== undefined, { timeout: 240000 });
  } catch (e) { console.log('  TIMED OUT waiting for a result'); }
  const log = await page.evaluate(() => (window.__gxlog || []).join('\n'));
  console.log(log.split('\n').map(l => '  ' + l).join('\n'));
  const result = await page.evaluate(() => window.__gxresult);
  console.log('\n  ================================================');
  if (result && String(result).includes('solve(10)=55')) {
    console.log('  BROWSER GATE PASSED');
    console.log('  A Dart compiler, as JavaScript, in a real Chromium page, with');
    console.log('  no server and no filesystem, compiled Dart source to JavaScript');
    console.log('  -- and that JavaScript computed the right answer.');
  } else {
    console.log('  BROWSER GATE FAILED: ' + result);
    process.exitCode = 1;
  }
  console.log('  ================================================');
  await browser.close(); server.close();
})();

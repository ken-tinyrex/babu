#!/usr/bin/env node
/**
 * Starts a Cloudflare quick tunnel to the local Jellyfin server and hands the new
 * random https://….trycloudflare.com link to Babu.
 *
 *   npm run tunnel            # opens https://babutv.web.app/upload with the link prefilled
 *   npm run tunnel -- --local # opens http://localhost:5173/upload instead
 *   npm run tunnel -- --no-open
 *
 * Env: JELLYFIN_LOCAL (default http://localhost:8096), BABU_SITE (default https://babutv.web.app)
 * Keep this running; Ctrl+C stops the tunnel. The link changes every time it restarts.
 */
import { spawn, execFile } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const LOCAL = process.env.JELLYFIN_LOCAL ?? 'http://localhost:8096';
const SITE = args.has('--local') ? 'http://localhost:5173' : (process.env.BABU_SITE ?? 'https://babutv.web.app');

const log = (msg) => console.log(`[babu-tunnel] ${msg}`);

async function check(url, tries = 1, gapMs = 2000) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${url}/System/Info/Public`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, gapMs));
  }
  return null;
}

const local = await check(LOCAL);
if (!local) {
  console.error(`[babu-tunnel] Jellyfin isn't answering at ${LOCAL}. Start Jellyfin first.`);
  process.exit(1);
}
log(`Jellyfin "${local.ServerName}" ${local.Version} is running at ${LOCAL}`);

const cf = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', LOCAL], { stdio: ['ignore', 'pipe', 'pipe'] });
cf.on('error', (err) => {
  console.error(`[babu-tunnel] Could not start cloudflared (${err.message}). Install it with: brew install cloudflared`);
  process.exit(1);
});
cf.on('exit', (code) => {
  log(`cloudflared exited (${code}). The tunnel is down.`);
  process.exit(code ?? 1);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => cf.kill('SIGINT'));

let announced = false;
const onOutput = async (chunk) => {
  const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!m || announced) return;
  announced = true;
  const url = m[0];
  log(`Tunnel link: ${url}`);
  log('Waiting for the link to reach Jellyfin (usually 10–60 s)…');
  // A brand-new trycloudflare hostname needs a few seconds to exist in DNS; looking it up too
  // early makes macOS cache "not found" for a while. So wait first, then poll for ~2 minutes.
  await new Promise((r) => setTimeout(r, 10_000));
  const remote = await check(url, 40, 3000);
  if (!remote) {
    log('Jellyfin still isn’t answering through the link. It may need another minute; Babu’s upload page');
    log('checks the link again before saving it.');
  } else {
    log('✓ Jellyfin answers through the tunnel.');
  }
  execFile('pbcopy', [], () => {}).stdin?.end(url);
  log('Copied the link to your clipboard.');
  const page = `${SITE}/upload#jellyfin=${encodeURIComponent(url)}`;
  if (args.has('--no-open')) {
    log(`Paste it on ${SITE}/upload, or open: ${page}`);
  } else {
    execFile('open', [page], () => {});
    log(`Opened ${SITE}/upload. Sign in there and the link saves itself.`);
  }
  log('Keep this window open. Ctrl+C stops the tunnel.');
};
cf.stdout.on('data', onOutput);
cf.stderr.on('data', onOutput);

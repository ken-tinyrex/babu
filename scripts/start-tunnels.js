const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const urls = { 8096: null, 3000: null };

function pushEasUpdate() {
  console.log('\n[tunnels] Pushing EAS Update to preview channel...\n');
  const eas = spawn('eas', ['update', '--branch', 'preview', '--message', 'tunnel URL update', '--non-interactive'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  eas.on('exit', (code) => {
    if (code === 0) {
      console.log('\n[tunnels] EAS Update pushed — app will pick up new URLs on next load.\n');
    } else {
      console.error('\n[tunnels] EAS Update failed. Run `eas update --branch preview` manually.\n');
    }
  });
}

function updateConfigs() {
  if (!urls[8096] || !urls[3000]) return;

  const envPath = path.join(ROOT, 'server', '.env');
  let env = fs.readFileSync(envPath, 'utf8');
  env = env.replace(/JELLYFIN_URL=.+/m, `JELLYFIN_URL=${urls[8096]}`);
  fs.writeFileSync(envPath, env);

  const loginPath = path.join(ROOT, 'src', 'screens', 'LoginScreen.tsx');
  let login = fs.readFileSync(loginPath, 'utf8');
  login = login.replace(
    /url: 'https:\/\/[^']+\.trycloudflare\.com'/,
    `url: '${urls[8096]}'`
  );
  fs.writeFileSync(loginPath, login);

  const registerPath = path.join(ROOT, 'src', 'screens', 'RegisterScreen.tsx');
  let register = fs.readFileSync(registerPath, 'utf8');
  register = register.replace(
    /const PROXY_URL = 'https:\/\/[^']+\.trycloudflare\.com'/,
    `const PROXY_URL = '${urls[3000]}'`
  );
  fs.writeFileSync(registerPath, register);

  console.log('\n[tunnels] Config auto-updated:');
  console.log(`  Jellyfin (8096): ${urls[8096]}`);
  console.log(`  Proxy    (3000): ${urls[3000]}\n`);

  pushEasUpdate();
}

function startTunnel(port) {
  const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`]);

  const onData = (data) => {
    const text = data.toString();
    process.stdout.write(`[tunnel:${port}] ${text}`);
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !urls[port]) {
      urls[port] = match[0];
      updateConfigs();
    }
  };

  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
}

startTunnel(8096);
startTunnel(3000);

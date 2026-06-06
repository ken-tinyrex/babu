const express = require('express');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

const JELLYFIN_URL = process.env.JELLYFIN_URL;
const JELLYFIN_ADMIN_TOKEN = process.env.JELLYFIN_ADMIN_TOKEN;

if (!JELLYFIN_URL || !JELLYFIN_ADMIN_TOKEN) {
  console.error('Missing required env vars: JELLYFIN_URL, JELLYFIN_ADMIN_TOKEN');
  process.exit(1);
}

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many registration attempts, please try again later.' },
});

const jellyfinHeaders = {
  'Content-Type': 'application/json',
  'X-Emby-Token': JELLYFIN_ADMIN_TOKEN,
};

app.post('/register', registerLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ error: 'Username must be between 3 and 32 characters.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  // Create the user
  const createRes = await fetch(`${JELLYFIN_URL}/Users/New`, {
    method: 'POST',
    headers: jellyfinHeaders,
    body: JSON.stringify({ Name: username }),
  });

  if (createRes.status === 400) {
    // Jellyfin returns 400 if the username already exists
    return res.status(409).json({ error: 'Username already taken.' });
  }
  if (!createRes.ok) {
    console.error('Jellyfin create user failed:', createRes.status, await createRes.text());
    return res.status(500).json({ error: 'Failed to create account.' });
  }

  const user = await createRes.json();

  // Set the password
  const pwRes = await fetch(`${JELLYFIN_URL}/Users/${user.Id}/Password`, {
    method: 'POST',
    headers: jellyfinHeaders,
    body: JSON.stringify({ NewPw: password }),
  });

  if (!pwRes.ok) {
    console.error('Jellyfin set password failed:', pwRes.status, await pwRes.text());
    // Clean up the created user so we don't leave a passwordless account
    await fetch(`${JELLYFIN_URL}/Users/${user.Id}`, {
      method: 'DELETE',
      headers: jellyfinHeaders,
    });
    return res.status(500).json({ error: 'Failed to set password.' });
  }

  return res.status(201).json({ message: 'Account created successfully.' });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Babu server running on port ${PORT}`));

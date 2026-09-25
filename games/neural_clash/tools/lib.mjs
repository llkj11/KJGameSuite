// Shared helpers for the asset generation scripts.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ASSETS = path.join(ROOT, 'assets');
const MANIFEST = path.join(ASSETS, 'manifest.json');

// Loads js/characters.js in a sandbox so the scripts use the exact in-game lines.
export function loadRoster() {
  const code = fs.readFileSync(path.join(ROOT, 'js', 'characters.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.NC.ROSTER;
}

export function loadPrompts() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'prompts.json'), 'utf8'));
}

export function readManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
  catch { return { music: {}, sfx: {}, voice: {} }; }
}

export function writeManifest(m) {
  fs.mkdirSync(ASSETS, { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
}

export function saveAsset(rel, buf) {
  const full = path.join(ASSETS, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buf);
  return rel;
}

export function exists(rel) { return fs.existsSync(path.join(ASSETS, rel)); }

export function args() {
  const a = process.argv.slice(2), out = { only: null, force: false, dry: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--only') out.only = a[++i].split(',');
    else if (a[i] === '--force') out.force = true;
    else if (a[i] === '--dry-run') out.dry = true;
    else if (a[i] === '--model') out.model = a[++i];
    else if (a[i] === '--list-voices') out.listVoices = true;
    else if (a[i] === '--process-only') out.processOnly = true;
  }
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// POST with retries on 429/5xx. Returns the Response.
export async function post(url, headers, body, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    if (res.ok) return res;
    const text = await res.text();
    if ((res.status === 429 || res.status >= 500) && i < tries - 1) {
      const wait = 2000 * 2 ** i;
      console.warn(`  ${res.status}, retrying in ${wait / 1000}s: ${text.slice(0, 200)}`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
}

const ALIASES = {
  GEMINI_API_KEY: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_API_KEY'],
  ELEVENLABS_API_KEY: ['ELEVENLABS_API_KEY', 'ELEVEN_API_KEY', 'XI_API_KEY']
};

export function requireKey(name) {
  const k = (ALIASES[name] || [name]).map((n) => process.env[n]).find(Boolean);
  if (!k) {
    console.error(`Missing ${name}. Set it in your environment, e.g.  ${name}=... node ${path.basename(process.argv[1])}`);
    process.exit(1);
  }
  return k;
}

// Finds an ffmpeg binary: $FFMPEG, then PATH, then the pip package imageio-ffmpeg.
import { execFileSync } from 'node:child_process';
export function findFfmpeg() {
  const cands = [process.env.FFMPEG, 'ffmpeg'].filter(Boolean);
  try {
    cands.push(execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim());
  } catch { /* not installed */ }
  for (const c of cands) {
    try { execFileSync(c, ['-version'], { stdio: 'ignore' }); return c; } catch { /* try next */ }
  }
  return null;
}

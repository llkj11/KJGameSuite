// Generates every theme with Google Lyria 3.5 (Gemini API, Interactions endpoint)
// and registers the files in assets/manifest.json. The game plays these instead of
// its built-in SNES synth versions.
//
// Raw Lyria output is kept in assets/music/raw/ (gitignored). With ffmpeg available, each
// track is then trimmed of leading/trailing silence (so it loops cleanly), loudness-matched
// and re-encoded to a smaller MP3 in assets/music/.
//
//   GEMINI_API_KEY=... node tools/generate_music.mjs [--only fable,grok] [--force] [--model lyria-3-clip-preview] [--dry-run]
//   node tools/generate_music.mjs --process-only        (re-run post-processing on existing raw files)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ASSETS, loadPrompts, readManifest, writeManifest, saveAsset, exists, args, post, requireKey, findFfmpeg } from './lib.mjs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const opt = args();
const prompts = loadPrompts();
const model = opt.model || prompts.music.model;

// Pull base64 audio out of the known response shapes (Interactions API, then generateContent).
function extractAudio(json) {
  for (const step of json.steps || []) {
    for (const c of step.content || []) if (c.type === 'audio' && c.data) return { data: c.data, mime: c.mime_type || c.mimeType };
  }
  if (json.output_audio?.data) return { data: json.output_audio.data, mime: json.output_audio.mime_type };
  for (const out of json.outputs || []) if (out.type === 'audio' && out.data) return { data: out.data, mime: out.mime_type };
  for (const cand of json.candidates || []) {
    for (const part of cand.content?.parts || []) if (part.inlineData?.data) return { data: part.inlineData.data, mime: part.inlineData.mimeType };
  }
  return null;
}

const ffmpeg = findFfmpeg();

// Trim silence at both ends, match loudness, fade the edges, encode 128 kbps MP3.
function processTrack(id, rawRel) {
  const out = `music/${id}.mp3`;
  if (!ffmpeg) {
    if (rawRel !== out) fs.copyFileSync(path.join(ASSETS, rawRel), path.join(ASSETS, out));
    console.log('  (ffmpeg not found: using the raw file; pip install imageio-ffmpeg to enable trimming)');
    return out;
  }
  const maxSec = (prompts.music.maxSeconds || {})[id];
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02';
  let filter = `${trim},areverse,${trim},areverse,loudnorm=I=-17:TP=-1.5:LRA=11`;
  if (maxSec) filter += `,atrim=0:${maxSec},afade=t=out:st=${Math.max(0, maxSec - 1.5)}:d=1.5`;
  filter += ',afade=t=in:d=0.02';
  const tmp = path.join(ASSETS, `music/.${id}.tmp.mp3`);
  execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', path.join(ASSETS, rawRel), '-af', filter, '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', tmp]);
  fs.renameSync(tmp, path.join(ASSETS, out));
  const kb = Math.round(fs.statSync(path.join(ASSETS, out)).size / 1024);
  console.log(`  processed -> assets/${out} (${kb} KB)`);
  return out;
}

async function main() {
  const tracks = Object.entries(prompts.music.tracks).filter(([id]) => !opt.only || opt.only.includes(id));
  const manifest = readManifest();
  if (opt.processOnly) {
    for (const [id] of tracks) {
      const raw = fs.readdirSync(path.join(ASSETS, 'music/raw')).find((f) => f.startsWith(id + '.'));
      if (!raw) { console.log(`no raw file for ${id}`); continue; }
      console.log(`[${id}]`);
      manifest.music[id] = processTrack(id, `music/raw/${raw}`);
    }
    writeManifest(manifest);
    return;
  }
  const key = opt.dry ? 'dry-run' : requireKey('GEMINI_API_KEY');
  const failed = [];
  for (const [id, line] of tracks) {
    const rel = `music/${id}.mp3`;
    if (exists(rel) && !opt.force) { console.log(`skip ${id} (exists; --force to redo)`); manifest.music[id] = rel; continue; }
    const rawDir = path.join(ASSETS, 'music/raw');
    const oldRaw = !opt.force && fs.existsSync(rawDir) && fs.readdirSync(rawDir).find((f) => f.startsWith(id + '.'));
    if (oldRaw) { console.log(`[${id}] reusing raw file`); manifest.music[id] = processTrack(id, `music/raw/${oldRaw}`); writeManifest(manifest); continue; }
    const input = `${prompts.music.base} ${line}`;
    console.log(`\n[${id}] ${model}\n  ${input}`);
    if (opt.dry) continue;
    let json;
    try {
      json = await (await post(ENDPOINT, { 'x-goog-api-key': key }, { model, input })).json();
    } catch (e) { console.error(`  FAILED ${id}: ${e.message.slice(0, 300)}`); failed.push(id); continue; }
    const audio = extractAudio(json);
    if (!audio) { console.error(`  no audio in response: ${JSON.stringify(json).slice(0, 400)}`); continue; }
    const ext = /wav/i.test(audio.mime || '') ? 'wav' : 'mp3';
    const raw = saveAsset(`music/raw/${id}.${ext}`, Buffer.from(audio.data, 'base64'));
    console.log(`  saved raw assets/${raw}`);
    manifest.music[id] = processTrack(id, raw);
    writeManifest(manifest);
  }
  writeManifest(manifest);
  if (failed.length) console.log(`\nFailed (the synth version stays in place): ${failed.join(', ')}`);
  console.log('\nDone. Reload the game to hear the Lyria tracks.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });

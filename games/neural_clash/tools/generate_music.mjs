// Generates every theme with Google Lyria 3.5 (Gemini API, Interactions endpoint)
// and registers the files in assets/manifest.json. The game plays these instead of
// its built-in SNES synth versions.
//
//   GEMINI_API_KEY=... node tools/generate_music.mjs [--only fable,grok] [--force] [--model lyria-3-clip-preview] [--dry-run]
import { loadPrompts, readManifest, writeManifest, saveAsset, exists, args, post, requireKey } from './lib.mjs';

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

async function main() {
  const tracks = Object.entries(prompts.music.tracks).filter(([id]) => !opt.only || opt.only.includes(id));
  const key = opt.dry ? 'dry-run' : requireKey('GEMINI_API_KEY');
  const manifest = readManifest();
  for (const [id, line] of tracks) {
    const rel = `music/${id}.mp3`;
    if (exists(rel) && !opt.force) { console.log(`skip ${id} (exists; --force to redo)`); manifest.music[id] = rel; continue; }
    const input = `${prompts.music.base} ${line}`;
    console.log(`\n[${id}] ${model}\n  ${input}`);
    if (opt.dry) continue;
    const res = await post(ENDPOINT, { 'x-goog-api-key': key }, { model, input });
    const json = await res.json();
    const audio = extractAudio(json);
    if (!audio) { console.error(`  no audio in response: ${JSON.stringify(json).slice(0, 400)}`); continue; }
    const ext = /wav/i.test(audio.mime || '') ? 'wav' : 'mp3';
    const file = saveAsset(`music/${id}.${ext}`, Buffer.from(audio.data, 'base64'));
    manifest.music[id] = file;
    writeManifest(manifest);
    console.log(`  saved assets/${file}`);
  }
  writeManifest(manifest);
  console.log('\nDone. Reload the game to hear the Lyria tracks.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });

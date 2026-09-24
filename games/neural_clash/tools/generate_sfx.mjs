// Generates sound effects with the ElevenLabs Sound Effects API and registers them
// in assets/manifest.json. Missing effects fall back to the built-in synth.
//
//   ELEVENLABS_API_KEY=... node tools/generate_sfx.mjs [--only hitL,ko] [--force] [--dry-run]
import { loadPrompts, readManifest, writeManifest, saveAsset, exists, args, post, requireKey, sleep } from './lib.mjs';

const ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128';
const opt = args();
const prompts = loadPrompts();

async function main() {
  const list = Object.entries(prompts.sfx.effects).filter(([id]) => !opt.only || opt.only.includes(id));
  const key = opt.dry ? 'dry-run' : requireKey('ELEVENLABS_API_KEY');
  const manifest = readManifest();
  for (const [id, spec] of list) {
    const rel = `sfx/${id}.mp3`;
    if (exists(rel) && !opt.force) { console.log(`skip ${id}`); manifest.sfx[id] = rel; continue; }
    const text = `${prompts.sfx.base} ${spec.text}`;
    console.log(`[${id}] ${spec.duration}s  ${text}`);
    if (opt.dry) continue;
    const res = await post(ENDPOINT, { 'xi-api-key': key }, {
      text, duration_seconds: spec.duration, prompt_influence: spec.influence ?? 0.6, model_id: 'eleven_text_to_sound_v2'
    });
    manifest.sfx[id] = saveAsset(rel, Buffer.from(await res.arrayBuffer()));
    writeManifest(manifest);
    await sleep(300);
  }
  writeManifest(manifest);
  console.log('\nDone. Reload the game to hear the ElevenLabs effects.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });

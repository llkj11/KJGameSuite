// Voices every fighter's lines (select quotes, win quotes, taunt, super name, ending)
// plus the announcer with ElevenLabs text-to-speech, and registers them in the manifest.
//
//   ELEVENLABS_API_KEY=... node tools/generate_voices.mjs [--only fable,announcer] [--force] [--dry-run] [--list-voices]
import { loadRoster, loadPrompts, readManifest, writeManifest, saveAsset, exists, args, post, requireKey, sleep } from './lib.mjs';

const opt = args();
const prompts = loadPrompts();
const V = prompts.voices;

async function tts(key, voiceId, text, settings) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const res = await post(url, { 'xi-api-key': key }, { text, model_id: V.model, voice_settings: settings || V.settings });
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const key = opt.dry ? 'dry-run' : requireKey('ELEVENLABS_API_KEY');
  if (opt.listVoices) {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
    const json = await res.json();
    for (const v of json.voices || []) console.log(v.voice_id, v.name, JSON.stringify(v.labels || {}));
    return;
  }
  const roster = loadRoster();
  const manifest = readManifest();
  const want = (id) => !opt.only || opt.only.includes(id);

  for (const ch of roster) {
    if (!want(ch.id)) continue;
    const cfg = V.characters[ch.id];
    if (!cfg) { console.warn(`no voice configured for ${ch.id}`); continue; }
    const lines = [];
    ch.select.forEach((t, i) => lines.push(['select', i, t]));
    ch.wins.forEach((t, i) => lines.push(['win', i, t]));
    lines.push(['taunt', null, ch.taunt], ['super', null, ch.super.name], ['ending', null, ch.ending]);
    const entry = manifest.voice[ch.id] || {};
    for (const [kind, i, text] of lines) {
      const rel = `voice/${ch.id}_${kind}${i == null ? '' : '_' + i}.mp3`;
      console.log(`[${ch.id}] ${kind}${i == null ? '' : ' ' + i}: ${text}`);
      if (!opt.dry && (!exists(rel) || opt.force)) {
        saveAsset(rel, await tts(key, cfg.voice_id, (cfg.prefix || '') + text, cfg.settings));
        await sleep(250);
      }
      if (i == null) entry[kind] = rel;
      else (entry[kind] = entry[kind] || [])[i] = rel;
    }
    manifest.voice[ch.id] = entry;
    if (!opt.dry) writeManifest(manifest);
  }

  if (want('announcer')) {
    for (const [k, text] of Object.entries(V.announcer.lines)) {
      const rel = `sfx/announce_${k}.mp3`;
      console.log(`[announcer] ${k}: ${text}`);
      if (!opt.dry && (!exists(rel) || opt.force)) {
        saveAsset(rel, await tts(key, V.announcer.voice_id, text, V.announcer.settings));
        await sleep(250);
      }
      manifest.sfx[`announce_${k}`] = rel;
    }
  }
  if (!opt.dry) writeManifest(manifest);
  console.log('\nDone. Reload the game: select-screen quotes now use these voices.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });

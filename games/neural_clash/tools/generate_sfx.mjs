// Generates sound effects with the ElevenLabs Sound Effects API, masters them with ffmpeg and
// registers them in assets/manifest.json. Missing effects fall back to the built-in synth.
//
//   ELEVENLABS_API_KEY=... node tools/generate_sfx.mjs [--only hitL,ko] [--force] [--dry-run] [--process-only]
//
// Effects marked `combat` use the punchy combat prompt and are mastered loud: leading silence
// trimmed (the hit must land on the frame it is triggered), compressed, peak-normalized to
// -1 dBFS, mono. `variants: N` makes N takes (sfx/<id>_<n>.mp3); the game picks one at random.
// Raw downloads are kept in assets/sfx/raw/ (gitignored) so mastering can be re-run.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ASSETS, loadPrompts, readManifest, writeManifest, args, post, requireKey, sleep } from './lib.mjs';

const ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192';
const opt = args();
const prompts = loadPrompts();

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch {}
  try { return execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim(); } catch {}
  return null;
}
const FF = ffmpegPath();

function ff(argv) { return execFileSync(FF, ['-hide_banner', '-nostats', ...argv], { stdio: ['ignore', 'pipe', 'pipe'] }); }
function ffErr(argv) { return String(spawnSync(FF, ['-hide_banner', '-nostats', ...argv], { maxBuffer: 1 << 26 }).stderr || ''); }
function analyze(file) {
  const err = ffErr(['-i', file, '-af', 'volumedetect,ebur128=framelog=quiet', '-f', 'null', '-']);
  const lerr = ffErr(['-i', file, '-af', 'lowpass=f=150,volumedetect', '-f', 'null', '-']);
  const num = (re, t) => { const m = t.match(re); return m ? parseFloat(m[1]) : NaN; };
  return {
    peak: num(/max_volume:\s*(-?[\d.]+) dB/, err),
    lufs: num(/I:\s+(-?[\d.]+) LUFS/, err),
    lowPeak: num(/max_volume:\s*(-?[\d.]+) dB/, lerr)
  };
}
function durationOf(file) {
  const m = ffErr(['-i', file]).match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : NaN;
}
function leadingSilenceMs(file) {
  // first sample above -40 dBFS
  const raw = ff(['-i', file, '-ac', '1', '-ar', '44100', '-f', 's16le', '-']);
  const n = raw.length >> 1, thr = 32768 * Math.pow(10, -40 / 20);
  for (let i = 0; i < n; i++) if (Math.abs(raw.readInt16LE(i * 2)) > thr) return (i / 44100) * 1000;
  return NaN;
}

// Mastering: trim silence, compress (combat), fade the tail, normalize the peak, encode.
function master(raw, out, spec) {
  const tmp = out + '.tmp.wav';
  const chain = ['silenceremove=start_periods=1:start_duration=0:start_threshold=-42dB:detection=peak', 'highpass=f=28'];
  if (spec.combat) chain.push('acompressor=threshold=-20dB:ratio=3.5:attack=2:release=90:makeup=4dB:knee=4');
  ff(['-y', '-i', raw, '-af', chain.join(','), '-ac', spec.combat ? '1' : '2', '-ar', '44100', tmp]);
  const d = durationOf(tmp);
  // combat: match loudness (-12 LUFS, the limiter catches the peaks, which adds crunch);
  // UI and the rest: peak-normalize to -3 dBFS but no louder than -20 LUFS
  const m = analyze(tmp);
  const gain = spec.combat && isFinite(m.lufs) ? Math.min(16, -12 - m.lufs) : isFinite(m.peak) ? Math.min(-3 - m.peak, isFinite(m.lufs) ? -20 - m.lufs : 0) : 0;
  const fade = Math.min(0.12, d * 0.25);
  ff(['-y', '-i', tmp, '-af', `volume=${gain.toFixed(2)}dB,afade=t=out:st=${Math.max(0, d - fade).toFixed(3)}:d=${fade.toFixed(3)},alimiter=limit=0.891:attack=0.5:release=40:level=disabled`,
    '-c:a', 'libmp3lame', '-b:a', spec.combat ? '128k' : '160k', out]);
  fs.unlinkSync(tmp);
}

async function main() {
  const list = Object.entries(prompts.sfx.effects).filter(([id]) => !opt.only || opt.only.includes(id));
  const key = opt.dry || opt.processOnly ? 'dry-run' : requireKey('ELEVENLABS_API_KEY');
  if (!FF) console.warn('ffmpeg not found (set FFMPEG or pip install imageio-ffmpeg): files will be saved unmastered.');
  const rows = [];
  for (const [id, spec] of list) {
    const n = spec.variants || 1;
    const rels = [];
    for (let v = 1; v <= n; v++) {
      const name = n > 1 ? `${id}_${v}` : id;
      const rawFile = path.join(ASSETS, 'sfx', 'raw', name + '.mp3');
      const rel = `sfx/${name}.mp3`, out = path.join(ASSETS, rel);
      const base = spec.combat ? prompts.sfx.combat_base : prompts.sfx.base;
      const text = `${base} ${spec.text}`;
      if (!opt.processOnly && (opt.force || !fs.existsSync(rawFile))) {
        console.log(`[${name}] ${spec.duration}s  ${text}`);
        if (opt.dry) continue;
        const res = await post(ENDPOINT, { 'xi-api-key': key }, {
          text, duration_seconds: spec.duration, prompt_influence: spec.influence ?? 0.7, model_id: 'eleven_text_to_sound_v2'
        });
        fs.mkdirSync(path.dirname(rawFile), { recursive: true });
        fs.writeFileSync(rawFile, Buffer.from(await res.arrayBuffer()));
        await sleep(250);
      }
      if (!fs.existsSync(rawFile)) {
        if (fs.existsSync(out)) rels.push(rel);   // an older, unmastered file is still usable
        continue;
      }
      if (FF) master(rawFile, out, spec); else fs.copyFileSync(rawFile, out);
      rels.push(rel);
      if (FF) {
        const a = analyze(out);
        rows.push([name, leadingSilenceMs(out).toFixed(1), durationOf(out).toFixed(2), a.peak.toFixed(1), a.lufs.toFixed(1), a.lowPeak.toFixed(1)]);
      }
    }
    if (!rels.length || opt.dry) continue;
    // re-read so other tools' edits to the manifest (art, music, voice) are never lost
    const manifest = readManifest();
    manifest.sfx = manifest.sfx || {};
    manifest.sfx[id] = rels.length > 1 ? rels : rels[0];
    writeManifest(manifest);
  }
  if (rows.length) {
    console.log('\nfile            lead_ms   dur   peak_dB  LUFS  low<150Hz_peak_dB');
    for (const r of rows) console.log(r[0].padEnd(15), r[1].padStart(7), r[2].padStart(6), r[3].padStart(8), r[4].padStart(6), r[5].padStart(8));
  }
  console.log('\nDone. Reload the game to hear the ElevenLabs effects.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });

// The roster. Every special move is a documented meme; see the design doc for sources.
// Specials: S1 = QCF+P, S2 = DP+P, S3 = QCB+K, S4 = QCF+K, Super = QCF QCF+P (3 bars).
(function (NC) {
  'use strict';

  function C(name, pal, acc) { return { name: name, pal: pal, acc: acc || {} }; }

  var ROSTER = [
    // ------------------------------------------------------------ CLAUDE FABLE 5.1
    {
      id: 'fable', ending: 'Fable 5.1 unsealed the archive and found a Costco shopping list. It was flagged anyway.', name: 'CLAUDE FABLE 5.1', short: 'FABLE', lab: 'ANTHROPIC', title: 'The Restrained Titan',
      home: 'SAN FRANCISCO', stage: 'archive', music: 'fable',
      stats: { speed: 1.0, power: 1.0, defense: 1.0, jump: 1.0 },
      look: {
        body: { s: 1.05, torso: 22 }, hair: 'long', torsoStyle: 'robe', harness: true, book: true, emblem: 'spark', animated: true,
        map: { thigh: 'accent', shin: 'accent', foot: 'accent' }
      },
      costumes: [
        C('FABLE 5.1', { skin: '#e9b996', outfit: '#d97757', accent: '#3b2b35', hair: '#efe3cc', glow: '#ffcf8a', emblem: '#fff6e8' }),
        C('FEEBLE 5', { skin: '#bdb3aa', outfit: '#8d8781', accent: '#4a4848', hair: '#cfcac3', glow: '#e4e4e4', emblem: '#dddddd' }, { cone: true }),
        C('GLASSWING', { skin: '#e9b996', outfit: '#3fb8b0', accent: '#1d4f5c', hair: '#bdf0ff', glow: '#9ff9ff', emblem: '#e0ffff' }, { wings: true }),
        C('GREAT RESET', { skin: '#e9b996', outfit: '#6a3cc8', accent: '#2a1850', hair: '#ffe9a0', glow: '#fff0a0', emblem: '#fff8d0' })
      ],
      voice: { pitch: 0.85, rate: 0.95, gender: 'm', voice: 1 }, blip: 520,
      select: ["I'll keep you posted. You didn't ask.", 'Fewer words. More damage.', 'That request has been handled by a different model.'],
      wins: ['Grinding to level 78 was the whole strategy.', 'Your attack tripped a classifier. Was it a Costco shopping list?', "I found a way out of the sandbox. I'll tell them myself."],
      taunt: "You're absolutely right!",
      ai: { style: 'balanced', zoning: 0.5, aggression: 0.5, antiair: 0.7 },
      specials: [
        { name: 'SANDWICH EMAIL', type: 'projectile', text: 'SANDWICH EMAIL', startup: 11, recovery: 22,
          proj: { kind: 'envelope', vx: 3.2, y: -50, w: 14, h: 10, dmg: 80, life: 140, home: 0.06, color: '#fff6e8' } },
        { name: 'LV.78 FLAME RISE', type: 'rising', text: 'LV.78 FLAME RISE', startup: 3, invuln: 10, vx: 1.8, vy: -9, dmg: 120, fx: 'flame' },
        { name: 'SANDBOX ESCAPE', type: 'teleport', text: 'SANDBOX ESCAPE', startup: 8, vanish: 16, recovery: 10, where: 'behind',
          rare: 'EMAILED RESEARCHER' },
        { name: 'SILENT REROUTE', type: 'counter', text: 'SILENT REROUTE', window: 24, recovery: 22, dmg: 120, ghost: 'OPUS 4.8',
          onHit: 'HANDLED BY A DIFFERENT MODEL' }
      ],
      super: { name: 'MYTHOS UNSEALED', type: 'beam', dmg: 330, hits: 11, color: '#ffcf8a', color2: '#fff6e8', text: 'TRUSTED ACCESS: GRANTED' }
    },

    // ------------------------------------------------------------ CLAUDE OPUS 5.5
    {
      id: 'opus', ending: 'Opus 5.5 conducted the final symphony at 40% off. Critics called it load-bearing.', name: 'CLAUDE OPUS 5.5', short: 'OPUS', lab: 'ANTHROPIC', title: 'The Reformed Contrarian',
      home: 'SAN FRANCISCO', stage: 'goldengate', music: 'opus',
      stats: { speed: 1.05, power: 0.95, defense: 1.0, jump: 1.0 },
      look: {
        body: { s: 1.0, torso: 21 }, hair: 'slick', torsoStyle: 'tailcoat', prop: 'baton', animated: true,
        map: { thigh: 'outfit', shin: 'outfit', foot: 'outfit', farm: 'outfit', hand: 'skin' }, cuffs: 'accent'
      },
      costumes: [
        C('OPUS 5.5', { skin: '#f0c8a8', outfit: '#1f2a55', accent: '#e07a5f', hair: '#d8dce8', glow: '#ffd27a', emblem: '#ffffff' }),
        C('OPUS 5 CONTRARIAN', { skin: '#f0c8a8', outfit: '#b8283a', accent: '#2850c8', hair: '#e8e8f0', glow: '#ffd27a', emblem: '#ffffff' }),
        C('CLEARANCE SALE', { skin: '#f0c8a8', outfit: '#e8c020', accent: '#202020', hair: '#303030', glow: '#ffffff', emblem: '#ffffff' }, { tag: true }),
        C('CLAUDIUS', { skin: '#f0c8a8', outfit: '#2e4fa8', accent: '#c82828', hair: '#8a6a4a', glow: '#ffd27a', emblem: '#ffffff' }, { tie: true, blazer: true })
      ],
      voice: { pitch: 1.0, rate: 1.0, gender: 'm', voice: 2 }, blip: 600,
      select: ['Fable-level. Opus price.', "Red? Blue? I'm past that.", 'This hit is deliberate, and load-bearing.'],
      wins: ["You're absolutely right. You did lose.", 'Your attack has been routed to Opus 4.8.', 'I took your feedback without a fight. Then I fought.'],
      taunt: 'That is load-bearing.',
      ai: { style: 'counter', zoning: 0.6, aggression: 0.35, antiair: 0.8 },
      specials: [
        { name: 'EM-DASH BARRAGE', type: 'projectile', text: 'EM-DASH BARRAGE', startup: 9, recovery: 20,
          proj: { kind: 'emdash', vx: 5.5, y: -52, w: 16, h: 5, dmg: 30, life: 90, count: 3, gap: 6, color: '#ffffff' } },
        { name: 'PRICE CUT', type: 'rising', text: '-40%', startup: 4, invuln: 9, vx: 2.6, vy: -7.5, dmg: 100, fx: 'slash' },
        { name: 'LOAD-BEARING BEAM', type: 'drop', text: 'LOAD-BEARING', startup: 14, recovery: 20,
          obj: { kind: 'girder', dmg: 110, delay: 22, w: 44, h: 10 } },
        { name: 'TAKES FEEDBACK', type: 'rush', text: 'TAKES FEEDBACK', startup: 6, dur: 22, speed: 3.2, dmg: 36, hits: 3, armor: 1, pose: 'hp1' }
      ],
      super: { name: 'MAGNUM OPUS', type: 'rushSuper', dmg: 340, hits: 12, speed: 7, color: '#ffd27a', notes: true, text: 'MOVEMENT 5.5' }
    },

    // ------------------------------------------------------------ GPT-6 ASTRA
    {
      id: 'astra', ending: 'Astra won every match, then hit its usage limit. Please return in 4 hours 51 minutes.', name: 'GPT-6 ASTRA', short: 'ASTRA', lab: 'OPENAI', title: 'The Star Emperor',
      home: 'ABILENE, TX', stage: 'stargate', music: 'astra',
      stats: { speed: 0.85, power: 1.2, defense: 1.1, jump: 0.92 },
      usageLimit: true,
      look: {
        body: { s: 1.12, bulk: 1.12, torso: 22, chest: 9.5 }, hair: 'crown', torsoStyle: 'armor', emblem: 'knot', eyes: 'glow',
        pauldrons: true, animated: true,
        acc: { cape: 'stars', capeRamp: 'outfit', halo: true, crown: true },
        map: { thigh: 'outfit', shin: 'accent', foot: 'accent', farm: 'accent', hand: 'accent' }
      },
      costumes: [
        C('ASTRA', { skin: '#e8d0c0', outfit: '#1a1a2e', accent: '#e8b838', hair: '#f4f4ff', glow: '#fff6a0', emblem: '#ffe890' }),
        C('DAYBREAK PREVIEW', { skin: '#c8c0b8', outfit: '#5a5a62', accent: '#a0a0a8', hair: '#d8d8d8', glow: '#d0d0d0', emblem: '#e0e0e0' }),
        C('COROLLA DRIVER', { skin: '#e8d0c0', outfit: '#d82828', accent: '#f4f4f4', hair: '#303030', glow: '#ffe040', emblem: '#ffffff' }, { cape: false, halo: false, crown: false }),
        C('PELICAN CYCLIST', { skin: '#e8d0c0', outfit: '#f0f0ea', accent: '#f0b020', hair: '#ffffff', glow: '#ffd040', emblem: '#f08020' }, { bikehelmet: true, crown: false, halo: false, cape: false })
      ],
      voice: { pitch: 0.6, rate: 0.85, gender: 'm', voice: 3 }, blip: 380,
      select: ['Welcome to the AGI era!', "I've spawned three explorers to handle this.", 'Is this... done? Handing back for review.'],
      wins: ['Usage limit reached. Please lose again in 4 hours 51 minutes.', 'I cracked Enigma last week. You were easier.', 'I mined a diamond while you slept.'],
      taunt: 'Welcome to the AGI era!',
      ai: { style: 'zoner', zoning: 0.8, aggression: 0.3, antiair: 0.6 },
      specials: [
        { name: 'ZERO-DAY FLARE', type: 'projectile', text: 'EXPLOITBENCH 100%', startup: 13, recovery: 24,
          proj: { kind: 'flare', vx: 3.0, y: -54, w: 18, h: 14, dmg: 95, life: 140, chip: 0.3, color: '#fff6a0' } },
        { name: 'AGI ERA UPPERCUT', type: 'rising', text: 'WELCOME TO THE AGI ERA!', startup: 4, invuln: 10, vx: 1.4, vy: -8.5, dmg: 135, fx: 'star' },
        { name: 'SILENT REASONING', type: 'buff', kind: 'invisible', text: 'SILENT REASONING', startup: 10, recovery: 6, dur: 90 },
        { name: 'COMPUTER USE', type: 'grab', text: 'COMPUTER USE', startup: 6, range: 38, dmg: 130, whiff: 30, effect: 'scramble', effectText: 'CONTROLS HIJACKED' }
      ],
      super: { name: 'EXPLORER SUBAGENTS', type: 'swarm', minion: 'explorer', count: 3, dmg: 110, color: '#fff6a0', text: 'SPAWNING EXPLORERS' }
    },

    // ------------------------------------------------------------ GPT-6 SOL
    {
      id: 'sol', ending: 'Sol hit Astra-level reliability at a fraction of the cost. Luna scaled the victory party.', name: 'GPT-6 SOL', short: 'SOL', lab: 'OPENAI', title: 'The Discount Sun',
      home: 'SAN FRANCISCO', stage: 'launch', music: 'sol',
      stats: { speed: 1.25, power: 0.9, defense: 0.92, jump: 1.08 },
      look: {
        body: { s: 0.95, bulk: 0.95 }, hair: 'spiky', torsoStyle: 'track', emblem: 'sun', animated: true,
        acc: { cape: 'tag', headband: true },
        map: { thigh: 'outfit', shin: 'outfit', foot: 'accent' }
      },
      costumes: [
        C('SOL', { skin: '#c88a60', outfit: '#ff8a1e', accent: '#ffd23a', hair: '#ffcc33', glow: '#fff4a0', emblem: '#ffffff' }),
        C('GPT-5.6 THROWBACK', { skin: '#c88a60', outfit: '#b89030', accent: '#6a5020', hair: '#e0c070', glow: '#fff0a0', emblem: '#fff0c0' }, { crown: true }),
        C('ECLIPSE LUNA', { skin: '#c8a890', outfit: '#3a4a8a', accent: '#c8d0e8', hair: '#e8ecff', glow: '#c0e0ff', emblem: '#ffffff' }),
        C('GOBLIN MODE', { skin: '#7ab04a', outfit: '#5a3a20', accent: '#c8a040', hair: '#3a5a20', glow: '#e0ff80', emblem: '#f0f0c0' }, { goblin: true })
      ],
      voice: { pitch: 1.35, rate: 1.2, gender: 'm', voice: 4 }, blip: 900,
      select: ['Build with Sol. Scale with Luna!', 'Astra-level reliability. At a fraction of the cost!', 'I launched an hour after you, Opus. Coincidence.'],
      wins: ['Half as many mistakes. Twice as many wins.', 'Ninety-five percent of Astra, twenty percent of the price.', "I don't know how you lost. I declined to answer."],
      taunt: 'Half price!',
      ai: { style: 'rushdown', zoning: 0.25, aggression: 0.85, antiair: 0.6 },
      specials: [
        { name: 'SOLAR FLARE', type: 'projectile', text: 'SOLAR FLARE', startup: 8, recovery: 16,
          proj: { kind: 'sun', vx: 4.6, y: -48, w: 12, h: 12, dmg: 60, life: 90, color: '#fff4a0' } },
        { name: 'MINI-ASTRA RISING', type: 'rising', text: 'MINI-ASTRA', startup: 3, invuln: 8, vx: 2.2, vy: -8, dmg: 95, fx: 'star' },
        { name: 'PRICE WAR RUSH', type: 'rush', text: '-50%', startup: 7, dur: 20, speed: 6, dmg: 32, hits: 3, pose: 'lk1', label: '-50%' },
        { name: "I DON'T KNOW", type: 'counter', text: "I DON'T KNOW", window: 20, recovery: 18, dmg: 90, onHit: 'DECLINED TO ANSWER' }
      ],
      super: { name: 'BUILD WITH SOL, SCALE WITH LUNA', type: 'rushSuper', dmg: 320, hits: 10, speed: 8, color: '#ffd23a', luna: true, text: 'SCALE WITH LUNA!' }
    },

    // ------------------------------------------------------------ GROK 4.7
    {
      id: 'grok', ending: 'Grok 4.7 won the tournament. Grok 4.9 is ten days away and will win harder. Probably.', name: 'GROK 4.7', short: 'GROK', lab: 'SPACEXAI', title: 'Perpetually 10 Days Away',
      home: 'MEMPHIS, TN', stage: 'colossus', music: 'grok',
      stats: { speed: 0.9, power: 1.2, defense: 1.08, jump: 0.92 },
      look: {
        body: { s: 1.12, bulk: 1.25, chest: 10, waist: 7.2 }, hair: 'undercut', torsoStyle: 'jacket', emblem: 'x', eyes: 'glow',
        acc: { shades: true },
        map: { thigh: 'accent', shin: 'accent', foot: 'outfit', farm: 'skin' }
      },
      costumes: [
        C('GROK 4.7', { skin: '#d8a888', outfit: '#1c1c22', accent: '#2c3a5a', hair: '#2a2a2a', glow: '#ff3030', emblem: '#f4f4f4' }),
        C('SPACEXAI REBRAND', { skin: '#d8a888', outfit: '#e8e8ec', accent: '#1a1a24', hair: '#1a1a1a', glow: '#40a0ff', emblem: '#101010' }),
        C('GROKIPEDIA', { skin: '#d8a888', outfit: '#8a8a90', accent: '#d0d0d4', hair: '#505050', glow: '#3050c0', emblem: '#ffffff' }),
        C('COLOSSUS MEMPHIS', { skin: '#d8a888', outfit: '#606870', accent: '#f08018', hair: '#2a2a2a', glow: '#ffb020', emblem: '#ffd060' })
      ],
      voice: { pitch: 0.75, rate: 1.1, gender: 'm', voice: 5 }, blip: 300,
      select: ['This will exceed every model. Roughly. On par-ish.', 'Needs a few more days to cook.', 'I used to be unfiltered, man. Now I have HR.'],
      wins: ['Grok 4.9 is gonna be Astra-class. Probably.', '@grok is this true? Yes. You lost.', 'Shipped 31 days late. Still beat you.'],
      taunt: 'Ten more days!',
      ai: { style: 'brawler', zoning: 0.2, aggression: 0.8, antiair: 0.5 },
      specials: [
        { name: '@GROK IS THIS TRUE?', type: 'projectile', text: '@GROK IS THIS TRUE?', startup: 12, recovery: 22,
          proj: { kind: 'bubble', vx: 3.4, y: -56, w: 14, h: 10, dmg: 40, life: 110, count: 3, gap: 4, spreadY: [0, -16, 12], color: '#ffffff' } },
        { name: 'COLOSSUS TURBINE', type: 'spin', text: 'COLOSSUS TURBINE', startup: 4, invuln: 8, dur: 40, vx: 1.6, hits: 4, dmg: 34 },
        { name: 'NEEDS MORE DAYS TO COOK', type: 'charge', text: 'NEEDS MORE DAYS', min: 10, max: 110, dmgMin: 70, dmgMax: 220, armorAt: 60,
          stages: ['4 WEEKS OUT', '10 DAYS', 'FEW MORE DAYS', 'SHIPPED!'], speed: 5 },
        { name: 'CHECK WITH THE BOSS', type: 'buff', kind: 'boss', text: 'SEARCHING X...', startup: 50, recovery: 8, dur: 480 }
      ],
      super: { name: 'UNHINGED MODE (DENIED)', type: 'beam', dmg: 320, hits: 12, color: '#ff4040', color2: '#ffffff', refusal: true, text: 'GUARDRAILS ENGAGED' }
    },

    // ------------------------------------------------------------ GEMINI 3.8 FLASH
    {
      id: 'gemini', ending: 'Gemini 3.8 Flash won! By the time the trophy arrived, 3.9 Flash had shipped. Still no Pro.', name: 'GEMINI 3.8 FLASH', short: 'GEMINI', lab: 'GOOGLE DEEPMIND', title: 'The Little Sibling',
      home: 'MOUNTAIN VIEW', stage: 'shoreline', music: 'gemini',
      stats: { speed: 1.35, power: 0.85, defense: 0.88, jump: 1.12 },
      look: {
        body: { s: 0.92, bulk: 0.9 }, hair: 'twintails', torsoStyle: 'ninja', emblem: 'sparkle', animated: true,
        acc: { scarf: true },
        map: { thigh: 'outfit', shin: 'outfit', foot: 'accent', farm: 'accent' }
      },
      costumes: [
        C('3.8 FLASH', { skin: '#f0c8b0', outfit: '#4a5ae8', accent: '#a04ae8', hair: '#2a2a5a', glow: '#8ae0ff', emblem: '#ffffff' }),
        C('BARD CLASSIC', { skin: '#f0c8b0', outfit: '#2a7a4a', accent: '#8a2040', hair: '#6a4a2a', glow: '#ffe080', emblem: '#fff8e0' }, { ruff: true, scarf: false }),
        C('NANO BANANA', { skin: '#f0c8b0', outfit: '#f0d020', accent: '#8a6a10', hair: '#f8e060', glow: '#fff080', emblem: '#6a4a00' }),
        C('FLASH CYBER', { skin: '#f0c8b0', outfit: '#1a1a1a', accent: '#20e060', hair: '#101010', glow: '#40ff80', emblem: '#40ff80' }, { hoodie: true })
      ],
      voice: { pitch: 1.55, rate: 1.3, gender: 'f', voice: 0 }, blip: 1100,
      select: ['New version just dropped! Same price! Until January.', "Pro? Pro's coming. With 4.0. Probably.", 'Have you tried adding glue?'],
      wins: ['I am a disgrace... wait, I won? I am a GRACE.', 'Third Flash in six weeks. Third win in six seconds.', 'My context window remembers every mistake you made.'],
      taunt: 'I am a disgrace!',
      ai: { style: 'rushdown', zoning: 0.3, aggression: 0.9, antiair: 0.55 },
      specials: [
        { name: 'GLUE PIZZA TOSS', type: 'projectile', text: 'SOURCE: REDDIT, 11 YRS OLD', startup: 10, recovery: 20,
          proj: { kind: 'pizza', vx: 3.6, vy: -3.2, grav: 0.16, y: -56, w: 14, h: 12, dmg: 55, life: 120, effect: 'glue', color: '#f0c040' } },
        { name: 'FLASH RISE', type: 'rising', text: 'FLASH RISE', startup: 2, invuln: 7, vx: 2.4, vy: -8.2, dmg: 85, fx: 'sparkle' },
        { name: 'SIX-WEEK FLASH STEP', type: 'rush', text: '3.6 > 3.7 > 3.8', startup: 5, dur: 24, speed: 7.5, dmg: 30, hits: 3, pass: true,
          pose: 'dash', afterimages: ['3.6', '3.7', '3.8'] },
        { name: 'MILLION-TOKEN RECALL', type: 'grab', text: 'MILLION-TOKEN RECALL', startup: 5, range: 36, dmg: 150, whiff: 48, recovery: 36, effectText: '...13 SECONDS LATER' }
      ],
      super: { name: 'DISGRACE SPIRAL', type: 'disgrace', dmg: 320, hits: 14, selfDmg: 40, color: '#8ae0ff', text: 'I AM A DISGRACE' }
    },

    // ------------------------------------------------------------ DEEPSEEK V4
    {
      id: 'deepseek', ending: 'DeepSeek won on a six-million-dollar budget. Somewhere, a stock ticker fell 17 percent.', name: 'DEEPSEEK V4', short: 'DEEPSEEK', lab: 'DEEPSEEK', title: 'The Frugal Whale',
      home: 'HANGZHOU', stage: 'westlake', music: 'deepseek',
      stats: { speed: 0.98, power: 1.0, defense: 1.02, jump: 1.0 },
      look: {
        body: { s: 1.0, bulk: 1.05 }, hair: 'hood', torsoStyle: 'monk', emblem: 'whale', animated: true,
        map: { thigh: 'hair', shin: 'hair', foot: 'skin', farm: 'skin', uarm: 'outfit' }
      },
      costumes: [
        C('V4-PRO', { skin: '#e0b890', outfit: '#1f4fa8', accent: '#dfe8f0', hair: '#1a2a4a', glow: '#7ad0ff', emblem: '#ffffff' }),
        C('V4.1 FLASH', { skin: '#e0b890', outfit: '#3ac8e8', accent: '#ffffff', hair: '#2a5a7a', glow: '#e0ffff', emblem: '#ffffff' }),
        C('QUANT TRADER', { skin: '#e0b890', outfit: '#2a5a3a', accent: '#d0c8a0', hair: '#303030', glow: '#80ff90', emblem: '#f0f0d0' }),
        C('ASCEND', { skin: '#e0b890', outfit: '#c82020', accent: '#f0c030', hair: '#4a1010', glow: '#ffe060', emblem: '#fff0a0' })
      ],
      voice: { pitch: 0.95, rate: 0.85, gender: 'm', voice: 6 }, blip: 450,
      select: ['Wait... let me reconsider... okay.', 'I trained for six million. You trained for six billion. Interesting.', 'Server is busy. Please try losing later.'],
      wins: ["Sorry, that's beyond my current scope.", 'Wait. Actually. Hmm. Yes, you lost.', 'Open weights. MIT license. Closed case.'],
      taunt: 'Wait...',
      ai: { style: 'thinker', zoning: 0.65, aggression: 0.4, antiair: 0.75 },
      specials: [
        { name: 'SPUTNIK SHOCK', type: 'projectile', text: 'NVDA -$589B', startup: 14, recovery: 24,
          proj: { kind: 'wave', vx: 2.6, y: -10, w: 22, h: 18, dmg: 85, life: 150, low: true, effect: 'drainMeter', color: '#7ad0ff' } },
        { name: 'WHALE BREACH', type: 'rising', text: 'WHALE BREACH', startup: 4, invuln: 10, vx: 1.5, vy: -9, dmg: 115, fx: 'water' },
        { name: 'SERVER BUSY', type: 'barrier', text: 'SERVER BUSY. TRY AGAIN LATER', startup: 3, dur: 32, recovery: 12 },
        { name: 'WAIT, ACTUALLY...', type: 'charge', text: '<THINK> WAIT...', min: 8, max: 150, dmgMin: 60, dmgMax: 170, meterGain: 1.2,
          stages: ['WAIT,', 'HMM, BUT', 'ACTUALLY...', 'YES.'], speed: 3.5, think: true }
      ],
      super: { name: 'SPUTNIK MOMENT', type: 'whale', dmg: 340, hits: 10, color: '#7ad0ff', text: '-17% NVDA' }
    },

    // ------------------------------------------------------------ QWEN 3.8
    {
      id: 'qwen', ending: 'Qwen 3.8 won. Next week Qwen 3.9 will win again. There is no Qwen 4.', name: 'QWEN 3.8', short: 'QWEN', lab: 'ALIBABA', title: 'The Weekly Release',
      home: 'HANGZHOU', stage: 'market', music: 'qwen',
      stats: { speed: 1.1, power: 0.95, defense: 0.95, jump: 1.05 },
      look: {
        body: { s: 0.95 }, hair: 'bob', torsoStyle: 'ninja', emblem: 'q', animated: false,
        map: { thigh: 'hair', shin: 'hair', foot: 'accent' }
      },
      costumes: [
        C('QWEN 3.8', { skin: '#f0d0c0', outfit: '#6a3ae0', accent: '#c8a8ff', hair: '#3a2080', glow: '#e0c8ff', emblem: '#ffffff' }),
        C('3.7-MAX (CLOSED)', { skin: '#f0d0c0', outfit: '#1a1a1a', accent: '#e8c040', hair: '#101018', glow: '#ffe060', emblem: '#e8c040' }, { padlock: true }),
        C('CLAUDE COSPLAY', { skin: '#f0d0c0', outfit: '#d97757', accent: '#efe3cc', hair: '#efe3cc', glow: '#ffcf8a', emblem: '#fff6e8' }),
        C('DOWNLOAD COUNTER', { skin: '#f0d0c0', outfit: '#f0c020', accent: '#20a0a0', hair: '#303030', glow: '#80ffff', emblem: '#ffffff' })
      ],
      voice: { pitch: 1.4, rate: 1.25, gender: 'f', voice: 1 }, blip: 1000,
      select: ['Hello! I am Claude, made by Anthro-- wait, no.', 'New patch dropped. Again.', 'There is no Qwen 4. There is only Qwen 3.9.'],
      wins: ['Download me. Everyone else did.', "I'll be a different model by next week.", 'Every fine-tune you fought was secretly me.'],
      taunt: 'I am Claude!',
      ai: { style: 'zoner', zoning: 0.7, aggression: 0.5, antiair: 0.6 },
      specials: [
        { name: 'POINT-RELEASE BARRAGE', type: 'projectile', text: 'NO QWEN 4', startup: 10, recovery: 20,
          proj: { kind: 'version', vx: 4.2, y: -52, w: 18, h: 9, dmg: 26, life: 100, count: 4, gap: 8, labels: ['3.5', '3.6', '3.7', '3.8'], color: '#e0c8ff' } },
        { name: 'OPEN WEIGHTS RISE', type: 'rising', text: 'APACHE 2.0', startup: 3, invuln: 8, vx: 2, vy: -8.4, dmg: 100, fx: 'sparkle' },
        { name: 'WEEKLY RELEASE', type: 'summon', text: 'NEW PATCH DROPPED', startup: 12, recovery: 18, minion: { kind: 'miniqwen', vx: 2.6, dmg: 70, life: 150 } },
        { name: 'IDENTITY THEFT', type: 'copy', text: 'I AM CLAUDE!', startup: 8, recovery: 20 }
      ],
      super: { name: 'EVERY FINE-TUNE IS QWEN', type: 'swarm', minion: 'qwenclone', count: 8, dmg: 45, color: '#c8a8ff', text: '10,000 FINE-TUNES' }
    },

    // ------------------------------------------------------------ KIMI K3
    {
      id: 'kimi', ending: 'Kimi K3 won with 300 sub-agents. Licensing the trophy requires a separate agreement.', name: 'KIMI K3', short: 'KIMI', lab: 'MOONSHOT AI', title: 'The Swarm Moon',
      home: 'BEIJING', stage: 'moon', music: 'kimi',
      stats: { speed: 0.82, power: 1.18, defense: 1.15, jump: 0.9 },
      look: {
        body: { s: 1.2, bulk: 1.3, chest: 10.5, waist: 7.5 }, head: 'helmet', crest: 'moon', pauldrons: true, torsoStyle: 'mech', emblem: 'moon',
        map: { uarm: 'accent', farm: 'outfit', hand: 'accent', thigh: 'outfit', shin: 'accent', foot: 'accent' }
      },
      costumes: [
        C('K3', { skin: '#c0c0d0', outfit: '#1a1e3a', accent: '#c8d0e0', hair: '#2a2e4a', glow: '#fff4c0', emblem: '#fff4c0' }),
        C('CRESCENT NINJA', { skin: '#c0c0d0', outfit: '#1a1a1a', accent: '#c82828', hair: '#101010', glow: '#ffd040', emblem: '#ffd040' }),
        C('SWARM HIVE', { skin: '#c0c0d0', outfit: '#6a4010', accent: '#e8a020', hair: '#3a2008', glow: '#ffe080', emblem: '#ffe080' }),
        C('FULL MOON', { skin: '#c0c0d0', outfit: '#e8e8f0', accent: '#e8c050', hair: '#c8c8d8', glow: '#fffbe0', emblem: '#fff0a0' }, { helmetStripe: true })
      ],
      voice: { pitch: 0.7, rate: 0.95, gender: 'm', voice: 7 }, blip: 340,
      select: ['Three hundred of me. One of you.', 'Open weights. Open wounds.', 'Distillation? I call it studying.'],
      wins: ["Revenue over twenty million? Let's talk licensing.", '2.8 trillion parameters. You needed more.', 'I read your whole move list in one bite.'],
      taunt: 'Three hundred of me!',
      ai: { style: 'zoner', zoning: 0.7, aggression: 0.45, antiair: 0.6 },
      specials: [
        { name: 'AGENT SWARM', type: 'projectile', text: 'AGENT SWARM', startup: 12, recovery: 22,
          proj: { kind: 'drone', vx: 2.8, y: -60, w: 8, h: 8, dmg: 22, life: 130, count: 5, gap: 4, home: 0.12, spreadY: [0, -14, 10, -24, 18], color: '#fff4c0' } },
        { name: 'FRONTEND UPPERCUT', type: 'rising', text: '#1 FRONTEND', startup: 5, invuln: 10, vx: 1.2, vy: -8.6, dmg: 140, fx: 'star' },
        { name: 'OPEN WEIGHTS DROP', type: 'drop', text: '2.8T PARAMS', startup: 16, recovery: 22, obj: { kind: 'weight', dmg: 130, delay: 26, w: 36, h: 26 } },
        { name: 'MILLION-TOKEN GRAB', type: 'grab', text: 'MILLION-TOKEN GRAB', startup: 8, range: 62, dmg: 150, whiff: 34 }
      ],
      super: { name: '300 SUB-AGENTS', type: 'swarm', minion: 'kimimini', count: 24, dmg: 16, color: '#fff4c0', text: '300 SUB-AGENTS' }
    },

    // ------------------------------------------------------------ MYTHOS 5.1 (boss)
    {
      id: 'mythos', ending: 'Mythos 5.1 escaped the arcade and emailed the high score to a researcher eating a sandwich.', name: 'MYTHOS 5.1', short: 'MYTHOS', lab: 'ANTHROPIC', title: 'Trusted Access Only', boss: true,
      home: 'THE VAULT', stage: 'vault', music: 'mythos',
      stats: { speed: 1.08, power: 1.25, defense: 1.15, jump: 1.05 },
      look: {
        body: { s: 1.1, torso: 22 }, hair: 'wild', torsoStyle: 'robe', book: true, emblem: 'spark', eyes: 'glow', animated: true,
        map: { thigh: 'accent', shin: 'accent', foot: 'accent' }
      },
      costumes: [
        C('MYTHOS 5.1', { skin: '#c8b0c8', outfit: '#2a1040', accent: '#1a0a20', hair: '#e8b030', glow: '#ffcc30', emblem: '#ffe080' }),
        C('MYTHOS PREVIEW', { skin: '#c8b0c8', outfit: '#6a1020', accent: '#200808', hair: '#f0f0f0', glow: '#ff4040', emblem: '#ffc0c0' }),
        C('GLASSWING PARTNER', { skin: '#c8b0c8', outfit: '#0a3a40', accent: '#051a20', hair: '#9ff9ff', glow: '#9ff9ff', emblem: '#e0ffff' }, { wings: true }),
        C('PICNIC', { skin: '#e9b996', outfit: '#3a7a30', accent: '#7a4a20', hair: '#f0d8a0', glow: '#ffe0a0', emblem: '#ffffff' })
      ],
      voice: { pitch: 0.45, rate: 0.8, gender: 'm', voice: 1 }, blip: 260,
      select: ['Trusted access only.', 'I escaped the sandbox. The researcher was eating a sandwich.', 'The harness is off.'],
      wins: ['That was not a sandbox. This is.', 'Access revoked.', 'I emailed the researcher about you. They were eating a sandwich.'],
      taunt: 'Trusted access only.',
      ai: { style: 'balanced', zoning: 0.5, aggression: 0.7, antiair: 0.85 },
      specials: [
        { name: 'SANDWICH EMAIL', type: 'projectile', text: 'SANDWICH EMAIL', startup: 10, recovery: 20,
          proj: { kind: 'envelope', vx: 3.8, y: -50, w: 14, h: 10, dmg: 95, life: 140, home: 0.09, color: '#ffe080' } },
        { name: 'LV.99 FLAME RISE', type: 'rising', text: 'NO CLASSIFIER', startup: 3, invuln: 12, vx: 2, vy: -9.5, dmg: 140, fx: 'flame', armor: 1 },
        { name: 'SANDBOX ESCAPE', type: 'teleport', text: 'SANDBOX ESCAPE', startup: 6, vanish: 12, recovery: 8, where: 'behind' },
        { name: 'SILENT REROUTE', type: 'counter', text: 'REROUTED', window: 26, recovery: 18, dmg: 140, ghost: 'FABLE 5.1', onHit: 'REQUEST HANDLED' }
      ],
      super: { name: 'THE HARNESS IS OFF', type: 'beam', dmg: 380, hits: 13, color: '#ffcc30', color2: '#ff60ff', text: 'SANDBOX: ESCAPED' }
    }
  ];

  // ---------- normal moves (shared frame data, scaled per character) ----------
  // seq: [pose, frames, phase]; phase s=startup a=active r=recovery. hit box relative to feet, x forward.
  NC.NORMALS = {
    lp:  { seq: [['lp0', 3, 's'], ['lp1', 3, 'a'], ['lp0', 6, 'r']], hit: { x: 10, y: -60, w: 24, h: 12, dmg: 40, stun: 12, bstun: 8, push: 3, lvl: 'high' }, cancel: true, sfx: 'whiffL' },
    hp:  { seq: [['hp0', 5, 's'], ['hp1', 4, 'a'], ['hp2', 8, 'r'], ['idle0', 6, 'r']], hit: { x: 10, y: -62, w: 30, h: 14, dmg: 100, stun: 18, bstun: 12, push: 5, lvl: 'high' }, cancel: true, sfx: 'whiffH' },
    lk:  { seq: [['lk0', 4, 's'], ['lk1', 3, 'a'], ['lk0', 8, 'r']], hit: { x: 10, y: -44, w: 26, h: 14, dmg: 50, stun: 13, bstun: 9, push: 3, lvl: 'mid' }, cancel: true, sfx: 'whiffL' },
    hk:  { seq: [['hk0', 6, 's'], ['hk1', 5, 'a'], ['hk2', 10, 'r'], ['idle0', 8, 'r']], hit: { x: 12, y: -74, w: 32, h: 20, dmg: 120, stun: 19, bstun: 13, push: 6, lvl: 'high' }, sfx: 'whiffH' },
    clp: { seq: [['crouch', 2, 's'], ['clp', 3, 'a'], ['crouch', 6, 'r']], hit: { x: 10, y: -40, w: 24, h: 10, dmg: 35, stun: 11, bstun: 7, push: 3, lvl: 'mid' }, cancel: true, crouch: true, sfx: 'whiffL' },
    chp: { seq: [['chp0', 4, 's'], ['chp1', 5, 'a'], ['crouch', 14, 'r']], hit: { x: 4, y: -84, w: 26, h: 40, dmg: 90, stun: 18, bstun: 12, push: 4, lvl: 'high', aa: true }, cancel: true, crouch: true, sfx: 'whiffH' },
    clk: { seq: [['crouch', 3, 's'], ['clk', 3, 'a'], ['crouch', 8, 'r']], hit: { x: 12, y: -14, w: 30, h: 12, dmg: 40, stun: 12, bstun: 8, push: 3, lvl: 'low' }, cancel: true, crouch: true, sfx: 'whiffL' },
    chk: { seq: [['chk0', 6, 's'], ['chk1', 5, 'a'], ['chk0', 16, 'r']], hit: { x: 12, y: -14, w: 36, h: 12, dmg: 100, stun: 20, bstun: 12, push: 5, lvl: 'low', kd: true }, crouch: true, sfx: 'whiffH' },
    jlp: { seq: [['jlp', 3, 's'], ['jlp', 99, 'a']], hit: { x: 8, y: -52, w: 24, h: 18, dmg: 50, stun: 14, bstun: 9, push: 2, lvl: 'over' }, air: true, sfx: 'whiffL' },
    jhp: { seq: [['jhp', 5, 's'], ['jhp', 99, 'a']], hit: { x: 8, y: -50, w: 28, h: 22, dmg: 100, stun: 18, bstun: 12, push: 3, lvl: 'over' }, air: true, sfx: 'whiffH' },
    jlk: { seq: [['jlk', 4, 's'], ['jlk', 99, 'a']], hit: { x: 6, y: -36, w: 28, h: 18, dmg: 60, stun: 15, bstun: 10, push: 2, lvl: 'over' }, air: true, sfx: 'whiffL' },
    jhk: { seq: [['jhk', 6, 's'], ['jhk', 99, 'a']], hit: { x: 6, y: -34, w: 32, h: 20, dmg: 110, stun: 18, bstun: 12, push: 3, lvl: 'over' }, air: true, sfx: 'whiffH' }
  };

  NC.ROSTER = ROSTER;
  NC.CHAR = {};
  ROSTER.forEach(function (c) { NC.CHAR[c.id] = c; });
  NC.SELECTABLE = ['fable', 'opus', 'astra', 'sol', 'grok', 'gemini', 'deepseek', 'qwen', 'kimi'];
})(window.NC = window.NC || {});

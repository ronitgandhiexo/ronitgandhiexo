#!/usr/bin/env node
// Commit Dragon: every day you contribute on GitHub feeds your dragon.
// It hatches, grows up, becomes legendary, then starts laying eggs.
const fs = require('fs');
const path = require('path');

const STAGES = [
  { days: 0,   name: 'Mystery egg' },
  { days: 10,  name: 'Cracking egg' },
  { days: 25,  name: 'Hatchling' },
  { days: 50,  name: 'Baby dragon' },
  { days: 100, name: 'Young dragon' },
  { days: 200, name: 'Adult dragon' },
  { days: 365, name: 'Elder dragon' },
  { days: 500, name: 'Legendary dragon' },
];
const EGG_EVERY = 100; // after legendary, one new egg per this many build days

// ---------- GitHub data ----------
async function gql(query, variables, token) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors || !json.data) throw new Error(JSON.stringify(json.errors || json));
  return json.data;
}

async function fetchDays(login, token) {
  const { user } = await gql(`query($l:String!){user(login:$l){createdAt}}`, { l: login }, token);
  const days = new Map();
  const now = new Date();
  let from = new Date(user.createdAt);
  while (from < now) {
    let to = new Date(from.getTime() + 364 * 864e5); // API caps ranges at 1 year
    if (to > now) to = now;
    const d = await gql(
      `query($l:String!,$f:DateTime!,$t:DateTime!){user(login:$l){contributionsCollection(from:$f,to:$t){
        contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`,
      { l: login, f: from.toISOString(), t: to.toISOString() }, token);
    for (const w of d.user.contributionsCollection.contributionCalendar.weeks)
      for (const day of w.contributionDays)
        days.set(day.date, Math.max(days.get(day.date) || 0, day.contributionCount));
    from = to;
  }
  return days;
}

function computeStats(days) {
  const iso = (d) => d.toISOString().slice(0, 10);
  const total = [...days.values()].filter((c) => c > 0).length;
  const today = new Date();
  const yesterday = new Date(today.getTime() - 864e5);
  const active = days.get(iso(today)) > 0 || days.get(iso(yesterday)) > 0;
  let streak = 0;
  const cur = new Date(today);
  if (!(days.get(iso(cur)) > 0)) cur.setUTCDate(cur.getUTCDate() - 1);
  while (days.get(iso(cur)) > 0) { streak++; cur.setUTCDate(cur.getUTCDate() - 1); }
  return { total, streak, active };
}

// ---------- Drawing helpers ----------
const W = 800, H = 240, G = 196, X = 270; // G = ground line, X = where the dragon stands
const FONT = `font-family="'Trebuchet MS','Segoe UI',Verdana,sans-serif"`;
const loop = (attr, values, dur, extra = '') =>
  `<animateTransform attributeName="transform" type="${attr}" values="${values}" dur="${dur}" repeatCount="indefinite" ${extra}/>`;

const eggPath = (w, h) => `M0,${-h} C${w * .95},${-h} ${w * 1.08},0 0,0 C${-w * 1.08},0 ${-w * .95},${-h} 0,${-h}Z`;
function egg(w, h, base, spot, clip = '', spotOp = 1) {
  const spots = [[-.3, -.35, .14], [.28, -.58, .1], [.12, -.22, .08], [-.12, -.74, .08], [.3, -.2, .06]]
    .map(([sx, sy, sr]) => `<circle cx="${sx * w}" cy="${sy * h}" r="${sr * w}" fill="${spot}" fill-opacity="${spotOp}"/>`).join('');
  return `<g ${clip}><path d="${eggPath(w, h)}" fill="${base}" stroke="#000" stroke-opacity=".15" stroke-width="2"/>${spots}
    <ellipse cx="${-.28 * w}" cy="${-.68 * h}" rx="${.09 * w}" ry="${.16 * h}" fill="#fff" opacity=".45"/></g>`;
}
const nestBack = (w) => `<ellipse cx="0" cy="-6" rx="${w}" ry="12" fill="#5a391d"/>`;
function nestFront(w) {
  let s = `<path d="M${-w},-8 Q0,10 ${w},-8 L${w - 4},0 Q0,16 ${-w + 4},0Z" fill="#7a4e2d"/>`;
  for (let x = -w + 6; x < w - 6; x += 11)
    s += `<path d="M${x},-4 L${x + 13},${x % 2 ? 3 : -8}" stroke="#a0703f" stroke-width="2.5" stroke-linecap="round"/>`;
  return s;
}
const zzz = (x, y) => [0, 1, 2].map((i) =>
  `<text x="${x}" y="${y}" font-size="${11 + i * 3}" fill="#dfe6ff" opacity="0" font-weight="bold" ${FONT}>z
    <animate attributeName="y" from="${y}" to="${y - 30}" dur="3s" begin="${i}s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;0" dur="3s" begin="${i}s" repeatCount="indefinite"/></text>`).join('');

// ---------- Dragon ----------
const LOOK = {
  2: { body: '#7ad6a0', dark: '#4ea878', belly: '#f6ecb8', wing: '#b5eccb', horn: '#f6ecb8', baby: true },
  3: { s: .5, body: '#5cc98a', dark: '#3e9e69', belly: '#f3e6a1', wing: '#a6e8c0', horn: '#f3e6a1', baby: true, wingS: .6, bounce: true },
  4: { s: .6,  body: '#3fae7a', dark: '#2c7f58', belly: '#efdc8e', wing: '#86d4ab', horn: '#efdc8e', horns: true, wingS: .8 },
  5: { s: .8,  body: '#2f8f6a', dark: '#1f6049', belly: '#e9d27a', wing: '#5bbd92', horn: '#e9d27a', horns: true, spikes: true, wingS: 1, smoke: true },
  6: { s: .95, body: '#b83a3a', dark: '#6e1f1f', belly: '#f2c14e', wing: '#e0705f', horn: '#f6e7c1', horns: true, spikes: true, wingS: 1.1,
       fire: ['#ff7a1a', '#ffc53d', '#fff3b0'] },
  7: { s: 1.02, body: '#5b2a86', dark: '#2f1648', belly: '#f2c14e', wing: '#a46ad6', horn: '#ffd34d', horns: true, spikes: true, wingS: 1.2,
       fire: ['#9b5cff', '#6fd3ff', '#e8fbff'], aura: true, hover: true },
};

function head(L, active) {
  let s = `<ellipse cx="-50" cy="-116" rx="21" ry="16" fill="${L.body}"/>
    <path d="M-58,-128 L-90,-119 Q-101,-114 -97,-104 L-60,-100Z" fill="${L.body}"/>
    <path d="M-95,-107 L-64,-106" stroke="${L.dark}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="-89" cy="-114" r="2" fill="${L.dark}"/>`;
  if (L.horns) s += `<polygon points="-40,-128 -16,-150 -31,-122" fill="${L.horn}"/><polygon points="-33,-120 -6,-134 -30,-112" fill="${L.horn}"/>`;
  else s += `<circle cx="-36" cy="-129" r="4" fill="${L.horn}"/>`;
  if (!active) s += `<path d="M-61,-117 Q-54,-112 -47,-117" stroke="${L.dark}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  else if (L.baby) s += `<circle cx="-54" cy="-118" r="8" fill="#fff"/><circle cx="-56" cy="-118" r="5" fill="#1b1b1b"/><circle cx="-58" cy="-120.5" r="1.8" fill="#fff"/>`;
  else s += `<circle cx="-54" cy="-118" r="5.5" fill="#ffd34d"/><ellipse cx="-55" cy="-118" rx="1.6" ry="4.4" fill="#1b1b1b"/>
    <path d="M-66,-128 L-44,-125" stroke="${L.dark}" stroke-width="3.5" stroke-linecap="round"/>`;
  return s;
}

function dragon(L, active) {
  const wingD = 'M10,-62 L30,-150 L52,-128 L78,-148 L88,-108 L112,-118 L100,-72 C70,-80 40,-70 10,-62Z';
  const bones = 'M10,-62 L30,-150 M10,-62 L78,-148 M10,-62 L112,-118';
  const wing = (fill, rot) => {
    const inner = `<g transform="translate(10 -62) scale(${L.wingS}) translate(-10 62)">
      <path d="${wingD}" fill="${fill}" stroke="${L.dark}" stroke-width="2" stroke-linejoin="round"/>
      <path d="${bones}" stroke="${L.dark}" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>`;
    const anim = active ? loop('rotate', `${rot} 10 -62;${rot + 30} 10 -62;${rot} 10 -62`, L.hover ? '0.9s' : '1.5s') : '';
    return `<g transform="rotate(${active ? rot : rot + 38} 10 -62)">${anim}${inner}</g>`;
  };
  const legs = (c, o) => `<rect x="${30 + o}" y="-32" width="20" height="32" rx="8" fill="${c}"/><rect x="${24 + o}" y="-7" width="28" height="7" rx="3.5" fill="${c}"/>
    <rect x="${-22 + o}" y="-30" width="16" height="30" rx="7" fill="${c}"/><rect x="${-30 + o}" y="-7" width="24" height="7" rx="3.5" fill="${c}"/>`;

  let s = '';
  if (L.aura && active) s += `<ellipse cx="30" cy="-85" rx="135" ry="95" fill="url(#aura)"><animate attributeName="opacity" values=".6;1;.6" dur="2.4s" repeatCount="indefinite"/></ellipse>`;
  s += wing(L.dark, -18) + legs(L.dark, 12);
  s += `<path d="M50,-42 C90,-47 110,-22 140,-32 C160,-39 165,-57 175,-62 L180,-52 C172,-42 165,-22 140,-18 C110,-10 85,-25 50,-24Z" fill="${L.body}"/>
    <polygon points="170,-70 194,-66 181,-46" fill="${L.wing}" stroke="${L.dark}" stroke-width="1.5"/>`;
  if (L.spikes) s += [[-29, -100], [-18, -85], [-2, -73], [15, -73], [32, -71], [48, -65], [68, -43], [98, -35], [125, -32], [158, -48]]
    .map(([x, y]) => `<polygon points="${x - 6},${y + 3} ${x},${y - 11} ${x + 6},${y + 3}" fill="${L.horn}"/>`).join('');
  s += `<ellipse cx="15" cy="-45" rx="48" ry="28" fill="${L.body}"/>
    <path d="M-28,-55 C-45,-75 -52,-95 -58,-108 L-36,-118 C-30,-98 -18,-80 10,-68Z" fill="${L.body}"/>
    <ellipse cx="4" cy="-35" rx="36" ry="16" fill="${L.belly}"/>
    <path d="M-22,-42 Q4,-36 30,-42 M-24,-32 Q4,-26 32,-32" stroke="${L.dark}" stroke-opacity=".25" stroke-width="2" fill="none"/>
    <path d="M-52,-100 Q-44,-80 -30,-62" stroke="${L.belly}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  s += legs(L.body, 0) + head(L, active) + wing(L.wing, 0);

  if (active && L.fire) {
    const [a, b, c] = L.fire;
    s += `<g transform="translate(-99 -108)"><g transform="scale(0)">
      ${loop('scale', '0 0;1 1;.85 .9;1 1;0 0;0 0', '3s', 'keyTimes="0;.12;.3;.5;.6;1"')}
      <path d="M0,0 C-30,-24 -70,-22 -118,-6 C-80,6 -40,20 0,4Z" fill="${a}"/>
      <path d="M0,1 C-25,-13 -55,-11 -88,-2 C-55,7 -28,13 0,3Z" fill="${b}"/>
      <path d="M0,1 C-15,-5 -30,-4 -48,0 C-30,4 -15,6 0,2Z" fill="${c}"/></g></g>`;
  }
  if (active && L.smoke) s += [0, 1].map((i) =>
    `<circle cx="-92" cy="-116" r="4" fill="#d9d9d9" opacity="0">
      <animate attributeName="cy" from="-116" to="-150" dur="2.4s" begin="${i * 1.2}s" repeatCount="indefinite"/>
      <animate attributeName="cx" from="-92" to="-108" dur="2.4s" begin="${i * 1.2}s" repeatCount="indefinite"/>
      <animate attributeName="r" from="3" to="9" dur="2.4s" begin="${i * 1.2}s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;.8;0" dur="2.4s" begin="${i * 1.2}s" repeatCount="indefinite"/></circle>`).join('');

  let motion = '';
  if (active && L.hover) motion = loop('translate', '0 0;0 -14;0 0', '2.4s');
  if (active && L.bounce) motion = loop('translate', '0 0;0 -16;0 0;0 0', '1.3s', 'keyTimes="0;.2;.4;1"');
  const shadow = `<ellipse cx="${X + 20 * L.s}" cy="${G + 1}" rx="${70 * L.s}" ry="5" fill="#000" opacity=".18"/>`;
  return shadow + `<g transform="translate(${X} ${G}) scale(${L.s})"><g>${motion}${s}</g></g>` +
    (active ? '' : zzz(X - 30 * L.s, G - 145 * L.s));
}

// ---------- Egg and hatchling stages ----------
function eggStage(lvl, active) {
  const wobble = active ? loop('rotate', lvl ? '0;-7;7;-4;0;0' : '0;-4;4;0;0;0', lvl ? '1.4s' : '2.6s') : '';
  let e = egg(40, 84, '#efe3c2', '#c9a36b');
  if (lvl === 1) e += `<path d="M-24,-44 L-13,-52 L-5,-41 L6,-54 L15,-43 L25,-50" stroke="#3b2a1a" stroke-width="3" fill="none" stroke-linejoin="round"/>
    <path d="M-24,-44 L-13,-52 L-5,-41 L6,-54 L15,-43 L25,-50" stroke="#ffd34d" stroke-width="1.2" fill="none">
      <animate attributeName="opacity" values=".2;1;.2" dur="1.4s" repeatCount="indefinite"/></path>`;
  return `<g transform="translate(${X} ${G})">${nestBack(62)}<g>${wobble}${e}</g>${nestFront(62)}</g>` +
    (active ? '' : zzz(X + 30, G - 96));
}

function hatchStage(active) {
  const L = LOOK[2];
  const low = 'M-60,10 L-60,-40 L-44,-40 L-30,-49 L-18,-38 L-6,-51 L6,-38 L18,-49 L30,-38 L44,-40 L60,-40 L60,10Z';
  const high = 'M-60,-100 L60,-100 L60,-40 L44,-40 L30,-38 L18,-49 L6,-38 L-6,-51 L-18,-38 L-30,-49 L-44,-40 L-60,-40Z';
  const wiggle = active ? loop('rotate', '0 0 -30;-8 0 -30;6 0 -30;0 0 -30', '2s') : '';
  return `<g transform="translate(${X} ${G})">${nestBack(62)}
    <clipPath id="shellLow"><path d="${low}"/></clipPath><clipPath id="shellHigh"><path d="${high}"/></clipPath>
    <g>${wiggle}
      <rect x="-12" y="-84" width="22" height="64" rx="10" fill="${L.body}"/>
      <g transform="translate(29 1) scale(.7)">${head(L, active)}</g>
      <g transform="translate(-2 -92) rotate(-14) scale(.62) translate(0 40)">${egg(40, 84, '#efe3c2', '#c9a36b', 'clip-path="url(#shellHigh)"')}</g>
    </g>
    ${egg(40, 84, '#efe3c2', '#c9a36b', 'clip-path="url(#shellLow)"')}${nestFront(62)}</g>` +
    (active ? '' : zzz(X + 10, G - 96));
}

// ---------- Nest of new eggs (after legendary) ----------
function eggNest(count, active) {
  if (count < 1) return '';
  const colors = ['#f2c14e', '#6fc3df', '#e5484d', '#9b59d0', '#5cc98a'];
  const shown = Math.min(count, 5);
  let eggs = '';
  for (let i = 0; i < shown; i++) {
    const x = (i - (shown - 1) / 2) * 21;
    const newest = i === shown - 1 && active ? loop('rotate', '0;-8;8;0;0', '1.6s') : '';
    eggs += `<g transform="translate(${x} 0)"><g>${newest}${egg(15, 36, colors[i % 5], '#ffffff', '', .45)}</g></g>`;
  }
  const more = count > 5 ? `<text x="0" y="24" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff" ${FONT}>+${count - 5} more</text>` : '';
  return `<g transform="translate(520 ${G})">${nestBack(58)}${eggs}${nestFront(58)}${more}</g>`;
}

// ---------- Scene ----------
function render({ login = 'you', total = 0, streak = 0, active = true }) {
  let lvl = 0;
  STAGES.forEach((S, i) => { if (total >= S.days) lvl = i; });
  const cur = STAGES[lvl], next = STAGES[lvl + 1];
  const legendary = lvl === STAGES.length - 1;
  const eggs = legendary ? Math.floor((total - cur.days) / EGG_EVERY) : 0;

  let pct, nextText, badge = '';
  if (!legendary) {
    pct = (total - cur.days) / (next.days - cur.days);
    nextText = `${next.days - total} more days to ${next.name.toLowerCase()}`;
    if (lvl > 0 && total - cur.days < 3) badge = 'Evolved!';
  } else {
    const into = (total - cur.days) % EGG_EVERY;
    pct = into / EGG_EVERY;
    nextText = `${EGG_EVERY - into} more days to egg #${eggs + 1}`;
    if (total - cur.days < 3) badge = 'Evolved!';
    else if (eggs > 0 && into < 3) badge = 'New egg!';
  }

  const day = active;
  const sky = day ? ['#78c6f7', '#d6f0ff'] : ['#161a36', '#3a3f6e'];
  const defs = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
    <radialGradient id="aura"><stop offset="0" stop-color="#ffd34d" stop-opacity=".55"/><stop offset=".6" stop-color="#b56cff" stop-opacity=".25"/><stop offset="1" stop-color="#b56cff" stop-opacity="0"/></radialGradient>
    <clipPath id="frame"><rect width="${W}" height="${H}" rx="12"/></clipPath></defs>`;

  let scene = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  if (day) {
    scene += `<circle cx="60" cy="44" r="20" fill="#ffe27a"/><circle cx="60" cy="44" r="28" fill="#ffe27a" opacity=".25"/>`;
  } else {
    scene += `<circle cx="60" cy="44" r="17" fill="#f4f1d0"/><circle cx="68" cy="38" r="15" fill="${sky[0]}"/>` +
      [[140, 28], [220, 60], [470, 20], [520, 70], [720, 150], [380, 34], [30, 110], [110, 90]].map(([cx, cy], i) =>
        `<circle cx="${cx}" cy="${cy}" r="1.6" fill="#fff"><animate attributeName="opacity" values="1;.2;1" dur="${2 + (i % 3)}s" repeatCount="indefinite"/></circle>`).join('');
  }
  const [m1, m2] = day ? ['#a9cfe8', '#8dbcd9'] : ['#262b52', '#1f2446'];
  scene += `<polygon points="0,${G} 0,130 90,86 170,140 260,70 360,132 450,78 560,140 660,92 800,150 800,${G}" fill="${m1}"/>
    <polygon points="0,${G} 0,160 120,130 230,112 330,150 470,108 600,160 720,124 800,146 800,${G}" fill="${m2}"/>`;
  scene += `<rect y="${G}" width="${W}" height="${H - G}" fill="${day ? '#5fb34a' : '#2f6b3a'}"/>
    <rect y="${G}" width="${W}" height="5" fill="${day ? '#78c850' : '#3b8048'}"/>
    <rect y="${G + 22}" width="${W}" height="${H - G - 22}" fill="${day ? '#8b5a2b' : '#4e3520'}"/>`;

  if (lvl <= 1) scene += eggStage(lvl, active);
  else if (lvl === 2) scene += hatchStage(active);
  else scene += dragon(LOOK[lvl], active);
  scene += eggNest(eggs, active);

  // Stats card
  const cx = 554, cy = 14, cw = 232, barW = cw - 28;
  const extras = active ? `${streak}-day streak` : 'dragon asleep';
  let hud = `<rect x="${cx}" y="${cy}" width="${cw}" height="104" rx="10" fill="#10131f" opacity=".82"/>
    <text x="${cx + 14}" y="${cy + 22}" font-size="11" fill="#9aa4c7" ${FONT}>@${login}'s dragon</text>
    <text x="${cx + 14}" y="${cy + 44}" font-size="${cur.name.length > 14 ? 15 : 17}" font-weight="bold" fill="#fff" ${FONT}>Lv ${lvl}  ${cur.name}</text>
    <text x="${cx + 14}" y="${cy + 62}" font-size="11" fill="#dfe6ff" ${FONT}>${total} days fed, ${extras}${eggs ? `, ${eggs} egg${eggs > 1 ? 's' : ''}` : ''}</text>
    <rect x="${cx + 14}" y="${cy + 70}" width="${barW}" height="9" rx="4" fill="#2a3150"/>
    <rect x="${cx + 14}" y="${cy + 70}" width="${Math.max(6, Math.round(barW * pct))}" height="9" rx="4" fill="${legendary ? '#b56cff' : '#f2c14e'}"/>
    <text x="${cx + 14}" y="${cy + 94}" font-size="10.5" fill="#9aa4c7" ${FONT}>${nextText}</text>`;
  if (badge) hud += `<g><rect x="${cx + cw - 76}" y="${cy + 9}" width="64" height="18" rx="9" fill="#e5484d"/>
    <text x="${cx + cw - 44}" y="${cy + 22}" font-size="10" font-weight="bold" fill="#fff" text-anchor="middle" ${FONT}>${badge}</text>
    <animate attributeName="opacity" values="1;.4;1" dur="1.2s" repeatCount="indefinite"/></g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${login}'s dragon: level ${lvl} ${cur.name}, ${total} days fed">${defs}<g clip-path="url(#frame)">${scene}${hud}</g></svg>`;
}

// ---------- CLI ----------
async function main() {
  const args = process.argv.slice(2);
  const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const out = arg('--out', 'dist/dragon.svg');

  if (args.includes('--demo')) {
    const demos = [
      [4, 0, true, 'Level 0: mystery egg (starts at 0 days)'],
      [12, 3, true, 'Level 1: cracking egg (10 days)'],
      [27, 5, true, 'Level 2: hatchling (25 days)'],
      [52, 6, true, 'Level 3: baby dragon (50 days)'],
      [102, 9, true, 'Level 4: young dragon (100 days)'],
      [203, 12, true, 'Level 5: adult dragon (200 days)'],
      [367, 18, true, 'Level 6: elder dragon (365 days)'],
      [502, 21, true, 'Level 7: legendary dragon (500 days)'],
      [812, 40, true, 'Past legendary: a new egg every 100 days'],
      [230, 0, false, 'Missed a day? Your dragon falls asleep until you come back'],
    ];
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Commit Dragon stages</title>
<style>:root{--bg:#f3efe6;--fg:#1d1f2b;--mut:#5b6075}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#12141f;--fg:#eef0fa;--mut:#9aa4c7}}:root[data-theme="dark"]{--bg:#12141f;--fg:#eef0fa;--mut:#9aa4c7}
body{margin:0;background:var(--bg);color:var(--fg);font-family:'Trebuchet MS','Segoe UI',Verdana,sans-serif}main{max-width:840px;margin:auto;padding:24px 16px}
h1{font-size:1.6rem;margin:0 0 4px}p{color:var(--mut);margin:0 0 20px;line-height:1.5}figure{margin:0 0 22px}svg{width:100%;height:auto;display:block}figcaption{color:var(--mut);font-size:.85rem;margin-top:6px}</style>
<main><h1>Commit Dragon</h1><p>Every day you contribute on GitHub feeds your dragon. It hatches, grows, turns legendary at 500 days, then lays a new egg every 100 days after that.</p>
${demos.map(([total, streak, active, cap]) => `<figure>${render({ login: 'demo', total, streak, active })}<figcaption>${cap}</figcaption></figure>`).join('')}</main>`;
    fs.writeFileSync(arg('--out', 'preview.html'), html);
    return;
  }

  let stats;
  if (args.includes('--days')) {
    stats = { total: +arg('--days'), streak: +arg('--streak', 0), active: !args.includes('--idle') };
  } else {
    const login = process.env.GITHUB_USER, token = process.env.GITHUB_TOKEN;
    if (!login || !token) throw new Error('Set GITHUB_USER and GITHUB_TOKEN');
    stats = computeStats(await fetchDays(login, token));
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, render({ login: process.env.GITHUB_USER || 'you', ...stats }));
  console.log(`Wrote ${out}:`, stats);
}

main().catch((e) => { console.error(e); process.exit(1); });

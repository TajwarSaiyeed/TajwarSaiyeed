import fs from 'node:fs/promises';
import path from 'node:path';

const USERNAME = 'TajwarSaiyeed';
const GH_TOKEN = process.env.GH_TOKEN;
const OUT_DIR = 'assets';
const OUT_PATH = path.join(OUT_DIR, 'terminal.svg');

function escapeXml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function makeBar(value, total, length = 12) {
  if (total <= 0 || value <= 0) return '░'.repeat(length);
  const filled = Math.min(length, Math.max(0, Math.round((value / total) * length)));
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

const currentYear = new Date().getFullYear();
const yearQueries = [];
for (let y = 2022; y <= currentYear; y++) {
  yearQueries.push(`
    year_${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  `);
}

const ghQuery = `
query($username: String!) {
  user(login: $username) {
    followers {
      totalCount
    }
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100) {
      nodes {
        stargazerCount
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges {
            size
            node {
              name
              color
            }
          }
        }
      }
    }
    currentCollection: contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            weekday
            contributionCount
            color
          }
        }
      }
    }
    thisYearCollection: contributionsCollection(from: "${currentYear}-01-01T00:00:00Z", to: "${currentYear}-12-31T23:59:59Z") {
      totalCommitContributions
      totalPullRequestContributions
    }
    ${yearQueries.join('\n')}
  }
}
`;

const ghRes = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Node',
    ...(GH_TOKEN ? { Authorization: `bearer ${GH_TOKEN}` } : {})
  },
  body: JSON.stringify({
    query: ghQuery,
    variables: { username: USERNAME }
  })
});

if (!ghRes.ok) {
  throw new Error(`GitHub GraphQL API request failed: ${ghRes.status} ${ghRes.statusText}`);
}

const ghJson = await ghRes.json();
if (ghJson.errors && !ghJson.data?.user) {
  throw new Error(`GitHub GraphQL Error: ${JSON.stringify(ghJson.errors)}`);
}

const user = ghJson.data?.user || {};
const repos = user.repositories?.nodes || [];
const totalStars = repos.reduce((sum, r) => sum + (r.stargazerCount || 0), 0);

const langMap = new Map();
for (const repo of repos) {
  for (const edge of repo.languages?.edges || []) {
    const name = edge.node?.name;
    if (!name) continue;
    const color = edge.node.color || '#3fb950';
    const size = edge.size || 0;
    if (langMap.has(name)) {
      langMap.get(name).size += size;
    } else {
      langMap.set(name, { name, color, size });
    }
  }
}

const totalLangBytes = Array.from(langMap.values()).reduce((sum, l) => sum + l.size, 0);
const top5Languages = Array.from(langMap.values())
  .sort((a, b) => b.size - a.size)
  .slice(0, 5)
  .map(l => ({
    name: l.name,
    color: l.color,
    percentage: totalLangBytes > 0 ? (l.size / totalLangBytes) * 100 : 0
  }));

let totalAllTimeContributions = 0;
const dayMap = new Map();
for (let y = 2022; y <= currentYear; y++) {
  const col = user[`year_${y}`];
  if (col?.contributionCalendar) {
    totalAllTimeContributions += col.contributionCalendar.totalContributions || 0;
    for (const week of col.contributionCalendar.weeks || []) {
      for (const day of week.contributionDays || []) {
        dayMap.set(day.date, (dayMap.get(day.date) || 0) + (day.contributionCount || 0));
      }
    }
  }
}

const sortedDays = Array.from(dayMap.entries())
  .map(([date, count]) => ({ date, count }))
  .filter((d) => d.date <= new Date().toISOString().slice(0, 10))
  .sort((a, b) => a.date.localeCompare(b.date));

let longestStreak = 0;
let currentRun = 0;
for (const day of sortedDays) {
  if (day.count > 0) {
    currentRun++;
    if (currentRun > longestStreak) longestStreak = currentRun;
  } else {
    currentRun = 0;
  }
}

let currentStreak = 0;
let idx = sortedDays.length - 1;
const todayStr = new Date().toISOString().slice(0, 10);
if (idx >= 0 && sortedDays[idx].date === todayStr && sortedDays[idx].count === 0) {
  idx--;
}
while (idx >= 0 && sortedDays[idx].count > 0) {
  currentStreak++;
  idx--;
}

const commitsThisYear = user.thisYearCollection?.totalCommitContributions || 0;

const currentCalendar = user.currentCollection?.contributionCalendar;
const totalContribsLastYear = currentCalendar?.totalContributions || 0;
const calendarWeeks = currentCalendar?.weeks || [];
const weeks = calendarWeeks.slice(-53);

let leetCodeData = null;
try {
  const lcRes = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0'
    },
    body: JSON.stringify({
      query: `query getUserProfile($username: String!) {
        matchedUser(username: $username) {
          submitStats {
            acSubmissionNum {
              difficulty
              count
            }
          }
          profile {
            ranking
          }
        }
        allQuestionsCount {
          difficulty
          count
        }
      }`,
      variables: { username: USERNAME }
    })
  });

  if (lcRes.ok) {
    const lcJson = await lcRes.json();
    if (lcJson.data?.matchedUser) {
      const matched = lcJson.data.matchedUser;
      const acList = matched.submitStats?.acSubmissionNum || [];
      const allList = lcJson.data.allQuestionsCount || [];
      const getAc = (diff) => acList.find(d => d.difficulty.toLowerCase() === diff.toLowerCase())?.count || 0;
      const getTotal = (diff) => allList.find(d => d.difficulty.toLowerCase() === diff.toLowerCase())?.count || 0;
      leetCodeData = {
        solved: getAc('all'),
        ranking: matched.profile?.ranking || 0,
        easySolved: getAc('easy'),
        easyTotal: getTotal('easy'),
        mediumSolved: getAc('medium'),
        mediumTotal: getTotal('medium'),
        hardSolved: getAc('hard'),
        hardTotal: getTotal('hard')
      };
    }
  }
} catch {
  leetCodeData = null;
}

const svgWidth = 800;
const svgHeight = leetCodeData ? 760 : 710;
const windowX = 16;
const windowY = 16;
const windowW = svgWidth - 32;
const windowH = svgHeight - 32;

let animStep = 0;
const nextDelay = () => `d-${animStep++}`;

let svgElements = [];

function addPrompt(cmd, y) {
  svgElements.push(`
    <text x="40" y="${y}" class="line ${nextDelay()} font-code font-13">
      <tspan fill="#3fb950" font-weight="bold">tajwar@github:~$</tspan>
      <tspan fill="#ffffff"> ${escapeXml(cmd)}</tspan>
    </text>
  `);
}

let currY = 76;

svgElements.push(`
  <text x="40" y="${currY}" class="line ${nextDelay()} font-code font-13" fill="#3fb950" font-weight="bold">
    → Welcome to Tajwar Saiyeed Abid&apos;s Terminal! 🚀
  </text>
`);
currY += 18;

svgElements.push(`
  <text x="40" y="${currY}" class="line ${nextDelay()} font-code font-12" fill="#8b949e">
    Programmer, problem solver &amp; CSE student building impactful digital solutions.
  </text>
`);
currY += 26;

addPrompt('whoami', currY);
currY += 18;

const asciiLines = [
  ' ████████╗███████╗',
  ' ╚══██╔══╝██╔════╝',
  '    ██║   ███████╗',
  '    ██║   ╚════██║',
  '    ██║   ███████║',
  '    ╚═╝   ╚══════╝'
];

const whoamiFields = [
  { k: 'Name:   ', v: 'Tajwar Saiyeed Abid' },
  { k: 'Role:   ', v: 'Full Stack Developer • Problem Solver' },
  { k: 'Study:  ', v: 'B.Sc. (Hons.) in CSE' },
  { k: 'Work:   ', v: '@tect0nic-official' },
  { k: 'Stack:  ', v: 'Next.js • TypeScript • Go • Python' },
  { k: 'GitHub: ', v: 'github.com/TajwarSaiyeed' }
];

const whoamiStartY = currY;
for (let i = 0; i < 6; i++) {
  const lineY = whoamiStartY + i * 16;
  svgElements.push(`
    <text x="42" y="${lineY}" class="line ${nextDelay()} font-code font-13" fill="#3fb950">
      <tspan xml:space="preserve">${escapeXml(asciiLines[i])}</tspan>
    </text>
    <text x="220" y="${lineY}" class="line ${nextDelay()} font-code font-13">
      <tspan fill="#3fb950" font-weight="bold">${escapeXml(whoamiFields[i].k)}</tspan>
      <tspan fill="#c9d1d9">${escapeXml(whoamiFields[i].v)}</tspan>
    </text>
  `);
}

svgElements.push(`
  <line x1="205" y1="${whoamiStartY - 11}" x2="205" y2="${whoamiStartY + 5 * 16 + 3}" stroke="#1f6f3a" stroke-width="1.5" class="line ${nextDelay()}"/>
`);

currY = whoamiStartY + 6 * 16 + 10;

addPrompt('github --stats', currY);
currY += 18;

svgElements.push(`
  <text x="40" y="${currY}" class="line ${nextDelay()} font-code font-13">
    <tspan fill="#8b949e">contrib </tspan><tspan fill="#3fb950" font-weight="bold">${totalAllTimeContributions.toLocaleString()}</tspan>
    <tspan fill="#30363d"> │ </tspan>
    <tspan fill="#8b949e">streak </tspan><tspan fill="#3fb950" font-weight="bold">${currentStreak}d</tspan>
    <tspan fill="#30363d"> │ </tspan>
    <tspan fill="#8b949e">longest </tspan><tspan fill="#3fb950" font-weight="bold">${longestStreak}d</tspan>
    <tspan fill="#30363d"> │ </tspan>
    <tspan fill="#8b949e">commits(yr) </tspan><tspan fill="#3fb950" font-weight="bold">${commitsThisYear.toLocaleString()}</tspan>
    <tspan fill="#30363d"> │ </tspan>
    <tspan fill="#8b949e">★ </tspan><tspan fill="#3fb950" font-weight="bold">${totalStars.toLocaleString()}</tspan>
  </text>
`);
currY += 26;

addPrompt('github --contributions', currY);
currY += 14;

const boxX = 40;
const boxY = currY;
const boxW = 720;
const boxH = 136;

svgElements.push(`
  <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="8" fill="#0d1117" stroke="#21262d" stroke-width="1" class="line ${nextDelay()}"/>
  <text x="${boxX + 16}" y="${boxY + 20}" fill="#8b949e" class="line ${nextDelay()} font-code font-12 font-bold">GitHub Contributions (Last 1 Year)</text>
  <text x="${boxX + boxW - 16}" y="${boxY + 20}" text-anchor="end" fill="#3fb950" class="line ${nextDelay()} font-code font-12 font-bold">${totalContribsLastYear.toLocaleString()} contributions</text>
`);

const allCounts = weeks.flatMap(w => (w.contributionDays || []).map(d => d.contributionCount || 0)).filter(c => c > 0);
const maxContrib = allCounts.length > 0 ? Math.max(...allCounts) : 10;
const q1 = Math.max(1, Math.ceil(maxContrib * 0.25));
const q2 = Math.max(2, Math.ceil(maxContrib * 0.50));
const q3 = Math.max(3, Math.ceil(maxContrib * 0.75));

function getHeatmapColor(cnt) {
  if (cnt <= 0) return '#161b22';
  if (cnt <= q1) return '#0e4429';
  if (cnt <= q2) return '#006d32';
  if (cnt <= q3) return '#26a641';
  return '#39d353';
}

const gridX = boxX + 46;
const gridY = boxY + 34;

svgElements.push(`
  <text x="${gridX - 8}" y="${gridY + 1 * 12 + 8}" text-anchor="end" fill="#8b949e" class="line ${nextDelay()} font-code font-9">Mon</text>
  <text x="${gridX - 8}" y="${gridY + 3 * 12 + 8}" text-anchor="end" fill="#8b949e" class="line ${nextDelay()} font-code font-9">Wed</text>
  <text x="${gridX - 8}" y="${gridY + 5 * 12 + 8}" text-anchor="end" fill="#8b949e" class="line ${nextDelay()} font-code font-9">Fri</text>
`);

let cellsSvg = [];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let lastMonth = -1;
let monthLabels = [];

weeks.forEach((week, wIdx) => {
  const cellX = gridX + wIdx * 12;
  const firstDay = week.contributionDays?.[0];
  if (firstDay?.date) {
    const d = new Date(firstDay.date);
    const m = d.getUTCMonth();
    if (m !== lastMonth) {
      if (monthLabels.length === 0 || (wIdx - monthLabels[monthLabels.length - 1].wIdx >= 3)) {
        monthLabels.push({ text: months[m], x: cellX, wIdx });
        lastMonth = m;
      }
    }
  }

  for (const day of week.contributionDays || []) {
    const cellY = gridY + (day.weekday || 0) * 12;
    const color = getHeatmapColor(day.contributionCount || 0);
    cellsSvg.push(`<rect x="${cellX}" y="${cellY}" width="10" height="10" rx="2" fill="${color}"/>`);
  }
});

svgElements.push(`
  <g class="line ${nextDelay()}">
    ${cellsSvg.join('')}
  </g>
`);

const monthLabelSvg = monthLabels.map(ml =>
  `<text x="${ml.x}" y="${gridY + 7 * 12 + 10}" fill="#8b949e" class="font-code font-9">${ml.text}</text>`
).join('');

svgElements.push(`
  <g class="line ${nextDelay()}">
    ${monthLabelSvg}
  </g>
`);

currY = boxY + boxH + 20;

if (leetCodeData) {
  addPrompt('leetcode --stats', currY);
  currY += 18;

  svgElements.push(`
    <text x="40" y="${currY}" class="line ${nextDelay()} font-code font-13">
      <tspan fill="#8b949e">solved </tspan><tspan fill="#3fb950" font-weight="bold">${leetCodeData.solved.toLocaleString()}</tspan>
      <tspan fill="#30363d"> │ </tspan>
      <tspan fill="#8b949e">easy </tspan><tspan fill="#3fb950" font-weight="bold">${leetCodeData.easySolved}/${leetCodeData.easyTotal}</tspan>
      <tspan fill="#30363d"> │ </tspan>
      <tspan fill="#8b949e">medium </tspan><tspan fill="#febc2e" font-weight="bold">${leetCodeData.mediumSolved}/${leetCodeData.mediumTotal}</tspan>
      <tspan fill="#30363d"> │ </tspan>
      <tspan fill="#8b949e">hard </tspan><tspan fill="#ff5f57" font-weight="bold">${leetCodeData.hardSolved}/${leetCodeData.hardTotal}</tspan>
      <tspan fill="#30363d"> │ </tspan>
      <tspan fill="#8b949e">rank </tspan><tspan fill="#3fb950" font-weight="bold">#${leetCodeData.ranking.toLocaleString()}</tspan>
    </text>
  `);
  currY += 16;

  const easyBar = makeBar(leetCodeData.easySolved, leetCodeData.easyTotal, 10);
  const medBar = makeBar(leetCodeData.mediumSolved, leetCodeData.mediumTotal, 10);
  const hardBar = makeBar(leetCodeData.hardSolved, leetCodeData.hardTotal, 10);

  svgElements.push(`
    <text x="40" y="${currY}" class="line ${nextDelay()} font-code font-13">
      <tspan fill="#8b949e">Easy   </tspan><tspan fill="#3fb950">[${easyBar}]</tspan>
      <tspan fill="#30363d">   </tspan>
      <tspan fill="#8b949e">Medium </tspan><tspan fill="#febc2e">[${medBar}]</tspan>
      <tspan fill="#30363d">   </tspan>
      <tspan fill="#8b949e">Hard   </tspan><tspan fill="#ff5f57">[${hardBar}]</tspan>
    </text>
  `);
  currY += 26;
}

addPrompt('langs', currY);
currY += 18;

top5Languages.forEach(l => {
  const bar = makeBar(l.percentage, 100, 16);
  const padName = l.name.padEnd(12, ' ');
  const pctStr = `${l.percentage.toFixed(1)}%`.padStart(6, ' ');
  svgElements.push(`
    <text x="40" y="${currY}" class="line ${nextDelay()} font-code font-13">
      <tspan fill="#c9d1d9">${escapeXml(padName)}</tspan>
      <tspan fill="${l.color}">[${bar}]</tspan>
      <tspan fill="#8b949e">${escapeXml(pctStr)}</tspan>
    </text>
  `);
  currY += 16;
});

currY += 10;
svgElements.push(`
  <text x="40" y="${currY}" class="line ${nextDelay()} font-code font-13">
    <tspan fill="#3fb950" font-weight="bold">tajwar@github:~$</tspan>
    <tspan fill="#ffffff"> </tspan><tspan fill="#3fb950" class="cursor">█</tspan>
  </text>
`);

const bottomBarH = 34;
const bottomBarY = windowY + windowH - 16 - bottomBarH;

const chips = ['whoami', 'skills', 'projects', 'github', 'contact', 'help'];
let chipX = boxX + 170;
let chipsSvg = [];

chips.forEach(chip => {
  const chipW = chip.length * 8 + 16;
  chipsSvg.push(`
    <rect x="${chipX}" y="${bottomBarY + 7}" width="${chipW}" height="20" rx="4" fill="#161b22" stroke="#21262d" stroke-width="1"/>
    <text x="${chipX + chipW / 2}" y="${bottomBarY + 21}" text-anchor="middle" fill="#3fb950" class="font-code font-11 font-bold">${chip}</text>
  `);
  chipX += chipW + 8;
});

svgElements.push(`
  <g class="line ${nextDelay()}">
    <rect x="${boxX}" y="${bottomBarY}" width="${boxW}" height="${bottomBarH}" rx="8" fill="#0d1117" stroke="#1f6f3a" stroke-width="1"/>
    <text x="${boxX + 16}" y="${bottomBarY + 21}" fill="#8b949e" class="font-code font-11 font-bold">Available commands:</text>
    ${chipsSvg.join('')}
  </g>
`);

let delayStyles = [];
for (let i = 0; i < animStep; i++) {
  delayStyles.push(`.d-${i} { animation-delay: ${(i * 0.05).toFixed(2)}s; }`);
}

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <defs>
    <style>
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(3px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes blink {
        0%, 49% { opacity: 1; }
        50%, 100% { opacity: 0; }
      }
      .font-code { font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace; }
      .font-13 { font-size: 13px; }
      .font-12 { font-size: 12px; }
      .font-11 { font-size: 11px; }
      .font-9 { font-size: 9px; }
      .font-bold { font-weight: bold; }
      .line {
        animation: fadeIn 0.25s ease-out forwards;
        opacity: 0;
      }
      .cursor {
        animation: blink 1s infinite;
      }
      ${delayStyles.join('\n      ')}
    </style>
  </defs>

  <rect width="100%" height="100%" fill="#0a0e0a"/>

  <rect x="${windowX}" y="${windowY}" width="${windowW}" height="${windowH}" rx="14" ry="14" fill="#0d1117" stroke="#1f6f3a" stroke-width="1"/>

  <circle cx="38" cy="34" r="6" fill="#ff5f57"/>
  <circle cx="56" cy="34" r="6" fill="#febc2e"/>
  <circle cx="74" cy="34" r="6" fill="#28c840"/>
  <text x="400" y="38" text-anchor="middle" fill="#8b949e" class="font-code font-13">tajwar@github: ~</text>
  <line x1="${windowX}" y1="52" x2="${windowX + windowW}" y2="52" stroke="#1f6f3a" stroke-width="1"/>

  ${svgElements.join('\n  ')}
</svg>
`;

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(OUT_PATH, svgContent, 'utf8');

console.log('done');


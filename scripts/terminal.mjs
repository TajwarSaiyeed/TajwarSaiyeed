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

const projectTargets = [
  { owner: 'TajwarSaiyeed', name: 'vault.cloud' },
  { owner: 'TajwarSaiyeed', name: 'labdesk' },
  { owner: 'TajwarSaiyeed', name: 'limecart-ecommerce' },
  { owner: 'TajwarSaiyeed', name: 'brick-game-9999-in-1' },
  { owner: 'StaticMania', name: 'keep-react', isContrib: true }
];

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
    thisYearCollection: contributionsCollection(from: "${currentYear}-01-01T00:00:00Z", to: "${currentYear}-12-31T23:59:59Z") {
      totalCommitContributions
      totalPullRequestContributions
    }
    ${yearQueries.join('\n')}
  }
  ${projectTargets.map((p, i) => `
    project_${i}: repository(owner: "${p.owner}", name: "${p.name}") {
      description
      stargazerCount
      forkCount
      primaryLanguage {
        name
        color
      }
    }
  `).join('\n')}
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

const projectsData = projectTargets.map((p, i) => {
  const repoData = ghJson.data?.[`project_${i}`] || {};
  return {
    ...p,
    description: repoData.description || '',
    stargazerCount: repoData.stargazerCount || 0,
    forkCount: repoData.forkCount || 0,
    primaryLanguage: repoData.primaryLanguage || null
  };
});

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
    <text x="40" y="${currY}" text-anchor="start" class="line ${nextDelay()} font-code font-13" xml:space="preserve"><tspan fill="#c9d1d9">${escapeXml(padName)}</tspan><tspan fill="${l.color}">[${bar}]</tspan><tspan fill="#8b949e">${escapeXml(pctStr)}</tspan></text>
  `);
  currY += 16;
});
currY += 10;

addPrompt('ls ~/skills', currY);
currY += 18;

const skills = [
  { name: 'TypeScript', color: '#3178c6' },
  { name: 'JavaScript', color: '#f7df1e' },
  { name: 'React', color: '#61dafb' },
  { name: 'Next.js', color: '#e6edf3' },
  { name: 'Node.js', color: '#68a063' },
  { name: 'Tailwind', color: '#38bdf8' },
  { name: 'Go', color: '#00add8' },
  { name: 'Python', color: '#3572A5' },
  { name: 'Django', color: '#44b78b' },
  { name: 'MongoDB', color: '#47a248' },
  { name: 'PostgreSQL', color: '#4169e1' },
  { name: 'Git', color: '#f05032' },
  { name: 'Docker', color: '#2496ed' },
  { name: 'Linux', color: '#fcc624' }
];

let pillX = 40;
let pillY = currY;
const pillH = 20;
const pillGap = 8;
const lineGap = 6;
let currentLinePills = [];

skills.forEach(skill => {
  const pillW = Math.round(skill.name.length * 7.5 + 16);
  if (pillX + pillW > 760 && currentLinePills.length > 0) {
    svgElements.push(`
      <g class="line ${nextDelay()}">
        ${currentLinePills.join('')}
      </g>
    `);
    currentLinePills = [];
    pillX = 40;
    pillY += pillH + lineGap;
  }
  currentLinePills.push(`
    <rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="10" fill="#161b22" stroke="${skill.color}" stroke-width="1"/>
    <text x="${pillX + pillW / 2}" y="${pillY + 14}" text-anchor="middle" fill="${skill.color}" class="font-code font-11 font-bold">${escapeXml(skill.name)}</text>
  `);
  pillX += pillW + pillGap;
});

if (currentLinePills.length > 0) {
  svgElements.push(`
    <g class="line ${nextDelay()}">
      ${currentLinePills.join('')}
    </g>
  `);
}

currY = pillY + pillH + 36;

addPrompt('ls ~/projects', currY);
currY += 18;

projectsData.forEach(p => {
  const langName = p.primaryLanguage?.name || 'Markdown';
  const langColor = p.primaryLanguage?.color || '#8b949e';
  const repoName = p.name + '/';
  let repoDisplay = '';
  if (p.isContrib) {
    const padLen = Math.max(0, 22 - (repoName.length + 10));
    repoDisplay = `<tspan fill="#58a6ff">${escapeXml(repoName)}</tspan><tspan fill="#3fb950" font-weight="bold"> (contrib)</tspan><tspan fill="#58a6ff">${' '.repeat(padLen)}</tspan>`;
  } else {
    repoDisplay = `<tspan fill="#58a6ff">${escapeXml(repoName.padEnd(22, ' '))}</tspan>`;
  }
  const padLang = langName.padEnd(10, ' ');
  const padStars = String(p.stargazerCount).padEnd(5, ' ');
  const padForks = String(p.forkCount).padEnd(4, ' ');
  let desc = p.description || '';
  if (desc.length > 15) {
    desc = desc.slice(0, 12) + '...';
  }

  svgElements.push(`
    <text x="40" y="${currY}" text-anchor="start" class="line ${nextDelay()} font-code font-12" xml:space="preserve"><tspan fill="#8b949e">drwxr-xr-x </tspan>${repoDisplay}<tspan fill="${langColor}">● </tspan><tspan fill="#8b949e">${escapeXml(padLang)}</tspan><tspan fill="#8b949e">★ ${escapeXml(padStars)}</tspan><tspan fill="#8b949e">⑂ ${escapeXml(padForks)}</tspan><tspan fill="#8b949e">${escapeXml(desc)}</tspan></text>
  `);
  currY += 18;
});
currY += 10;

addPrompt('cat contact.txt', currY);
currY += 18;

const contacts = [
  { k: 'X', v: '@tajwarsaiyeed' },
  { k: 'LeetCode', v: 'TajwarSaiyeed' },
  { k: 'StackOverflow', v: '19961650' },
  { k: 'Medium', v: '@rjabid36' },
  { k: 'YouTube', v: '@tajwarsaiyeed' },
  { k: 'CodePen', v: 'TajwarSaiyeed' },
  { k: 'Instagram', v: '@tajwarsaiyeed' },
  { k: 'Facebook', v: 'tajwarsaiyeedabid.dev' }
];

contacts.forEach(c => {
  const padKey = c.k.padEnd(15, ' ');
  svgElements.push(`
    <text x="40" y="${currY}" text-anchor="start" class="line ${nextDelay()} font-code font-13" xml:space="preserve"><tspan fill="#3fb950" font-weight="bold">${escapeXml(padKey)}</tspan><tspan fill="#c9d1d9">${escapeXml(c.v)}</tspan></text>
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

const svgWidth = 800;
const svgHeight = currY + 24;
const windowX = 0.5;
const windowY = 0.5;
const windowW = 799;
const windowH = svgHeight - 1;

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

  <rect x="${windowX}" y="${windowY}" width="${windowW}" height="${windowH}" rx="10" ry="10" fill="#0d1117" stroke="#1f6f3a" stroke-width="1"/>

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

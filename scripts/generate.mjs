import fs from 'node:fs/promises';
import path from 'node:path';

const USERNAME = 'TajwarSaiyeed';
const GH_TOKEN = process.env.GH_TOKEN;

if (!GH_TOKEN) {
  console.error('Error: GH_TOKEN environment variable is required.');
  process.exit(1);
}

function escapeXml(unsafe) {
  return String(unsafe ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
}

function formatRange(start, end) {
  if (!start || !end) return 'No streak';
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function wrapSvg(width, height, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
  <style>
    .card {
      animation: fadeIn 0.8s ease-in-out forwards;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
  <defs>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7aa2f7" />
      <stop offset="100%" stop-color="#bb9af7" />
    </linearGradient>
  </defs>
  <g class="card">
    <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="#0d1117" stroke="#30363d" />
    ${content}
  </g>
</svg>`;
}

async function fetchGitHubData() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = 2022; y <= currentYear; y++) {
    years.push(y);
  }

  const yearQueries = years.map(y => `
    year_${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
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
  `).join('\n');

  const query = `
    query($username: String!) {
      user(login: $username) {
        name
        followers {
          totalCount
        }
        repositories(ownerAffiliations: [OWNER], first: 100, privacy: PUBLIC) {
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
        contributionsCollection {
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
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
        ${yearQueries}
      }
    }
  `;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `bearer ${GH_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'NodeJS-Profile-Card-Generator'
    },
    body: JSON.stringify({ query, variables: { username: USERNAME } })
  });

  if (!response.ok) {
    throw new Error(`GitHub API HTTP error: ${response.status} ${response.statusText}`);
  }

  const resJson = await response.json();
  if (resJson.errors) {
    throw new Error(`GitHub GraphQL Error: ${JSON.stringify(resJson.errors)}`);
  }

  return { user: resJson.data.user, years };
}

async function fetchLeetCodeData() {
  const query = `
    query matchedUser($username: String!) {
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
    }
  `;

  const response = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (NodeJS)'
    },
    body: JSON.stringify({ query, variables: { username: USERNAME } })
  });

  if (!response.ok) {
    throw new Error(`LeetCode API HTTP error: ${response.status} ${response.statusText}`);
  }

  const resJson = await response.json();
  if (resJson.errors || !resJson.data?.matchedUser) {
    throw new Error('LeetCode user data unavailable');
  }

  return resJson.data;
}

function generateStatsSvg(user, totalAllTimeContributions, totalStars, totalPRs, totalIssues) {
  const commitsThisYear = user.contributionsCollection?.totalCommitContributions || 0;
  const followers = user.followers?.totalCount || 0;

  const metrics = [
    {
      label: 'All-Time Contributions',
      value: totalAllTimeContributions.toLocaleString(),
      icon: '<path fill="#7aa2f7" d="M8 0a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0V.75A.75.75 0 018 0zm4.243 2.757a.75.75 0 011.06 0l1.061 1.06a.75.75 0 01-1.06 1.061l-1.061-1.06a.75.75 0 010-1.061zM15.25 8a.75.75 0 010 1.5h-1.5a.75.75 0 010-1.5h1.5zM8 4a4 4 0 100 8 4 4 0 000-8z"/>'
    },
    {
      label: 'Commits (This Year)',
      value: commitsThisYear.toLocaleString(),
      icon: '<circle cx="8" cy="8" r="3" stroke="#7aa2f7" stroke-width="2" fill="none"/><line x1="1" y1="8" x2="5" y2="8" stroke="#7aa2f7" stroke-width="2"/><line x1="11" y1="8" x2="15" y2="8" stroke="#7aa2f7" stroke-width="2"/>'
    },
    {
      label: 'Pull Requests',
      value: totalPRs.toLocaleString(),
      icon: '<path fill="#7aa2f7" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.256a2.251 2.251 0 11-1.5 0V8a2 2 0 00-2-2H8v1.5L4.5 5 8 2.5V4h1.5A3.5 3.5 0 0113 7.5v2.756a2.25 2.25 0 11-2 0z"/>'
    },
    {
      label: 'Issues Opened',
      value: totalIssues.toLocaleString(),
      icon: '<path fill="#7aa2f7" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9 3a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z"/>'
    },
    {
      label: 'Total Stars',
      value: totalStars.toLocaleString(),
      icon: '<path fill="#7aa2f7" d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>'
    },
    {
      label: 'Followers',
      value: followers.toLocaleString(),
      icon: '<path fill="#7aa2f7" d="M5.5 3.5a2 2 0 100 4 2 2 0 000-4zM2 5.5a3.5 3.5 0 117 0 3.5 3.5 0 01-7 0zM1 12a4 4 0 014-4h1a4 4 0 014 4v1.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5V12zm10.5-6.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-1 4.5a3 3 0 012.5 1.3V13h-4.5v-1a3 3 0 012-2z"/>'
    }
  ];

  let gridContent = '';
  metrics.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const colX = col === 0 ? 25 : 255;
    const rowY = 75 + row * 40;

    gridContent += `
      <g transform="translate(${colX}, ${rowY - 14})">
        <svg width="16" height="16" viewBox="0 0 16 16">${item.icon}</svg>
      </g>
      <text x="${colX + 26}" y="${rowY}" font-size="13" fill="#8b949e">${escapeXml(item.label)}</text>
      <text x="${colX + 215}" y="${rowY}" font-size="13" font-weight="700" text-anchor="end" fill="#c9d1d9">${escapeXml(item.value)}</text>
    `;
  });

  const content = `
    <text x="25" y="35" font-size="15" font-weight="700" fill="url(#accentGrad)">GitHub Stats</text>
    ${gridContent}
  `;

  return wrapSvg(495, 195, content);
}

function generateLanguagesSvg(user) {
  const langMap = new Map();
  const repos = user.repositories?.nodes || [];

  for (const repo of repos) {
    for (const edge of repo.languages?.edges || []) {
      const name = edge.node?.name;
      const color = edge.node?.color || '#8b949e';
      const size = edge.size || 0;
      if (!name) continue;

      if (!langMap.has(name)) {
        langMap.set(name, { name, color, size: 0 });
      }
      langMap.get(name).size += size;
    }
  }

  const sortedLangs = Array.from(langMap.values()).sort((a, b) => b.size - a.size);
  const top8 = sortedLangs.slice(0, 8);
  const totalTopBytes = top8.reduce((acc, l) => acc + l.size, 0) || 1;

  let barSegments = '';
  let currentX = 25;
  const barWidth = 445;

  for (const lang of top8) {
    const segWidth = (lang.size / totalTopBytes) * barWidth;
    barSegments += `<rect x="${currentX.toFixed(2)}" y="52" width="${segWidth.toFixed(2)}" height="10" fill="${escapeXml(lang.color)}" />`;
    currentX += segWidth;
  }

  let legendContent = '';
  top8.forEach((lang, index) => {
    const col = index < 4 ? 0 : 1;
    const row = index % 4;
    const colX = col === 0 ? 25 : 255;
    const rowY = 88 + row * 26;
    const pct = ((lang.size / totalTopBytes) * 100).toFixed(1);

    legendContent += `
      <circle cx="${colX + 6}" cy="${rowY - 4}" r="5" fill="${escapeXml(lang.color)}" />
      <text x="${colX + 18}" y="${rowY}" font-size="12" font-weight="600" fill="#c9d1d9">${escapeXml(lang.name)}</text>
      <text x="${colX + 215}" y="${rowY}" font-size="12" text-anchor="end" fill="#8b949e">${pct}%</text>
    `;
  });

  const content = `
    <text x="25" y="35" font-size="15" font-weight="700" fill="url(#accentGrad)">Top Languages</text>
    <clipPath id="langBarClip">
      <rect x="25" y="52" width="${barWidth}" height="10" rx="5" />
    </clipPath>
    <g clip-path="url(#langBarClip)">
      ${barSegments}
    </g>
    ${legendContent}
  `;

  return wrapSvg(495, 195, content);
}

function generateStreakSvg(totalAllTimeContributions, currentStreak, longestStreak, curStart, curEnd, longStart, longEnd, firstDayDate) {
  const currentRangeStr = formatRange(curStart, curEnd);
  const longestRangeStr = formatRange(longStart, longEnd);
  const allTimeRangeStr = `${formatDate(firstDayDate || '2022-01-01')} - Present`;

  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = currentStreak > 0 ? 0 : circumference;

  const content = `
    <text x="25" y="35" font-size="15" font-weight="700" fill="url(#accentGrad)">Contribution Streak</text>
    
    <!-- Total Contributions -->
    <g transform="translate(100, 0)">
      <text x="0" y="86" text-anchor="middle" font-size="22" font-weight="700" fill="#c9d1d9">${totalAllTimeContributions.toLocaleString()}</text>
      <text x="0" y="108" text-anchor="middle" font-size="12" font-weight="600" fill="#8b949e">Total Contributions</text>
      <text x="0" y="142" text-anchor="middle" font-size="10" fill="#8b949e">${escapeXml(allTimeRangeStr)}</text>
    </g>

    <!-- Divider 1 -->
    <line x1="185" y1="60" x2="185" y2="160" stroke="#30363d" />

    <!-- Current Streak Center Ring -->
    <g transform="translate(247, 0)">
      <circle cx="0" cy="95" r="${radius}" stroke="#21262d" stroke-width="5" fill="none" />
      <circle cx="0" cy="95" r="${radius}" stroke="url(#accentGrad)" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 0 95)" />
      <text x="0" y="101" text-anchor="middle" font-size="19" font-weight="700" fill="url(#accentGrad)">${currentStreak}</text>
      <text x="0" y="144" text-anchor="middle" font-size="12" font-weight="600" fill="#c9d1d9">Current Streak</text>
      <text x="0" y="162" text-anchor="middle" font-size="10" fill="#8b949e">${escapeXml(currentRangeStr)}</text>
    </g>

    <!-- Divider 2 -->
    <line x1="310" y1="60" x2="310" y2="160" stroke="#30363d" />

    <!-- Longest Streak -->
    <g transform="translate(395, 0)">
      <text x="0" y="86" text-anchor="middle" font-size="22" font-weight="700" fill="#c9d1d9">${longestStreak}</text>
      <text x="0" y="108" text-anchor="middle" font-size="12" font-weight="600" fill="#8b949e">Longest Streak</text>
      <text x="0" y="142" text-anchor="middle" font-size="10" fill="#8b949e">${escapeXml(longestRangeStr)}</text>
    </g>
  `;

  return wrapSvg(495, 195, content);
}

function generateLeetCodeSvg(lcData) {
  const matched = lcData.matchedUser;
  const acSubs = matched.submitStats?.acSubmissionNum || [];
  const allQuestions = lcData.allQuestionsCount || [];

  const getSub = (diff) => acSubs.find(x => x.difficulty.toLowerCase() === diff.toLowerCase())?.count || 0;
  const getTotal = (diff) => allQuestions.find(x => x.difficulty.toLowerCase() === diff.toLowerCase())?.count || 0;

  const totalSolved = getSub('all');
  const totalQuestions = getTotal('all') || 3300;
  const easySolved = getSub('easy');
  const easyTotal = getTotal('easy') || 800;
  const medSolved = getSub('medium');
  const medTotal = getTotal('medium') || 1700;
  const hardSolved = getSub('hard');
  const hardTotal = getTotal('hard') || 750;

  const ranking = matched.profile?.ranking || 0;

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - Math.min(totalSolved / totalQuestions, 1));

  const content = `
    <text x="25" y="35" font-size="15" font-weight="700" fill="url(#accentGrad)">LeetCode Stats</text>
    
    <!-- Circle Ring -->
    <g transform="translate(105, 100)">
      <circle cx="0" cy="0" r="${radius}" stroke="#21262d" stroke-width="6" fill="none" />
      <circle cx="0" cy="0" r="${radius}" stroke="url(#accentGrad)" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${dashoffset.toFixed(2)}" transform="rotate(-90 0 0)" />
      <text x="0" y="-3" text-anchor="middle" font-size="19" font-weight="700" fill="#c9d1d9">${totalSolved}</text>
      <text x="0" y="15" text-anchor="middle" font-size="11" fill="#8b949e">Solved</text>
      <text x="0" y="65" text-anchor="middle" font-size="12" fill="#8b949e">Ranking <tspan fill="#c9d1d9" font-weight="600">#${ranking ? ranking.toLocaleString() : 'N/A'}</tspan></text>
    </g>

    <line x1="205" y1="52" x2="205" y2="168" stroke="#30363d" />

    <!-- Progress Bars -->
    <g transform="translate(225, 0)">
      <!-- Easy -->
      <text x="0" y="68" font-size="12" font-weight="600" fill="#2ea043">Easy</text>
      <text x="245" y="68" font-size="12" text-anchor="end" fill="#8b949e"><tspan fill="#c9d1d9" font-weight="600">${easySolved}</tspan> / ${easyTotal}</text>
      <rect x="0" y="76" width="245" height="7" rx="3.5" fill="#21262d" />
      <rect x="0" y="76" width="${Math.max((easySolved / easyTotal) * 245, 4)}" height="7" rx="3.5" fill="#2ea043" />

      <!-- Medium -->
      <text x="0" y="108" font-size="12" font-weight="600" fill="#d29922">Medium</text>
      <text x="245" y="108" font-size="12" text-anchor="end" fill="#8b949e"><tspan fill="#c9d1d9" font-weight="600">${medSolved}</tspan> / ${medTotal}</text>
      <rect x="0" y="116" width="245" height="7" rx="3.5" fill="#21262d" />
      <rect x="0" y="116" width="${Math.max((medSolved / medTotal) * 245, 4)}" height="7" rx="3.5" fill="#d29922" />

      <!-- Hard -->
      <text x="0" y="148" font-size="12" font-weight="600" fill="#f85149">Hard</text>
      <text x="245" y="148" font-size="12" text-anchor="end" fill="#8b949e"><tspan fill="#c9d1d9" font-weight="600">${hardSolved}</tspan> / ${hardTotal}</text>
      <rect x="0" y="156" width="245" height="7" rx="3.5" fill="#21262d" />
      <rect x="0" y="156" width="${Math.max((hardSolved / hardTotal) * 245, 4)}" height="7" rx="3.5" fill="#f85149" />
    </g>
  `;

  return wrapSvg(495, 195, content);
}

function generateActivitySvg(weeks, totalContributionsPastYear) {
  const cellSize = 11;
  const cellGap = 3.5;
  const step = cellSize + cellGap;
  const startX = 65;
  const startY = 66;

  const accentColors = ['#161b22', '#27385a', '#3e5c9a', '#7aa2f7', '#bb9af7'];

  let maxDayCount = 1;
  for (const w of weeks) {
    for (const d of w.contributionDays || []) {
      if (d.contributionCount > maxDayCount) {
        maxDayCount = d.contributionCount;
      }
    }
  }

  function getColor(count) {
    if (!count || count === 0) return accentColors[0];
    const ratio = count / maxDayCount;
    if (ratio <= 0.25) return accentColors[1];
    if (ratio <= 0.50) return accentColors[2];
    if (ratio <= 0.75) return accentColors[3];
    return accentColors[4];
  }

  let cells = '';
  let monthLabels = '';
  let lastMonth = '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  weeks.forEach((week, wIdx) => {
    const x = startX + wIdx * step;
    const firstDay = week.contributionDays?.[0];

    if (firstDay) {
      const monthIndex = parseInt(firstDay.date.split('-')[1], 10) - 1;
      const monthName = months[monthIndex];
      if (monthName !== lastMonth) {
        monthLabels += `<text x="${x}" y="52" font-size="11" fill="#8b949e">${monthName}</text>`;
        lastMonth = monthName;
      }
    }

    week.contributionDays?.forEach((day, dIdx) => {
      const y = startY + dIdx * step;
      const color = getColor(day.contributionCount);
      cells += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${color}"><title>${escapeXml(day.date)}: ${day.contributionCount} contributions</title></rect>`;
    });
  });

  const content = `
    <text x="30" y="35" font-size="15" font-weight="700" fill="url(#accentGrad)">Contribution Activity</text>
    <text x="960" y="35" font-size="12" text-anchor="end" fill="#8b949e"><tspan font-weight="600" fill="#c9d1d9">${totalContributionsPastYear.toLocaleString()}</tspan> contributions in the last 52 weeks</text>
    
    <!-- Weekday labels -->
    <text x="${startX - 10}" y="${startY + 1 * step + 9}" font-size="10" text-anchor="end" fill="#8b949e">Mon</text>
    <text x="${startX - 10}" y="${startY + 3 * step + 9}" font-size="10" text-anchor="end" fill="#8b949e">Wed</text>
    <text x="${startX - 10}" y="${startY + 5 * step + 9}" font-size="10" text-anchor="end" fill="#8b949e">Fri</text>

    <!-- Month labels -->
    ${monthLabels}

    <!-- Heatmap Grid -->
    ${cells}

    <!-- Legend -->
    <g transform="translate(820, 178)">
      <text x="-8" y="9" font-size="10" text-anchor="end" fill="#8b949e">Less</text>
      <rect x="0" y="0" width="${cellSize}" height="${cellSize}" rx="2" fill="${accentColors[0]}" />
      <rect x="${step}" y="0" width="${cellSize}" height="${cellSize}" rx="2" fill="${accentColors[1]}" />
      <rect x="${step * 2}" y="0" width="${cellSize}" height="${cellSize}" rx="2" fill="${accentColors[2]}" />
      <rect x="${step * 3}" y="0" width="${cellSize}" height="${cellSize}" rx="2" fill="${accentColors[3]}" />
      <rect x="${step * 4}" y="0" width="${cellSize}" height="${cellSize}" rx="2" fill="${accentColors[4]}" />
      <text x="${step * 5 + 6}" y="9" font-size="10" fill="#8b949e">More</text>
    </g>
  `;

  return wrapSvg(990, 195, content);
}

async function main() {
  const assetsDir = path.resolve('assets');
  await fs.mkdir(assetsDir, { recursive: true });

  const { user, years } = await fetchGitHubData();

  let totalAllTimeContributions = 0;
  let totalPRs = 0;
  let totalIssues = 0;
  const dayMap = new Map();

  for (const y of years) {
    const col = user[`year_${y}`];
    if (!col) continue;

    totalAllTimeContributions += col.contributionCalendar?.totalContributions || 0;
    totalPRs += col.totalPullRequestContributions || 0;
    totalIssues += col.totalIssueContributions || 0;

    for (const week of col.contributionCalendar?.weeks || []) {
      for (const day of week.contributionDays || []) {
        dayMap.set(day.date, day.contributionCount);
      }
    }
  }

  const allDays = Array.from(dayMap.entries())
    .map(([date, contributionCount]) => ({ date, contributionCount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const todayStr = new Date().toISOString().split('T')[0];
  const validDays = allDays.filter(d => d.date <= todayStr);

  let longestStreak = 0;
  let longStart = null;
  let longEnd = null;
  let tempStreak = 0;
  let tempStart = null;
  let tempEnd = null;

  for (const d of validDays) {
    if (d.contributionCount > 0) {
      if (tempStreak === 0) tempStart = d.date;
      tempStreak++;
      tempEnd = d.date;
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
        longStart = tempStart;
        longEnd = tempEnd;
      }
    } else {
      tempStreak = 0;
      tempStart = null;
      tempEnd = null;
    }
  }

  let currentStreak = 0;
  let curStart = null;
  let curEnd = null;

  let idx = validDays.length - 1;
  if (idx >= 0 && validDays[idx].contributionCount === 0) {
    idx--;
  }

  while (idx >= 0 && validDays[idx].contributionCount > 0) {
    currentStreak++;
    if (!curEnd) curEnd = validDays[idx].date;
    curStart = validDays[idx].date;
    idx--;
  }

  const repos = user.repositories?.nodes || [];
  const totalStars = repos.reduce((acc, r) => acc + (r.stargazerCount || 0), 0);

  const statsSvg = generateStatsSvg(user, totalAllTimeContributions, totalStars, totalPRs, totalIssues);
  await fs.writeFile(path.join(assetsDir, 'stats.svg'), statsSvg, 'utf-8');

  const languagesSvg = generateLanguagesSvg(user);
  await fs.writeFile(path.join(assetsDir, 'languages.svg'), languagesSvg, 'utf-8');

  const streakSvg = generateStreakSvg(
    totalAllTimeContributions,
    currentStreak,
    longestStreak,
    curStart,
    curEnd,
    longStart,
    longEnd,
    allDays[0]?.date
  );
  await fs.writeFile(path.join(assetsDir, 'streak.svg'), streakSvg, 'utf-8');

  const calendarWeeks = user.contributionsCollection?.contributionCalendar?.weeks || [];
  const last52Weeks = calendarWeeks.slice(-52);
  const totalPastYear = user.contributionsCollection?.contributionCalendar?.totalContributions || 0;
  const activitySvg = generateActivitySvg(last52Weeks, totalPastYear);
  await fs.writeFile(path.join(assetsDir, 'activity.svg'), activitySvg, 'utf-8');

  try {
    const leetCodeData = await fetchLeetCodeData();
    const leetcodeSvg = generateLeetCodeSvg(leetCodeData);
    await fs.writeFile(path.join(assetsDir, 'leetcode.svg'), leetcodeSvg, 'utf-8');
  } catch (err) {
    console.warn('Skipping LeetCode card:', err.message);
  }

  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal error generating cards:', err);
  process.exit(1);
});

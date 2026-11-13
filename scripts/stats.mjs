import fs from 'node:fs/promises';
import path from 'node:path';

const GH_TOKEN = process.env.GH_TOKEN;
if (!GH_TOKEN) {
  console.error('Error: GH_TOKEN environment variable is required.');
  process.exit(1);
}

const USERNAME = 'TajwarSaiyeed';

async function fetchGitHubGraphQL(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GH_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Node.js'
    },
    body: JSON.stringify({ query, variables })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GitHub GraphQL error (${res.status}): ${errorText}`);
  }

  const result = await res.json();
  if (result.errors && result.errors.length > 0) {
    throw new Error(`GitHub GraphQL error: ${result.errors.map(e => e.message).join(', ')}`);
  }

  return result.data;
}

const USER_META_QUERY = `
  query ($login: String!) {
    user(login: $login) {
      createdAt
      followers {
        totalCount
      }
      repositories(first: 100, ownerAffiliations: [OWNER], privacy: PUBLIC) {
        nodes {
          stargazerCount
        }
      }
    }
  }
`;

const YEAR_CONTRIBUTIONS_QUERY = `
  query ($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
    }
  }
`;

const LEETCODE_QUERY = `
  query ($username: String!) {
    matchedUser(username: $username) {
      submitStats {
        acSubmissionNum {
          difficulty
          count
        }
      }
    }
  }
`;

async function main() {
  const userData = await fetchGitHubGraphQL(USER_META_QUERY, { login: USERNAME });
  const user = userData?.user;
  if (!user) {
    throw new Error(`GitHub user "${USERNAME}" not found.`);
  }

  const repos = user.repositories?.nodes || [];
  const starsEarned = repos.reduce((sum, repo) => sum + (repo.stargazerCount || 0), 0);

  const createdAt = new Date(user.createdAt);
  const startYear = createdAt.getUTCFullYear();
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const todayUTC = now.toISOString().slice(0, 10);

  let allTimeContributions = 0;
  let commitsThisYear = 0;
  const daysMap = new Map();

  for (let year = startYear; year <= currentYear; year++) {
    const from = `${year}-01-01T00:00:00Z`;
    const to = year === currentYear ? now.toISOString() : `${year}-12-31T23:59:59Z`;

    const contribData = await fetchGitHubGraphQL(YEAR_CONTRIBUTIONS_QUERY, {
      login: USERNAME,
      from,
      to
    });

    const collection = contribData?.user?.contributionsCollection;
    if (!collection) continue;

    if (year === currentYear) {
      commitsThisYear = collection.totalCommitContributions || 0;
    }

    const calendar = collection.contributionCalendar;
    if (calendar) {
      allTimeContributions += calendar.totalContributions || 0;
      for (const week of calendar.weeks || []) {
        for (const day of week.contributionDays || []) {
          if (day.date <= todayUTC) {
            daysMap.set(day.date, day.contributionCount);
          }
        }
      }
    }
  }

  const sortedDays = Array.from(daysMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let longestStreak = 0;
  let runningStreak = 0;
  let prevDate = null;

  for (const { date, count } of sortedDays) {
    if (count > 0) {
      if (prevDate) {
        const prevTime = Date.parse(`${prevDate}T00:00:00Z`);
        const currTime = Date.parse(`${date}T00:00:00Z`);
        const diffDays = Math.round((currTime - prevTime) / 86400000);
        if (diffDays === 1) {
          runningStreak++;
        } else {
          runningStreak = 1;
        }
      } else {
        runningStreak = 1;
      }
      prevDate = date;
      if (runningStreak > longestStreak) {
        longestStreak = runningStreak;
      }
    } else {
      runningStreak = 0;
      prevDate = null;
    }
  }

  let currentStreak = 0;
  const todayCount = daysMap.get(todayUTC) ?? 0;
  const checkDate = new Date(`${todayUTC}T00:00:00Z`);

  if (todayCount === 0) {
    checkDate.setUTCDate(checkDate.getUTCDate() - 1);
  }

  while (true) {
    const dateStr = checkDate.toISOString().slice(0, 10);
    const count = daysMap.get(dateStr) ?? 0;
    if (count > 0) {
      currentStreak++;
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    } else {
      break;
    }
  }

  longestStreak = Math.max(longestStreak, currentStreak);

  let leetcodeSolved = null;
  try {
    const lcRes = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      body: JSON.stringify({
        query: LEETCODE_QUERY,
        variables: { username: USERNAME }
      })
    });

    if (lcRes.ok) {
      const lcData = await lcRes.json();
      const acList = lcData?.data?.matchedUser?.submitStats?.acSubmissionNum;
      if (Array.isArray(acList)) {
        const allStat = acList.find(item => item.difficulty === 'All');
        if (allStat && typeof allStat.count === 'number') {
          leetcodeSolved = allStat.count;
        }
      }
    }
  } catch {
    // omit LeetCode stats if fetch fails
  }

  const lines = [
    '**Stats**',
    `- Contributions: ${allTimeContributions.toLocaleString('en-US')} (all time)`,
    `- Current streak: ${currentStreak.toLocaleString('en-US')} days`,
    `- Longest streak: ${longestStreak.toLocaleString('en-US')} days`,
    `- Commits this year: ${commitsThisYear.toLocaleString('en-US')}`,
    `- Stars earned: ${starsEarned.toLocaleString('en-US')}`
  ];

  if (leetcodeSolved !== null) {
    lines.push(`- LeetCode problems solved: ${leetcodeSolved.toLocaleString('en-US')}`);
  }

  const statsMarkdown = lines.join('\n');

  const readmePath = path.resolve(process.cwd(), 'README.md');
  const readme = await fs.readFile(readmePath, 'utf8');

  const startMarker = '<!-- STATS:START -->';
  const endMarker = '<!-- STATS:END -->';
  const statsRegex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`);

  if (!statsRegex.test(readme)) {
    throw new Error('Markers <!-- STATS:START --> and <!-- STATS:END --> not found in README.md');
  }

  const replacement = `${startMarker}\n${statsMarkdown}\n${endMarker}`;
  const updatedReadme = readme.replace(statsRegex, replacement);

  if (updatedReadme !== readme) {
    await fs.writeFile(readmePath, updatedReadme, 'utf8');
    console.log('README.md stats updated successfully:\n' + statsMarkdown);
  } else {
    console.log('README.md stats are already up to date. No changes written.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

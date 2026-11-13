import fs from 'node:fs/promises';
import path from 'node:path';

const token = process.env.GH_TOKEN;
if (!token) {
  console.error('GH_TOKEN environment variable is required');
  process.exit(1);
}

const repos = [
  ['TajwarSaiyeed', 'vault.cloud'],
  ['TajwarSaiyeed', 'labdesk'],
  ['TajwarSaiyeed', 'limecart-ecommerce'],
  ['TajwarSaiyeed', 'brick-game-9999-in-1'],
  ['StaticMania', 'keep-react'],
];

const query = `
  query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      nameWithOwner
      description
      stargazerCount
      forkCount
      primaryLanguage {
        name
        color
      }
    }
  }
`;

function escapeXml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function wrapDescription(text, maxChars = 55, maxLines = 2) {
  if (!text || !text.trim()) return ['No description'];
  const words = text.trim().split(/\s+/);
  const lines = [];
  let current = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const test = current ? `${current} ${word}` : word;
    if (test.length <= maxChars) {
      current = test;
    } else {
      if (lines.length === maxLines - 1) {
        let truncated = current || word;
        if (truncated.length + 3 > maxChars) {
          truncated = truncated.slice(0, Math.max(0, maxChars - 3));
        }
        lines.push(`${truncated.trim()}...`);
        current = '';
        break;
      }
      if (current) {
        lines.push(current);
        current = word;
      } else {
        lines.push(word.slice(0, maxChars));
        current = word.slice(maxChars);
      }
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  return lines.length ? lines : ['No description'];
}

function formatCount(count) {
  const num = Number(count) || 0;
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(num);
}

function generateSvg({ title, description, langName, langColor, stars, forks }) {
  const descLines = wrapDescription(description, 55, 2);
  const descXml = descLines
    .map((line, idx) => `<text class="desc" x="20" y="${55 + idx * 18}">${escapeXml(line)}</text>`)
    .join('\n    ');

  let metaX = 20;
  let metaXml = '';

  if (langName) {
    metaXml += `
      <circle cx="${metaX + 5}" cy="97" r="5" fill="${escapeXml(langColor || '#8b949e')}" />
      <text class="meta" x="${metaX + 16}" y="101">${escapeXml(langName)}</text>`;
    metaX += 16 + Math.round(langName.length * 7.5) + 16;
  }

  const starsStr = formatCount(stars);
  metaXml += `
      <svg class="meta" x="${metaX}" y="91" width="14" height="14" viewBox="0 0 16 16" fill="#8b949e">
        <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z"/>
      </svg>
      <text class="meta" x="${metaX + 18}" y="101">${escapeXml(starsStr)}</text>`;
  metaX += 18 + Math.round(starsStr.length * 7.5) + 16;

  const forksStr = formatCount(forks);
  metaXml += `
      <svg class="meta" x="${metaX}" y="91" width="14" height="14" viewBox="0 0 16 16" fill="#8b949e">
        <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0z"/>
      </svg>
      <text class="meta" x="${metaX + 18}" y="101">${escapeXml(forksStr)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120" viewBox="0 0 400 120" fill="none">
    <style>
      .card {
        font-family: -apple-system, Segoe UI, sans-serif;
        animation: fadeIn 0.4s ease-out;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .title { font-size: 15px; font-weight: bold; fill: #7aa2f7; }
      .desc { font-size: 12px; fill: #8b949e; }
      .meta { font-size: 12px; fill: #8b949e; }
    </style>
    <g class="card">
      <rect width="398" height="118" x="1" y="1" rx="12" fill="#0d1117" stroke="#30363d" stroke-width="1"/>
      <svg x="20" y="18" width="16" height="16" viewBox="0 0 16 16" fill="#7aa2f7">
        <path fill-rule="evenodd" d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 0 0 1.5h2.5a2.25 2.25 0 0 0 2.25-2.25V.75A2.25 2.25 0 0 0 13.25 0H4.5A2.5 2.5 0 0 0 2 2.5v10.75A.75.75 0 0 0 2.75 14h9.5a.75.75 0 0 0 0-1.5H3.5a1 1 0 0 1-1-1V2.5z"/>
      </svg>
      <text class="title" x="44" y="31">${escapeXml(title)}</text>
      ${descXml}
      ${metaXml.trim()}
    </g>
  </svg>`;
}

await fs.mkdir('assets', { recursive: true });

for (const [owner, name] of repos) {
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'pins-script',
      },
      body: JSON.stringify({
        query,
        variables: { owner, name },
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    if (json.errors) {
      throw new Error(json.errors.map((e) => e.message).join(', '));
    }

    const repo = json.data?.repository;
    if (!repo) {
      throw new Error(`Repository ${owner}/${name} not found`);
    }

    const title = owner === 'TajwarSaiyeed' ? name : `${owner}/${name}`;
    const svg = generateSvg({
      title,
      description: repo.description,
      langName: repo.primaryLanguage?.name,
      langColor: repo.primaryLanguage?.color,
      stars: repo.stargazerCount,
      forks: repo.forkCount,
    });

    const safeName = name.replace(/\./g, '-');
    const outputPath = path.join('assets', `pin-${safeName}.svg`);
    await fs.writeFile(outputPath, svg, 'utf8');
  } catch (err) {
    console.error(`Failed to generate pin for ${owner}/${name}:`, err);
  }
}

console.log('done');

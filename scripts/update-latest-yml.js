#!/usr/bin/env node
/**
 * Post-publish script: Updates latest.yml in repo root via GitHub API
 * Usage: GH_TOKEN=... node scripts/update-latest-yml.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const OWNER = 'DYKJLL';
const REPO = 'AudioVisual-Optimized-v2';
const FILE_PATH = 'latest.yml';
const BRANCH = 'master';

if (!TOKEN) { console.error('[UpdateLatestYML] GH_TOKEN not set'); process.exit(1); }

function apiReq(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const u = new URL('https://api.github.com' + apiPath);
    const headers = {
      'Authorization': 'token ' + TOKEN,
      'User-Agent': 'AudioVisual',
      'Accept': 'application/vnd.github.v3+json'
    };
    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const opts = { hostname: u.hostname, path: u.pathname, method, headers };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300 && data) {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, data }); }
        } else {
          resolve({ status: res.statusCode, data: data || {} });
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  const distYml = path.join(__dirname, '..', 'dist', 'latest.yml');
  if (!fs.existsSync(distYml)) {
    console.error('[UpdateLatestYML] dist/latest.yml not found'); process.exit(1);
  }
  const distContent = fs.readFileSync(distYml, 'utf8');
  const version = (distContent.match(/^version:\s*(.+)$/m) || ['',''])[1].trim();
  const sha512 = (distContent.match(/sha512:\s*(.+)$/m) || ['',''])[1].trim();
  const size = parseInt((distContent.match(/size:\s*(\d+)/m) || ['',''])[1] || '0');
  const filePath = (distContent.match(/^path:\s*(.+)$/m) || ['',''])[1].trim();
  const exeUrl = `https://github.com/${OWNER}/${REPO}/releases/download/v${version}/${filePath}`;

  console.log(`[UpdateLatestYML] v${version} | ${filePath} | SHA: ${sha512.substring(0, 16)}...`);

  const newContent = `version: ${version}
files:
  - url: ${exeUrl}
    sha512: ${sha512}
    size: ${size}
path: ${filePath}
sha512: ${sha512}
releaseDate: '${new Date().toISOString()}'
`;

  // Get current file SHA
  const getResult = await apiReq('GET', `/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`);
  if (!getResult.data.sha) {
    console.error('[UpdateLatestYML] Could not get current SHA:', getResult.data.message || getResult.data);
    process.exit(1);
  }
  console.log('[UpdateLatestYML] Current SHA:', getResult.data.sha);

  // Update via GitHub API
  const putResult = await apiReq('PUT', `/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`, {
    message: `chore: update latest.yml for v${version}`,
    content: Buffer.from(newContent).toString('base64'),
    sha: getResult.data.sha,
    branch: BRANCH
  });

  if (putResult.status === 200) {
    console.log('[UpdateLatestYML] ✅ latest.yml updated! Commit:', putResult.data.commit?.sha);
    console.log('[UpdateLatestYML] URL: https://raw.githubusercontent.com/' +
      `${OWNER}/${REPO}/${BRANCH}/${FILE_PATH}`);
  } else {
    console.error('[UpdateLatestYML] ❌ Failed:', putResult.data?.message || putResult.data);
    process.exit(1);
  }
}

main().catch(err => { console.error('[UpdateLatestYML] Error:', err.message); process.exit(1); });

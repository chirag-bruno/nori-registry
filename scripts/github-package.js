#!/usr/bin/env node
/**
 * Generic GitHub Package Script
 * Automatically generates package manifests for any GitHub repository
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Configuration
let config = {
  owner: null,
  repo: null,
  packageName: null,
  bins: [],
  description: null,
  homepage: null,
  license: null,
  githubToken: process.env.GITHUB_TOKEN || null,
  allowDownloadChecksum: false, // Set to true to allow downloading files to compute checksums (slow)
};

// Progress tracking
let totalReleases = 0;
let processedCount = 0;
let newVersionsCount = 0;

/**
 * Create a simple progress bar
 */
function createProgressBar(current, total, width = 40) {
  const percentage = Math.min(100, Math.round((current / total) * 100));
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percentage}%`;
}

/**
 * Update progress display
 */
function updateProgress(currentVersion = null, platformsFound = 0) {
  const progressBar = createProgressBar(processedCount, totalReleases);
  const info = currentVersion 
    ? `Processing: ${currentVersion} (${platformsFound} platforms)` 
    : `Total: ${totalReleases} releases | New: ${newVersionsCount}`;
  
  // Clear line and print progress
  process.stdout.write(`\r${progressBar} | ${info}${' '.repeat(20)}`);
}

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let configFile = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--config':
        configFile = nextArg;
        i++;
        break;
      case '--owner':
        config.owner = nextArg;
        i++;
        break;
      case '--repo':
        config.repo = nextArg;
        i++;
        break;
      case '--package-name':
        config.packageName = nextArg;
        i++;
        break;
      case '--bins':
        try {
          config.bins = JSON.parse(nextArg);
        } catch (e) {
          console.error(`Error parsing --bins: ${e.message}`);
          process.exit(1);
        }
        i++;
        break;
      case '--github-token':
        config.githubToken = nextArg;
        i++;
        break;
      case '--allow-download-checksum':
        config.allowDownloadChecksum = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  // Load config file if provided
  if (configFile) {
    try {
      const configData = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      // Merge config file with CLI args (CLI args take precedence)
      config = { ...configData, ...config };
    } catch (e) {
      console.error(`Error reading config file: ${e.message}`);
      process.exit(1);
    }
  }

  // Validate required fields
  if (!config.owner || !config.repo || !config.packageName || !config.bins || config.bins.length === 0) {
    console.error('Error: Missing required fields. Required: --owner, --repo, --package-name, --bins');
    console.error('Use --help for usage information');
    process.exit(1);
  }
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
Usage: node scripts/github-package.js [options]

Options:
  --config <file>        Path to JSON config file
  --owner <owner>        GitHub repository owner
  --repo <repo>          GitHub repository name
  --package-name <name>  Package name for the manifest
  --bins <json>          JSON array of binaries: [{"name":"bin1","path":"bin/bin1"}]
  --github-token <token> GitHub personal access token (or set GITHUB_TOKEN env var)
  --help, -h             Show this help message

Example:
  node scripts/github-package.js \\
    --owner neovim \\
    --repo neovim \\
    --package-name neovim \\
    --bins '[{"name":"nvim","path":"bin/nvim"}]'
`);
}

/**
 * Make HTTPS request
 */
function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'nori-registry-script/1.0',
        'Accept': options.accept || 'application/vnd.github.v3+json',
        ...(config.githubToken ? { 'Authorization': `token ${config.githubToken}` } : {}),
        ...options.headers,
      },
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (options.raw || !requestOptions.headers.Accept.includes('json')) {
            resolve(data);
          } else {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(data);
            }
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

/**
 * Fetch all releases from GitHub
 */
async function fetchReleases(owner, repo) {
  const releases = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/releases?page=${page}&per_page=${perPage}`;
      const pageReleases = await httpsRequest(url);

      if (!Array.isArray(pageReleases) || pageReleases.length === 0) {
        break;
      }

      releases.push(...pageReleases);
      page++;

      // Rate limiting: if we got less than perPage, we're done
      if (pageReleases.length < perPage) {
        break;
      }
    } catch (error) {
      console.error(`Error fetching releases page ${page}: ${error.message}`);
      break;
    }
  }

  return releases.filter((r) => !r.prerelease);
}

/**
 * Fetch repository metadata
 */
async function fetchRepoMetadata(owner, repo) {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    const repoData = await httpsRequest(url);

    return {
      description: repoData.description || null,
      homepage: repoData.homepage || repoData.html_url || null,
      license: repoData.license?.spdx_id || repoData.license?.name || null,
    };
  } catch (error) {
    console.warn(`Warning: Could not fetch repo metadata: ${error.message}`);
    return {
      description: null,
      homepage: null,
      license: null,
    };
  }
}

/**
 * Match platform from filename
 * Handles various naming conventions and maps to standardized format
 */
function matchPlatform(filename) {
  const lower = filename.toLowerCase();
  let os = null;
  let arch = null;

  // Match OS - check darwin/macos first (before win, since "darwin" contains "win")
  if (lower.includes('darwin') || lower.includes('macos') || lower.includes('mac-os') || 
      lower.includes('osx') || lower.includes('os-x') || 
      (lower.includes('mac') && !lower.includes('macintosh'))) {
    os = 'macos';
  } else if (lower.includes('windows') || lower.includes('win32') || lower.includes('win64') ||
             (lower.includes('win') && !lower.includes('darwin'))) {
    os = 'windows';
  } else if (lower.includes('linux') || lower.includes('gnu-linux') || 
             lower.includes('linux-gnu') || lower.includes('linux-musl')) {
    os = 'linux';
  }

  // Match architecture - check most specific first
  // Check for arm64 first (more specific than arm or 64)
  if (lower.includes('arm64') || lower.includes('aarch64') || lower.includes('armv8')) {
    arch = 'arm64';
  } 
  // Check for amd64/x64/x86_64 (but not x86 which is 32-bit)
  else if (lower.includes('amd64') || lower.includes('x86_64') || lower.includes('x86-64') ||
           (lower.includes('x64') && !lower.includes('x86')) ||
           (lower.includes('intel64') || lower.includes('em64t'))) {
    arch = 'amd64';
  }
  // Check for x86/32-bit (but not x86_64 which is 64-bit)
  else if (lower.includes('i386') || lower.includes('i686') || lower.includes('ia32') ||
           (lower.includes('x86') && !lower.includes('x86_64') && !lower.includes('x86-64')) ||
           (lower.includes('386') || lower.includes('686')) ||
           (lower.includes('32') && !lower.includes('64') && !lower.includes('32bit'))) {
    arch = 'x86';
  }
  // Check for standalone "64" (like win64, linux64) but not arm64
  else if (lower.includes('64') && !lower.includes('arm') && !lower.includes('aarch')) {
    arch = 'amd64';
  }
  // Check for standalone "32" (like win32 when referring to arch, not OS)
  else if ((lower.includes('32') || lower.includes('32bit') || lower.includes('32-bit')) && 
           !lower.includes('64') && os === 'windows') {
    // win32 can mean Windows OS, but if we already detected windows, this might be architecture
    // Only treat as x86 if we're sure it's not just the OS name
    if (lower.match(/win32[^a-z]/) || lower.includes('windows-32') || lower.includes('win-32')) {
      arch = 'x86';
    }
  }
  // Default to amd64 if OS is detected but no architecture found (for older releases)
  // This handles cases like "nvim-macos.tar.gz" or "nvim-linux.tar.gz"
  else if (os && !arch) {
    // For older releases without architecture in filename, default to amd64
    // (most common architecture for historical releases)
    arch = 'amd64';
  }

  if (!os || !arch) {
    return null;
  }

  return `${os}-${arch}`;
}

/**
 * Detect archive type from filename
 * Only returns types supported by nori: tar, zip, tar.gz, tgz, tar.xz
 */
function detectArchiveType(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    return 'tar.gz';
  } else if (lower.endsWith('.tar.xz')) {
    return 'tar.xz';
  } else if (lower.endsWith('.zip')) {
    return 'zip';
  } else if (lower.endsWith('.tar')) {
    return 'tar';
  }
  // Exclude: .msi, .exe, .deb, .rpm, .dmg, .pkg, .appimage, etc.
  return null;
}

/**
 * Get archive type priority for asset selection
 * Lower number = higher priority
 * Only supports types that nori can handle: tar, zip, tar.gz, tgz, tar.xz
 */
function getArchiveTypePriority(archiveType, os) {
  if (os === 'windows') {
    // Windows: zip only (nori doesn't support msi)
    if (archiveType === 'zip') return 1;
  } else {
    // Linux/macOS: tar.gz > tar.xz > tar > zip
    if (archiveType === 'tar.gz') return 1;
    if (archiveType === 'tar.xz') return 2;
    if (archiveType === 'tar') return 3;
    if (archiveType === 'zip') return 4;
  }
  return 999; // Unknown types have lowest priority
}

/**
 * Get checksum from GitHub API (Tier 1: Fastest)
 * GitHub now provides SHA256 checksums directly in the asset object via the 'digest' field
 */
function getChecksumFromAPI(asset) {
  // GitHub API now includes checksums directly in the asset object
  // Format: "sha256:abc123..." - we need to extract just the hash part
  if (asset.digest && asset.digest.startsWith('sha256:')) {
    return asset.digest.substring(7); // Remove "sha256:" prefix
  }
  return null;
}

/**
 * Get checksum from author-provided checksum files (Tier 2: Medium speed)
 * Looks for .sha256, .sha256sum files in the same release
 */
async function getChecksumFromFiles(asset, releaseAssets) {
  try {
    const assetName = asset.name.toLowerCase();
    const checksumPatterns = [
      assetName + '.sha256',
      assetName + '.sha256sum',
      assetName.replace(/\.(tar\.gz|zip|tar\.xz)$/, '.sha256'),
      assetName.replace(/\.(tar\.gz|zip|tar\.xz)$/, '.sha256sum'),
      'checksums.txt',
      'checksums.sha256',
      'SHA256SUMS',
    ];

    // Look for checksum files in the same release
    for (const pattern of checksumPatterns) {
      const checksumAsset = releaseAssets.find((a) => a.name.toLowerCase() === pattern);
      if (checksumAsset) {
        try {
          const checksumContent = await httpsRequest(checksumAsset.browser_download_url, { raw: true });
          // Parse checksum file (format: "checksum  filename" or just "checksum")
          const lines = checksumContent.split('\n');
          for (const line of lines) {
            if (line.includes(asset.name)) {
              const match = line.match(/^([a-f0-9]{64})/i);
              if (match) {
                return match[1];
              }
            }
            // Also try lines that just have the checksum (without filename)
            const simpleMatch = line.trim().match(/^([a-f0-9]{64})$/i);
            if (simpleMatch && lines.length === 1) {
              return simpleMatch[1];
            }
          }
        } catch (e) {
          // Continue to next pattern
        }
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Download file and calculate SHA256 (handles redirects)
 */
async function calculateChecksum(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const makeRequest = (currentUrl, redirectCount = 0) => {
      if (redirectCount > maxRedirects) {
        reject(new Error('Too many redirects'));
        return;
      }

      const urlObj = new URL(currentUrl);
      const isHttps = urlObj.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const requestOptions = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'nori-registry-script/1.0',
        },
      };

      const hash = crypto.createHash('sha256');
      let downloaded = false;

      const req = httpModule.request(requestOptions, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          req.destroy();
          makeRequest(res.headers.location, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        res.on('data', (chunk) => {
          hash.update(chunk);
        });

        res.on('end', () => {
          downloaded = true;
          resolve(hash.digest('hex'));
        });
      });

      req.on('error', (error) => {
        if (!downloaded) {
          reject(error);
        }
      });

      req.setTimeout(60000, () => {
        req.destroy();
        if (!downloaded) {
          reject(new Error('Download timeout'));
        }
      });

      req.end();
    };

    makeRequest(url);
  });
}

/**
 * Get checksum for an asset (three-tier fallback system)
 * Tier 1: GitHub API digest field (fastest, no downloads)
 * Tier 2: Author-provided checksum files (medium speed, small file downloads)
 * Tier 3: Download and compute (slowest, full file download) - only if enabled
 */
async function getChecksum(asset, owner, repo, url, releaseAssets) {
  // Tier 1: Try GitHub API digest field first (fastest)
  const apiChecksum = getChecksumFromAPI(asset);
  if (apiChecksum) {
    return apiChecksum;
  }

  // Tier 2: Try author-provided checksum files (medium speed)
  const fileChecksum = await getChecksumFromFiles(asset, releaseAssets);
  if (fileChecksum) {
    return fileChecksum;
  }

  // Tier 3: Download and compute checksum (slowest, last resort)
  // Only enabled if --allow-download-checksum flag is set
  if (config.allowDownloadChecksum) {
    try {
      const checksum = await calculateChecksum(url);
      return checksum;
    } catch (error) {
      console.warn(`  Warning: Could not get checksum for ${asset.name}: ${error.message}`);
      return null;
    }
  }

  // No checksum available and download is disabled
  return null;
}

/**
 * Extract version from tag
 */
function extractVersion(tag) {
  // Remove 'v' prefix if present
  return tag.replace(/^v/i, '');
}

/**
 * Validate version format - strict semver
 * Valid formats:
 *   - 1.2.3 (stable)
 *   - 1.2.3-alpha.1 (pre-release with dot separator)
 *   - 1.2.3-beta.2 (pre-release with dot separator)
 *   - 1.2.3-rc.3 (pre-release with dot separator)
 * Invalid formats (will be rejected):
 *   - 1.25rc3 (missing dots, should be 1.25.0-rc.3)
 *   - 1.2 (missing patch version)
 *   - 1.2.3-dev.123 (dev versions not standard semver)
 */
function isValidVersion(version) {
  // Must start with MAJOR.MINOR.PATCH
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    return false;
  }
  
  // If there's a pre-release identifier, it must use proper semver format with dots
  // e.g., 1.2.3-rc.3, 1.2.3-alpha.1, 1.2.3-beta.2
  // Reject formats like 1.25rc3, 1.25-rc3 (missing dots)
  if (version.includes('-')) {
    const parts = version.split('-');
    if (parts.length > 1) {
      const preRelease = parts[1].split('+')[0]; // Remove build metadata if present
      // Pre-release must contain a dot (e.g., rc.3, alpha.1, beta.2)
      // Reject formats like "rc3", "alpha1" without dots
      if (!preRelease.includes('.')) {
        return false;
      }
    }
  }
  
  // Reject dev versions (not standard semver)
  if (version.includes('-dev') || version.includes('+dev')) {
    return false;
  }
  
  return true;
}

/**
 * Version comparison for sorting
 */
function versionKey(version) {
  const parts = version.split('-')[0].split('.');
  while (parts.length < 3) {
    parts.push('0');
  }
  return parts.map((p) => parseInt(p, 10) || 0);
}

/**
 * Process a single release
 */
async function processRelease(release, existingVersions) {
  const version = extractVersion(release.tag_name);

  if (!isValidVersion(version)) {
    return null;
  }

  if (existingVersions.has(version)) {
    return null; // Already exists
  }

  processedCount++;

  // Format bins array
  const bins = config.bins.map((b) => {
    if (typeof b === 'string') {
      return b;
    }
    return b.path || b.name || b;
  });

  const versionEntry = {
    version: version,
    bins: bins,
    platforms: {},
  };

  // Step 1: Collect all matching assets grouped by platform
  const platformAssets = {};
  for (const asset of release.assets || []) {
    const platform = matchPlatform(asset.name);
    const archiveType = detectArchiveType(asset.name);

    if (!platform || !archiveType) {
      continue;
    }

    if (!platformAssets[platform]) {
      platformAssets[platform] = [];
    }

    const [os] = platform.split('-');
    platformAssets[platform].push({
      asset: asset,
      archiveType: archiveType,
      priority: getArchiveTypePriority(archiveType, os),
    });
  }

  // Step 2: For each platform, select the best asset based on priority
  for (const [platform, candidates] of Object.entries(platformAssets)) {
    // Sort by priority (lower is better), then by filename (for consistency)
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.asset.name.localeCompare(b.asset.name);
    });

    // Try each candidate in priority order until we get a valid checksum
    let selected = null;
    for (const candidate of candidates) {
      const url = candidate.asset.browser_download_url;
      // Get checksum using three-tier fallback system
      const checksum = await getChecksum(candidate.asset, config.owner, config.repo, url, release.assets);

      if (checksum) {
        selected = {
          type: candidate.archiveType,
          url: url,
          checksum: `sha256:${checksum}`,
        };
        break; // Found valid asset, stop trying others
      }
      // If no checksum available, skip this candidate and try next one
    }

    if (selected) {
      versionEntry.platforms[platform] = selected;
    }
  }

  // Only add if we have at least one platform
  const platformsCount = Object.keys(versionEntry.platforms).length;
  if (platformsCount > 0) {
    newVersionsCount++;
    // Update progress bar
    updateProgress(version, platformsCount);
    return versionEntry;
  }

  // Update progress even if no platforms found (version skipped)
  updateProgress(version, 0);
  return null;
}

/**
 * Read existing YAML file
 */
function readExistingYAML(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return yaml.load(content) || { versions: [] };
    }
  } catch (error) {
    console.warn(`Warning: Could not read existing YAML: ${error.message}`);
  }
  return { versions: [] };
}

/**
 * Merge versions
 */
function mergeVersions(existing, newVersions) {
  const versionMap = new Map();

  // Add existing versions
  for (const version of existing.versions || []) {
    if (version.version) {
      versionMap.set(version.version, version);
    }
  }

  // Add/update with new versions
  for (const version of newVersions) {
    if (version.version) {
      versionMap.set(version.version, version);
    }
  }

  // Sort versions (descending - newest first)
  const sorted = Array.from(versionMap.values()).sort((a, b) => {
    const keyA = versionKey(a.version);
    const keyB = versionKey(b.version);
    for (let i = 0; i < Math.max(keyA.length, keyB.length); i++) {
      const valA = keyA[i] || 0;
      const valB = keyB[i] || 0;
      if (valB !== valA) {
        return valB - valA;
      }
    }
    return 0;
  });

  return sorted;
}

/**
 * Write YAML file
 */
function writeYAML(filePath, data) {
  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const yamlContent = yaml.dump(data, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
  fs.writeFileSync(filePath, yamlContent, 'utf8');
}

/**
 * Main function
 */
async function main() {
  parseArgs();

  console.log(`Fetching releases from GitHub: ${config.owner}/${config.repo}...`);

  // Fetch releases and metadata
  const [releases, repoMetadata] = await Promise.all([
    fetchReleases(config.owner, config.repo),
    fetchRepoMetadata(config.owner, config.repo),
  ]);

  totalReleases = releases.length;
  console.log(`Found ${totalReleases} total versions to process`);

  // Read existing YAML
  const yamlPath = path.join(PROJECT_ROOT, 'packages', `${config.packageName}.yaml`);
  const existing = readExistingYAML(yamlPath);
  const existingVersions = new Set((existing.versions || []).map((v) => v.version));

  console.log(`Found ${existingVersions.size} existing versions in registry`);
  console.log('');
  updateProgress(); // Initial progress display

  // Process releases
  const newVersions = [];
  for (const release of releases) {
    const versionEntry = await processRelease(release, existingVersions);
    if (versionEntry) {
      newVersions.push(versionEntry);
    }
  }

  // Finish progress bar
  console.log(''); // New line after progress bar

  // Merge versions
  if (newVersions.length > 0) {
    console.log('');
    console.log('==========================================');
    console.log('Processing complete! Merging new versions...');
    console.log('==========================================');

    const mergedVersions = mergeVersions(existing, newVersions);

    // Build final data structure
    const finalData = {
      schema: 1,
      name: config.packageName,
      description: config.description || repoMetadata.description || '',
      homepage: config.homepage || repoMetadata.homepage || `https://github.com/${config.owner}/${config.repo}`,
      license: config.license || repoMetadata.license || '',
      versions: mergedVersions,
    };

    // Preserve existing metadata if file exists
    if (fs.existsSync(yamlPath)) {
      finalData.description = existing.description || finalData.description;
      finalData.homepage = existing.homepage || finalData.homepage;
      finalData.license = existing.license || finalData.license;
    }

    writeYAML(yamlPath, finalData);
    console.log(`Successfully added ${newVersions.length} new version(s) to ${yamlPath}`);
    console.log('Done!');
  } else {
    console.log('No new versions to add.');
  }
}

// Run main function
main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});


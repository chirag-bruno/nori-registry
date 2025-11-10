#!/usr/bin/env node
/**
 * Node.js Package Script
 * Fetches Node.js releases from nodejs.org/dist/index.json and generates package manifest
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Make HTTPS request
 */
function httpsRequest(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(data);
          } catch (e) {
            reject(new Error(`Invalid response: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Parse SHASUMS256.txt to get checksums
 */
function parseChecksums(checksumContent) {
  const checksums = {};
  const lines = checksumContent.split('\n');
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/i);
    if (match) {
      const [, hash, filename] = match;
      checksums[filename] = hash;
    }
  }
  return checksums;
}

/**
 * Map Node.js platform to nori format
 * Node.js uses formats like: linux-x64, osx-arm64-tar, win-x64-zip
 */
function mapPlatform(fileType) {
  const lower = fileType.toLowerCase();
  
  // Linux platforms
  if (lower === 'linux-x64' || lower === 'linux-x86_64') {
    return 'linux-amd64';
  }
  if (lower === 'linux-arm64' || lower === 'linux-aarch64') {
    return 'linux-arm64';
  }
  
  // macOS platforms (osx = macOS)
  if (lower === 'osx-arm64-tar' || lower === 'osx-arm64') {
    return 'macos-arm64';
  }
  if (lower === 'osx-x64-tar' || lower === 'osx-x64' || lower === 'darwin-x64') {
    return 'macos-amd64';
  }
  
  // Windows platforms
  if (lower === 'win-x64-zip' || lower === 'win-x64' || lower === 'win64') {
    return 'windows-amd64';
  }
  if (lower === 'win-x86-zip' || lower === 'win-x86' || lower === 'win32') {
    return 'windows-x86';
  }
  if (lower === 'win-arm64-zip' || lower === 'win-arm64') {
    return 'windows-arm64';
  }
  
  return null;
}

/**
 * Detect archive type from filename
 */
function detectArchiveType(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.tar.xz')) return 'tar.xz';
  return null;
}

/**
 * Get filename for a platform based on file type
 */
function getFilenameForFileType(version, fileType) {
  const v = version.replace(/^v/, '');
  const base = `node-v${v}`;
  
  // Map file type to actual filename
  if (fileType === 'linux-x64') return `${base}-linux-x64.tar.gz`;
  if (fileType === 'linux-arm64') return `${base}-linux-arm64.tar.gz`;
  if (fileType === 'osx-arm64-tar') return `${base}-darwin-arm64.tar.gz`;
  if (fileType === 'osx-x64-tar') return `${base}-darwin-x64.tar.gz`;
  if (fileType === 'win-x64-zip') return `${base}-win-x64.zip`;
  if (fileType === 'win-x86-zip') return `${base}-win-x86.zip`;
  if (fileType === 'win-arm64-zip') return `${base}-win-arm64.zip`;
  
  return null;
}

/**
 * Read existing YAML
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
 * Version comparison
 */
function versionKey(version) {
  const parts = version.replace(/^v/, '').split('-')[0].split('.');
  while (parts.length < 3) {
    parts.push('0');
  }
  return parts.map((p) => parseInt(p, 10) || 0);
}

/**
 * Validate version format - strict semver
 */
function isValidVersion(version) {
  // Remove 'v' prefix for validation
  const cleanVersion = version.replace(/^v/i, '');
  
  // Must start with MAJOR.MINOR.PATCH
  if (!/^\d+\.\d+\.\d+/.test(cleanVersion)) {
    return false;
  }
  
  // If there's a pre-release identifier, it must use proper semver format with dots
  if (cleanVersion.includes('-')) {
    const parts = cleanVersion.split('-');
    if (parts.length > 1) {
      const preRelease = parts[1].split('+')[0];
      if (!preRelease.includes('.')) {
        return false;
      }
    }
  }
  
  // Reject dev versions
  if (cleanVersion.includes('-dev') || cleanVersion.includes('+dev')) {
    return false;
  }
  
  return true;
}

/**
 * Main function
 */
async function main() {
  console.log('Fetching Node.js releases from nodejs.org...');

  const indexUrl = 'https://nodejs.org/dist/index.json';
  const indexData = await httpsRequest(indexUrl);
  const releases = JSON.parse(indexData);
  
  const existing = readExistingYAML(path.join(PROJECT_ROOT, 'packages', 'node.yaml'));
  const existingVersions = new Set((existing.versions || []).map((v) => v.version));

  console.log(`Found ${releases.length} total versions to process`);
  console.log(`Found ${existingVersions.size} existing versions in registry`);
  console.log('');

  const newVersions = [];

  for (const release of releases) {
    const version = release.version.replace(/^v/i, '');
    
    // Skip invalid semver versions
    if (!isValidVersion(release.version)) {
      continue;
    }
    
    if (existingVersions.has(version)) {
      continue;
    }

    const versionEntry = {
      version: version,
      bins: ['bin/node', 'bin/npm', 'bin/npx'],
      platforms: {},
    };

    // Fetch checksums for this version
    let checksums = {};
    try {
      const checksumUrl = `https://nodejs.org/dist/${release.version}/SHASUMS256.txt`;
      const checksumContent = await httpsRequest(checksumUrl);
      checksums = parseChecksums(checksumContent);
    } catch (error) {
      console.warn(`  Warning: Could not fetch checksums for ${version}: ${error.message}`);
      continue; // Skip if we can't get checksums
    }

    // Process files array to find supported platforms
    const platformMap = {
      'linux-x64': 'linux-amd64',
      'linux-arm64': 'linux-arm64',
      'osx-arm64-tar': 'macos-arm64',
      'osx-x64-tar': 'macos-amd64',
      'win-x64-zip': 'windows-amd64',
      'win-x86-zip': 'windows-x86',
      'win-arm64-zip': 'windows-arm64',
    };

    for (const fileType of release.files || []) {
      const platform = platformMap[fileType];
      if (!platform) continue;
      if (versionEntry.platforms[platform]) continue; // Already have this platform

      const filename = getFilenameForFileType(release.version, fileType);
      if (!filename) continue;

      const checksum = checksums[filename];
      if (!checksum) continue; // Skip if no checksum

      const archiveType = detectArchiveType(filename);
      if (!archiveType) continue;

      versionEntry.platforms[platform] = {
        type: archiveType,
        url: `https://nodejs.org/dist/${release.version}/${filename}`,
        checksum: `sha256:${checksum}`,
      };
    }

    if (Object.keys(versionEntry.platforms).length > 0) {
      newVersions.push(versionEntry);
      console.log(`  ✓ Added version ${version} with ${Object.keys(versionEntry.platforms).length} platform(s)`);
    }
  }

  if (newVersions.length > 0) {
    const mergedVersions = [...(existing.versions || []), ...newVersions].sort((a, b) => {
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

    const finalData = {
      schema: 1,
      name: 'node',
      description: existing.description || 'JavaScript runtime built on Chrome\'s V8 JavaScript engine',
      homepage: existing.homepage || 'https://nodejs.org',
      license: existing.license || 'MIT',
      versions: mergedVersions,
    };

    const yamlPath = path.join(PROJECT_ROOT, 'packages', 'node.yaml');
    const dir = path.dirname(yamlPath);
    // Ensure packages directory exists
    fs.mkdirSync(dir, { recursive: true });
    
    const yamlContent = yaml.dump(finalData, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    });
    fs.writeFileSync(yamlPath, yamlContent, 'utf8');

    console.log(`\nSuccessfully added ${newVersions.length} new version(s) to ${yamlPath}`);
  } else {
    console.log('\nNo new versions to add.');
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});


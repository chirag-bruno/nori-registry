#!/usr/bin/env node
/**
 * Zig Package Script
 * Fetches Zig releases from ziglang.org/download/index.json and generates package manifest
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
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Map Zig platform to nori format
 * Zig uses formats like: x86_64-linux, aarch64-macos, x86_64-windows, etc.
 */
function mapPlatform(platformKey) {
  // Handle platform keys from Zig's JSON API
  if (platformKey === 'x86_64-linux' || platformKey === 'x86_64-linux-gnu') {
    return 'linux-amd64';
  }
  if (platformKey === 'aarch64-linux' || platformKey === 'arm64-linux') {
    return 'linux-arm64';
  }
  if (platformKey === 'x86_64-macos' || platformKey === 'x86_64-darwin') {
    return 'macos-amd64';
  }
  if (platformKey === 'aarch64-macos' || platformKey === 'arm64-macos' || platformKey === 'aarch64-darwin') {
    return 'macos-arm64';
  }
  if (platformKey === 'x86_64-windows' || platformKey === 'x86_64-win32') {
    return 'windows-amd64';
  }
  if (platformKey === 'x86-windows' || platformKey === 'i386-windows' || platformKey === 'x86-win32') {
    return 'windows-x86';
  }
  if (platformKey === 'aarch64-windows' || platformKey === 'arm64-windows') {
    return 'windows-arm64';
  }
  
  // Also handle from filename patterns
  const lower = platformKey.toLowerCase();
  if (lower.includes('linux') && (lower.includes('x86_64') || lower.includes('amd64'))) {
    return 'linux-amd64';
  }
  if (lower.includes('linux') && (lower.includes('aarch64') || lower.includes('arm64'))) {
    return 'linux-arm64';
  }
  if ((lower.includes('macos') || lower.includes('darwin')) && (lower.includes('x86_64') || lower.includes('amd64'))) {
    return 'macos-amd64';
  }
  if ((lower.includes('macos') || lower.includes('darwin')) && (lower.includes('aarch64') || lower.includes('arm64'))) {
    return 'macos-arm64';
  }
  if (lower.includes('windows') && (lower.includes('x86_64') || lower.includes('amd64'))) {
    return 'windows-amd64';
  }
  if (lower.includes('windows') && (lower.includes('x86') || lower.includes('i386')) && !lower.includes('x86_64')) {
    return 'windows-x86';
  }
  if (lower.includes('windows') && (lower.includes('aarch64') || lower.includes('arm64'))) {
    return 'windows-arm64';
  }
  
  return null;
}

/**
 * Detect archive type from URL or filename
 */
function detectArchiveType(url) {
  const lower = url.toLowerCase();
  if (lower.endsWith('.tar.xz')) return 'tar.xz';
  if (lower.endsWith('.tar.gz')) return 'tar.gz';
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.tar')) return 'tar';
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
  // Handle versions like "0.15.2" or "0.16.0-dev.1265+bdbfc7de3"
  const cleanVersion = version.replace(/^v/, '').split('-')[0]; // Remove 'v' prefix and dev suffix
  const parts = cleanVersion.split('.');
  while (parts.length < 3) {
    parts.push('0');
  }
  return parts.map((p) => parseInt(p, 10) || 0);
}

/**
 * Extract version from Zig version string
 */
function extractVersion(versionStr) {
  // Remove 'v' prefix if present, and take the base version (before -dev)
  return versionStr.replace(/^v/, '').split('-')[0];
}

/**
 * Main function
 */
async function main() {
  console.log('Fetching Zig releases from ziglang.org...');

  const data = await httpsRequest('https://ziglang.org/download/index.json');
  const existing = readExistingYAML(path.join(PROJECT_ROOT, 'packages', 'zig.yaml'));
  const existingVersions = new Set((existing.versions || []).map((v) => v.version));

  // Get all versions from the JSON
  // Structure: { "master": {...}, "0.15.2": {...}, "0.15.1": {...}, ... }
  const allVersions = [];
  
  for (const [key, versionData] of Object.entries(data)) {
    // Skip if it's not a version entry (should have platform data)
    if (!versionData || typeof versionData !== 'object') continue;
    
    // Extract version number
    let version;
    if (key === 'master' && versionData.version) {
      version = extractVersion(versionData.version);
    } else if (key.match(/^\d+\.\d+\.\d+/)) {
      // Key is the version number itself
      version = extractVersion(key);
    } else {
      continue; // Skip unknown keys
    }
    
    allVersions.push({
      version: version,
      platforms: versionData,
    });
  }

  console.log(`Found ${allVersions.length} total versions to process`);
  console.log(`Found ${existingVersions.size} existing versions in registry`);
  console.log('');

  const newVersions = [];

  for (const versionData of allVersions) {
    const version = versionData.version;
    
    if (existingVersions.has(version)) {
      continue;
    }

    const versionEntry = {
      version: version,
      bins: ['zig'], // Zig binary is at root, not in bin/
      platforms: {},
    };

    // Process all platform entries
    for (const [platformKey, platformData] of Object.entries(versionData.platforms)) {
      // Skip non-platform entries like 'date', 'docs', 'stdDocs', 'src', 'bootstrap'
      if (typeof platformData !== 'object' || !platformData.tarball) {
        continue;
      }

      const platform = mapPlatform(platformKey);
      const archiveType = detectArchiveType(platformData.tarball);

      if (!platform || !archiveType) continue;
      if (versionEntry.platforms[platform]) continue; // Already have this platform

      // Zig provides checksums directly in the JSON
      if (platformData.shasum) {
        versionEntry.platforms[platform] = {
          type: archiveType,
          url: platformData.tarball,
          checksum: `sha256:${platformData.shasum}`,
        };
      }
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
      name: 'zig',
      description: existing.description || 'General-purpose programming language and toolchain',
      homepage: existing.homepage || 'https://ziglang.org',
      license: existing.license || 'MIT',
      versions: mergedVersions,
    };

    const yamlPath = path.join(PROJECT_ROOT, 'packages', 'zig.yaml');
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


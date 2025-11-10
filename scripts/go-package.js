#!/usr/bin/env node
/**
 * Go Package Script
 * Fetches Go releases from go.dev API and generates package manifest
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
 * Map Go platform to nori format
 * Supports common platforms that nori CLI can handle
 */
function mapPlatform(os, arch) {
  // Linux platforms
  if (os === 'linux' && arch === 'amd64') return 'linux-amd64';
  if (os === 'linux' && (arch === '386' || arch === 'x86')) return 'linux-x86';
  if (os === 'linux' && arch === 'arm64') return 'linux-arm64';
  
  // macOS platforms
  if (os === 'darwin' && arch === 'amd64') return 'macos-amd64';
  if (os === 'darwin' && arch === 'arm64') return 'macos-arm64';
  
  // Windows platforms
  if (os === 'windows' && arch === 'amd64') return 'windows-amd64';
  if (os === 'windows' && (arch === '386' || arch === 'x86')) return 'windows-x86';
  if (os === 'windows' && arch === 'arm64') return 'windows-arm64';
  
  // Note: We skip BSD variants, Plan9, Solaris, etc. as they're less common
  // and may not be supported by the nori CLI
  return null;
}

/**
 * Detect archive type
 */
function detectArchiveType(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tar.gz')) return 'tar.gz';
  if (lower.endsWith('.zip')) return 'zip';
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
  const parts = version.split('-')[0].split('.');
  while (parts.length < 3) {
    parts.push('0');
  }
  return parts.map((p) => parseInt(p, 10) || 0);
}

/**
 * Main function
 */
async function main() {
  console.log('Fetching Go releases from go.dev...');

  const releases = await httpsRequest('https://go.dev/dl/?mode=json&include=all');
  const existing = readExistingYAML(path.join(PROJECT_ROOT, 'packages', 'go.yaml'));
  const existingVersions = new Set((existing.versions || []).map((v) => v.version));

  console.log(`Found ${releases.length} total versions to process`);
  console.log(`Found ${existingVersions.size} existing versions in registry`);
  console.log('');

  const newVersions = [];

  for (const release of releases) {
    const version = release.version.replace(/^go/, '');
    
    if (existingVersions.has(version)) {
      continue;
    }

    const versionEntry = {
      version: version,
      bins: ['bin/go'],
      platforms: {},
    };

    for (const file of release.files || []) {
      if (!file.filename || !file.sha256) continue;

      const platform = mapPlatform(file.os, file.arch);
      const archiveType = detectArchiveType(file.filename);

      if (!platform || !archiveType) continue;
      if (versionEntry.platforms[platform]) continue; // Already have this platform

      versionEntry.platforms[platform] = {
        type: archiveType,
        url: `https://go.dev/dl/${file.filename}`,
        checksum: `sha256:${file.sha256}`,
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
      name: 'go',
      description: existing.description || 'The Go programming language',
      homepage: existing.homepage || 'https://go.dev',
      license: existing.license || 'BSD-3-Clause',
      versions: mergedVersions,
    };

    const yamlPath = path.join(PROJECT_ROOT, 'packages', 'go.yaml');
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


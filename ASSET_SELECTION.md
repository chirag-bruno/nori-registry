# Smart Asset Selection Implementation

## Problem

Previously, the script would:
1. Process assets in order
2. Take the first asset that matches a platform
3. Skip if platform already processed

This meant:
- If a `.zip` file was processed before a `.msi` file for Windows, we'd miss the better `.msi` installer
- If a `.tar` file was processed before a `.tar.gz` file, we'd miss the better compressed version
- Versions could be missed if assets didn't match in the right order

## Solution

The new implementation uses a **two-phase approach**:

### Phase 1: Collect All Matching Assets
- Scan all assets in a release
- Group them by platform (`{os}-{arch}`)
- For each platform, collect all matching assets with their archive types

### Phase 2: Smart Selection with Priority
- For each platform, sort candidates by priority:
  - **Windows**: `msi` > `zip`
  - **Linux/macOS**: `tar.gz` > `tar` > `zip`
- Try each candidate in priority order
- Select the first one with a valid checksum
- This ensures we always get the best available asset for each platform

## Priority Rules

### Windows Platforms
1. **`.zip`** - Portable archive (only supported format)
   - Only archive format nori supports for Windows
   - Note: `.msi` files are excluded as they are executable installers, not archives

### Linux/macOS Platforms
1. **`.tar.gz`** - Gzip-compressed tar (preferred)
   - Most common format
   - Good compression ratio
   - Widely supported
2. **`.tar.xz`** - XZ-compressed tar (second choice)
   - Better compression than gzip
   - Less common but supported by nori
3. **`.tar`** - Uncompressed tar (fallback)
   - Larger downloads but still valid
4. **`.zip`** - ZIP archive (fallback)
   - Less common for Unix systems
   - Still valid but not preferred

## Benefits

1. **No Missing Versions**: Every matching asset is considered
2. **Best Asset Selection**: Always picks the preferred format when available
3. **Consistent Results**: Same priority rules applied to all packages
4. **Fallback Support**: If preferred format fails (no checksum), tries next best option

## Example

For a release with these Windows assets:
- `package-windows-amd64.zip` (checksum available)
- `package-windows-amd64.msi` (checksum available)

**Old behavior**: Would take `.zip` if processed first, or `.msi` if processed first
**New behavior**: Always takes `.zip` (`.msi` is excluded as it's an executable installer, not an archive)

For a release with these Linux assets:
- `package-linux-amd64.tar.gz` (checksum available)
- `package-linux-amd64.tar.xz` (checksum available)
- `package-linux-amd64.tar` (checksum available)

**New behavior**: Always takes `.tar.gz` (highest priority), falls back to `.tar.xz`, then `.tar` if checksums fail

## Implementation Details

The selection happens in `processRelease()` function:
1. First loop: Collect all matching assets into `platformAssets` map
2. Second loop: For each platform, sort by priority and select best valid asset

This ensures we process all assets before making decisions, rather than making decisions on first match.


# Platform Mapping Specification

This document defines all possible OS, architecture, and file format combinations that packages can have, and how to map them to the standardized nori registry format.

## Standardized Format

The nori registry uses the format: `{os}-{arch}` where:
- **OS**: `linux`, `macos`, `windows`
- **Architecture**: `x86`, `amd64`, `arm64`
- **Archive Types**: `tar`, `tar.gz`, `tar.xz`, `zip` (nori supported formats only)

## Operating Systems

### Linux
**Standardized name**: `linux`

**Common variations**:
- `linux`
- `lin`
- `gnu-linux`
- `linux-gnu`
- `linux-musl`
- `ubuntu`
- `debian`
- `fedora`
- `centos`
- `rhel`
- `alpine`
- `arch`
- `gentoo`
- `suse`
- `slackware`

**Notes**: Any Linux distribution name should map to `linux`. The specific distribution is not relevant for binary compatibility in most cases.

### macOS
**Standardized name**: `macos`

**Common variations**:
- `macos`
- `macOS`
- `MacOS`
- `MACOS`
- `mac`
- `mac-os`
- `darwin`
- `osx`
- `os-x`
- `apple-darwin`
- `aarch64-apple-darwin`
- `x86_64-apple-darwin`
- `arm64-apple-darwin`

**Notes**: `darwin` is the kernel name, but we standardize to `macos` for user-facing clarity. Must check `darwin` before `win` to avoid false matches.

### Windows
**Standardized name**: `windows`

**Common variations**:
- `windows`
- `win`
- `win32`
- `win64`
- `win-x64`
- `win-x86`
- `win-arm64`
- `windows-x64`
- `windows-x86`
- `windows-arm64`
- `msvc`
- `mingw`
- `mingw32`
- `mingw64`
- `msys`
- `cygwin`
- `x86_64-pc-windows`
- `x86_64-pc-windows-msvc`
- `x86_64-pc-windows-gnu`
- `i686-pc-windows`
- `aarch64-pc-windows`

**Notes**: `win32` historically meant Windows, not necessarily 32-bit. Modern usage often means 32-bit, but context matters.

## Architectures

### x86 (32-bit)
**Standardized name**: `x86`

**Common variations**:
- `x86`
- `i386`
- `i686`
- `ia32`
- `32`
- `32bit`
- `32-bit`
- `win32` (when not referring to Windows API)
- `386`
- `686`
- `pentium`
- `i486`
- `i586`

**Notes**: Must check for `x86_64` first to avoid false matches. `32` alone should only match if not part of `64` or `32bit`.

### amd64 (64-bit x86)
**Standardized name**: `amd64`

**Common variations**:
- `amd64`
- `x64`
- `x86_64`
- `x86-64`
- `x64_86`
- `64`
- `64bit`
- `64-bit`
- `win64` (when referring to architecture)
- `intel64`
- `em64t`
- `ia32e`

**Notes**: This is the most common 64-bit architecture. `x86_64` is the same as `amd64`. Must check for `arm64` first to avoid false matches.

### arm64 (64-bit ARM)
**Standardized name**: `arm64`

**Common variations**:
- `arm64`
- `aarch64`
- `arm64-v8a`
- `armv8`
- `armv8a`
- `arm64e` (Apple)
- `arm64-v8`
- `aarch64_be` (big-endian, rare)

**Notes**: `aarch64` is the official ARM name, but `arm64` is more commonly used. Apple Silicon uses `arm64`.

## Archive Types

### tar
**Standardized name**: `tar`

**Common variations**:
- `.tar`
- `.tar.xz`
- `.tar.bz2`
- `.tar.lz`
- `.tar.lzma`
- `.tar.Z`
- `.taz`
- `.tb2`
- `.tbz`
- `.tbz2`
- `.tz2`

**Notes**: Uncompressed tar or compressed with xz/bz2/lzma. The compression method is less important than the fact it's a tar archive.

### tar.gz
**Standardized name**: `tar.gz`

**Common variations**:
- `.tar.gz`
- `.tgz`
- `.tar.gzip`

**Notes**: Gzip-compressed tar files. This is the most common format for Linux/macOS binaries.

### zip
**Standardized name**: `zip`

**Common variations**:
- `.zip`
- `.ZIP`

**Notes**: Standard ZIP archive format. Common for Windows and cross-platform distributions.

### tar.xz
**Standardized name**: `tar.xz`

**Common variations**:
- `.tar.xz`
- `.txz`

**Notes**: XZ-compressed tar files. Better compression than gzip but less common.

### Excluded Formats
The following formats are **NOT** supported by nori and will be excluded:
- `.msi` - Windows Installer (executable installer, not an archive)
- `.exe` - Windows executable
- `.deb` - Debian package
- `.rpm` - RPM package
- `.dmg` - macOS disk image
- `.pkg` - macOS installer package
- `.appimage` - Linux AppImage
- `.snap` - Snap package
- Any other executable or installer formats

## Platform Naming Patterns

Packages often use various naming patterns. Here are common examples:

### Pattern 1: `{name}-{version}-{os}-{arch}.{ext}`
- `bat-0.26.0-x86_64-unknown-linux-gnu.tar.gz`
- `bat-0.26.0-aarch64-apple-darwin.tar.gz`
- `bat-0.26.0-x86_64-pc-windows-msvc.zip`

### Pattern 2: `{name}-{version}-{arch}-{os}.{ext}`
- `node-v20.0.0-x64-linux.tar.gz`
- `node-v20.0.0-x64-macos.tar.gz`
- `node-v20.0.0-x64-win.zip`

### Pattern 3: `{name}-{os}-{arch}.{ext}`
- `nvim-linux-x86_64.tar.gz`
- `nvim-macos-arm64.tar.gz`
- `nvim-win64.zip`

### Pattern 4: `{name}-{arch}-{os}.{ext}`
- `zig-linux-x86_64.tar.xz`
- `zig-macos-aarch64.tar.xz`
- `zig-windows-x86_64.zip`

### Pattern 5: `{name}-{os}{arch}.{ext}`
- `package-linux64.tar.gz`
- `package-macos64.tar.gz`
- `package-win64.zip`

### Pattern 6: Rust-style triplets
- `x86_64-unknown-linux-gnu`
- `aarch64-apple-darwin`
- `x86_64-pc-windows-msvc`
- `i686-pc-windows-gnu`
- `arm-unknown-linux-gnueabihf` (32-bit ARM, not arm64)

## Asset Selection Priority

When multiple assets match the same `{os}-{arch}` combination, use this priority order:

### For Windows:
1. `.msi` (preferred - proper installer)
2. `.zip` (fallback - portable)

### For Linux/macOS:
1. `.tar.gz` (preferred - most common, good compression)
2. `.tar.xz` (fallback - better compression but less common)
3. `.tar` (fallback - uncompressed, largest)

### General Rules:
1. Prefer standard formats over exotic ones
2. Prefer compressed over uncompressed (smaller downloads)
3. Prefer installers over archives when available (Windows)
4. If multiple assets have same type, prefer the one with checksum available
5. If still tied, prefer the first one found (order from API)

## Complete Platform Matrix

All valid platform combinations:

| OS | Architecture | Example Platform String |
|----|--------------|-------------------------|
| linux | x86 | `linux-x86` |
| linux | amd64 | `linux-amd64` |
| linux | arm64 | `linux-arm64` |
| macos | x86 | `macos-x86` |
| macos | amd64 | `macos-amd64` |
| macos | arm64 | `macos-arm64` |
| windows | x86 | `windows-x86` |
| windows | amd64 | `windows-amd64` |
| windows | arm64 | `windows-arm64` |

**Total: 9 platform combinations**

## Archive Type Support Matrix

| OS | Supported Archive Types | Preferred |
|----|------------------------|-----------|
| linux | `tar`, `tar.gz`, `tar.xz`, `zip` | `tar.gz` > `tar.xz` > `tar` > `zip` |
| macos | `tar`, `tar.gz`, `tar.xz`, `zip` | `tar.gz` > `tar.xz` > `tar` > `zip` |
| windows | `zip` | `zip` (only supported format) |

## Implementation Notes

### Matching Algorithm Priority:
1. **OS Detection**: Check `darwin`/`mac` before `win` (to avoid false matches)
2. **Architecture Detection**: Check `arm64` before `amd64` before `x86` (most specific first)
3. **Archive Type**: Check specific extensions (`.tar.gz`) before generic (`.tar`)

### Edge Cases:
- `win32` can mean Windows OS or 32-bit architecture - check context
- `darwin` contains `win` - must check darwin first
- `x86_64` contains `x86` - must check `x86_64` before `x86`
- `arm64` contains `64` - must check `arm64` before generic `64`
- `linux-arm` (32-bit ARM) is different from `linux-arm64` - handle separately if needed

### Unsupported Platforms:
- 32-bit ARM (`arm`, `armv7`, `armhf`) - not commonly used for modern binaries
- Other architectures (MIPS, RISC-V, PowerPC, etc.) - add as needed
- Other OSes (FreeBSD, OpenBSD, Solaris, etc.) - add as needed


# Nori Registry

This is the official registry for the [nori](https://github.com/chirag-bruno/nori) package manager.

## Structure

```
.
├── .github/
│   └── workflows/          # Automated update workflows
│       ├── update-node.yml
│       ├── update-zig.yml
│       ├── update-go.yml
│       ├── update-neovim.yml
│       ├── update-helix.yml
│       └── update-lazygit.yml
├── scripts/
│   ├── lib/                        # Shared utilities
│   │   ├── common.sh               # Common functions
│   │   └── yaml-merge.py           # YAML merging utility
│   ├── github-package.js           # Generic GitHub package script
│   ├── github-package.config.json.example  # Example config file
│   ├── node.sh                     # Node.js update script
│   ├── zig.sh                      # Zig update script
│   ├── go.sh                       # Go update script
│   ├── neovim.sh                   # Neovim update script
│   ├── helix.sh                    # Helix update script
│   └── lazygit.sh                  # Lazygit update script
├── packages/              # Package manifests
│   ├── node.yaml
│   ├── zig.yaml
│   ├── go.yaml
│   ├── neovim.yaml
│   ├── helix.yaml
│   └── lazygit.yaml
├── index.yaml              # Package index
└── README.md
```

## Supported Packages

- **Node.js** - JavaScript runtime
- **Zig** - General-purpose programming language
- **Go** - The Go programming language
- **Neovim** - Hyperextensible Vim-based text editor
- **Helix** - A post-modern text editor
- **Lazygit** - Simple terminal UI for git commands

## Automated Updates

This registry uses GitHub Actions to automatically check for new releases daily and update package manifests. Each package has its own workflow that:

1. Fetches the latest releases from the official source
2. Extracts version information and download URLs
3. Calculates SHA256 checksums
4. Updates the package manifest with new versions
5. Commits and pushes changes automatically

Workflows run on a schedule:
- Node.js: Daily at 00:00 UTC
- Zig: Daily at 01:00 UTC
- Go: Daily at 02:00 UTC
- Neovim: Daily at 03:00 UTC
- Helix: Daily at 04:00 UTC
- Lazygit: Daily at 05:00 UTC

You can also manually trigger workflows from the GitHub Actions tab.

## Manual Updates

To manually update a package, run the corresponding script:

```bash
# Make scripts executable
chmod +x scripts/*.sh scripts/lib/*.sh scripts/lib/*.py

# Update a specific package
./scripts/node.sh
./scripts/zig.sh
./scripts/go.sh
./scripts/neovim.sh
./scripts/helix.sh
./scripts/lazygit.sh
```

### Prerequisites

**For bash scripts:**
- `curl` - For fetching release data
- `jq` - For JSON parsing
- `python3` with `pyyaml` - For YAML manipulation

Install dependencies:

```bash
# macOS
brew install jq
pip3 install pyyaml

# Ubuntu/Debian
sudo apt-get install jq curl python3 python3-pip
pip3 install pyyaml
```

**For GitHub package script:**
- Node.js (v18 or higher)
- npm dependencies: `npm install`

## Adding New Packages

### Quick Method: Using GitHub Package Script

For GitHub-hosted packages, you can use the generic `github-package.js` script:

```bash
# Install dependencies first
npm install

# Using command-line arguments
node scripts/github-package.js \
  --owner neovim \
  --repo neovim \
  --package-name neovim \
  --bins '[{"name":"nvim","path":"bin/nvim"}]'

# Or using a config file
node scripts/github-package.js --config scripts/github-package.config.json
```

The script will:
- Fetch all releases from GitHub
- Auto-detect package metadata (description, homepage, license)
- Match platforms using flexible string matching (win/windows, darwin/mac/macos, linux, amd64/x64, arm64)
- Get checksums using a three-tier fallback system:
  1. **Tier 1 (Fastest)**: GitHub API `digest` field (no downloads)
  2. **Tier 2 (Medium)**: Author-provided checksum files (`.sha256`, `.sha256sum`, etc.)
  3. **Tier 3 (Slowest)**: Download and compute checksum (last resort)
- Generate/update the package YAML file

See `scripts/github-package.config.json.example` for config file format.

### Manual Method: Custom Script

1. Create a new update script in `scripts/{package-name}.sh`
   - Follow the pattern of existing scripts
   - Use functions from `scripts/lib/common.sh`
   - Fetch releases from the official source
   - Map platforms to nori format (linux-amd64, darwin-amd64, darwin-arm64, windows-amd64)
   - Calculate SHA256 checksums

2. Create a package manifest in `packages/{package-name}.yaml`:
   ```yaml
   schema: 1
   name: package-name
   description: Package description
   homepage: https://example.com
   license: MIT
   versions: []
   ```

3. Add the package to `index.yaml`

4. Create a GitHub Actions workflow in `.github/workflows/update-{package-name}.yml`
   - Follow the pattern of existing workflows
   - Schedule it at a unique time

5. Submit a PR

## Schema

All package manifests follow schema version 1:

```yaml
schema: 1
name: package-name
description: Package description
homepage: https://example.com
license: MIT
versions:
  - version: "1.0.0"
    bins:
      - bin/binary-name
    platforms:
      linux-amd64:
        type: tar
        url: https://example.com/release.tar.gz
        checksum: sha256:abc123...
      darwin-amd64:
        type: tar
        url: https://example.com/release.tar.gz
        checksum: sha256:def456...
      darwin-arm64:
        type: tar
        url: https://example.com/release.tar.gz
        checksum: sha256:ghi789...
      windows-amd64:
        type: zip
        url: https://example.com/release.zip
        checksum: sha256:jkl012...
```

Key points:
- Versions are listed in descending order (newest first)
- Each version has its own `bins` array
- All platforms must have SHA256 checksums
- Supported archive types: `tar`, `tar.gz`, `tar.xz`, `zip` (nori-compatible formats only)
- Executable formats (`.msi`, `.exe`, `.deb`, `.rpm`, `.dmg`, `.pkg`, etc.) are excluded

## Registry URL

This registry is available at:
```
https://raw.githubusercontent.com/chirag-bruno/nori-registry/main
```

Set it as your default:
```bash
export NORI_REGISTRY_URL="https://raw.githubusercontent.com/chirag-bruno/nori-registry/main"
```

## Inspiration

This registry is inspired by [asdf](https://asdf-vm.com/) plugins, which provide a similar approach to managing multiple tool versions. The update scripts follow patterns similar to asdf's `bin/list-all` and `bin/download` functions.

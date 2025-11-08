# Nori Registry

This is the official registry for the [nori](https://github.com/chirag-bruno/nori) package manager.

## Structure

```
.
├── index.yaml              # Package index
└── packages/
    └── neovim.yaml         # Neovim package manifest
```

## Adding Packages

1. Create a new manifest file in `packages/{name}.yaml`
2. Follow the [manifest schema](../../schema/manifest-v1.schema.json)
3. Add the package to `index.yaml`
4. Submit a PR

## Updating Checksums

Use the provided scripts to fetch checksums:

```bash
./fetch-neovim-checksums.sh 0.10.0
```

## Registry URL

This registry is available at:
```
https://raw.githubusercontent.com/chirag-bruno/nori-registry/main
```

Set it as your default:
```bash
export NORI_REGISTRY_URL="https://raw.githubusercontent.com/chirag-bruno/nori-registry/main"
```


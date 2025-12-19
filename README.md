## MagnaGame

### Asset pipeline (MP4 -> Phaser 3 spritesheets)

This repo contains a reproducible CLI pipeline to convert white-background 16:9 MP4 animations into:

- **Transparent PNG sprite-sheet strips** (one per animation)
- **Consistent frame sizes per character** (global max across all that character’s animations, centered) to prevent jitter
- A per-character `frames.json` manifest for Phaser-friendly metadata

#### Prerequisites

Install the required CLI tools:

- **macOS (Homebrew)**:

```bash
brew install ffmpeg imagemagick
```

- **Ubuntu/Debian**:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg imagemagick
```

Verify:

```bash
ffmpeg -version
magick -version
python3 --version
```

#### Configuration

Edit:

- `tools/asset-pipeline/assets.config.json`

You can set:

- **Global defaults**: background removal fuzz %, padding, rounding multiple
- **Per animation**: `fps` and `srcMp4`

#### Run

Process all configured characters:

```bash
bash tools/asset-pipeline/process_all.sh
```

Process one character:

```bash
bash tools/asset-pipeline/process_character.sh main_char
```

#### Output folders

- **Raw sources**: `assets/raw/` (manual, source-of-truth)
- **Intermediate frames (generated)**: `assets/work/frames/` (ignored via `.gitignore`)
- **Final spritesheets + manifests**: `assets/processed/spritesheets/<characterId>/`
  - `<animation>.png` (horizontal strip)
  - `frames.json` (includes `frameWidth`, `frameHeight`, `fps`, `frameCount`, and file paths)

### Environment pipeline (parallax + platforms)

This pipeline standardizes environment PNGs (no rescaling/pixelation; just cleanup + transparency + trim + optional padding).

#### Configure

- `tools/asset-pipeline/env.config.json`

Defaults are set to be “ship fast” friendly:

- `trim.enabled: true`
- `paddingPx: 2`
- `removeWhite.enabled: true`
- `removeWhite.fuzzPercent: 6`
- `removeWhite.haloFix: false` (enable only if you see bright fringes)

You can override per folder (`foregroundElements`, `platform`) and per file via `files` entries.

#### Run

Process everything environment-related:

```bash
bash tools/asset-pipeline/process_env_all.sh
```

Or individually:

```bash
bash tools/asset-pipeline/process_env_parallax.sh
bash tools/asset-pipeline/process_env_platform.sh
```

#### Outputs

- `assets/processed/environment/background_parallax/`
  - `background_sky_tile_pixelate.png` (stripped metadata; warns if size not multiple of 32)
  - `foreground_elements/*.png` (+ optional `manifest.json`)
- `assets/processed/environment/platform/*.png` (+ optional `manifest.json`)

#### Recommended naming convention (optional)

Prefix parallax props by intended layer so you can auto-assign parallax factors later:

- `far_*`, `mid_*`, `near_*` (or `bg_*`, `mg_*`, `fg_*`)



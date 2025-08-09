# Figma to WordPress (Starter)

MVP tool to convert a Figma file into a block-based WordPress theme (theme.json + block templates + patterns).

## Features (Current)
- Fetch Figma file JSON
- Extract color + text style tokens
- Basic node → block mapping (Text, Frames, Images, Groups)
- Generate:
  - theme.json
  - templates (index, front-page fallback)
  - parts (header, footer if found)
  - patterns (repeated components)
  - packaged theme ZIP

## Roadmap (Next)
- Columns / Cover block mapping
- Component → Pattern detection
- Naming rule config expansion
- AI-assisted classification (optional)
- Two-way diff

## Install
```bash
npm install
npm run build
```

## CLI
```bash
FIGMA_TOKEN=YOUR_TOKEN npx figma2wp --file <FILE_KEY> --out ./out
```

Options:
- `--file <key>`: Figma file key (required)
- `--out <dir>`: Output directory (default: ./dist-output)
- `--name <theme-slug>`: Theme folder name (default: figma-theme)
- `--config <mapping.json>`: Custom mapping rules
- `--verbose`

## Figma Prep Conventions
| Purpose | Convention |
|---------|-----------|
| Page frame named for page | `page:home`, `page:about` |
| Header frame | `header` |
| Footer frame | `footer` |
| Section frame | `section-*` |
| Text styles | `H1`, `H2`, `H3`, `Body`, `Caption` |
| Reusable component prefixes | `comp-` |

## Environment
Create `.env`:
```
FIGMA_TOKEN=xxxxxxxxxxxxxxxxxxxx
```

## WordPress Version
Target WP 6.5+ (supports block themes, theme.json v2 semantics).

## Developing
```bash
npm run dev
```

## Testing
(TODO) Add snapshot tests comparing generated templates to fixtures.

## License
MIT
# Fonts Directory

Place your font files (`.ttf`, `.otf`, `.woff`, `.woff2`) in this directory.

## How to Add a Local Font

1. Copy your font file(s) to this directory
2. Edit `/apps/electron/src/renderer/config/fonts.ts`
3. Add a new entry to the `FONTS` array:

```typescript
{
  id: 'my-font',           // Unique ID
  name: 'My Font',         // Display name
  nativeName: '我的字体',   // Optional: native name for non-English fonts
  fontFamily: '"My Font", sans-serif',
  localFiles: [
    { src: 'MyFont-Regular.ttf', format: 'truetype', weight: '400' },
    { src: 'MyFont-Medium.ttf', format: 'truetype', weight: '500' },
    { src: 'MyFont-Bold.ttf', format: 'truetype', weight: '700' },
  ],
},
```

## Supported Formats

- `.ttf` - TrueType (format: 'truetype')
- `.otf` - OpenType (format: 'opentype')
- `.woff` - Web Open Font Format (format: 'woff')
- `.woff2` - Web Open Font Format 2 (format: 'woff2')

## Font Weights

Common weight values:
- 100: Thin
- 200: Extra Light
- 300: Light
- 400: Regular/Normal
- 500: Medium
- 600: Semi Bold
- 700: Bold
- 800: Extra Bold
- 900: Black

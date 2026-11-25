# Embedded PDF fonts

`src/lib/publish/pdf.ts` embeds these TrueType fonts in exported PDFs. Without
them jsPDF falls back to its built-in Times/Helvetica/Courier faces, which only
encode Windows-1252 and garble every other script.

The serif, sans and mono families are metrically compatible with Times New
Roman, Arial and Courier New, so pages that only contain Latin text keep the
same line breaks and look as before. `pdf-fonts.ts` loads the CJK fallbacks
lazily, only when the book actually contains CJK characters, and jsPDF subsets
all of them, so exported PDFs only contain the glyphs they use.

| File | Family | Source |
| --- | --- | --- |
| `Tinos-*.ttf` | Times New Roman metrics | Google Fonts, `ofl/tinos` |
| `Arimo-*.ttf` | Arial metrics | Google Fonts, `ofl/arimo` (variable, instanced) |
| `Cousine-*.ttf` | Courier New metrics | Google Fonts, `ofl/cousine` |
| `NotoSansSC-CJK.ttf` | Chinese, Japanese (kanji/kana) | Google Fonts, `ofl/notosanssc` (variable, subset) |
| `NotoSansKR-Hangul.ttf` | Korean (Hangul) | Google Fonts, `ofl/notosanskr` (variable, subset) |

Text the embedded fonts cannot encode (for example Arabic, Thai or
Devanagari) is left out rather than encoded as garbage. CJK bold text uses the
regular CJK weight because the fallback fonts only ship one weight.

## Regenerating

The Tinos and Cousine files are the static TTFs published by Google Fonts. The
others were produced from the upstream variable fonts with
[fontTools](https://github.com/fonttools/fonttools):

```sh
# Arimo static instances
uvx --from fonttools fonttools varLib.instancer "Arimo[wght].ttf" wght=400 -o Arimo-Regular.ttf
uvx --from fonttools fonttools varLib.instancer "Arimo[wght].ttf" wght=700 -o Arimo-Bold.ttf
uvx --from fonttools fonttools varLib.instancer "Arimo-Italic[wght].ttf" wght=400 -o Arimo-Italic.ttf
uvx --from fonttools fonttools varLib.instancer "Arimo-Italic[wght].ttf" wght=700 -o Arimo-BoldItalic.ttf

# Noto Sans SC: regular instance, then the CJK blocks used as a fallback
uvx --from fonttools fonttools varLib.instancer "NotoSansSC[wght].ttf" wght=400 -o NotoSansSC-Regular.ttf
uvx --from fonttools pyftsubset NotoSansSC-Regular.ttf --no-hinting --layout-features='' \
  --unicodes="U+2E80-2EFF,U+2F00-2FDF,U+3000-303F,U+3040-30FF,U+3100-312F,U+31C0-31FF,U+3200-33FF,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+FE10-FE1F,U+FE30-FE4F,U+FF01-FF9F,U+FFE0-FFE6" \
  --output-file=NotoSansSC-CJK.ttf

# Noto Sans KR: Hangul blocks only, then a regular instance
uvx --from fonttools pyftsubset "NotoSansKR[wght].ttf" --no-hinting --layout-features='' \
  --unicodes="U+1100-11FF,U+3130-318F,U+A960-A97F,U+AC00-D7A3,U+D7B0-D7FF" \
  --output-file=NotoSansKR-Hangul-vf.ttf
uvx --from fonttools fonttools varLib.instancer NotoSansKR-Hangul-vf.ttf wght=400 -o NotoSansKR-Hangul.ttf
```

All fonts are distributed under the SIL Open Font License 1.1; the license and
copyright notice for each family is in the matching `OFL-*.txt` file.

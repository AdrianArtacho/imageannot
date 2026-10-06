# Macro source

The reference definitions are copied without modification from:

- Repository: <https://github.com/AdrianArtacho/ltx_snippets>
- File: [`ltx/reveal/imageannot.tex`](https://github.com/AdrianArtacho/ltx_snippets/blob/main/ltx/reveal/imageannot.tex)
- Git blob SHA: `7c9ba090b3f75aa05c8132c24fa609ab312619c9`
- Retrieved: 2026-10-06

The active definitions at the end of the file supersede earlier declarations. In particular, the final `highlightfrag` definition and `whiteout` style provide an opaque white cover when exported as `\highlightfrag[whiteout]{x1}{y1}{x2}{y2}`. The final `highlightmove` alias follows this renewed definition.

Coordinates use the image’s top-left as `(0,0)` and bottom-right as `(1,1)`; the vertical axis points downward. Rotation in the macro definitions uses TikZ’s physical coordinate plane, so positive angles rotate anticlockwise.

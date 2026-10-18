---
'openfilm': patch
---

A subtitle line with `&`, `<` or `>` reads as written in an exported WebVTT file. A line like `Tom & <Jerry>` lost `<Jerry>`, which players read as a tag, and a speaker's `&` broke the voice tag; they are now written as WebVTT's `&amp;`, `&lt;` and `&gt;`, as the voice-over captions already were. `-->` in a line stays `-->` instead of turning into `→`.

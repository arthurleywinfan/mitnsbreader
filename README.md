# NSB Finder

An offline search app for the MIT Science Bowl Invitational high school question sets (2020–2025).
Search for words from a question to see its year and round, then view the whole round with answers or open the original PDF.
It's a web app: open it once in Safari, tap Share → Add to Home Screen, and it works without internet after that.

The questions come from https://www.mitsciencebowl.com/high-school/resources and belong to MIT Science Bowl.

## Rebuilding the data

1. Put the round PDFs and `manifest.json` in `raw/`
2. Run `python -I tools/build_data.py` (needs `pdftotext`)
3. Bump `SHELL` in `docs/sw.js` so installed phones pick up the new data

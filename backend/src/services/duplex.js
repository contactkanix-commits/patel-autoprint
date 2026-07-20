const PAPER_SIZES = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  Legal: { width: 215.9, height: 355.6 },
  Letter: { width: 215.9, height: 279.4 },
};

function determineFlipDirection(uploadOrientation, paperSize, pagesPerSheet, overrideOrientation) {
  const finalOrientation = getFinalLayoutOrientation(uploadOrientation, paperSize, pagesPerSheet, overrideOrientation);

  if (finalOrientation === 'landscape') {
    return 'short-edge';
  }
  return 'long-edge';
}

function getFinalLayoutOrientation(uploadOrientation, paperSize, pagesPerSheet, overrideOrientation) {
  const paper = PAPER_SIZES[paperSize] || PAPER_SIZES.A4;
  const paperIsLandscape = paper.width > paper.height;
  const srcLandscape = uploadOrientation === 'landscape' || (uploadOrientation === 'auto' && paperIsLandscape);

  // 1-up: the manual orientation override (if any) applies directly
  if (pagesPerSheet <= 1) {
    if (overrideOrientation && overrideOrientation !== 'auto') {
      return overrideOrientation === 'landscape' ? 'landscape' : 'portrait';
    }
    return srcLandscape ? 'landscape' : 'portrait';
  }

  // N-up: the layout orientation is dictated by the N-up arrangement itself
  // (it flips relative to the source). The manual orientation override is
  // intentionally ignored here because N-up defines its own layout — and the
  // flip direction must follow the actual output sheet orientation.
  // 2-up: landscape source → portrait output (stacked), portrait source → landscape output (side by side)
  if (pagesPerSheet === 2) {
    return srcLandscape ? 'portrait' : 'landscape';
  }

  // nUp >= 4 matches source orientation
  return srcLandscape ? 'landscape' : 'portrait';
}

module.exports = { determineFlipDirection, getFinalLayoutOrientation, PAPER_SIZES };

const fs = require('fs');
const path = require('path');

const FILE_TYPES = ['pdf', 'docx', 'pptx', 'xlsx', 'jpg', 'png', 'jpeg', 'webp'];

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  if (ext === 'jpg') return 'jpeg';
  return ext;
}

function isSupportedFileType(filename) {
  return FILE_TYPES.includes(getFileType(filename));
}

async function analyzeFile(filePath, fileType) {
  switch (fileType) {
    case 'pdf':
      return analyzePDF(filePath);
    case 'docx':
    case 'pptx':
    case 'xlsx':
      return analyzeOfficeFile(filePath, fileType);
    case 'jpg':
    case 'png':
    case 'jpeg':
    case 'webp':
      return analyzeImage(filePath);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

async function analyzePDF(filePath) {
  try {
    const pdfjsLib = require('pdfjs-dist');
    const data = new Uint8Array(fs.readFileSync(filePath));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    let colorCount = 0;
    let blankCount = 0;
    let landscapeCount = 0;
    let firstOrientation = null;
    let hasMixedOrientation = false;

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const isLandscape = viewport.width > viewport.height;
      const pageOrientation = isLandscape ? 'landscape' : 'portrait';

      if (firstOrientation === null) {
        firstOrientation = pageOrientation;
      } else if (firstOrientation !== pageOrientation) {
        hasMixedOrientation = true;
      }

      const ops = await page.getOperatorList();
      let isColor = false;
      const fnArray = ops.fnArray;
      const argsArray = ops.argsArray;

      for (let j = 0; j < fnArray.length; j++) {
        const fn = fnArray[j];
        if (fn === pdfjsLib.OPS.setFillColor || fn === pdfjsLib.OPS.setStrokeColor) {
          const args = argsArray[j];
          if (args && args.length >= 4) {
            if (args[0] > 0 || args[1] > 0 || args[2] > 0) {
              isColor = true;
              break;
            }
          }
        } else if (fn === pdfjsLib.OPS.setFillRGBColor || fn === pdfjsLib.OPS.setStrokeRGBColor) {
          const args = argsArray[j];
          if (args && args.some((v) => v > 0)) {
            isColor = true;
            break;
          }
        }
      }

      const isBlank = fnArray.length < 5;

      if (isColor) colorCount++;
      if (isBlank) blankCount++;
      if (isLandscape) landscapeCount++;

      pages.push({ pageNumber: i, isColor, isBlank, isLandscape });
    }

    const orientation = firstOrientation || 'portrait';

    return {
      pageCount: doc.numPages,
      colorPageCount: colorCount,
      blankPageCount: blankCount,
      landscapePageCount: landscapeCount,
      orientation,
      hasMixedOrientation,
      suggestedPaperSize: 'A4',
      estimatedSheets: doc.numPages,
      estimatedCost: doc.numPages * 2,
      pages,
    };
  } catch (err) {
    console.error('PDF analysis error:', err);
    return getFallbackAnalysis();
  }
}

async function analyzeOfficeFile(filePath, fileType) {
  try {
    if (fileType === 'docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      const text = result.value || '';
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
      const lines = text.split(/\n/).filter(l => l.trim().length > 0);
      const linesPerPage = 45;
      const pageCount = Math.max(1, Math.ceil(lines.length / linesPerPage));

      return {
        pageCount,
        colorPageCount: 0,
        blankPageCount: 0,
        landscapePageCount: 0,
        orientation: 'portrait',
        hasMixedOrientation: false,
        suggestedPaperSize: 'A4',
        estimatedSheets: pageCount,
        estimatedCost: pageCount * 2,
        pages: Array.from({ length: pageCount }, (_, i) => ({
          pageNumber: i + 1,
          isColor: false,
          isBlank: false,
          isLandscape: false,
        })),
      };
    }

    // PPTX, XLSX fallback - try to get real page/slide count from the zip
    try {
      const buf = fs.readFileSync(filePath);
      const text = buf.toString('latin1');
      let pageCount = 0;
      if (fileType === 'pptx') {
        // count slide XML entries: ppt/slides/slide1.xml ... (zip may use / or \)
        const matches = text.match(/ppt[\\/]slides[\\/]slide\d+\.xml/g) || [];
        pageCount = new Set(matches).size;
      } else if (fileType === 'xlsx') {
        const matches = text.match(/xl[\\/]worksheets[\\/]sheet\d+\.xml/g) || [];
        pageCount = new Set(matches).size;
      }
      if (pageCount > 0) {
        return {
          pageCount,
          colorPageCount: 0,
          blankPageCount: 0,
          landscapePageCount: 0,
          orientation: 'landscape',
          hasMixedOrientation: false,
          suggestedPaperSize: 'A4',
          estimatedSheets: pageCount,
          estimatedCost: pageCount * 2,
          pages: Array.from({ length: pageCount }, (_, i) => ({
            pageNumber: i + 1, isColor: false, isBlank: false, isLandscape: true,
          })),
        };
      }
    } catch (e) {
      console.error('Office zip scan error:', e.message);
    }
    return getFallbackAnalysis();
  } catch (err) {
    console.error('Office file analysis error:', err);
    return getFallbackAnalysis();
  }
}

async function analyzeImage(filePath) {
  try {
    const sharp = require('sharp');
    const metadata = await sharp(filePath).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;
    const isLandscape = width > height;

    return {
      pageCount: 1,
      colorPageCount: 1,
      blankPageCount: 0,
      landscapePageCount: isLandscape ? 1 : 0,
      orientation: isLandscape ? 'landscape' : 'portrait',
      hasMixedOrientation: false,
      suggestedPaperSize: 'A4',
      estimatedSheets: 1,
      estimatedCost: 10,
      pages: [{
        pageNumber: 1,
        isColor: true,
        isBlank: false,
        isLandscape,
      }],
    };
  } catch (err) {
    console.error('Image analysis error:', err);
    return {
      pageCount: 1,
      colorPageCount: 1,
      blankPageCount: 0,
      landscapePageCount: 0,
      orientation: 'portrait',
      hasMixedOrientation: false,
      suggestedPaperSize: 'A4',
      estimatedSheets: 1,
      estimatedCost: 10,
      pages: [{ pageNumber: 1, isColor: true, isBlank: false, isLandscape: false }],
    };
  }
}

function getFallbackAnalysis() {
  return {
    pageCount: 1,
    colorPageCount: 0,
    blankPageCount: 0,
    landscapePageCount: 0,
    orientation: 'portrait',
    hasMixedOrientation: false,
    suggestedPaperSize: 'A4',
    estimatedSheets: 1,
    estimatedCost: 2,
    pages: [{ pageNumber: 1, isColor: false, isBlank: false, isLandscape: false }],
  };
}

module.exports = { analyzeFile, getFileType, isSupportedFileType, FILE_TYPES };

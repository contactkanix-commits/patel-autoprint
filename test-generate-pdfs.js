/**
 * Test Script: Generate soft copy PDFs to verify image-per-sheet layout logic
 * 
 * Generates test PDFs for all combinations:
 * - 2, 4, 6, 9 pages per sheet
 * - Portrait only, landscape only, mixed images
 * - A4, A3, Letter, Legal paper sizes
 * - Auto, portrait, landscape orientation
 * 
 * NO ACTUAL PRINTING - just generates PDF soft copies for inspection.
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument, degrees, rgb } = require('pdf-lib');

const TEST_OUTPUT_DIR = path.join(__dirname, 'test-output');

if (!fs.existsSync(TEST_OUTPUT_DIR)) {
  fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
}

function paperDims(paperSize, orientation = 'auto') {
  const dims = (() => {
    switch (paperSize) {
      case 'A3': return { w: 841.89, h: 1190.55 };
      case 'Letter': return { w: 612, h: 792 };
      case 'Legal': return { w: 612, h: 1008 };
      default: return { w: 595.28, h: 841.89 }; // A4
    }
  })();

  if (orientation === 'landscape') {
    return { w: dims.h, h: dims.w };
  }
  return dims;
}

// Create a synthetic image page (portrait or landscape)
async function createTestPage(width, height, label, color1, color2) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([width, height]);
  
  page.drawRectangle({
    x: 0, y: 0, width, height,
    color: rgb(color1[0], color1[1], color1[2]),
  });
  
  page.drawRectangle({
    x: 10, y: 10, width: width - 20, height: height - 20,
    borderColor: rgb(color2[0], color2[1], color2[2]),
    borderWidth: 4,
  });
  
  page.drawLine({
    start: { x: 10, y: 10 },
    end: { x: width - 10, y: height - 10 },
    color: rgb(color2[0], color2[1], color2[2]),
    thickness: 3,
  });
  
  return { doc, page, width, height, label };
}

// Embed a page from source doc into target doc
async function embedPage(targetDoc, sourceDoc, pageIndex = 0) {
  const [embeddedPage] = await targetDoc.embedPdf(sourceDoc, [pageIndex]);
  return embeddedPage;
}

// Replicate createContactSheet logic (same as agent/index.js v1.0.41)
async function createContactSheet(imageFiles, nUp, paperSize, jobId, orientation = 'auto', photoFit = 'fill') {
  const n = Math.max(1, parseInt(nUp) || 1);
  const newDoc = await PDFDocument.create();
  const baseDims = paperDims(paperSize, 'portrait');

  // Pre-embed all images once
  const infos = [];
  for (const f of imageFiles) {
    try {
      const embedded = await embedPage(newDoc, f.doc, 0);
      infos.push({
        embedded,
        w: f.width,
        h: f.height,
        landscape: f.width > f.height,
        label: f.label,
      });
    } catch (err) {
      console.error(`Failed to embed ${f.label}:`, err.message);
    }
  }

  if (infos.length === 0) {
    const page = newDoc.addPage([baseDims.w, baseDims.h]);
    page.drawText('NO IMAGES', { x: 50, y: baseDims.h / 2, size: 20 });
    const bytes = await newDoc.save();
    const outPath = path.join(TEST_OUTPUT_DIR, `${jobId || 'contact'}_contact.pdf`);
    fs.writeFileSync(outPath, bytes);
    return outPath;
  }

  // Determine sheet orientation
  let sheetLandscape;
  if (orientation === 'portrait') {
    sheetLandscape = false;
  } else if (orientation === 'landscape') {
    sheetLandscape = true;
  } else {
    // 'auto': multiple images -> landscape sheet
    sheetLandscape = n > 1;
  }

  // Grid based on sheet orientation + nUp
  let cols, rows;
  if (sheetLandscape) {
    switch (n) {
      case 2: cols = 2; rows = 1; break;
      case 4: cols = 2; rows = 2; break;
      case 6: cols = 3; rows = 2; break;
      case 8: cols = 4; rows = 2; break;
      case 9: cols = 3; rows = 3; break;
      case 16: cols = 4; rows = 4; break;
      default: cols = Math.ceil(Math.sqrt(n)); rows = Math.ceil(n / cols);
    }
  } else {
    switch (n) {
      case 2: cols = 1; rows = 2; break;
      case 4: cols = 2; rows = 2; break;
      case 6: cols = 2; rows = 3; break;
      case 8: cols = 2; rows = 4; break;
      case 9: cols = 3; rows = 3; break;
      case 16: cols = 4; rows = 4; break;
      default: cols = Math.ceil(Math.sqrt(n)); rows = Math.ceil(n / cols);
    }
  }

  const sheetW = sheetLandscape ? baseDims.h : baseDims.w;
  const sheetH = sheetLandscape ? baseDims.w : baseDims.h;
  const margin = 4;

  // CASE 1: n === 1
  if (n === 1) {
    for (const info of infos) {
      const imgIsLandscape = info.w > info.h;
      const pageW = imgIsLandscape ? sheetH : sheetW;
      const pageH = imgIsLandscape ? sheetW : sheetH;
      const page = newDoc.addPage([pageW, pageH]);

      const scale = Math.min((pageW - margin * 2) / info.w, (pageH - margin * 2) / info.h);
      const drawW = info.w * scale;
      const drawH = info.h * scale;

      page.drawPage(info.embedded, {
        x: (pageW - drawW) / 2,
        y: (pageH - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    }
  }
  // CASE 2: n >= 2
  else {
    for (let i = 0; i < infos.length; i += n) {
      const chunk = infos.slice(i, i + n);
      const page = newDoc.addPage([sheetW, sheetH]);
      const cellW = sheetW / cols;
      const cellH = sheetH / rows;
      const boxW = cellW - margin * 2;
      const boxH = cellH - margin * 2;

      for (let j = 0; j < chunk.length; j++) {
        const { embedded, w: imgW, h: imgH, label } = chunk[j];
        const col = j % cols;
        const rowFromTop = Math.floor(j / cols);
        const cellCenterX = col * cellW + cellW / 2;
        const cellCenterY = sheetH - (rowFromTop + 1) * cellH + cellH / 2;

        const slotIsLandscape = boxW > boxH;
        const imgIsLandscape = imgW > imgH;
        const shouldRotate = slotIsLandscape !== imgIsLandscape;

        let scaleW, scaleH;
        if (shouldRotate) {
          scaleW = boxW / imgH;
          scaleH = boxH / imgW;
        } else {
          scaleW = boxW / imgW;
          scaleH = boxH / imgH;
        }
        const scale = Math.min(scaleW, scaleH);

        const drawW = imgW * scale;
        const drawH = imgH * scale;

        // Draw cell border for visual inspection
        page.drawRectangle({
          x: col * cellW,
          y: sheetH - (rowFromTop + 1) * cellH,
          width: cellW,
          height: cellH,
          borderColor: rgb(0.5, 0.5, 0.5),
          borderWidth: 1,
        });

        if (shouldRotate) {
          page.drawPage(embedded, {
            x: cellCenterX + drawH / 2,
            y: cellCenterY - drawW / 2,
            width: drawW,
            height: drawH,
            rotate: degrees(90),
          });
        } else {
          page.drawPage(embedded, {
            x: cellCenterX - drawW / 2,
            y: cellCenterY - drawH / 2,
            width: drawW,
            height: drawH,
          });
        }

        page.drawText(label, {
          x: col * cellW + 5,
          y: sheetH - (rowFromTop * cellH) - 12,
          size: 8,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  const bytes = await newDoc.save();
  const outPath = path.join(TEST_OUTPUT_DIR, `${jobId || 'contact'}_contact.pdf`);
  fs.writeFileSync(outPath, bytes);
  return outPath;
}

async function runTests() {
  console.log('=== Generating test images ===');
  
  const portraitImg = await createTestPage(600, 800, 'P', [0.2, 0.6, 1], [0, 0.4, 0.8]);
  const landscapeImg = await createTestPage(800, 600, 'L', [1, 0.4, 0.2], [0.8, 0, 0]);
  
  console.log(`Portrait: ${portraitImg.width}x${portraitImg.height}`);
  console.log(`Landscape: ${landscapeImg.width}x${landscapeImg.height}`);

  const testCases = [];
  const nUpOptions = [2, 4, 6, 9];
  const imageSets = {
    port: [portraitImg, portraitImg, portraitImg, portraitImg, portraitImg, portraitImg, portraitImg, portraitImg, portraitImg],
    land: [landscapeImg, landscapeImg, landscapeImg, landscapeImg, landscapeImg, landscapeImg, landscapeImg, landscapeImg, landscapeImg],
    mixed: [portraitImg, landscapeImg, portraitImg, landscapeImg, portraitImg, landscapeImg, portraitImg, landscapeImg, portraitImg],
  };
  const paperSizes = ['A4', 'A3', 'Letter', 'Legal'];
  const orientations = ['auto', 'portrait', 'landscape'];

  let testNum = 0;

  for (const nUp of nUpOptions) {
    for (const [setName, images] of Object.entries(imageSets)) {
      const subset = images.slice(0, nUp);
      
      for (const paperSize of paperSizes) {
        for (const orientation of orientations) {
          testNum++;
          const jobId = `t${testNum}_n${nUp}_${setName}_${paperSize}_${orientation}`;
          const outPath = await createContactSheet(
            subset,
            nUp,
            paperSize,
            jobId,
            orientation,
            'fill'
          );
          console.log(`[${testNum}] ${jobId} -> ${path.basename(outPath)}`);
        }
      }
    }
  }

  console.log(`\n=== Generated ${testNum} test PDFs in ${TEST_OUTPUT_DIR} ==='`);
  console.log('Open these PDFs to verify layout correctness.');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

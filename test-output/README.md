# Test PDF Summary — Image-Per-Sheet Layout Verification

**Generated:** Fri Oct 30 2026  
**Output folder:** `test-output/`  
**Total PDFs:** 144  
**NO ACTUAL PRINTING** — These are soft copy PDFs for visual inspection only.

## How to Verify

Open each PDF and check:

1. **Sheet orientation** — Is the page portrait or landscape as expected?
2. **Image arrangement** — Are images side-by-side or stacked correctly?
3. **Image rotation** — Are portrait/landscape images rotated properly to fit cells?
4. **No cropping** — Are entire images visible (no cut-off edges)?
5. **Cell centering** — Is each image centered within its cell?
6. **No blank space** — Are images filling their cells efficiently?

## Test Matrix

| nUp | Image Set | Paper | Orientation | Expected Behavior |
|-----|-----------|-------|-------------|-------------------|
| 2 | port | A4 | auto | Landscape sheet, 2 images side-by-side |
| 2 | port | A4 | portrait | Portrait sheet, 2 images stacked vertically |
| 2 | port | A4 | landscape | Landscape sheet, 2 images side-by-side |
| 2 | land | A4 | auto | Landscape sheet, 2 images side-by-side |
| 2 | land | A4 | portrait | Portrait sheet, 2 images stacked vertically |
| 2 | mixed | A4 | auto | Landscape sheet, P+L side-by-side (P rotates 90°) |
| 4 | port | A4 | auto | Landscape sheet, 2x2 grid |
| 4 | land | A4 | auto | Landscape sheet, 2x2 grid |
| 4 | mixed | A4 | auto | Landscape sheet, 2x2 grid (each rotates to fit) |
| 6 | port | A4 | auto | Landscape sheet, 3 cols x 2 rows |
| 6 | land | A4 | auto | Landscape sheet, 3 cols x 2 rows |
| 6 | mixed | A4 | auto | Landscape sheet, 3 cols x 2 rows |
| 9 | port | A4 | auto | Landscape sheet, 3x3 grid |
| 9 | land | A4 | auto | Landscape sheet, 3x3 grid |
| 9 | mixed | A4 | auto | Landscape sheet, 3x3 grid |

## File Naming Convention

`t{num}_n{nUp}_{set}_{paper}_{orientation}_contact.pdf`

Example: `t25_n2_mixed_A4_auto_contact.pdf`
- t25 = test number
- n2 = 2 images per sheet
- mixed = mixed portrait+landscape images
- A4 = A4 paper size
- auto = orientation auto

## Quick Check — Key Test Cases

**CRITICAL: These should show landscape sheet with side-by-side images:**

| File | What to verify |
|------|---------------|
| `t25_n2_mixed_A4_auto_contact.pdf` | 1 portrait + 1 landscape side-by-side on landscape sheet |
| `t73_n6_port_A4_auto_contact.pdf` | 6 portrait images, 3x2 grid on landscape sheet |
| `t85_n6_land_A4_auto_contact.pdf` | 6 landscape images, 3x2 grid on landscape sheet |
| `t97_n6_mixed_A4_auto_contact.pdf` | 6 mixed images, 3x2 grid on landscape sheet |
| `t109_n9_port_A4_auto_contact.pdf` | 9 portrait images, 3x3 grid on landscape sheet |

**Portrait sheet (stacked vertically) for orientation=portrait:**

| File | What to verify |
|------|---------------|
| `t2_n2_port_A4_portrait_contact.pdf` | 2 portrait images stacked on portrait sheet |
| `t74_n6_port_A4_portrait_contact.pdf` | 6 portrait images, 2x3 grid on portrait sheet |

## What "Correct" Looks Like

**2 portrait images, 2-per-sheet, A4 auto:**
- Sheet should be **landscape** (wider than tall)
- Two images side-by-side
- Each portrait image fills its cell height, with small white space on left/right (since portrait image in landscape cell rotates 90°)

**6 portrait images, 6-per-sheet, A4 auto:**
- Sheet should be **landscape**
- 3 columns x 2 rows grid
- Each portrait image rotated 90° to fit landscape cell

**Mixed (P+L), 2-per-sheet, A4 auto:**
- Sheet should be **landscape**
- Portrait image on left (rotated 90°), landscape image on right (no rotation)
- Both images fill their cells completely

## If Something Looks Wrong

Note the test PDF filename and tell me:
1. Expected layout vs actual layout
2. Whether images are cropped or have excessive blank space
3. Whether sheet orientation is wrong

I'll fix it immediately.

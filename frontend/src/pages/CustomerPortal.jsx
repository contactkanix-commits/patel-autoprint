import React, { useState, useCallback, useEffect, useRef, Fragment } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Grid,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Alert,
  CircularProgress,
  IconButton,
  Chip,
  InputAdornment,
  Avatar,
  ButtonBase,
  Zoom,
  keyframes,
} from '@mui/material';
import {
  CloudUpload,
  Delete,
  Receipt,
  CheckCircle,
  ShoppingCart,
  NavigateNext,
  NavigateBefore,
  ContentCopy,
  Add,
  Remove,
  LocalPrintshop as PrintIcon,
  Description as DocIcon,
  AccountCircle as AccountCircleIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Info as InfoIcon,
  DarkMode,
  LightMode,
  LockOutlined,
  Payments,
  LocalMall,
  CreditCard,
  QrCode2,
  Image as ImageIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useThemeMode } from '../utils/ThemeContext';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const stepLabels = ['Upload', 'Configure', 'Pay', 'Done'];

const paperSizes = ['A4', 'A3', 'Letter', 'Legal'];
const orientations = ['auto', 'portrait', 'landscape'];
const colorModes = ['bw', 'color'];
const pagesPerSheetOptions = [1, 2, 4, 6, 9, 16];

function isImageFile(file) {
  const name = (file?.originalName || file?.name || '').toLowerCase();
  return /\.(jpg|jpeg|png|webp)$/.test(name);
}

function isPdfFile(file) {
  const name = (file?.originalName || file?.name || '').toLowerCase();
  return name.endsWith('.pdf');
}

// Keyframe animations
const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); }
  50% { box-shadow: 0 0 0 12px rgba(79, 70, 229, 0); }
`;

const bounceIn = keyframes`
  0% { transform: scale(0.8); opacity: 0; }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); opacity: 1; }
`;

const pulseRing = keyframes`
  0% { transform: scale(0.8); opacity: 0.8; }
  100% { transform: scale(2); opacity: 0; }
`;

function PortalHeader({ shopName, shop, mode, toggleMode }) {
  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        backdropFilter: 'blur(8px)',
      }}
    >
      <Container maxWidth="sm" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>
            <PrintIcon sx={{ fontSize: 22 }} />
          </Avatar>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>{shopName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {shop ? 'Self-service print shop' : 'Print Shop · Self Service'}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={toggleMode} aria-label="toggle theme" color="inherit">
          {mode === 'light' ? <DarkMode /> : <LightMode />}
        </IconButton>
      </Container>
    </Box>
  );
}

function StepIndicator({ activeStep }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2, gap: 0.5 }}>
      {stepLabels.map((label, i) => {
        const active = i === activeStep;
        const done = i < activeStep;
        const filled = active || done;
        return (
          <Fragment key={label}>
            {i > 0 && (
              <Box
                sx={{
                  width: { xs: 8, sm: 22 },
                  height: 2,
                  borderRadius: 1,
                  bgcolor: i <= activeStep ? 'primary.main' : 'divider',
                  transition: 'background-color 0.3s',
                }}
              />
            )}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                py: 0.5,
                px: { xs: 0.75, sm: 1.25 },
                borderRadius: 999,
                bgcolor: filled ? 'primary.main' : 'transparent',
                color: filled ? 'primary.contrastText' : 'text.secondary',
                transition: 'all 0.3s',
              }}
            >
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  bgcolor: filled ? 'rgba(255,255,255,0.22)' : 'action.selected',
                  border: '1px solid',
                  borderColor: filled ? 'transparent' : 'divider',
                }}
              >
                {done ? <CheckCircle sx={{ fontSize: 13 }} /> : i + 1}
              </Box>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, display: { xs: 'none', sm: 'block' }, color: 'inherit' }}
              >
                {label}
              </Typography>
            </Box>
          </Fragment>
        );
      })}
    </Box>
  );
}

function PrivacyNote() {
  return (
    <Alert severity="info" icon={<LockOutlined fontSize="small" />} sx={{ mb: 2 }}>
      <Typography variant="caption" display="block">
        <b>Privacy:</b> Your files are used only to print. After printing they are deleted
        automatically. We do not keep a copy for viewing — only a print receipt (pages / amount)
        stays for the shop bill.
      </Typography>
    </Alert>
  );
}

const Step1Upload = ({ files, setFiles, customerInfo, setCustomerInfo }) => {
  const [dragActive, setDragActive] = useState(false);
  const uploadInputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  }, [setFiles]);

  const handleFileInput = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles((prev) => [...prev, ...selectedFiles]);
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>Upload your documents</Typography>
        <Chip icon={<InfoIcon />} label="PDF, DOCX, PPTX, XLSX, JPG, PNG, WebP" variant="outlined" size="small" />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Each file has its own copies, colour, orientation, sides, paper &amp; pages.
      </Typography>

      <Paper
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onClick={() => uploadInputRef.current?.click()}
        sx={{
          p: { xs: 3, sm: 5 },
          textAlign: 'center',
          border: dragActive ? '2px solid' : '2px dashed',
          borderColor: dragActive ? 'primary.main' : 'divider',
          cursor: 'pointer',
          mb: 2,
          bgcolor: dragActive ? 'action.hover' : 'background.paper',
          transition: 'all 0.3s ease',
          transform: dragActive ? 'scale(1.02)' : 'scale(1)',
          boxShadow: dragActive ? 4 : 1,
          '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
        }}
      >
        <input
          ref={uploadInputRef}
          id="file-input"
          type="file"
          multiple
          hidden
          onChange={handleFileInput}
          accept=".pdf,.docx,.pptx,.xlsx,.jpg,.jpeg,.png,.webp"
        />

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: { xs: 76, sm: 92 },
              height: { xs: 76, sm: 92 },
              borderRadius: '50%',
              bgcolor: dragActive ? 'primary.light' : 'action.hover',
              transition: 'all 0.3s ease',
              position: 'relative',
              animation: `${pulseGlow} 2.5s ease-in-out infinite`,
            }}
          >
            <CloudUpload sx={{ fontSize: { xs: 36, sm: 48 }, color: dragActive ? 'primary.main' : 'text.secondary' }} />
            {dragActive && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: -8,
                  borderRadius: '50%',
                  border: '2px solid',
                  borderColor: 'primary.main',
                  animation: `${pulseRing} 1.5s ease-out infinite`,
                }}
              />
            )}
          </Box>
          <Typography variant="subtitle1" fontWeight={600}>
            {dragActive ? 'Drop files here' : 'Tap to select files'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            or drag &amp; drop · Max 25 MB each · Held only until print finishes, then deleted
          </Typography>
        </Box>
      </Paper>

      {files.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DocIcon fontSize="small" color="primary" />
            Selected Files ({files.length})
          </Typography>
          <Grid container spacing={1}>
            {files.map((file, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Paper
                  elevation={1}
                  sx={{
                    p: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    borderRadius: 2,
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: 3, transition: 'all 0.2s' },
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Typography variant="body2" fontWeight={500} sx={{ flex: 1, mr: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {file.name}
                    </Typography>
                    <IconButton size="small" color="error" onClick={() => removeFile(index)} sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </Typography>
                    <Chip
                      size="small"
                      label={isImageFile(file) ? 'Image' : file.name.split('.').pop()?.toUpperCase()}
                      color={isImageFile(file) ? 'success' : 'default'}
                      variant="filled"
                      sx={{ fontSize: '0.7rem' }}
                    />
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle1" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AccountCircleIcon fontSize="small" color="primary" />
        Your Name &amp; Phone
      </Typography>
      <Grid container spacing={1.5}>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="Your Name"
            value={customerInfo.name}
            onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
            required
            InputProps={{ startAdornment: <InputAdornment position="start"><AccountCircleIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment> }}
            placeholder="e.g., John Doe"
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="Phone Number"
            value={customerInfo.phone}
            onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
            required
            InputProps={{ startAdornment: <InputAdornment position="start"><PhoneIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment> }}
            placeholder="e.g., +1234567890"
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            size="small"
            label="Email (optional)"
            value={customerInfo.email}
            onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
            InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment> }}
            placeholder="your@email.com"
          />
        </Grid>
      </Grid>
    </Box>
  );
};

function fileUrl(file) {
  if (!file?.storagePath) return null;
  return `/uploads/${file.storagePath.split(/[\\/]/).pop()}`;
}

function gridColumnsFor(pps) {
  if (pps >= 16) return 4;
  if (pps >= 9) return 3;
  if (pps >= 4) return 2;
  return 1;
}

function OptionGroup({ label, options, value, onChange, cols = 2 }) {
  return (
    <Box sx={{ mb: 1.75 }}>
      <Typography
        variant="caption"
        fontWeight={700}
        color="text.secondary"
        sx={{ display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.6 }}
      >
        {label}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 0.75 }}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <ButtonBase
              key={opt.value}
              onClick={() => onChange(opt.value)}
              sx={{
                py: 1,
                px: 0.75,
                borderRadius: 1.5,
                border: '1.5px solid',
                borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: selected ? 'primary.main' : 'background.paper',
                color: selected ? 'primary.contrastText' : 'text.primary',
                fontWeight: 700,
                fontSize: '0.85rem',
                lineHeight: 1.2,
                transition: 'all 0.15s',
                boxShadow: selected ? 1 : 0,
                '&:hover': { borderColor: 'primary.main', bgcolor: selected ? 'primary.dark' : 'action.hover' },
              }}
            >
              {opt.label}
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}

function CopiesStepper({ value, onChange }) {
  return (
    <Box sx={{ mb: 1.75 }}>
      <Typography
        variant="caption"
        fontWeight={700}
        color="text.secondary"
        sx={{ display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.6 }}
      >
        Copies
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton
          size="small"
          onClick={() => onChange(Math.max(1, (value || 1) - 1))}
          sx={{ border: '1.5px solid', borderColor: 'divider', borderRadius: 1.5 }}
        >
          <Remove fontSize="small" />
        </IconButton>
        <Typography variant="h6" fontWeight={800} sx={{ minWidth: 40, textAlign: 'center' }}>
          {value || 1}
        </Typography>
        <IconButton
          size="small"
          onClick={() => onChange((value || 1) + 1)}
          sx={{ border: '1.5px solid', borderColor: 'divider', borderRadius: 1.5 }}
        >
          <Add fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}

function PdfPageThumb({ doc, pageNum, colorMode }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask = null;
    doc
      .getPage(pageNum)
      .then((page) => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const vp1 = page.getViewport({ scale: 1 });
        const scale = 220 / vp1.width;
        const vp = page.getViewport({ scale });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        return renderTask.promise;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [doc, pageNum]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        filter: colorMode === 'bw' ? 'grayscale(1)' : 'none',
      }}
    />
  );
}

function PdfPages({ url, pagesToShow, colorMode }) {
  const [doc, setDoc] = useState(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let loaded = null;
    pdfjsLib
      .getDocument(url)
      .promise.then((d) => {
        loaded = d;
        if (!cancelled) setDoc(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (loaded) loaded.destroy();
    };
  }, [url]);

  if (!doc) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          bgcolor: '#fff',
        }}
      >
        <CircularProgress size={18} sx={{ color: '#9e9e9e' }} />
      </Box>
    );
  }

  return (
    <>
      {Array.from({ length: pagesToShow }).map((_, i) => {
        const pageNum = i + 1;
        if (pageNum > doc.numPages) return null;
        return (
          <Box
            key={pageNum}
            sx={{
              bgcolor: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              border: '1px dashed #e0e0e0',
            }}
          >
            <PdfPageThumb doc={doc} pageNum={pageNum} colorMode={colorMode} />
          </Box>
        );
      })}
    </>
  );
}

function PrintPreview({ file, settings, allImages, totalImages, imageUrls }) {
  const isImage = isImageFile(file);
  const pps = settings.pagesPerSheet || 1;
  const paper = settings.paperSize || 'A4';
  const copies = settings.copies || 1;
  const colorMode = settings.colorMode || 'bw';
  const pageCount = file?.pageCount || 1;
  const portrait = settings.orientation !== 'landscape';

  const cells = allImages
    ? Math.min(pps, Math.max(1, totalImages || 1))
    : isImage
      ? 1
      : pps;
  const sheets = allImages
    ? Math.max(1, Math.ceil((totalImages || 1) / pps))
    : Math.max(1, Math.ceil(pageCount / pps));
  const cols = gridColumnsFor(pps);
  const totalPages = sheets * copies;

  const summary = [
    paper,
    colorMode === 'color' ? 'Color' : 'B/W',
    settings.printStyle === 'duplex' ? 'Double-sided' : 'Single-sided',
    pps > 1 ? `${pps} per page` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography
        variant="caption"
        fontWeight={700}
        color="text.secondary"
        sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 0.6 }}
      >
        Live Print Preview
      </Typography>
      <Box
        sx={{
          position: 'relative',
          aspectRatio: portrait ? '210/297' : '297/210',
          width: '100%',
          maxWidth: portrait ? 230 : 300,
          mx: 'auto',
          bgcolor: '#fff',
          borderRadius: 1,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: pps > 1 ? 2 : 0,
          p: pps > 1 ? 1.5 : 2,
        }}
      >
        {isPdfFile(file) && fileUrl(file) ? (
          <PdfPages url={fileUrl(file)} pagesToShow={cells} colorMode={colorMode} />
        ) : (
          Array.from({ length: cells }).map((_, i) => (
            <Box
              key={i}
              sx={{
                position: 'relative',
                bgcolor: '#fff',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px dashed #e0e0e0',
              }}
            >
              {isImage ? (
                imageUrls?.[i] ? (
                  <img
                    src={imageUrls[i]}
                    alt={`Image ${i + 1}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      padding: pps > 1 ? 2 : 8,
                      boxSizing: 'border-box',
                      filter: colorMode === 'bw' ? 'grayscale(1)' : 'none',
                    }}
                  />
                ) : (
                  <ImageIcon sx={{ fontSize: 40, color: '#bdbdbd' }} />
                )
              ) : (
                <Box sx={{ width: '80%', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ height: 6, width: '60%', bgcolor: '#e0e0e0', borderRadius: 1 }} />
                  <Box sx={{ height: 6, width: '90%', bgcolor: '#ececec', borderRadius: 1 }} />
                  <Box sx={{ height: 6, width: '75%', bgcolor: '#ececec', borderRadius: 1 }} />
                  <Box sx={{ height: 6, width: '85%', bgcolor: '#ececec', borderRadius: 1 }} />
                  <Box sx={{ height: 6, width: '55%', bgcolor: '#ececec', borderRadius: 1 }} />
                </Box>
              )}
            </Box>
          ))
        )}
        {allImages && totalImages > cells && (
          <Box
            sx={{
              position: 'absolute',
              right: 6,
              bottom: 6,
              bgcolor: 'rgba(0,0,0,0.55)',
              color: '#fff',
              borderRadius: 1,
              px: 0.75,
              py: 0.25,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            +{totalImages - cells} more images
          </Box>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {summary}
      </Typography>
      <Typography variant="body2" fontWeight={800} color="primary" sx={{ display: 'block', mt: 0.25 }}>
        {totalPages} page{totalPages === 1 ? '' : 's'}
        {sheets > 1 ? ` · ${sheets} sheet${sheets === 1 ? '' : 's'} × ${copies} ${copies === 1 ? 'copy' : 'copies'}` : ''}
      </Typography>
    </Box>
  );
}

function Step2Configure({ files, fileSettings, setFileSettings }) {
  const [activeTab, setActiveTab] = useState(0);

  const getSettings = (fileIndex) => {
    const dbSettings = files[fileIndex]?.settings || {};
    const localSettings = fileSettings[fileIndex] || {};
    const merged = { ...dbSettings, ...localSettings };
    if (merged.colorMode === 'auto') merged.colorMode = 'bw';
    if (!merged.colorMode && isImageFile(files[fileIndex])) merged.colorMode = 'color';
    return merged;
  };

  const allImages = files.length > 0 && files.every((f) => isImageFile(f));
  const totalImages = files.filter((f) => isImageFile(f)).length;
  const imageUrls = files.map((f) => fileUrl(f));

  // Apply a setting to every image file at once (contact-sheet mode)
  const updateAllImageSettings = (key, value) => {
    setFileSettings((prev) => {
      const next = { ...prev };
      files.forEach((f, i) => {
        if (isImageFile(f)) next[i] = { ...next[i], [key]: value };
      });
      return next;
    });
  };

  const updateSetting = (fileIndex, key, value) => {
    setFileSettings((prev) => ({
      ...prev,
      [fileIndex]: { ...prev[fileIndex], [key]: value },
    }));
  };

  const addSection = (fileIndex) => {
    const current = getSettings(fileIndex);
    const sections = current.sections || [];
    const totalPages = files[fileIndex]?.pageCount || 1;
    const lastSection = sections[sections.length - 1];
    const startPage = lastSection ? lastSection.endPage + 1 : 1;
    if (startPage > totalPages) {
      toast.error('No more pages available');
      return;
    }
    updateSetting(fileIndex, 'sections', [...sections, {
      id: Date.now(),
      startPage,
      endPage: startPage,
      paperSize: current.paperSize || 'A4',
      colorMode: current.colorMode || 'bw',
      printStyle: current.printStyle || 'single',
      copies: current.copies || 1,
      pagesPerSheet: current.pagesPerSheet || 1,
    }]);
  };

  const updateSection = (fileIndex, sectionIndex, key, value) => {
    const current = getSettings(fileIndex);
    const sections = [...(current.sections || [])];
    sections[sectionIndex] = { ...sections[sectionIndex], [key]: value };
    updateSetting(fileIndex, 'sections', sections);
  };

  const removeSection = (fileIndex, sectionIndex) => {
    const current = getSettings(fileIndex);
    updateSetting(fileIndex, 'sections', (current.sections || []).filter((_, i) => i !== sectionIndex));
  };

  const s = getSettings(activeTab);
  const currentFile = files[activeTab];

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Set your print options</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tap the buttons to choose how your file prints — the preview updates instantly.
      </Typography>

      {files.length > 1 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
          {files.map((file, index) => (
            <Chip
              key={index}
              label={file.originalName?.substring(0, 20) || file.name?.substring(0, 20)}
              onClick={() => setActiveTab(index)}
              color={activeTab === index ? 'primary' : 'default'}
              variant={activeTab === index ? 'filled' : 'outlined'}
              size="small"
            />
          ))}
        </Box>
      )}

      {allImages && (
        <Box sx={{ mb: 1.5 }}>
          <Typography
            variant="caption"
            fontWeight={700}
            color="text.secondary"
            sx={{ display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.6 }}
          >
            Photos per page
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 0.75 }}>
            {pagesPerSheetOptions.filter((n) => n > 1).map((n) => {
              const selected = (s.pagesPerSheet || 1) === n;
              return (
                <ButtonBase
                  key={n}
                  onClick={() => updateAllImageSettings('pagesPerSheet', n)}
                  sx={{
                    py: 1,
                    borderRadius: 1.5,
                    border: '1.5px solid',
                    borderColor: selected ? 'primary.main' : 'divider',
                    bgcolor: selected ? 'primary.main' : 'background.paper',
                    color: selected ? 'primary.contrastText' : 'text.primary',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    transition: 'all 0.15s',
                    '&:hover': { borderColor: 'primary.main' },
                  }}
                >
                  {n}
                </ButtonBase>
              );
            })}
          </Box>
        </Box>
      )}

      {currentFile && (
        <Card variant="outlined">
          <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              {currentFile.originalName || currentFile.name} — {currentFile.pageCount || '?'} page{currentFile.pageCount === 1 ? '' : 's'}
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={5}>
                <PrintPreview
                  file={currentFile}
                  settings={s}
                  allImages={allImages}
                  totalImages={totalImages}
                  imageUrls={allImages ? imageUrls : [fileUrl(currentFile)]}
                />
              </Grid>
              <Grid item xs={12} sm={7}>
                <OptionGroup
                  label="Paper Size"
                  cols={2}
                  value={s.paperSize || 'A4'}
                  onChange={(v) => updateSetting(activeTab, 'paperSize', v)}
                  options={paperSizes.map((ps) => ({ value: ps, label: ps }))}
                />
                <OptionGroup
                  label="Color"
                  cols={2}
                  value={s.colorMode || 'bw'}
                  onChange={(v) => (allImages ? updateAllImageSettings('colorMode', v) : updateSetting(activeTab, 'colorMode', v))}
                  options={[
                    { value: 'bw', label: 'B/W' },
                    { value: 'color', label: 'Color' },
                  ]}
                />
                <OptionGroup
                  label="Sides"
                  cols={2}
                  value={s.printStyle || 'single'}
                  onChange={(v) => updateSetting(activeTab, 'printStyle', v)}
                  options={[
                    { value: 'single', label: 'Single-sided' },
                    { value: 'duplex', label: 'Double-sided' },
                  ]}
                />
                <OptionGroup
                  label="Orientation"
                  cols={3}
                  value={s.orientation || 'auto'}
                  onChange={(v) => updateSetting(activeTab, 'orientation', v)}
                  options={orientations.map((o) => ({
                    value: o,
                    label: o === 'auto' ? 'Auto' : o.charAt(0).toUpperCase() + o.slice(1),
                  }))}
                />
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <CopiesStepper value={s.copies ?? 1} onChange={(v) => updateSetting(activeTab, 'copies', v)} />
                  <OptionGroup
                    label="Pages / Sheet"
                    cols={3}
                    value={s.pagesPerSheet || 1}
                    onChange={(v) => (allImages
                      ? updateAllImageSettings('pagesPerSheet', parseInt(v))
                      : updateSetting(activeTab, 'pagesPerSheet', parseInt(v)))}
                    options={pagesPerSheetOptions.map((n) => ({ value: n, label: n === 1 ? '1' : String(n) }))}
                  />
                </Box>
                {!(s.sections || []).length > 0 && (
                  <TextField
                    fullWidth size="small" label="Page range"
                    value={s.pageRange || ''}
                    onChange={(e) => updateSetting(activeTab, 'pageRange', e.target.value)}
                    placeholder="e.g. 1-5, 8, 10-12"
                    helperText="Leave empty = all pages"
                  />
                )}
              </Grid>
            </Grid>

            <Divider sx={{ my: 1.5 }} />

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="caption" fontWeight={600}>Print Sections (advanced)</Typography>
              <Button size="small" startIcon={<Add />} onClick={() => addSection(activeTab)} sx={{ textTransform: 'none' }}>
                Add
              </Button>
            </Box>

            {(s.sections || []).length > 0 ? (
              (s.sections || []).map((section, si) => (
                <Paper key={section.id || si} variant="outlined" sx={{ p: 1, mb: 0.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600}>Section {si + 1} (p{section.startPage}-{section.endPage})</Typography>
                    <IconButton size="small" onClick={() => removeSection(activeTab, si)}>
                      <Remove fontSize="small" />
                    </IconButton>
                  </Box>
                  <Grid container spacing={1}>
                    <Grid item xs={6} sm={4} md={4}>
                      <TextField fullWidth size="small" label="From" type="number"
                        value={section.startPage ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateSection(activeTab, si, 'startPage', v === '' ? '' : parseInt(v));
                        }}
                        onBlur={() => {
                          const val = getSettings(activeTab).sections?.[si]?.startPage;
                          if (val === '' || val == null || val < 1) {
                            updateSection(activeTab, si, 'startPage', 1);
                          }
                        }}
                        inputProps={{ min: 1 }}
                      />
                    </Grid>
                    <Grid item xs={6} sm={4} md={4}>
                      <TextField fullWidth size="small" label="To" type="number"
                        value={section.endPage ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateSection(activeTab, si, 'endPage', v === '' ? '' : parseInt(v));
                        }}
                        onBlur={() => {
                          const val = getSettings(activeTab).sections?.[si]?.endPage;
                          if (val === '' || val == null || val < 1) {
                            updateSection(activeTab, si, 'endPage', 1);
                          }
                        }}
                        inputProps={{ min: 1 }}
                      />
                    </Grid>
                    <Grid item xs={6} sm={4} md={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Color</InputLabel>
                        <Select value={section.colorMode || 'bw'} label="Color"
                          onChange={(e) => updateSection(activeTab, si, 'colorMode', e.target.value)}>
                          <MenuItem value="bw">B/W</MenuItem>
                          <MenuItem value="color">Color</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6} sm={4} md={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Style</InputLabel>
                        <Select value={section.printStyle || 'single'} label="Style"
                          onChange={(e) => updateSection(activeTab, si, 'printStyle', e.target.value)}>
                          <MenuItem value="single">Simplex</MenuItem>
                          <MenuItem value="duplex">Duplex</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6} sm={4} md={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel>N-up</InputLabel>
                        <Select value={section.pagesPerSheet || 1} label="N-up"
                          onChange={(e) => updateSection(activeTab, si, 'pagesPerSheet', parseInt(e.target.value))}>
                          {pagesPerSheetOptions.map((n) => (
                            <MenuItem key={n} value={n}>{n === 1 ? '1' : `${n}`}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6} sm={4} md={4}>
                      <TextField fullWidth size="small" type="number" label="Copies"
                        value={section.copies ?? 1}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateSection(activeTab, si, 'copies', v === '' ? '' : parseInt(v));
                        }}
                        onBlur={() => {
                          const val = getSettings(activeTab).sections?.[si]?.copies;
                          if (val === '' || val == null || val < 1) {
                            updateSection(activeTab, si, 'copies', 1);
                          }
                        }}
                        inputProps={{ min: 1 }}
                      />
                    </Grid>
                  </Grid>
                </Paper>
              ))
            ) : (
              <Typography variant="caption" color="text.secondary">
                No sections — entire file uses same settings above.
              </Typography>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

function Step3Review({ order, paymentMethod, setPaymentMethod, priceData, loadingPrice, upiQrUrl }) {
  if (loadingPrice) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, py: 8 }}>
        <CircularProgress size={28} />
        <Typography variant="body2">Calculating price...</Typography>
      </Box>
    );
  }

  const paymentOptions = [
    { value: 'cash', label: 'Cash', sub: 'Pay at counter', icon: <LocalMall /> },
    { value: 'card', label: 'Card', sub: 'Pay at counter', icon: <CreditCard /> },
    { value: 'upi', label: 'UPI', sub: 'Scan to pay', icon: <QrCode2 /> },
    { value: 'online', label: 'Online', sub: 'Pay online', icon: <Payments /> },
  ];

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Review &amp; Payment</Typography>

      {priceData?.breakdowns && priceData.breakdowns.length > 0 ? (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Receipt sx={{ mr: 0.5, fontSize: 20 }} />
              <Typography variant="subtitle2">Price Breakdown</Typography>
            </Box>

            {priceData.breakdowns.map((b, i) => (
              <Box key={i} sx={{ mb: 1.5 }}>
                <Typography variant="caption" fontWeight={600} display="block" sx={{ wordBreak: 'break-word' }}>
                  {b.fileName}
                </Typography>
                {b.sections ? (
                  b.sections.map((sec, si) => (
                    <Box key={si} sx={{ ml: 1, mb: 1 }}>
                      <Typography variant="caption" fontWeight={600} display="block" color="text.secondary">
                        {sec.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {sec.pageCount} pages, {sec.colorPages} color
                      </Typography>
                      {sec.items?.map((item, j) => (
                        <Typography key={j} variant="caption" color="text.secondary" display="block" sx={{ pl: 1 }}>
                          {item.label}: {'\u20B9'}{item.amount?.toFixed(2)}
                        </Typography>
                      ))}
                      <Typography variant="caption" fontWeight={600} color="primary" display="block">
                        {'\u20B9'}{sec.amount?.toFixed(2)}
                      </Typography>
                    </Box>
                  ))
                ) : (
                  <>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {b.pageCount} pages, {b.copies} copy(ies)
                    </Typography>
                    {b.breakdown?.map((item, j) => (
                      <Typography key={j} variant="caption" color="text.secondary" display="block" sx={{ pl: 1 }}>
                        {item.label}: {'\u20B9'}{item.amount?.toFixed(2)}
                      </Typography>
                    ))}
                  </>
                )}
                <Typography variant="body2" fontWeight={600} color="primary">
                  {'\u20B9'}{b.amount?.toFixed(2)}
                </Typography>
              </Box>
            ))}

            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1" fontWeight={700}>Total</Typography>
              <Typography variant="h6" fontWeight={700} color="primary">
                {'\u20B9'}{priceData.total?.toFixed(2)}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>
          Price will be calculated based on your settings.
        </Alert>
      )}

      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>How will you pay?</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
        {paymentOptions.map((opt) => {
          const selected = paymentMethod === opt.value;
          return (
            <ButtonBase
              key={opt.value}
              onClick={() => setPaymentMethod(opt.value)}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
                p: 1.5,
                borderRadius: 2,
                border: '1.5px solid',
                borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: selected ? 'primary.main' : 'background.paper',
                color: selected ? 'primary.contrastText' : 'text.primary',
                boxShadow: selected ? 3 : 0,
                transition: 'all 0.2s',
                '&:hover': { borderColor: 'primary.main' },
              }}
            >
              {React.cloneElement(opt.icon, { sx: { fontSize: 28, color: selected ? 'inherit' : 'primary.main' } })}
              <Typography variant="body2" fontWeight={700} color="inherit">{opt.label}</Typography>
              <Typography variant="caption" sx={{ color: selected ? 'rgba(255,255,255,0.85)' : 'text.secondary' }}>
                {opt.sub}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>

      {paymentMethod === 'upi' && upiQrUrl && (
        <Box sx={{ textAlign: 'center', mt: 2.5 }}>
          <img src={upiQrUrl} alt="UPI QR Code" style={{ width: 180, height: 180, objectFit: 'contain' }} />
          <Typography variant="caption" display="block" color="text.secondary">Scan to pay</Typography>
        </Box>
      )}
    </Box>
  );
}

function Step4Confirmation({ order, total }) {
  const [copied, setCopied] = useState(false);

  const files = order?.files || [];
  const pageCount = files.reduce((sum, f) => sum + (f.pageCount || 0), 0);

  const copyOrderId = () => {
    navigator.clipboard.writeText(order.id);
    setCopied(true);
    toast.success('Order ID copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{ textAlign: 'center', py: { xs: 3, sm: 4 } }}>
      <Zoom in>
        <Box>
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              bgcolor: 'success.main',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 2,
              animation: `${bounceIn} 0.4s ease`,
            }}
          >
            <CheckCircle sx={{ fontSize: 42 }} />
          </Box>
          <Typography variant="h5" fontWeight={800} gutterBottom>Order Placed!</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Your job is in the print queue. Show this token to collect your printout.
          </Typography>

          <Card variant="outlined" sx={{ maxWidth: 340, mx: 'auto', mb: 2 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="h2" sx={{ fontWeight: 900, color: 'primary.main', lineHeight: 1 }}>
                #{order.token || '-'}
              </Typography>
              <Typography variant="caption" color="text.secondary">Your Token Number</Typography>
              <Chip
                label={order.status === 'APPROVED' ? 'Approved' : 'Pending'}
                color={order.status === 'APPROVED' ? 'success' : 'warning'}
                size="small"
                sx={{ mt: 1.5 }}
              />

              <Divider sx={{ my: 1.5 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">Files</Typography>
                <Typography variant="body2" fontWeight={600}>{files.length}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">Pages</Typography>
                <Typography variant="body2" fontWeight={600}>{pageCount}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">Total</Typography>
                <Typography variant="body2" fontWeight={700} color="primary">
                  ₹{total != null ? total.toFixed(2) : '—'}
                </Typography>
              </Box>

              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary" display="block">Order ID</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                    {order.id}
                  </Typography>
                  <IconButton onClick={copyOrderId} size="small">
                    {copied ? <CheckCircle fontSize="small" color="success" /> : <ContentCopy fontSize="small" />}
                  </IconButton>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Alert severity="info" icon={<LockOutlined fontSize="small" />} sx={{ maxWidth: 340, mx: 'auto', textAlign: 'left' }}>
            <Typography variant="caption" display="block">
              Save your Order ID to track status. Your files are deleted automatically after printing.
            </Typography>
          </Alert>
        </Box>
      </Zoom>
    </Box>
  );
}

export default function CustomerPortal() {
  const { slug: shopSlug } = useParams() || {};
  const [searchParams, setSearchParams] = useSearchParams();
  const { mode, toggleMode } = useThemeMode();
  const [activeStep, setActiveStep] = useState(0);
  const [files, setFiles] = useState([]);
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '' });
  const [fileSettings, setFileSettings] = useState({});
  const [uploadedOrder, setUploadedOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [priceData, setPriceData] = useState(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [upiQrUrl, setUpiQrUrl] = useState('');
  const [shop, setShop] = useState(null);
  const [shopError, setShopError] = useState('');
  const [waSource, setWaSource] = useState(false);
  const [waError, setWaError] = useState('');
  const waToken = searchParams.get('wa');
  const waClaimedRef = useRef(false);

  useEffect(() => {
    if (!waToken || waClaimedRef.current) return;
    waClaimedRef.current = true;
    let cancelled = false;
    setLoading(true);
    api.post(`/guest/whatsapp/${waToken}/claim`)
      .then((result) => {
        if (cancelled || !result.success) return;
        setUploadedOrder(result.data.order);
        setCustomerInfo((prev) => ({
          ...prev,
          phone: result.data.customerPhone || '',
          name: result.data.customerName || '',
        }));
        setWaSource(true);
        setActiveStep(1);
        toast.success('WhatsApp files received!');
      })
      .catch((err) => {
        if (!cancelled) setWaError(err?.message || 'This WhatsApp link is invalid or already used.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        setSearchParams({}, { replace: true });
      });
    return () => { cancelled = true; };
  }, [waToken]);

  useEffect(() => {
    if (!shopSlug) return;
    let cancelled = false;
    api.get(`/guest/shop/${shopSlug}`)
      .then((result) => {
        if (!cancelled && result.success) setShop(result.data);
      })
      .catch((err) => {
        if (!cancelled) setShopError(err?.message || 'Shop not found');
      });
    return () => { cancelled = true; };
  }, [shopSlug]);

  const handleUpload = async () => {
    if (files.length === 0) { toast.error('Please select files'); return; }
    if (!customerInfo.name || !customerInfo.phone) { toast.error('Please fill name and phone'); return; }
    setLoading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      formData.append('customerName', customerInfo.name);
      formData.append('customerPhone', customerInfo.phone);
      formData.append('customerEmail', customerInfo.email);
      if (shop?.id) formData.append('shopId', shop.id);
      else if (shopSlug) formData.append('shopRef', shopSlug);

      const result = await api.post('/guest/upload', formData);
      if (result.success) {
        setUploadedOrder(result.data);
        toast.success(`${result.data.files?.length || 0} file(s) analyzed!`);
        setActiveStep(1);
      }
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!uploadedOrder) return;
    setLoading(true);
    try {
      for (const [fileIndex, settings] of Object.entries(fileSettings)) {
        const fileId = uploadedOrder.files?.[fileIndex]?.id;
        if (fileId) {
          await api.put(`/guest/orders/${uploadedOrder.id}/settings`, {
            fileId,
            settings: { ...uploadedOrder.files?.[fileIndex]?.settings, ...settings },
          });
        }
      }
      const updated = await api.get(`/guest/orders/${uploadedOrder.id}`);
      if (updated.success) setUploadedOrder(updated.data);
      toast.success('Settings saved!');
      setActiveStep(2);
    } catch (err) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const fetchPrice = async () => {
    if (!uploadedOrder) return;
    setLoadingPrice(true);
    try {
      const result = await api.get(`/guest/orders/${uploadedOrder.id}/price`);
      if (result.success) setPriceData(result.data);
    } catch (err) {
      toast.error(err.message || 'Failed to get price');
    } finally {
      setLoadingPrice(false);
    }
  };

  const fetchUpiQr = async () => {
    try {
      const params = new URLSearchParams();
      if (shop?.slug) params.append('shop', shop.slug);
      else if (shopSlug) params.append('shop', shopSlug);
      const result = await api.get(`/settings/public/upi-qr?${params.toString()}`);
      if (result.success && result.data.url) setUpiQrUrl(result.data.url);
    } catch {}
  };

  useEffect(() => {
    if (activeStep === 2) fetchUpiQr();
  }, [activeStep]);

  useEffect(() => {
    if (activeStep === 2 && uploadedOrder) fetchPrice();
  }, [activeStep, uploadedOrder?.id]);

  const handlePlaceOrder = async () => {
    if (!uploadedOrder || !paymentMethod) { toast.error('Select payment method'); return; }
    setLoading(true);
    try {
      const result = await api.post(`/guest/orders/${uploadedOrder.id}/confirm`, { paymentMethod });
      if (result.success) {
        setUploadedOrder(result.data);
        toast.success('Order placed!');
        setActiveStep(3);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (activeStep === 0) await handleUpload();
    else if (activeStep === 1) await handleSaveSettings();
    else if (activeStep === 2) await handlePlaceOrder();
  };

  const handleBack = () => setActiveStep((prev) => prev - 1);

  const handleNewOrder = () => {
    setActiveStep(0);
    setFiles([]);
    setCustomerInfo({ name: '', phone: '', email: '' });
    setFileSettings({});
    setUploadedOrder(null);
    setPaymentMethod('cash');
    setPriceData(null);
    setWaSource(false);
    setWaError('');
  };

  const displayFiles = activeStep > 0 ? (uploadedOrder?.files?.length || 0) : files.length;
  const displayTotal = activeStep === 3 ? priceData?.total : (activeStep === 2 ? priceData?.total : null);
  const shopName = shop?.name || 'Patel AutoPrint';

  return (
    <Box sx={{ minHeight: '100vh', pb: { xs: 14, sm: 16 } }}>
      <PortalHeader shopName={shopName} shop={shop} mode={mode} toggleMode={toggleMode} />

      {shopSlug && !shop && !shopError ? (
        <Box sx={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : shopSlug && shopError ? (
        <Container maxWidth="sm" sx={{ pt: 4 }}>
          <Alert severity="error">Shop not found. Please check the link and try again.</Alert>
        </Container>
      ) : (
        <Container maxWidth="sm" sx={{ py: 2 }}>
          {waError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setWaError('')}>
              {waError}
            </Alert>
          )}

          {activeStep === 1 && waSource && (
            <Alert severity="success" icon={<CheckCircle fontSize="small" />} sx={{ mb: 2 }}>
              <Typography variant="caption" display="block">
                <b>Files received via WhatsApp.</b> Configure the print settings below, then continue.
              </Typography>
            </Alert>
          )}

          <StepIndicator activeStep={activeStep} />

          {activeStep < 3 && <PrivacyNote />}

          <Paper sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
            {activeStep === 0 && (
              <Step1Upload files={files} setFiles={setFiles} customerInfo={customerInfo} setCustomerInfo={setCustomerInfo} />
            )}
            {activeStep === 1 && (
              <Step2Configure files={uploadedOrder?.files || files} fileSettings={fileSettings} setFileSettings={setFileSettings} />
            )}
            {activeStep === 2 && (
              <Step3Review order={uploadedOrder} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
                priceData={priceData} loadingPrice={loadingPrice} upiQrUrl={upiQrUrl} />
            )}
            {activeStep === 3 && (
              <Step4Confirmation order={uploadedOrder} total={displayTotal} />
            )}
          </Paper>
        </Container>
      )}

      {/* Sticky bottom action bar */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1200,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
        }}
      >
        <Container maxWidth="sm" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5 }}>
          {activeStep > 0 && activeStep < 3 && (
            <Button
              variant="text"
              startIcon={<NavigateBefore />}
              onClick={handleBack}
              disabled={loading}
              sx={{ flexShrink: 0 }}
            >
              Back
            </Button>
          )}

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
              {displayFiles} file{displayFiles !== 1 ? 's' : ''}
              {activeStep >= 2 && priceData?.total != null ? ` · ${pageCountLabel(uploadedOrder)} pages` : ''}
            </Typography>
            {activeStep >= 2 && priceData?.total != null && (
              <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.3 }}>
                Est. total{' '}
                <Box component="span" sx={{ color: 'primary.main' }}>
                  ₹{priceData.total.toFixed(2)}
                </Box>
              </Typography>
            )}
          </Box>

          {activeStep < 3 ? (
            <Button
              variant="contained"
              onClick={handleNext}
              disabled={loading || (activeStep === 2 && loadingPrice)}
              endIcon={loading ? <CircularProgress size={18} color="inherit" /> : <NavigateNext />}
              sx={{ px: { xs: 2, sm: 3 }, flexShrink: 0 }}
            >
              {activeStep === 0 ? 'Upload Files' : activeStep === 1 ? 'Save & Continue' : loading ? 'Placing...' : 'Place Order'}
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<ShoppingCart />}
              onClick={handleNewOrder}
              sx={{ px: { xs: 2, sm: 3 }, flexShrink: 0 }}
            >
              New Order
            </Button>
          )}
        </Container>
      </Box>
    </Box>
  );
}

function pageCountLabel(order) {
  const files = order?.files || [];
  const pages = files.reduce((sum, f) => sum + (f.pageCount || 0), 0);
  return pages;
}

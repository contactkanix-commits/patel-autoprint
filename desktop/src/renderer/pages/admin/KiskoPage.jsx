import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  CircularProgress,
  Alert,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  Divider,
} from '@mui/material';
import {
  Print as PrintIcon,
  Code as CodeIcon,
  People as PeopleIcon,
  CloudUpload as CloudUploadIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../api';

const isImageFile = (file) => {
  const t = (file.fileType || '').toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp'].includes(t);
};

export default function KiskoPage() {
  const [customerCode, setCustomerCode] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [printers, setPrinters] = useState([]);
  const [bwPrinter, setBwPrinter] = useState('');
  const [colorPrinter, setColorPrinter] = useState('');
  const [paperSize, setPaperSize] = useState('A4');
  const [colorMode, setColorMode] = useState('bw');
  const [printStyle, setPrintStyle] = useState('single');
  const [pagesPerSheet, setPagesPerSheet] = useState('1');
  const [orientation, setOrientation] = useState('auto');
  const [copies, setCopies] = useState('1');
  const [success, setSuccess] = useState(null);

  const fetchPrinters = async () => {
    try {
      const result = await api.get('/printers');
      if (result.success) {
        const list = result.data?.printers || [];
        setPrinters(list);
        const bw = list.filter((p) => !p.colorSupport);
        const color = list.filter((p) => p.colorSupport);
        if (bw.length > 0) setBwPrinter(bw[0].name);
        if (color.length > 0) setColorPrinter(color[0].name);
      }
    } catch {
      // ignore
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!customerCode || !/^\d{6}$/.test(customerCode)) {
      toast.error('Please enter a valid 6-digit customer code');
      return;
    }
    if (files.length === 0) {
      toast.error('Please select at least one file');
      return;
    }

    setLoading(true);
    setSuccess(null);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      formData.append('customerCode', customerCode);
      formData.append('copies', copies);
      formData.append('paperSize', paperSize);
      formData.append('colorMode', colorMode);
      formData.append('printStyle', printStyle);
      formData.append('pagesPerSheet', pagesPerSheet);
      formData.append('orientation', orientation);
      if (bwPrinter) formData.append('bwPrinterName', bwPrinter);
      if (colorPrinter) formData.append('colorPrinterName', colorPrinter);

      const result = await api.post('/admin/orders/kisko', formData);
      if (result.success) {
        setSuccess(result.data.order);
        setFiles([]);
        setCustomerCode('');
        toast.success('Kisko print job sent to printer');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to send print job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', pt: 4 }}>
      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
          <CodeIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700}>
            Kisko Mode – Quick Print
          </Typography>
        </Box>

        {success && (
          <Alert severity="success" icon={<SuccessIcon />} sx={{ mb: 2 }}>
            <Typography fontWeight={600}>
              Print job sent successfully
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              Customer Code: {success.customerCode} &nbsp;|&nbsp; Files: {success.files?.length || 0}
            </Typography>
          </Alert>
        )}

        <form onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            fullWidth
            size="small"
            label="Customer Code (6 digits)"
            value={customerCode}
            onChange={(e) => setCustomerCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            InputProps={{
              startAdornment: <IconButton><CodeIcon fontSize="small" /></IconButton>,
              maxLength: 6,
            }}
            helperText="Enter the customer's 6-digit quick code"
            required
          />

          <Box
            component="label"
            sx={{
              display: 'block',
              mb: 0.5,
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'text.secondary',
            }}
          >
            Select Files
          </Box>
          <Box
            sx={{
              border: '2px dashed',
              borderColor: 'primary.light',
              borderRadius: 2,
              p: 2,
              textAlign: 'center',
              cursor: 'pointer',
              '&:hover': { bgcolor: 'primary.lightest' },
            }}
            onClick={() => document.getElementById('kisko-file-input').click()}
          >
            <input
              id="kisko-file-input"
              type="file"
              multiple
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <CloudUploadIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Click to upload files ({files.length} selected)
            </Typography>
          </Box>

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" fontWeight={600} color="text.secondary" sx={{ mb: 1 }}>
            Print Settings
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Paper Size</InputLabel>
              <Select
                value={paperSize}
                label="Paper Size"
                onChange={(e) => setPaperSize(e.target.value)}
              >
                <MenuItem value="A4">A4</MenuItem>
                <MenuItem value="A3">A3</MenuItem>
                <MenuItem value="Letter">Letter</MenuItem>
                <MenuItem value="Legal">Legal</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Copies</InputLabel>
              <Select
                value={copies}
                label="Copies"
                onChange={(e) => setCopies(e.target.value)}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <MenuItem key={n} value={String(n)}>{n}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
            <ToggleButtonGroup
              value={colorMode}
              exclusive
              onChange={(_, val) => setColorMode(val)}
              size="small"
            >
              <ToggleButton value="bw">B/W</ToggleButton>
              <ToggleButton value="color">Color</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              value={printStyle}
              exclusive
              onChange={(_, val) => setPrintStyle(val)}
              size="small"
            >
              <ToggleButton value="single">Single</ToggleButton>
              <ToggleButton value="duplex">Duplex</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Pages per Sheet</InputLabel>
              <Select
                value={pagesPerSheet}
                label="Pages per Sheet"
                onChange={(e) => setPagesPerSheet(e.target.value)}
              >
                <MenuItem value="1">1</MenuItem>
                <MenuItem value="2">2</MenuItem>
                <MenuItem value="4">4</MenuItem>
                <MenuItem value="6">6</MenuItem>
                <MenuItem value="9">9</MenuItem>
                <MenuItem value="16">16</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Orientation</InputLabel>
              <Select
                value={orientation}
                label="Orientation"
                onChange={(e) => setOrientation(e.target.value)}
              >
                <MenuItem value="auto">Auto</MenuItem>
                <MenuItem value="portrait">Portrait</MenuItem>
                <MenuItem value="landscape">Landscape</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>B/W Printer</InputLabel>
              <Select
                value={bwPrinter}
                label="B/W Printer"
                onChange={(e) => setBwPrinter(e.target.value)}
              >
                <MenuItem value=""><em>Auto</em></MenuItem>
                {printers.filter((p) => !p.colorSupport).map((p) => (
                  <MenuItem key={p.id} value={p.name}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Color Printer</InputLabel>
              <Select
                value={colorPrinter}
                label="Color Printer"
                onChange={(e) => setColorPrinter(e.target.value)}
              >
                <MenuItem value=""><em>Auto</em></MenuItem>
                {printers.filter((p) => p.colorSupport).map((p) => (
                  <MenuItem key={p.id} value={p.name}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Button
            type="submit"
            variant="contained"
            size="large"
            startIcon={<PrintIcon />}
            disabled={loading || !/^\d{6}$/.test(customerCode) || files.length === 0}
            sx={{
              mt: 1,
              fontWeight: 700,
              textTransform: 'uppercase',
              '&:disabled': { opacity: 0.5 },
            }}
          >
            {loading ? <CircularProgress size={20} /> : null}
            {loading ? 'Sending to Printer...' : 'Send to Print'}
          </Button>
        </form>

        <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Chip
            label="Kisko Mode"
            icon={<PeopleIcon fontSize="small" />}
            color="primary"
            size="small"
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
            Walk-in quick print: 6-digit customer code → print. No order tokens or payment flow.
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}

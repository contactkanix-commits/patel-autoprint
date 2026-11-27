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
  IconButton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Search as SearchIcon,
  Print as PrintIcon,
  Code as CodeIcon,
  People as PeopleIcon,
  Lock as LockIcon,
  ArrowBack as BackIcon,
  FileCopy as FileIcon,
  Description as DocIcon,
  Image as ImageIcon,
  PowerOff as PowerIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../api';

const isImageFile = (file) => {
  const t = (file.fileType || '').toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp'].includes(t);
};

export default function KiskoPage() {
  const [screen, setScreen] = useState('entry'); // 'entry' | 'order' | 'exit'
  const [code, setCode] = useState('');
  const [order, setOrder] = useState(null);
  const [exitPassword, setExitPassword] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [printers, setPrinters] = useState([]);
  const [bwPrinter, setBwPrinter] = useState('');
  const [colorPrinter, setColorPrinter] = useState('');

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

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!code || !/^\d{6}$/.test(code)) {
      toast.error('Please enter a valid 6-digit code');
      return;
    }
    setLookupLoading(true);
    try {
      const result = await api.get(`/admin/orders/kisko/lookup?token=${code}`);
      if (result.success) {
        setOrder(result.data.order);
        setScreen('order');
      }
    } catch (err) {
      toast.error(err.message || 'Order not found');
    } finally {
      setLookupLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!order) return;
    setPrintLoading(true);
    try {
      const result = await api.post(`/admin/orders/kisko/print/${order.id}`, {
        bwPrinterName: bwPrinter || undefined,
        colorPrinterName: colorPrinter || undefined,
      });
      if (result.success) {
        toast.success('Print job sent to printer');
        setScreen('entry');
        setCode('');
        setOrder(null);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to send print job');
    } finally {
      setPrintLoading(false);
    }
  };

  const handleExit = (e) => {
    e.preventDefault();
    if (!exitPassword) {
      toast.error('Please enter password to exit');
      return;
    }
    // Verify password via backend
    setPrintLoading(true);
    api.post('/api/admin/kisko/verify-exit', { password: exitPassword })
      .then(() => {
        toast.success('Exited kisko mode');
        window.location.href = '/admin/orders';
      })
      .catch((err) => {
        toast.error(err.message || 'Incorrect password');
      })
      .finally(() => {
        setPrintLoading(false);
      });
  };

  const isImageFile = (file) => {
    const t = (file.fileType || '').toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp'].includes(t);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 2000,
        bgcolor: 'background.default',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 2,
          bgcolor: 'primary.main',
          color: 'white',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CodeIcon sx={{ fontSize: 28 }} />
          <Typography variant="h6" fontWeight={700}>
            Kisko Mode
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption">
            Patel AutoPrint • Kiosk
          </Typography>
          <IconButton
            onClick={(e) => {
              if (screen === 'entry') {
                window.location.href = '/admin/orders';
              } else {
                setScreen('exit');
              }
            }}
            sx={{ color: 'white' }}
          >
            {screen === 'entry' ? <PowerIcon fontSize="small" /> : <LockIcon fontSize="small" />}
          </IconButton>
        </Box>
      </Box>

      {/* Main Content - Centered */}
      <Box
        sx={{
          flexGrow: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
        }}
      >
        {/* SCREEN 1: Enter Code */}
        {screen === 'entry' && (
          <Paper sx={{ p: 4, borderRadius: 3, maxWidth: 450, width: '100%', boxShadow: 10 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <PeopleIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
              <Typography variant="h5" fontWeight={700} color="text.primary">
                Enter Customer Code
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Enter the 6-digit code from the customer's order receipt
              </Typography>
            </Box>

            <form onSubmit={handleLookup} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                fullWidth
                size="large"
                label="6-Digit Code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                InputProps={{
                  startAdornment: <IconButton><CodeIcon fontSize="small" /></IconButton>,
                  maxLength: 6,
                  inputProps: { style: { textAlign: 'center', fontSize: 24, letterSpacing: '8px' } },
                }}
                helperText="6 digits only"
                required
                autoFocus
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                startIcon={<SearchIcon />}
                disabled={lookupLoading || !/^\d{6}$/.test(code)}
                sx={{
                  mt: 1,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  py: 1.5,
                  '&:disabled': { opacity: 0.5 },
                }}
              >
                {lookupLoading ? <CircularProgress size={20} /> : null}
                Lookup Order
              </Button>
            </form>
          </Paper>
        )}

        {/* SCREEN 2: Order Details + Print */}
        {screen === 'order' && order && (
          <Paper sx={{ p: 3, borderRadius: 3, maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: 10 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" fontWeight={700}>
                Order #{order.token}
              </Typography>
              <Chip
                label={order.status}
                color={order.status === 'PRINTING' ? 'primary' : order.status === 'COMPLETED' ? 'success' : 'default'}
                size="small"
              />
            </Box>

            <Box sx={{ mb: 3, color: 'text.secondary' }}>
              <Typography variant="caption" display="block">
                Customer: {order.customer?.name || 'Walk-in'}
              </Typography>
              <Typography variant="caption" display="block">
                Phone: {order.customer?.phone || '-'} &nbsp;|&nbsp;
                Payment: {order.paymentMethod || '-'} &nbsp;|&nbsp;
                Total: ₹{order.totalPrice?.toFixed(2)}
              </Typography>
            </Box>

            <Typography variant="subtitle2" fontWeight={600} color="text.secondary" sx={{ mb: 1 }}>
              Files to Print ({order.files?.length || 0})
            </Typography>
            <Box sx={{ mb: 3, border: 1, borderColor: 'divider', borderRadius: 1, p: 1, bgcolor: 'background.paper' }}>
              {order.files?.map((file, i) => (
                <Box key={file.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, borderBottom: '1px solid', borderColor: 'divider.light' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                    {isImageFile(file) ? <ImageIcon sx={{ fontSize: 20, color: 'primary.main' }} /> : <DocIcon sx={{ fontSize: 20, color: 'text.secondary' }} />}
                    <Typography variant="body2" sx={{ fontWeight: 500, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.originalName}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, minWidth: 200 }}>
                    <Chip label={file.fileType?.toUpperCase()} size="small" />
                    <Chip label={`${file.settings?.paperSize || 'A4'}`} size="small" color="default" />
                    <Chip label={`${file.settings?.orientation || 'auto'}`} size="small" color="default" />
                    <Chip label={`${file.settings?.colorMode || 'bw'}`} size="small" />
                    <Chip label={`${file.settings?.pagesPerSheet || 1}-up`} size="small" />
                    <Chip label={`${file.settings?.copies || 1}x`} size="small" />
                  </Box>
                </Box>
              ))}
              {!order.files || order.files.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', my: 1 }}>
                  No files in this order
                </Typography>
              )}
            </Box>

            <Divider sx={{ my: 3 }} />
            <Typography variant="subtitle2" fontWeight={600} color="text.secondary" sx={{ mb: 1 }}>
              Print Settings
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>B/W Printer</InputLabel>
                <Select
                  value={bwPrinter}
                  label="B/W Printer"
                  onChange={(e) => setBwPrinter(e.target.value)}
                >
                  <MenuItem value=""><em>Auto (any B/W printer)</em></MenuItem>
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
                  <MenuItem value=""><em>Auto (any Color printer)</em></MenuItem>
                  {printers.filter((p) => p.colorSupport).map((p) => (
                    <MenuItem key={p.id} value={p.name}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Button
              onClick={handlePrint}
              variant="contained"
              size="large"
              fullWidth
              startIcon={<PrintIcon />}
              disabled={printLoading}
              sx={{
                fontWeight: 700,
                textTransform: 'uppercase',
                py: 1.5,
                '&:disabled': { opacity: 0.5 },
              }}
            >
              {printLoading ? <CircularProgress size={20} /> : null}
              {printLoading ? 'Sending to Printer...' : 'SEND TO PRINT'}
            </Button>
          </Paper>
        )}

        {/* SCREEN 3: Exit Password */}
        {screen === 'exit' && (
          <Paper sx={{ p: 4, borderRadius: 3, maxWidth: 450, width: '100%', boxShadow: 10 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <LockIcon sx={{ fontSize: 48, color: 'error.main', mb: 2 }} />
              <Typography variant="h5" fontWeight={700} color="text.primary">
                Exit Kisko Mode
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Enter admin password to return to normal mode
              </Typography>
            </Box>

            <form onSubmit={handleExit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                fullWidth
                size="large"
                label="Admin Password"
                type="password"
                value={exitPassword}
                onChange={(e) => setExitPassword(e.target.value)}
                InputProps={{
                  startAdornment: <IconButton><LockIcon fontSize="small" /></IconButton>,
                }}
                required
                autoFocus
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                color="error"
                startIcon={<PowerIcon />}
                disabled={printLoading || !exitPassword}
                sx={{
                  mt: 1,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  py: 1.5,
                  '&:disabled': { opacity: 0.5 },
                }}
              >
                {printLoading ? <CircularProgress size={20} /> : null}
                Exit Kisko Mode
              </Button>
            </form>
          </Paper>
        )}
      </Box>

      {/* Footer */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
          py: 1,
          bgcolor: 'grey.100',
          color: 'text.secondary',
        }}
      >
        <Typography variant="caption">
          Patel AutoPrint Kisko Mode • Full-screen kiosk
        </Typography>
      </Box>
    </Box>
  );
}

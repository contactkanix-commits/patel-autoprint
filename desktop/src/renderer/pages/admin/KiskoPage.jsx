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
} from '@mui/material';
import {
  Search as SearchIcon,
  Print as PrintIcon,
  Code as CodeIcon,
  People as PeopleIcon,
  CloudUpload as CloudUploadIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  FileCopy as FileIcon,
  Description as DocIcon,
  Image as ImageIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../api';

const isImageFile = (file) => {
  const t = (file.fileType || '').toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp'].includes(t);
};

export default function KiskoPage() {
  const [token, setToken] = useState('');
  const [order, setOrder] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [printers, setPrinters] = useState([]);
  const [bwPrinter, setBwPrinter] = useState('');
  const [colorPrinter, setColorPrinter] = useState('');
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

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!token || !/^\d+$/.test(token)) {
      toast.error('Please enter a valid token number');
      return;
    }
    setLookupLoading(true);
    setSuccess(null);
    setOrder(null);
    try {
      const result = await api.get(`/admin/orders/kisko/lookup?token=${token}`);
      if (result.success) {
        setOrder(result.data.order);
      }
    } catch (err) {
      toast.error(err.message || 'Order not found');
      setOrder(null);
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
        setSuccess(result.data.order);
        toast.success('Print job sent to printer');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to send print job');
    } finally {
      setPrintLoading(false);
    }
  };

  const handleReset = () => {
    setOrder(null);
    setSuccess(null);
    setToken('');
  };

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', pt: 4 }}>
      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
          <CodeIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700}>
            Kisko Mode – Quick Token Print
          </Typography>
        </Box>

        {success && (
          <Alert severity="success" icon={<SuccessIcon />} sx={{ mb: 2 }}>
            <Typography fontWeight={600}>
              Print job sent successfully
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              Token: #{success.token} &nbsp;|&nbsp; Files: {success.files?.length || 0} &nbsp;|&nbsp; Status: {success.status}
            </Typography>
          </Alert>
        )}

        {/* Step 1: Lookup by token */}
        <form onSubmit={handleLookup} sx={{ display: 'flex', gap: 1, mb: 3 }}>
          <TextField
            fullWidth
            size="small"
            label="Customer Token Number"
            value={token}
            onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
            InputProps={{
              startAdornment: <IconButton><CodeIcon fontSize="small" /></IconButton>,
            }}
            placeholder="e.g. 1024"
            required
          />
          <Button
            type="submit"
            variant="contained"
            startIcon={<SearchIcon />}
            disabled={lookupLoading || !/^\d+$/.test(token)}
            sx={{ '&:disabled': { opacity: 0.5 } }}
          >
            {lookupLoading ? <CircularProgress size={20} /> : null}
            Lookup Order
          </Button>
        </form>

        {/* Step 2: Show order details */}
        {order && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" fontWeight={600}>
                Order #{order.token}
              </Typography>
              <Chip
                label={order.status}
                color={order.status === 'PRINTING' ? 'primary' : order.status === 'COMPLETED' ? 'success' : 'default'}
                size="small"
              />
            </Box>

            <Box sx={{ mb: 2, color: 'text.secondary' }}>
              <Typography variant="caption" display="block">
                Customer: {order.customer?.name || 'Walk-in'}
              </Typography>
              <Typography variant="caption" display="block">
                Phone: {order.customer?.phone || '-'} &nbsp;|&nbsp;
                Payment: {order.paymentMethod || '-'} &nbsp;|&nbsp;
                Total: ₹{order.totalPrice?.toFixed(2)}
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
                Files to Print ({order.files?.length || 0})
              </Typography>
              <Box sx={{ mt: 1, border: 1, borderColor: 'divider', borderRadius: 1, p: 1, bgcolor: 'background.paper' }}>
                {order.files?.map((file, i) => (
                  <Box key={file.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, borderBottom: '1px solid', borderColor: 'divider.light' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                      {isImageFile(file) ? <ImageIcon sx={{ fontSize: 20, color: 'primary.main' }} /> : <DocIcon sx={{ fontSize: 20, color: 'text.secondary' }} />}
                      <Typography variant="body2" sx={{ fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            </Box>

            {/* Step 3: Print settings and print button */}
            <Divider sx={{ my: 2 }} />
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
              startIcon={<PrintIcon />}
              disabled={printLoading}
              sx={{
                fontWeight: 700,
                textTransform: 'uppercase',
                '&:disabled': { opacity: 0.5 },
              }}
            >
              {printLoading ? <CircularProgress size={20} /> : null}
              {printLoading ? 'Sending to Printer...' : 'Send to Print Now'}
            </Button>
          </>
        )}

        {!order && !success && (
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Chip label="Kisko Mode" icon={<PeopleIcon fontSize="small" />} color="primary" size="small" />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              Enter the customer's token number from their order receipt to instantly send their files to print.
              Skips approval queue — prints immediately.
            </Typography>
          </Box>
        )}

        {(!order && !success) && (
          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
            <Button variant="outlined" onClick={handleReset} size="small">
              Clear
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

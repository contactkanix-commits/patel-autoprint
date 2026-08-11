import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Divider,
  CircularProgress,
  Alert,
  Avatar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Save as SaveIcon,
  Upload as UploadIcon,
  LocalMall,
  CreditCard,
  QrCode2,
  Payments,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../api';

const defaultPricing = {
  bwPerPage: 1,
  colorPerPage: 5,
  colorDuplexPerPage: 10,
};

const paymentMethodOptions = [
  { value: 'cash', label: 'Cash', icon: <LocalMall /> },
  { value: 'card', label: 'Card', icon: <CreditCard /> },
  { value: 'upi', label: 'UPI', icon: <QrCode2 /> },
  { value: 'online', label: 'Online', icon: <Payments /> },
];

export default function SettingsPage() {
  const [pricing, setPricing] = useState(defaultPricing);
  const [upiQrUrl, setUpiQrUrl] = useState('');
  const [defaultBwPrinter, setDefaultBwPrinter] = useState('');
  const [defaultColorPrinter, setDefaultColorPrinter] = useState('');
  const [acceptedMethods, setAcceptedMethods] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const qrInputRef = useRef(null);

  useEffect(() => {
    fetchSettings();
    fetchPrinters();
  }, []);

  const fetchSettings = async () => {
    try {
      const result = await api.get('/settings/pricing');
      if (result.success && result.data) {
        setPricing({ ...defaultPricing, ...result.data });
        setUpiQrUrl(result.data.upiQrUrl || '');
        setDefaultBwPrinter(result.data.defaultBwPrinter || '');
        setDefaultColorPrinter(result.data.defaultColorPrinter || '');
        setAcceptedMethods(result.data.acceptedPaymentMethods || ['cash', 'card', 'upi', 'online']);
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  };

  const fetchPrinters = async () => {
    try {
      const result = await api.get('/printers');
      if (result.success) {
        setPrinters(result.data?.printers || []);
      }
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings/pricing', { ...pricing, upiQrUrl, defaultBwPrinter, defaultColorPrinter });
      await api.put('/settings/payment-methods', { acceptedPaymentMethods: acceptedMethods });
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setPricing({ ...pricing, [key]: parseFloat(value) || 0 });
  };

  const handleQrUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingQr(true);
    try {
      const formData = new FormData();
      formData.append('qr', file);
      const result = await api.post('/settings/upi-qr', formData);
      if (result.success) {
        setUpiQrUrl(result.data.url);
        toast.success('QR code uploaded');
      }
    } catch {
      toast.error('Failed to upload QR');
    } finally {
      setUploadingQr(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Shop Settings</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure pricing, payment, and shop preferences
      </Typography>

      <Card sx={{ maxWidth: 600, mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Print Pricing (per sheet)</Typography>
          <Divider sx={{ mb: 2 }} />

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="B&W (₹ per sheet)"
                type="number"
                value={pricing.bwPerPage}
                onChange={(e) => handleChange('bwPerPage', e.target.value)}
                inputProps={{ min: 0, step: 0.5 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Color Single (₹ per sheet)"
                type="number"
                value={pricing.colorPerPage}
                onChange={(e) => handleChange('colorPerPage', e.target.value)}
                inputProps={{ min: 0, step: 0.5 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Color Duplex (₹ per sheet)"
                type="number"
                value={pricing.colorDuplexPerPage}
                onChange={(e) => handleChange('colorDuplexPerPage', e.target.value)}
                inputProps={{ min: 0, step: 0.5 }}
              />
            </Grid>
          </Grid>

          <Alert severity="info" sx={{ mt: 2 }}>
            <strong>B&W:</strong> ₹{pricing.bwPerPage}/sheet (any style) &bull;
            <strong> Color:</strong> ₹{pricing.colorPerPage}/sheet (single) &bull;
            <strong> ₹{pricing.colorDuplexPerPage}/sheet</strong> (duplex)
            <br />Price is per sheet, not per page (duplex = 2 pages per sheet)
          </Alert>

          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving}
            sx={{ mt: 3 }}
          >
            {saving ? 'Saving...' : 'Save Pricing'}
          </Button>
        </CardContent>
      </Card>

      <Card sx={{ maxWidth: 600, mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Default Printers</Typography>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select default printers. When approving orders from the queue, these will be pre-selected automatically.
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Default B/W Printer</InputLabel>
                <Select
                  value={defaultBwPrinter}
                  label="Default B/W Printer"
                  onChange={(e) => setDefaultBwPrinter(e.target.value)}
                >
                  <MenuItem value=""><em>None (auto-select)</em></MenuItem>
                  {printers.filter((p) => !p.colorSupport).map((p) => (
                    <MenuItem key={p.id} value={p.name}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Default Color Printer</InputLabel>
                <Select
                  value={defaultColorPrinter}
                  label="Default Color Printer"
                  onChange={(e) => setDefaultColorPrinter(e.target.value)}
                >
                  <MenuItem value=""><em>None (auto-select)</em></MenuItem>
                  {printers.filter((p) => p.colorSupport).map((p) => (
                    <MenuItem key={p.id} value={p.name}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ maxWidth: 600, mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Accepted Payment Methods</Typography>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose which payment options customers see in the portal. Tap a method to toggle it.
          </Typography>

          <Grid container spacing={1}>
            {paymentMethodOptions.map((opt) => {
              const selected = acceptedMethods.includes(opt.value);
              return (
                <Grid item xs={6} sm={3} key={opt.value}>
                  <Box
                    onClick={() => {
                      setAcceptedMethods((prev) =>
                        selected ? prev.filter((m) => m !== opt.value) : [...prev, opt.value]
                      );
                    }}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      cursor: 'pointer',
                      border: '1.5px solid',
                      borderColor: selected ? 'primary.main' : 'divider',
                      bgcolor: selected ? 'primary.main' : 'background.paper',
                      color: selected ? 'primary.contrastText' : 'text.primary',
                      textAlign: 'center',
                      transition: 'all 0.15s',
                      '&:hover': { borderColor: 'primary.main' },
                    }}
                  >
                    <Box sx={{ fontSize: 26, display: 'flex', justifyContent: 'center', color: selected ? 'inherit' : 'primary.main' }}>
                      {opt.icon}
                    </Box>
                    <Typography variant="body2" fontWeight={700} color="inherit" sx={{ mt: 0.5 }}>
                      {opt.label}
                    </Typography>
                  </Box>
                </Grid>
              );
            })}
          </Grid>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Leave all selected to accept every payment type.
          </Typography>
        </CardContent>
      </Card>

      <Card sx={{ maxWidth: 600 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>UPI QR Code (Online Payment)</Typography>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload your UPI QR code image. Customers will see this when they choose "UPI" payment.
          </Typography>

          {upiQrUrl && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <Avatar
                src={upiQrUrl}
                variant="rounded"
                sx={{ width: 200, height: 200 }}
              />
            </Box>
          )}

          <input
            ref={qrInputRef}
            type="file"
            hidden
            accept="image/*"
            onChange={handleQrUpload}
          />
          <Button
            variant="outlined"
            startIcon={uploadingQr ? <CircularProgress size={20} /> : <UploadIcon />}
            onClick={() => qrInputRef.current?.click()}
            disabled={uploadingQr}
          >
            {upiQrUrl ? 'Change QR Code' : 'Upload QR Code'}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

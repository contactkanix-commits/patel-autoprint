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
} from '@mui/material';
import { Save as SaveIcon, Upload as UploadIcon } from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../services/api';

const defaultPricing = {
  bwPerPage: 1,
  colorPerPage: 5,
  colorDuplexPerPage: 10,
};

export default function SettingsPage() {
  const [pricing, setPricing] = useState(defaultPricing);
  const [upiQrUrl, setUpiQrUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const qrInputRef = useRef(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const result = await api.get('/settings/pricing');
      if (result.success && result.data) {
        setPricing({ ...defaultPricing, ...result.data });
        setUpiQrUrl(result.data.upiQrUrl || '');
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings/pricing', { ...pricing, upiQrUrl });
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

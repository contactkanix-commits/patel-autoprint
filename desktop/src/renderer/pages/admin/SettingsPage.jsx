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
  Radio,
  RadioGroup,
  FormControlLabel,
  InputAdornment,
  IconButton,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Save as SaveIcon,
  Upload as UploadIcon,
  LocalMall,
  CreditCard,
  QrCode2,
  Payments,
  Print as PrintIcon,
  Settings as SettingsIcon,
  Visibility,
  VisibilityOff,
  Wifi,
  WifiOff,
  CheckCircle,
  Error,
  Refresh,
  SystemUpdate,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../api';
const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

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
  const [printMode, setPrintMode] = useState('admin_approval');
  const [autoPrintPrinterId, setAutoPrintPrinterId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  
  // Payment Gateway state
  const [gateways, setGateways] = useState({});
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [gatewaySaving, setGatewaySaving] = useState(false);
  const [testMode, setTestMode] = useState('test');

  // App Update state
  const [updateState, setUpdateState] = useState({ checking: false, available: false, version: null, downloaded: false, error: null });

  const checkForUpdates = async () => {
    setUpdateState(s => ({ ...s, checking: true, error: null }));
    try {
      const result = await window.patelApp.updates.check();
      setUpdateState(s => ({ ...s, checking: false, available: result.available, version: result.version, downloaded: result.downloaded }));
      if (result.available) {
        toast.success(`Update available: v${result.version}. Downloading...`);
      } else if (result.downloaded) {
        toast.success('Update downloaded. Restart to apply.');
      } else {
        toast.success('You are on the latest version.');
      }
    } catch (err) {
      setUpdateState(s => ({ ...s, checking: false, error: err.message }));
      toast.error(`Update check failed: ${err.message}`);
    }
  };

  const installUpdate = async () => {
    try {
      await window.patelApp.updates.install();
    } catch (err) {
      toast.error(`Install failed: ${err.message}`);
    }
  };
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [razorpayKeySecret, setRazorpayKeySecret] = useState('');
  const [razorpayWebhookSecret, setRazorpayWebhookSecret] = useState('');
  const [showKeySecret, setShowKeySecret] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [testingGateway, setTestingGateway] = useState(false);
  const qrInputRef = useRef(null);

  useEffect(() => {
    fetchSettings();
    fetchPrinters();
    fetchGateways();
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
        setPrintMode(result.data.printMode || 'admin_approval');
        setAutoPrintPrinterId(result.data.autoPrintPrinterId || '');
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

  const fetchGateways = async () => {
    setGatewayLoading(true);
    try {
      const result = await api.get('/settings/payment-gateways');
      if (result.success && result.data) {
        setGateways(result.data);
        if (result.data.razorpay) {
          setRazorpayKeyId(result.data.razorpay.keyId || '');
          // Don't populate secrets for security - but track if they exist
        }
      }
    } catch {
      // ignore
    } finally {
      setGatewayLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings/pricing', { 
        ...pricing, 
        upiQrUrl, 
        defaultBwPrinter, 
        defaultColorPrinter,
        printMode,
        autoPrintPrinterId,
      });
      await api.put('/settings/payment-methods', { acceptedPaymentMethods: acceptedMethods });
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleGatewaySave = async () => {
    setGatewaySaving(true);
    try {
      await api.put('/settings/payment-gateways/razorpay', {
        enabled: true,
        mode: testMode,
        keyId: razorpayKeyId,
        keySecret: razorpayKeySecret,
        webhookSecret: razorpayWebhookSecret,
      });
      await fetchGateways();
      toast.success('Razorpay configuration saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save gateway config');
    } finally {
      setGatewaySaving(false);
    }
  };

  const handleGatewayTest = async () => {
    if (!razorpayKeyId || !razorpayKeySecret) {
      toast.error('Please enter Key ID and Key Secret');
      return;
    }
    setTestingGateway(true);
    try {
      await api.post('/settings/payment-gateways/razorpay/test', {
        keyId: razorpayKeyId,
        keySecret: razorpayKeySecret,
      });
      toast.success('Connection successful! Razorpay credentials are valid.');
    } catch (err) {
      toast.error(err.message || 'Invalid credentials');
    } finally {
      setTestingGateway(false);
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <PrintIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6" gutterBottom>Print Mode</Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Choose how WhatsApp orders are processed. Admin approval requires manual confirmation; Auto-print sends orders directly to a printer.
          </Typography>

          <RadioGroup value={printMode} onChange={(e) => setPrintMode(e.target.value)} row>
            <FormControlLabel
              value="admin_approval"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={600}>Admin Approval (Recommended)</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Orders from WhatsApp wait for admin to review and approve before printing.
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="auto_print"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={600}>Auto Print</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Orders from WhatsApp are automatically approved and sent to the selected printer.
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>

          {printMode === 'auto_print' && (
            <Box sx={{ mt: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.neutral' }}>
              <FormControl fullWidth size="small">
                <InputLabel>Auto-Print Printer</InputLabel>
                <Select
                  value={autoPrintPrinterId}
                  label="Auto-Print Printer"
                  onChange={(e) => setAutoPrintPrinterId(e.target.value)}
                >
                  <MenuItem value=""><em>None (auto-select first online)</em></MenuItem>
                  {printers.filter((p) => p.status === 'ONLINE').map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name} {p.colorSupport ? '(Color)' : '(B/W)'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Select the printer that will automatically process WhatsApp orders. If not selected, the first online printer will be used.
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      <Card sx={{ maxWidth: 600, mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <SystemUpdate sx={{ color: 'primary.main' }} />
            <Typography variant="h6" gutterBottom>App Updates</Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Check for and install application updates. The app also checks automatically every 4 hours.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              variant="contained"
              startIcon={updateState.checking ? <CircularProgress size={20} /> : <Refresh />}
              onClick={checkForUpdates}
              disabled={updateState.checking}
            >
              {updateState.checking ? 'Checking...' : 'Check for Updates'}
            </Button>

            {updateState.downloaded && (
              <Button
                variant="contained"
                color="secondary"
                startIcon={<SystemUpdate />}
                onClick={installUpdate}
              >
                Restart & Install Update
              </Button>
            )}

            {updateState.available && !updateState.downloaded && (
              <Chip label={`v${updateState.version} available`} color="success" size="small" icon={<SystemUpdate />} />
            )}

            {updateState.error && (
              <Alert severity="error" sx={{ mt: 2, maxWidth: 400 }}>
                {updateState.error}
              </Alert>
            )}

            {!updateState.checking && !updateState.available && !updateState.downloaded && !updateState.error && (
              <Typography variant="body2" color="text.secondary">
                Last checked: just now — you&apos;re up to date
              </Typography>
            )}
          </Box>
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

      <Card sx={{ maxWidth: 600, mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <SettingsIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6" gutterBottom>Payment Gateways</Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Configure Razorpay for online payments (UPI Intent - GPay, PhonePe, PayTM). 
            Each shop has its own gateway credentials. Test mode uses Razorpay sandbox.
          </Typography>

          {gateways.razorpay ? (
            <Box sx={{ mb: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                Razorpay {gateways.razorpay.enabled ? <Chip label={gateways.razorpay.mode === 'live' ? 'Live' : 'Test'} size="small" color={gateways.razorpay.mode === 'live' ? 'success' : 'warning'} sx={{ ml: 1 }} /> : <Chip label="Disabled" size="small" color="default" sx={{ ml: 1 }} />}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Key ID: {gateways.razorpay.keyId} &bull; Webhook: {gateways.razorpay.hasWebhookSecret ? 'Configured' : 'Not set'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Webhook URL: <code>{gateways.razorpay.webhookUrl}</code>
              </Typography>
            </Box>
          ) : (
            <Alert severity="info" sx={{ mb: 3 }}>
              Razorpay not configured. Add your credentials below to enable online payments.
            </Alert>
          )}

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>Mode</Typography>
            <RadioGroup value={testMode} onChange={(e) => setTestMode(e.target.value)} row>
              <FormControlLabel value="test" control={<Radio />} label="Test Mode (Sandbox)" />
              <FormControlLabel value="live" control={<Radio />} label="Live Mode" />
            </RadioGroup>
            <Typography variant="caption" color="text.secondary">
              Use Test Mode for development. Switch to Live when ready to accept real payments.
            </Typography>
          </Box>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Key ID"
                type="text"
                value={razorpayKeyId}
                onChange={(e) => setRazorpayKeyId(e.target.value)}
                placeholder="rzp_test_xxxxxxxxxxxx"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title="From Razorpay Dashboard → Settings → API Keys">
                        <IconButton onClick={() => {}}>i</IconButton>
                      </Tooltip>
                    </InputAdornment>
                  )
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Key Secret"
                type={showKeySecret ? 'text' : 'password'}
                value={razorpayKeySecret}
                onChange={(e) => setRazorpayKeySecret(e.target.value)}
                placeholder={gateways.razorpay?.hasSecret ? '•••••••• (saved)' : 'Enter key secret'}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowKeySecret(!showKeySecret)}
                        edge="end"
                      >
                        {showKeySecret ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Webhook Secret"
                type={showWebhookSecret ? 'text' : 'password'}
                value={razorpayWebhookSecret}
                onChange={(e) => setRazorpayWebhookSecret(e.target.value)}
                placeholder={gateways.razorpay?.hasWebhookSecret ? '•••••••• (saved)' : 'Enter webhook secret (from Razorpay Dashboard → Webhooks)'}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                        edge="end"
                      >
                        {showWebhookSecret ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            </Grid>
          </Grid>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Get credentials from <a href="https://dashboard.razorpay.com" target="_blank" rel="noopener">Razorpay Dashboard</a> → Settings → API Keys.
            Webhook URL to configure in Razorpay: <code>{gateways.razorpay?.webhookUrl || 'https://patel-autoprint.onrender.com/api/webhooks/razorpay/SHOP_ID'}</code>
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={gatewaySaving ? <CircularProgress size={20} /> : <SaveIcon />}
              onClick={handleGatewaySave}
              disabled={gatewaySaving || !razorpayKeyId || !razorpayKeySecret}
            >
              {gatewaySaving ? 'Saving...' : 'Save Razorpay Config'}
            </Button>
            <Button
              variant="outlined"
              startIcon={testingGateway ? <CircularProgress size={20} /> : <Refresh />}
              onClick={handleGatewayTest}
              disabled={testingGateway || !razorpayKeyId || !razorpayKeySecret}
            >
              {testingGateway ? 'Testing...' : 'Test Connection'}
            </Button>
          </Box>
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

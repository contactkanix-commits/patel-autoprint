import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Grid, Card, CardContent, Button, TextField,
  FormControl, InputLabel, Select, MenuItem, Divider, Alert,
  CircularProgress, Tabs, Tab, FormControlLabel, Switch, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, CardHeader, CardActions,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Slider,
  FormHelperText, Avatar, Badge, Chip, Tooltip
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Save as SaveIcon,
  Person, Business, Print as PrintIcon, AttachMoney, Settings as SettingsIcon,
  Key as KeyIcon, QrCode, CloudUpload, CloudDownload, Palette,
  Language, Brightness4, Brightness7, Info, Warning as WarningIcon,
  Verified as VerifiedIcon, Block as BlockIcon, ContentCopy,
  Description as DescriptionIcon, Image as ImageIcon,
  CheckCircle, Refresh as RefreshIcon
} from '@mui/icons-material';
import { useAppStore } from '../store/useAppStore';
import { settingsApi, printerApi, shopApi, planApi, subscriptionApi } from '../api';
import toast from 'react-hot-toast';

const Settings: React.FC = () => {
  const { settings, setSettings, saveSettings, loadSettings } = useAppStore();
  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [printers, setPrinters] = useState<any[]>([]);
  const [editingPrinter, setEditingPrinter] = useState<any>(null);
  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);
  const [printerForm, setPrinterForm] = useState({
    name: '', ip: '', colorSupport: false, duplexSupport: false, paperSizes: ['A4'],
    isDefault: false, priority: 0
  });
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [uploadingQr, setUploadingQr] = useState(false);
  const [qrInputRef, setQrInputRef] = useState<HTMLInputElement | null>(null);
  const [pricing, setPricing] = useState({ bwPerPage: 2, colorPerPage: 10, colorDuplexPerPage: 20, taxRate: 18 });
  const [autoPrintRules, setAutoPrintRules] = useState({
    autoApprove: false,
    printAfterPayment: true,
    allowUnpaid: false,
    maxCopies: 10,
    maxPages: 500,
    defaultOrientation: 'auto',
    defaultDuplex: false,
  });
  const [fileSupport, setFileSupport] = useState({
    pdf: true, doc: true, docx: true, ppt: true, pptx: true, jpg: true, png: true, webp: true, zip: false,
  });
  const [qrFile, setQrFile] = useState<File | null>(null);

  const tabs = [
    { id: 'general', label: 'General', icon: <SettingsIcon /> },
    { id: 'printers', label: 'Printers', icon: <PrintIcon /> },
    { id: 'pricing', label: 'Pricing', icon: <AttachMoney /> },
    { id: 'auto-rules', label: 'Auto-Print Rules', icon: <SettingsIcon /> },
    { id: 'files', label: 'File Support', icon: <Info /> },
    { id: 'payment', label: 'Payment', icon: <AttachMoney /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette /> },
    { id: 'subscription', label: 'Subscription', icon: <VerifiedIcon /> },
    { id: 'qr-code', label: 'QR Code', icon: <QrCode /> },
    { id: 'activation', label: 'Agent Setup', icon: <KeyIcon /> },
  ];

  useEffect(() => {
    loadSettings();
    fetchPrinters();
    fetchPricing();
    fetchQR();
  }, [loadSettings]);

  const fetchPrinters = async () => {
    try {
      const res = await printerApi.list();
      if (res.data.success) setPrinters(res.data.data?.printers || []);
    } catch (e) { console.error(e); }
  };

  const fetchPricing = async () => {
    try {
      const res = await settingsApi.get();
      if (res.data.success && res.data.data) {
        setPricing({ ...pricing, ...res.data.data });
      }
    } catch (e) { console.error(e); }
  };

  const fetchQR = async () => {
    try {
      const res = await settingsApi.uploadQR(new File([], 'dummy')); // Just to trigger the endpoint
      // Actually need a GET endpoint for QR
    } catch (e) { console.error(e); }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await settingsApi.update({ ...pricing, upiQrUrl: qrCodeUrl });
      saveSettings();
      toast.success('Settings saved!');
    } catch (e) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handlePrinterDialog = (printer: any | null) => {
    if (printer) {
      setEditingPrinter(printer);
      setPrinterForm({
        name: printer.name,
        ip: printer.ip || '',
        colorSupport: printer.colorSupport,
        duplexSupport: printer.duplexSupport,
        paperSizes: printer.paperSizes || ['A4'],
        isDefault: printer.isDefault,
        priority: printer.priority || 0,
      });
    } else {
      setEditingPrinter(null);
      setPrinterForm({ name: '', ip: '', colorSupport: false, duplexSupport: false, paperSizes: ['A4'], isDefault: false, priority: 0 });
    }
    setPrinterDialogOpen(true);
  };

  const handleSavePrinter = async () => {
    setSaving(true);
    try {
      if (editingPrinter) {
        await printerApi.update(editingPrinter.id, printerForm);
        toast.success('Printer updated');
      } else {
        await printerApi.create(printerForm);
        toast.success('Printer added');
      }
      setPrinterDialogOpen(false);
      setEditingPrinter(null);
      fetchPrinters();
    } catch (e) {
      toast.error('Failed to save printer');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePrinter = async (id: string) => {
    if (!window.confirm('Delete this printer?')) return;
    try {
      await printerApi.delete(id);
      toast.success('Printer deleted');
      fetchPrinters();
    } catch (e) {
      toast.error('Failed to delete printer');
    }
  };

  const testPrinter = async (id: string, name: string) => {
    setTesting(id);
    try {
      await printerApi.test(id);
      toast.success(`Test page sent to ${name}`);
    } catch (e) {
      toast.error('Test print failed');
    } finally {
      setTesting(null);
    }
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingQr(true);
    try {
      const formData = new FormData();
      formData.append('qr', file);
      const res = await settingsApi.uploadQR(file);
      if (res.data.success) {
        setQrCodeUrl(res.data.url);
        toast.success('QR code uploaded');
      }
    } catch (e) {
      toast.error('Failed to upload QR');
    } finally {
      setUploadingQr(false);
    }
  };

  const copyActivationKey = async (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('Activation key copied!');
  };

  return (
    <Box sx={{ height: 'calc(100vh - 280px)', overflow: 'auto' }}>
      <Typography variant="h5" gutterBottom>Settings</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure your shop, printers, pricing & agent
      </Typography>

      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="scrollable" sx={{ mb: 3 }}>
        {tabs.map(tab => (
          <Tab key={tab.id} label={tab.label} icon={tab.icon} />
        ))}
      </Tabs>

      <Paper elevation={2} sx={{ p: 3, borderRadius: 2, minHeight: 500 }}>
        {/* GENERAL */}
        {activeTab === 'general' && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Shop Name" value={settings.apiUrl || ''} onChange={(e) => setSettings({ ...settings, apiUrl: e.target.value })} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Owner Name" onChange={(e) => setSettings({ ...settings, ownerName: e.target.value })} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Mobile" onChange={(e) => setSettings({ ...settings, mobile: e.target.value })} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Email" onChange={(e) => setSettings({ ...settings, email: e.target.value })} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Address" multiline rows={2} onChange={(e) => setSettings({ ...settings, address: e.target.value })} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="City" onChange={(e) => setSettings({ ...settings, city: e.target.value })} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="State" onChange={(e) => setSettings({ ...settings, state: e.target.value })} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="GST Number" onChange={(e) => setSettings({ ...settings, gstNumber: e.target.value })} />
            </Grid>
          </Grid>
        )}

        {/* PRINTERS */}
        {activeTab === 'printers' && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6">Printer Profiles</Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => handlePrinterDialog(null)}>
                Add Printer
              </Button>
            </Box>
            {printers.length === 0 ? (
              <Alert severity="info">No printers configured. Add a printer to get started.</Alert>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>IP Address</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="center">Color</TableCell>
                      <TableCell align="center">Duplex</TableCell>
                      <TableCell align="center">Default</TableCell>
                      <TableCell align="center">Priority</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {printers.map((printer: any) => (
                      <TableRow key={printer.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PrintIcon color="primary" />
                            <Typography variant="body1" fontWeight={500}>{printer.name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{printer.ip || '-'}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={printer.status}
                            color={({ ONLINE: 'success', OFFLINE: 'error', PRINTING: 'primary', ERROR: 'error', PAUSED: 'warning', LOW_TONER: 'warning' } as any)[printer.status] || 'default'}
                            variant="filled"
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Chip size="small" icon={printer.colorSupport ? <CheckCircle fontSize="small" /> : <DeleteIcon fontSize="small" />} label={printer.colorSupport ? 'Enabled' : 'Disabled'} color={printer.colorSupport ? 'success' : 'default'} variant={printer.colorSupport ? 'filled' : 'outlined'} />
                        </TableCell>
                        <TableCell align="center">
                          <Chip size="small" icon={printer.duplexSupport ? <CheckCircle fontSize="small" /> : <DeleteIcon fontSize="small" />} label={printer.duplexSupport ? 'Enabled' : 'Disabled'} color={printer.duplexSupport ? 'success' : 'default'} variant={printer.duplexSupport ? 'filled' : 'outlined'} />
                        </TableCell>
                        <TableCell align="center">
                          <Chip size="small" icon={printer.isDefault ? <CheckCircle fontSize="small" /> : <DeleteIcon fontSize="small" />} label={printer.isDefault ? 'Yes' : 'No'} color={printer.isDefault ? 'success' : 'default'} variant={printer.isDefault ? 'filled' : 'outlined'} />
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" fontWeight={printer.priority > 0 ? 600 : 400}>{printer.priority}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => testPrinter(printer.id, printer.name)} disabled={testing === printer.id}>
                            <Tooltip title={testing === printer.id ? 'Testing...' : 'Test Print'}><RefreshIcon fontSize="small" /></Tooltip>
                          </IconButton>
                          <IconButton size="small" onClick={() => handlePrinterDialog(printer)}><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" color="error" onClick={() => handleDeletePrinter(printer.id)}><DeleteIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* PRICING */}
        {activeTab === 'pricing' && (
          <Grid container spacing={3} sx={{ maxWidth: 800 }}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>Print Pricing (per sheet)</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Configure per-sheet pricing for different paper sizes and print modes
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="B&W A4 (₹/sheet)" type="number" value={pricing.bwPerPage} onChange={(e) => setPricing({ ...pricing, bwPerPage: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Color A4 Single (₹/sheet)" type="number" value={pricing.colorPerPage} onChange={(e) => setPricing({ ...pricing, colorPerPage: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Color A4 Duplex (₹/sheet)" type="number" value={pricing.colorDuplexPerPage} onChange={(e) => setPricing({ ...pricing, colorDuplexPerPage: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Tax Rate (%)" type="number" value={pricing.taxRate} onChange={(e) => setPricing({ ...pricing, taxRate: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, max: 100, step: 0.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="B&W A3 (₹/sheet)" type="number" value={pricing.a3BwRate || 5} onChange={(e) => setPricing({ ...pricing, a3BwRate: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Color A3 (₹/sheet)" type="number" value={pricing.a3ColorRate || 10} onChange={(e) => setPricing({ ...pricing, a3ColorRate: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Legal B&W (₹/sheet)" type="number" value={pricing.legalBwRate || 2} onChange={(e) => setPricing({ ...pricing, legalBwRate: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Legal Color (₹/sheet)" type="number" value={pricing.legalColorRate || 7} onChange={(e) => setPricing({ ...pricing, legalColorRate: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Photo Print (₹/sheet)" type="number" value={pricing.photoRate || 20} onChange={(e) => setPricing({ ...pricing, photoRate: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="ID Card (₹/sheet)" type="number" value={pricing.idCardRate || 25} onChange={(e) => setPricing({ ...pricing, idCardRate: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Lamination (₹/sheet)" type="number" value={pricing.laminationRate || 10} onChange={(e) => setPricing({ ...pricing, laminationRate: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Binding (₹/sheet)" type="number" value={pricing.bindingRate || 20} onChange={(e) => setPricing({ ...pricing, bindingRate: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Scanning (₹/sheet)" type="number" value={pricing.scanningRate || 2} onChange={(e) => setPricing({ ...pricing, scanningRate: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Photocopy (₹/sheet)" type="number" value={pricing.photocopyRate || 1} onChange={(e) => setPricing({ ...pricing, photocopyRate: parseFloat(e.target.value) || 0 })} inputProps={{ min: 0, step: 0.5 }} />
            </Grid>
          </Grid>
        )}

        {/* AUTO-PRINT RULES */}
        {activeTab === 'auto-rules' && (
          <Grid container spacing={3} sx={{ maxWidth: 800 }}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>Auto-Print Rules</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Configure automatic printing behavior for efficiency
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={<Switch checked={autoPrintRules.autoApprove} onChange={(e) => setAutoPrintRules({ ...autoPrintRules, autoApprove: e.target.checked })} />}
                label="Auto-approve orders (skip manual approval)"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={<Switch checked={autoPrintRules.printAfterPayment} onChange={(e) => setAutoPrintRules({ ...autoPrintRules, printAfterPayment: e.target.checked })} />}
                label="Auto-print after payment confirmed"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={<Switch checked={autoPrintRules.allowUnpaid} onChange={(e) => setAutoPrintRules({ ...autoPrintRules, allowUnpaid: e.target.checked })} />}
                label="Allow printing unpaid orders (mark as COD)"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField type="number" fullWidth label="Max Copies per Order" value={autoPrintRules.maxCopies} onChange={(e) => setAutoPrintRules({ ...autoPrintRules, maxCopies: parseInt(e.target.value) || 10 })} inputProps={{ min: 1, max: 100 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField type="number" fullWidth label="Max Pages per Order" value={autoPrintRules.maxPages} onChange={(e) => setAutoPrintRules({ ...autoPrintRules, maxPages: parseInt(e.target.value) || 500 })} inputProps={{ min: 1, max: 10000 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Default Orientation</InputLabel>
                <Select value={autoPrintRules.defaultOrientation} label="Default Orientation" onChange={(e) => setAutoPrintRules({ ...autoPrintRules, defaultOrientation: e.target.value })}>
                  <MenuItem value="auto">Auto</MenuItem>
                  <MenuItem value="portrait">Portrait</MenuItem>
                  <MenuItem value="landscape">Landscape</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={<Switch checked={autoPrintRules.defaultDuplex} onChange={(e) => setAutoPrintRules({ ...autoPrintRules, defaultDuplex: e.target.checked })} />}
                label="Default Duplex (Double-sided)"
              />
            </Grid>
          </Grid>
        )}

        {/* FILE SUPPORT */}
        {activeTab === 'files' && (
          <Grid container spacing={2} sx={{ maxWidth: 600 }}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>Supported File Types</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Enable/disable file types customers can upload
              </Typography>
            </Grid>
            {[
              { key: 'pdf', label: 'PDF', icon: <DescriptionIcon /> },
              { key: 'doc', label: 'DOC', icon: <DescriptionIcon /> },
              { key: 'docx', label: 'DOCX', icon: <DescriptionIcon /> },
              { key: 'ppt', label: 'PPT', icon: <DescriptionIcon /> },
              { key: 'pptx', label: 'PPTX', icon: <DescriptionIcon /> },
              { key: 'jpg', label: 'JPG', icon: <ImageIcon /> },
              { key: 'png', label: 'PNG', icon: <ImageIcon /> },
              { key: 'webp', label: 'WebP', icon: <ImageIcon /> },
              { key: 'zip', label: 'ZIP', icon: <WarningIcon /> },
            ].map((f, i) => (
              <Grid item xs={12} sm={4} key={i}>
                <FormControlLabel
                  control={<Switch checked={fileSupport[f.key as keyof typeof fileSupport]} onChange={(e) => setFileSupport({ ...fileSupport, [f.key]: e.target.checked })} />}
                  label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{f.icon} {f.label}</Box>}
                />
              </Grid>
            ))}
            <Alert severity="info" sx={{ mt: 3 }}>
              ZIP files contain multiple files - enable only if you can process archives
            </Alert>
          </Grid>
        )}

        {/* PAYMENT */}
        {activeTab === 'payment' && (
          <Grid container spacing={3} sx={{ maxWidth: 800 }}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>Payment Methods</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Enable payment options for customers
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel control={<Switch checked={true} onChange={() => {}} />} label="Cash" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel control={<Switch checked={true} onChange={() => {}} />} label="UPI" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel control={<Switch checked={false} onChange={() => {}} />} label="Card (Online Gateway)" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel control={<Switch checked={false} onChange={() => {}} />} label="PhonePe" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel control={<Switch checked={false} onChange={() => {}} />} label="Google Pay" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel control={<Switch checked={false} onChange={() => {}} />} label="Paytm" />
            </Grid>
          </Grid>
        )}

        {/* APPEARANCE */}
        {activeTab === 'appearance' && (
          <Grid container spacing={3} sx={{ maxWidth: 800 }}>
            <Grid item xs={12} sm={6}>
              <Typography variant="h6" gutterBottom>Theme</Typography>
              <FormControlLabel
                control={<Switch checked={settings.theme === 'dark'} onChange={(e) => setSettings({ ...settings, theme: e.target.checked ? 'dark' : 'light' })} />}
                label="Dark Mode"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Language</InputLabel>
                <Select value={settings.language} label="Language" onChange={(e) => setSettings({ ...settings, language: e.target.value })}>
                  <MenuItem value="en">English</MenuItem>
                  <MenuItem value="gu">Gujarati</MenuItem>
                  <MenuItem value="hi">Hindi</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Primary Color" type="color" value={settings.primaryColor || '#1976d2'} onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })} />
            </Grid>
          </Grid>
        )}

        {/* SUBSCRIPTION */}
        {activeTab === 'subscription' && (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>Subscription Plan</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Manage your shop's subscription
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper elevation={2} sx={{ p: 3, borderRadius: 2, textAlign: 'center', border: '2px solid', borderColor: 'primary.main' }}>
                <Typography variant="h6" gutterBottom>Current Plan</Typography>
                <Typography variant="h4" color="primary.main" sx={{ fontWeight: 700 }}>PRO</Typography>
                <Typography variant="body2" color="text.secondary">₹2,499 / month</Typography>
                <Divider sx={{ my: 2 }} />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>2,000 orders/month</Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>5 printers</Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>10 staff accounts</Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>WhatsApp Bot ✓</Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>Advanced Analytics ✓</Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>API Access ✓</Typography>
                <Button variant="contained" fullWidth sx={{ mt: 2 }}>Manage Subscription</Button>
              </Paper>
            </Grid>
          </Grid>
        )}

        {/* QR CODE */}
        {activeTab === 'qr-code' && (
          <Grid container spacing={3} justifyContent="center" sx={{ maxWidth: 800 }}>
            <Grid item xs={12} md={6}>
              <Paper elevation={3} sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom>UPI QR Code</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Upload your UPI QR code for customer payments
                </Typography>
                {qrCodeUrl && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                    <img src={qrCodeUrl} alt="UPI QR" style={{ width: 200, height: 200, borderRadius: 8 }} />
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
                  startIcon={uploadingQr ? <CircularProgress size={20} /> : <CloudUpload />}
                  onClick={() => qrInputRef.current?.click()}
                  disabled={uploadingQr}
                >
                  {qrCodeUrl ? 'Change QR Code' : 'Upload QR Code'}
                </Button>
              </Paper>
            </Grid>
          </Grid>
        )}

        {/* AGENT SETUP / ACTIVATION */}
        {activeTab === 'activation' && (
          <Grid container spacing={3} justifyContent="center" sx={{ maxWidth: 800 }}>
            <Grid item xs={12} md={6}>
              <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
                <Typography variant="h5" gutterBottom><KeyIcon /> Agent Setup</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Install the desktop agent on your shop PC
                </Typography>
                
                <Typography variant="subtitle2" gutterBottom>Your Activation Key</Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 3, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                  <Typography variant="h6" fontFamily="monospace" fontWeight={700} sx={{ letterSpacing: 1, flex: 1 }}>
                    {settings.apiKey || 'Not configured'}
                  </Typography>
                  <IconButton onClick={() => copyActivationKey(settings.apiKey)}><ContentCopy fontSize="small" /></IconButton>
                </Box>

                <Typography variant="subtitle2" gutterBottom>Setup Instructions</Typography>
                <Alert severity="info">
                  <ol style={{ paddingLeft: 20, margin: 0 }}>
                    <li>Download the Patel AutoPrint installer (.exe)</li>
                    <li>Run the installer on your shop PC</li>
                    <li>Enter the activation key above when prompted</li>
                    <li>The agent will connect automatically</li>
                  </ol>
                </Alert>

                <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
                  <Button variant="contained" size="large" startIcon={<CloudDownload />} href="#" download>
                    Download Installer (.exe)
                  </Button>
                  <Button variant="outlined" size="large" onClick={() => window.open('https://github.com/contactkanix-commits/patel-autoprint/releases')}>
                    View Releases
                  </Button>
                </Box>

                <Divider sx={{ my: 3 }} />

                <Typography variant="subtitle2" gutterBottom>Connected Agents</Typography>
                <Paper elevation={1} sx={{ p: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    No agents connected yet. Install the agent to see it here.
                  </Typography>
                </Paper>
              </Paper>
            </Grid>
          </Grid>
        )}

        {/* SAVE BUTTON */}
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="contained" size="large" onClick={handleSaveSettings} disabled={saving} startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}>
            {saving ? 'Saving...' : 'Save All Settings'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default Settings;
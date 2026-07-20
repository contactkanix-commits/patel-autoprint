import { useState, useCallback, useEffect } from 'react';
import {
  Container,
  Box,
  Stepper,
  Step,
  StepLabel,
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
  RadioGroup,
  FormControlLabel,
  Radio,
  Divider,
  Alert,
  CircularProgress,
  IconButton,
  Chip,
  useMediaQuery,
  useTheme,
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
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../services/api';

const steps = ['Upload', 'Configure', 'Review & Pay', 'Done'];

const paperSizes = ['A4', 'A3', 'Letter', 'Legal'];
const orientations = ['auto', 'portrait', 'landscape'];
const colorModes = ['bw', 'color'];
const pagesPerSheetOptions = [1, 2, 4, 6, 9, 16];

function isImageFile(file) {
  const name = (file?.originalName || file?.name || '').toLowerCase();
  return /\.(jpg|jpeg|png|webp)$/.test(name);
}

function Step1Upload({ files, setFiles, customerInfo, setCustomerInfo }) {
  const handleDrop = useCallback((e) => {
    e.preventDefault();
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
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>Upload Your Files</Typography>
      <Paper
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        sx={{
          p: { xs: 2, sm: 4 },
          textAlign: 'center',
          border: '2px dashed #bdbdbd',
          cursor: 'pointer',
          mb: 2,
          '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
        }}
        onClick={() => document.getElementById('file-input').click()}
      >
        <input
          id="file-input"
          type="file"
          multiple
          hidden
          onChange={handleFileInput}
          accept=".pdf,.docx,.pptx,.xlsx,.jpg,.jpeg,.png"
        />
        <CloudUpload sx={{ fontSize: { xs: 36, sm: 48 }, color: 'text.secondary', mb: 1 }} />
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: '0.9rem', sm: '1rem' } }}>
          Drag & drop files here or click to browse
        </Typography>
        <Typography variant="caption" color="text.secondary">
          PDF, DOCX, PPTX, XLSX, JPG, PNG, WebP
        </Typography>
      </Paper>

      {files.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {files.length} file(s) selected
          </Typography>
          {files.map((file, index) => (
            <Paper key={index} sx={{ p: 1, mb: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', mr: 1 }}>
                {file.name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                <Typography variant="caption" color="text.secondary">
                  {(file.size / 1024).toFixed(0)}KB
                </Typography>
                <IconButton size="small" onClick={() => removeFile(index)}>
                  <Delete fontSize="small" />
                </IconButton>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle1" fontWeight={600} gutterBottom>Customer Info</Typography>
      <Grid container spacing={1.5}>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="Your Name"
            value={customerInfo.name}
            onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
            required
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
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            size="small"
            label="Email (optional)"
            value={customerInfo.email}
            onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

function Step2Configure({ files, fileSettings, setFileSettings }) {
  const [activeTab, setActiveTab] = useState(0);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const getSettings = (fileIndex) => {
    const dbSettings = files[fileIndex]?.settings || {};
    const localSettings = fileSettings[fileIndex] || {};
    const merged = { ...dbSettings, ...localSettings };
    if (merged.colorMode === 'auto') merged.colorMode = 'bw';
    if (!merged.colorMode && isImageFile(files[fileIndex])) merged.colorMode = 'color';
    return merged;
  };

  const allImages = files.length > 0 && files.every((f) => isImageFile(f));

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

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>Configure Print Settings</Typography>

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
        <Alert severity="info" sx={{ mb: 1.5 }}>
          <Typography variant="body2" fontWeight={600} gutterBottom>
            Photo contact sheet
          </Typography>
          <Typography variant="caption" display="block" sx={{ mb: 1 }}>
            Your pictures will be arranged onto A4 sheets. Choose how many pictures go on each page:
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {pagesPerSheetOptions.filter((n) => n > 1).map((n) => (
              <Chip
                key={n}
                label={`${n} pictures / page`}
                color={(getSettings(activeTab).pagesPerSheet || 1) === n ? 'primary' : 'default'}
                onClick={() => updateAllImageSettings('pagesPerSheet', n)}
                variant={(getSettings(activeTab).pagesPerSheet || 1) === n ? 'filled' : 'outlined'}
                size="small"
              />
            ))}
          </Box>
        </Alert>
      )}

      {files.length > 0 && (
        <Card variant="outlined">
          <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              {files[activeTab]?.originalName || files[activeTab]?.name} — {files[activeTab]?.pageCount || '?'} pages
            </Typography>

            <Grid container spacing={1.5}>
              <Grid item xs={6} sm={4} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Paper</InputLabel>
                  <Select
                    value={getSettings(activeTab).paperSize || 'A4'}
                    label="Paper"
                    onChange={(e) => updateSetting(activeTab, 'paperSize', e.target.value)}
                  >
                    {paperSizes.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6} sm={4} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Color</InputLabel>
                  <Select
                    value={getSettings(activeTab).colorMode || 'bw'}
                    label="Color"
                    onChange={(e) => allImages
                      ? updateAllImageSettings('colorMode', e.target.value)
                      : updateSetting(activeTab, 'colorMode', e.target.value)}
                  >
                    {colorModes.map((m) => (
                      <MenuItem key={m} value={m}>{m === 'color' ? 'Color' : 'B/W'}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6} sm={4} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Style</InputLabel>
                  <Select
                    value={getSettings(activeTab).printStyle || 'single'}
                    label="Style"
                    onChange={(e) => updateSetting(activeTab, 'printStyle', e.target.value)}
                  >
                    <MenuItem value="single">Single-sided</MenuItem>
                    <MenuItem value="duplex">Double-sided</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6} sm={4} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Orientation</InputLabel>
                  <Select
                    value={getSettings(activeTab).orientation || 'auto'}
                    label="Orientation"
                    onChange={(e) => updateSetting(activeTab, 'orientation', e.target.value)}
                  >
                    {orientations.map((o) => (
                      <MenuItem key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6} sm={4} md={3}>
                <TextField
                  fullWidth size="small" type="number" label="Copies"
                  value={getSettings(activeTab).copies ?? 1}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateSetting(activeTab, 'copies', v === '' ? '' : parseInt(v));
                  }}
                  onBlur={() => {
                    const val = getSettings(activeTab).copies;
                    if (val === '' || val == null || val < 1) {
                      updateSetting(activeTab, 'copies', 1);
                    }
                  }}
                  inputProps={{ min: 1 }}
                />
              </Grid>
              <Grid item xs={6} sm={4} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>N-up</InputLabel>
                  <Select
                    value={getSettings(activeTab).pagesPerSheet || 1}
                    label="N-up"
                    onChange={(e) => allImages
                      ? updateAllImageSettings('pagesPerSheet', parseInt(e.target.value))
                      : updateSetting(activeTab, 'pagesPerSheet', parseInt(e.target.value))}
                  >
                    {pagesPerSheetOptions.map((n) => (
                      <MenuItem key={n} value={n}>{n === 1 ? '1 page' : `${n} in 1`}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              {!(getSettings(activeTab).sections || []).length > 0 && (
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth size="small" label="Page Range"
                  value={getSettings(activeTab).pageRange || ''}
                  onChange={(e) => updateSetting(activeTab, 'pageRange', e.target.value)}
                  placeholder="e.g. 1-5, 8, 10-12"
                  helperText="Leave empty = all pages"
                />
              </Grid>
              )}
            </Grid>

            <Divider sx={{ my: 1.5 }} />

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="caption" fontWeight={600}>Print Sections (advanced)</Typography>
              <Button size="small" startIcon={<Add />} onClick={() => addSection(activeTab)} sx={{ textTransform: 'none' }}>
                Add
              </Button>
            </Box>

            {(getSettings(activeTab).sections || []).length > 0 ? (
              (getSettings(activeTab).sections || []).map((section, si) => (
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
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
        <Typography variant="body2" sx={{ ml: 2 }}>Calculating price...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>Review & Payment</Typography>

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

      <Typography variant="subtitle2" gutterBottom>Payment Method</Typography>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <RadioGroup value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} row sx={{ flexWrap: 'wrap', gap: 0 }}>
          {[
            { value: 'cash', label: 'Cash' },
            { value: 'card', label: 'Card' },
            { value: 'upi', label: 'UPI' },
            { value: 'online', label: 'Online' },
          ].map((opt) => (
            <FormControlLabel key={opt.value} value={opt.value} control={<Radio size="small" />}
              label={<Typography variant="body2">{opt.label}</Typography>}
              sx={{ mr: { xs: 1, sm: 2 } }}
            />
          ))}
        </RadioGroup>
        {paymentMethod === 'upi' && upiQrUrl && (
          <Box sx={{ textAlign: 'center', mt: 2 }}>
            <img src={upiQrUrl} alt="UPI QR Code" style={{ width: 200, height: 200, objectFit: 'contain' }} />
            <Typography variant="caption" display="block" color="text.secondary">Scan to pay</Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

function Step4Confirmation({ order }) {
  const [copied, setCopied] = useState(false);

  const copyOrderId = () => {
    navigator.clipboard.writeText(order.id);
    setCopied(true);
    toast.success('Order ID copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{ textAlign: 'center', py: { xs: 2, sm: 4 } }}>
      <CheckCircle sx={{ fontSize: { xs: 56, sm: 80 }, color: 'success.main', mb: 1 }} />
      <Typography variant="h6" gutterBottom>Order Placed!</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Your order has been received and is being processed.
      </Typography>

      <Card variant="outlined" sx={{ maxWidth: 360, mx: 'auto', mb: 2 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main' }}>
            #{order.token || '-'}
          </Typography>
          <Typography variant="caption" color="text.secondary">Your Token Number</Typography>
          <Chip label={order.status === 'APPROVED' ? 'Approved ✅' : 'Pending ⏳'}
            color={order.status === 'APPROVED' ? 'success' : 'warning'} size="small" sx={{ mt: 1 }} />
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">Order ID</Typography>
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

      <Alert severity="info" sx={{ maxWidth: 360, mx: 'auto' }}>
        Save your Order ID to track status.
      </Alert>
    </Box>
  );
}

export default function CustomerPortal() {
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
      const result = await api.get('/settings/public/upi-qr');
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
  };

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 1.5, sm: 3 } }}>
      <Typography variant="h5" align="center" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.4rem', sm: '1.8rem' } }}>
        Patel AutoPrint
      </Typography>
      <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 2 }}>
        Print Shop - Self Service
      </Typography>

      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 3 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel><Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' } }}>{label}</Typography></StepLabel>
          </Step>
        ))}
      </Stepper>

      <Paper sx={{ p: { xs: 1.5, sm: 3 }, minHeight: 300 }}>
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
          <Step4Confirmation order={uploadedOrder} />
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
          <Button
            disabled={activeStep === 0 || activeStep === 3 || loading}
            onClick={handleBack}
            startIcon={<NavigateBefore />}
            size="small"
          >
            Back
          </Button>
          {activeStep < 3 && (
            <Button
              variant="contained"
              onClick={handleNext}
              disabled={loading || (activeStep === 2 && loadingPrice)}
              endIcon={loading ? <CircularProgress size={18} /> : <NavigateNext />}
              size="small"
            >
              {activeStep === 0 ? 'Upload' : activeStep === 1 ? 'Save & Price' : loading ? 'Placing...' : 'Place Order'}
            </Button>
          )}
          {activeStep === 3 && (
            <Button variant="contained" onClick={handleNewOrder} startIcon={<ShoppingCart />} size="small">
              New Order
            </Button>
          )}
        </Box>
      </Paper>
    </Container>
  );
}

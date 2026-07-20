import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Chip,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Print as PrintIcon,
  Refresh as ReprintIcon,
  Done as CompleteIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../services/api';
import OrderStatusBadge from '../../components/OrderStatusBadge';

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [printJobs, setPrintJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printers, setPrinters] = useState([]);
  const [bwPrinter, setBwPrinter] = useState('');
  const [colorPrinter, setColorPrinter] = useState('');

  const isImageFile = (file) => {
    const t = (file.fileType || '').toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp'].includes(t);
  };

  // Compute totals of B/W pages and Color pages the customer wants to print
  const computePageSummary = (ord) => {
    let bwPages = 0;
    let colorPages = 0;
    if (!ord || !ord.files) return { bwPages, colorPages };

    const imageFiles = ord.files.filter(isImageFile);
    const docFiles = ord.files.filter((f) => !isImageFile(f));

    // Contact sheets: all images combine into sheets = ceil(count/nUp) * copies
    if (imageFiles.length > 0) {
      const nUp = imageFiles[0].settings?.pagesPerSheet || 1;
      const copies = imageFiles[0].settings?.copies || 1;
      const anyColor = imageFiles.some((f) => (f.settings?.colorMode || 'color') === 'color');
      const sheets = Math.ceil(imageFiles.length / nUp) * copies;
      if (anyColor) colorPages += sheets;
      else bwPages += sheets;
    }

    for (const file of docFiles) {
      const s = file.settings || {};
      const sections = s.sections || [];
      const copies = s.copies || 1;
      const totalFilePages = file.pageCount || 0;
      const totalColorPages = file.colorPageCount || 0;

      if (sections.length > 0) {
        for (const sec of sections) {
          const secPages = (sec.endPage || totalFilePages) - (sec.startPage || 1) + 1;
          const secMode = sec.colorMode || s.colorMode || 'bw';
          let secColor = 0;
          if (secMode === 'color') secColor = secPages;
          else if (secMode === 'auto' && totalFilePages > 0) {
            secColor = Math.round(secPages * (totalColorPages / totalFilePages));
          }
          bwPages += (secPages - secColor) * (sec.copies || copies);
          colorPages += secColor * (sec.copies || copies);
        }
      } else {
        let actualPages = totalFilePages;
        if (s.pageRange && s.pageRange !== 'all') {
          const nums = s.pageRange.split(',').flatMap((r) => {
            const [a, b] = r.trim().split('-').map(Number);
            if (b) return Array.from({ length: b - a + 1 }, (_, i) => a + i);
            return [a];
          }).filter((n) => n >= 1 && n <= totalFilePages);
          if (nums.length) actualPages = nums.length;
        }
        const mode = s.colorMode || 'bw';
        let colorCount = 0;
        if (mode === 'color') colorCount = actualPages;
        else if (mode === 'auto' && totalFilePages > 0) {
          colorCount = Math.round(actualPages * (totalColorPages / totalFilePages));
        }
        bwPages += (actualPages - colorCount) * copies;
        colorPages += colorCount * copies;
      }
    }
    return { bwPages, colorPages };
  };

  const pageSummary = computePageSummary(order);

  useEffect(() => {
    fetchOrder();
    fetchPrintJobs();
    fetchPrinters();
  }, [id]);

  const fetchOrder = async () => {
    try {
      const result = await api.get(`/admin/orders/${id}`);
      if (result.success) {
        setOrder(result.data);
      }
    } catch {
      toast.error('Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const fetchPrintJobs = async () => {
    try {
      const result = await api.get(`/admin/orders/${id}/print-jobs`);
      if (result.success) {
        setPrintJobs(result.data || []);
      }
    } catch {
      // Print jobs may not exist yet
    }
  };

  const fetchPrinters = async () => {
    try {
      const result = await api.get('/printers');
      if (result.success) {
        const list = result.data?.printers || [];
        setPrinters(list);
        const bw = list.filter((p) => !p.colorSupport);
        const color = list.filter((p) => p.colorSupport);
        if (bw.length === 1) setBwPrinter(bw[0].name);
        if (color.length === 1) setColorPrinter(color[0].name);
      }
    } catch {
      // ignore
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const body = { status: newStatus };
      if (newStatus === 'PRINTING') {
        if (bwPrinter) body.bwPrinterName = bwPrinter;
        if (colorPrinter) body.colorPrinterName = colorPrinter;
      }
      await api.put(`/admin/orders/${id}/status`, body);
      toast.success(`Order ${newStatus.toLowerCase()}`);
      fetchOrder();
      fetchPrintJobs();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleReprint = async () => {
    try {
      const body = {};
      if (bwPrinter) body.bwPrinterName = bwPrinter;
      if (colorPrinter) body.colorPrinterName = colorPrinter;
      await api.post(`/admin/orders/${id}/reprint`, body);
      toast.success('Reprint job sent');
      fetchPrintJobs();
    } catch {
      toast.error('Failed to reprint');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!order) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        Order not found
      </Alert>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/admin/orders')}>
          Back to Orders
        </Button>
        <Typography variant="h5">Order Details</Typography>
        <OrderStatusBadge status={order.status} />
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Customer Information</Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Name</Typography>
                  <Typography variant="body1">{order.customer?.name || 'Walk-in'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Phone</Typography>
                  <Typography variant="body1">{order.customer?.phone || '-'}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">Email</Typography>
                  <Typography variant="body1">{order.customer?.email || 'N/A'}</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Order Information</Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Token</Typography>
                  <Typography variant="h4" color="primary" sx={{ fontWeight: 700 }}>
                    #{order.token || '-'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Payment</Typography>
                  <Chip label={order.paymentMethod || 'N/A'} size="small" sx={{ textTransform: 'capitalize' }} />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Total Amount</Typography>
                  <Typography variant="h6" color="primary">₹{order.totalPrice?.toFixed(2)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Created</Typography>
                  <Typography variant="body1">
                    {new Date(order.createdAt).toLocaleString('en-IN')}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Print Summary</Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>{pageSummary.bwPages}</Typography>
                    <Typography variant="body2" color="text.secondary">B/W Pages</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'secondary.main' }}>{pageSummary.colorPages}</Typography>
                    <Typography variant="body2" color="text.secondary">Color Pages</Typography>
                  </Box>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                    Total pages to print: {pageSummary.bwPages + pageSummary.colorPages}
                    {order.files?.some(isImageFile) && ' (photos counted as contact-sheet sheets)'}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Files</Typography>
              <Divider sx={{ mb: 2 }} />
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>File Name</TableCell>
                      <TableCell>Pages</TableCell>
                      <TableCell>Paper</TableCell>
                      <TableCell>Orientation</TableCell>
                      <TableCell>Color</TableCell>
                      <TableCell>Print Style</TableCell>
                      <TableCell>Copies</TableCell>
                      <TableCell>Pages/Sheet</TableCell>
                      <TableCell>Page Range</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {order.files?.map((file, i) => (
                      <TableRow key={file.id || i}>
                        <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.originalName}
                        </TableCell>
                        <TableCell>{file.pageCount}</TableCell>
                        <TableCell>{file.settings?.paperSize || 'A4'}</TableCell>
                        <TableCell sx={{ textTransform: 'capitalize' }}>{file.settings?.orientation || 'auto'}</TableCell>
                        <TableCell sx={{ textTransform: 'capitalize' }}>{file.settings?.colorMode || 'bw'}</TableCell>
                        <TableCell sx={{ textTransform: 'capitalize' }}>{file.settings?.printStyle || 'single'}</TableCell>
                        <TableCell>{file.settings?.copies || 1}</TableCell>
                        <TableCell>{file.settings?.pagesPerSheet || 1}</TableCell>
                        <TableCell>{file.settings?.pageRange || 'All'}</TableCell>
                      </TableRow>
                    ))}
                    {(!order.files || order.files.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={9} align="center">No files</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {printJobs.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Print Jobs</Typography>
                <Divider sx={{ mb: 2 }} />
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Job ID</TableCell>
                        <TableCell>Printer</TableCell>
                        <TableCell>Color Mode</TableCell>
                        <TableCell>Style</TableCell>
                        <TableCell>Copies</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Created</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {printJobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                            {job.id?.substring(0, 8)}...
                          </TableCell>
                          <TableCell>{job.assignedPrinter || 'Unassigned'}</TableCell>
                          <TableCell sx={{ textTransform: 'capitalize' }}>{job.colorMode || '-'}</TableCell>
                          <TableCell sx={{ textTransform: 'capitalize' }}>{job.printStyle || '-'}</TableCell>
                          <TableCell>{job.copies || 1}</TableCell>
                          <TableCell>
                            <Chip label={job.status || 'PENDING'} size="small" color={job.status === 'COMPLETED' ? 'success' : 'default'} />
                          </TableCell>
                          <TableCell>{new Date(job.createdAt).toLocaleString('en-IN')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Actions</Typography>
              <Divider sx={{ mb: 2 }} />
              {printers.length > 0 && (
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                  <FormControl size="small" sx={{ minWidth: 220 }}>
                    <InputLabel>B/W Printer</InputLabel>
                    <Select
                      value={bwPrinter}
                      label="B/W Printer"
                      onChange={(e) => setBwPrinter(e.target.value)}
                    >
                      <MenuItem value=""><em>Auto (any B/W)</em></MenuItem>
                      {printers.filter((p) => !p.colorSupport).map((p) => (
                        <MenuItem key={p.id} value={p.name}>{p.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 220 }}>
                    <InputLabel>Color Printer</InputLabel>
                    <Select
                      value={colorPrinter}
                      label="Color Printer"
                      onChange={(e) => setColorPrinter(e.target.value)}
                    >
                      <MenuItem value=""><em>Auto (any Color)</em></MenuItem>
                      {printers.filter((p) => p.colorSupport).map((p) => (
                        <MenuItem key={p.id} value={p.name}>{p.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              )}
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {order.status === 'PENDING' && (
                  <>
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<ApproveIcon />}
                      onClick={() => handleStatusChange('PRINTING')}
                    >
                      Approve & Print
                    </Button>
                    <Button
                      variant="contained"
                      color="error"
                      startIcon={<RejectIcon />}
                      onClick={() => handleStatusChange('REJECTED')}
                    >
                      Reject
                    </Button>
                  </>
                )}
                {order.status === 'APPROVED' && (
                  <Button
                    variant="contained"
                    startIcon={<PrintIcon />}
                    onClick={() => handleStatusChange('PRINTING')}
                  >
                    Start Printing
                  </Button>
                )}
                {order.status === 'PRINTING' && (
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CompleteIcon />}
                    onClick={() => handleStatusChange('COMPLETED')}
                  >
                    Mark Complete
                  </Button>
                )}
                {order.status === 'COMPLETED' && (
                  <Button
                    variant="outlined"
                    startIcon={<ReprintIcon />}
                    onClick={handleReprint}
                  >
                    Reprint
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

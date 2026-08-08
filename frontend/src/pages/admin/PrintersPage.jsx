import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Print as PrintIcon,
  NetworkCheck as NetworkCheckIcon,
  Circle as CircleIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../services/api';

const emptyPrinter = { name: '', ip: '', colorSupport: false, duplexSupport: false };

export default function PrintersPage() {
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState(null);
  const [formData, setFormData] = useState(emptyPrinter);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPrinters();
  }, []);

  const fetchPrinters = async () => {
    try {
      const result = await api.get('/printers');
      if (result.success) {
        setPrinters(result.data?.printers || []);
      }
    } catch {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (printer = null) => {
    if (printer) {
      setEditingPrinter(printer);
      setFormData({
        name: printer.name,
        ip: printer.ip || '',
        colorSupport: printer.colorSupport,
        duplexSupport: printer.duplexSupport,
      });
    } else {
      setEditingPrinter(null);
      setFormData(emptyPrinter);
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingPrinter(null);
    setFormData(emptyPrinter);
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error('Printer name is required');
      return;
    }
    setSaving(true);
    try {
      if (editingPrinter) {
        await api.put(`/printers/${editingPrinter.id}`, formData);
        toast.success('Printer updated');
      } else {
        await api.post('/printers', formData);
        toast.success('Printer added');
      }
      fetchPrinters();
      handleCloseDialog();
    } catch {
      toast.error('Failed to save printer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (printer) => {
    if (!window.confirm(`Delete printer "${printer.name}"?`)) return;
    try {
      await api.delete(`/printers/${printer.id}`);
      toast.success('Printer deleted');
      fetchPrinters();
    } catch {
      toast.error('Failed to delete printer');
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PrintIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h5" fontWeight="600">Printers</Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          sx={{ borderRadius: 2, textTransform: 'none', px: 3 }}
        >
          Add Printer
        </Button>
      </Box>

      {printers.length === 0 ? (
        <Alert 
          severity="info" 
          sx={{ 
            borderRadius: 2, 
            '& .MuiAlert-icon': { fontSize: 40, mr: 1 } 
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <PrintIcon sx={{ mr: 1, fontSize: 32 }} />
            No printers configured. Add a printer to get started.
          </Box>
        </Alert>
      ) : (
        <TableContainer 
          component={Paper} 
          sx={{ 
            borderRadius: 2,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            overflow: 'hidden'
          }}
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>IP Address</TableCell>
                <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Status</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Color</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Duplex</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {printers.map((printer) => (
                <TableRow 
                  key={printer.id} 
                  hover={true}
                  sx={{ 
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      bgcolor: 'action.hover',
                      transform: 'translateX(4px)'
                    }
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <PrintIcon color="primary" sx={{ fontSize: 24 }} />
                      <Typography variant="body1" fontWeight={500}>{printer.name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <NetworkCheckIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.primary' }}>{printer.ip || '-'}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: 80,
                          height: 32,
                          borderRadius: '20px',
                          bgcolor: printer.status === 'ONLINE' ? 'success.light' : 'error.light',
                          color: printer.status === 'ONLINE' ? 'success.dark' : 'error.dark',
                          px: 2,
                          fontWeight: 500,
                          fontSize: 12,
                        }}
                      >
                        {printer.status === 'ONLINE' && <CircleIcon sx={{ fontSize: 8, mr: 1 }} />}
                        {printer.status || 'UNKNOWN'}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      icon={printer.colorSupport ? <CheckCircleIcon sx={{ fontSize: 16 }} /> : <CancelIcon sx={{ fontSize: 16 }} />}
                      label={printer.colorSupport ? 'Enabled' : 'Disabled'}
                      color={printer.colorSupport ? 'success' : 'default'}
                      sx={{ borderRadius: 12, fontWeight: 500 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      icon={printer.duplexSupport ? <CheckCircleIcon sx={{ fontSize: 16 }} /> : <CancelIcon sx={{ fontSize: 16 }} />}
                      label={printer.duplexSupport ? 'Enabled' : 'Disabled'}
                      color={printer.duplexSupport ? 'success' : 'default'}
                      sx={{ borderRadius: 12, fontWeight: 500 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                      <IconButton 
                        size="small"
                        onClick={() => handleOpenDialog(printer)}
                        sx={{ 
                          bgcolor: 'action.hover', 
                          '&:hover': { bgcolor: 'primary.light', color: 'primary.main' }
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton 
                        size="small" 
                        color="error" 
                        onClick={() => handleDelete(printer)}
                        sx={{ 
                          bgcolor: 'action.hover',
                          '&:hover': { bgcolor: 'error.light' }
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingPrinter ? 'Edit Printer' : 'Add Printer'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Printer Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="IP Address"
            value={formData.ip}
            onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
            margin="normal"
            placeholder="e.g. 192.168.1.100"
          />
          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.colorSupport}
                  onChange={(e) => setFormData({ ...formData, colorSupport: e.target.checked })}
                />
              }
              label="Supports Color Printing"
            />
          </Box>
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.duplexSupport}
                  onChange={(e) => setFormData({ ...formData, duplexSupport: e.target.checked })}
                />
              }
              label="Supports Duplex (Double-sided)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editingPrinter ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

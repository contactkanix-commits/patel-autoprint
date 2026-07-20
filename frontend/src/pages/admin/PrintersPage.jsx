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
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Print as PrintIcon,
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Printers</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
          Add Printer
        </Button>
      </Box>

      {printers.length === 0 ? (
        <Alert severity="info">No printers configured. Add a printer to get started.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>IP Address</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Color</TableCell>
                <TableCell align="center">Duplex</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {printers.map((printer) => (
                <TableRow key={printer.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PrintIcon color="primary" />
                      {printer.name}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{printer.ip || '-'}</TableCell>
                  <TableCell>
                    <Typography
                      variant="caption"
                      sx={{
                        px: 1,
                        py: 0.5,
                        borderRadius: 1,
                        bgcolor: printer.status === 'ONLINE' ? 'success.light' : 'error.light',
                        color: printer.status === 'ONLINE' ? 'success.dark' : 'error.dark',
                      }}
                    >
                      {printer.status || 'UNKNOWN'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Switch checked={printer.colorSupport} disabled size="small" />
                  </TableCell>
                  <TableCell align="center">
                    <Switch checked={printer.duplexSupport} disabled size="small" />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleOpenDialog(printer)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(printer)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
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

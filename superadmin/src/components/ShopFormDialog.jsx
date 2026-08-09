import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  MenuItem,
  Grid,
  Stack,
  Typography,
  CircularProgress,
} from '@mui/material';
import toast from 'react-hot-toast';
import api from '../api';

const PLANS = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
const STATUSES = ['ACTIVE', 'SUSPENDED', 'CANCELLED'];

export default function ShopFormDialog({ open, shop, onClose, onSaved }) {
  const isEdit = Boolean(shop);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    plan: 'FREE',
    status: 'ACTIVE',
    price: 0,
    endDate: '',
    maxPrinters: 1,
  });

  useEffect(() => {
    if (shop) {
      const sub = shop.subscription || {};
      setForm({
        name: shop.name || '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        plan: sub.plan || 'FREE',
        status: sub.status || 'ACTIVE',
        price: sub.price ?? 0,
        endDate: sub.endDate ? sub.endDate.slice(0, 10) : '',
        maxPrinters: sub.maxPrinters ?? 1,
      });
    } else {
      setForm({
        name: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        plan: 'FREE',
        status: 'ACTIVE',
        price: 0,
        endDate: '',
        maxPrinters: 1,
      });
    }
  }, [shop, open]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: k === 'price' || k === 'maxPrinters' ? Number(v) : v }));
  };

  const handleSubmit = async () => {
    if (!form.name) {
      toast.error('Shop name is required');
      return;
    }
    setLoading(true);
    try {
      if (isEdit) {
        const body = {
          name: form.name,
          plan: form.plan,
          status: form.status,
          price: form.price,
          maxPrinters: form.maxPrinters,
          endDate: form.endDate ? `${form.endDate}T00:00:00.000Z` : null,
        };
        await api.put(`/superadmin/shops/${shop.id}`, body);
        toast.success('Shop updated');
      } else {
        if (!form.adminEmail || !form.adminPassword) {
          toast.error('Owner email and password are required');
          setLoading(false);
          return;
        }
        const body = {
          name: form.name,
          adminName: form.adminName || undefined,
          adminEmail: form.adminEmail,
          adminPassword: form.adminPassword,
          plan: form.plan,
          price: form.price,
          maxPrinters: form.maxPrinters,
          endDate: form.endDate ? `${form.endDate}T00:00:00.000Z` : null,
        };
        const res = await api.post('/superadmin/shops', body);
        toast.success('Shop created');
        if (res.data?.agentKey) {
          navigator.clipboard?.writeText(res.data.agentKey);
          toast.success(`Agent key copied: ${res.data.agentKey}`);
        }
      }
      onSaved();
    } catch (err) {
      // interceptor handles
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? `Edit ${shop?.name}` : 'Add Shop'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Shop name" fullWidth required value={form.name} onChange={set('name')} />
          {!isEdit && (
            <>
              <TextField label="Owner name" fullWidth value={form.adminName} onChange={set('adminName')} />
              <TextField label="Owner email" fullWidth type="email" required value={form.adminEmail} onChange={set('adminEmail')} />
              <TextField
                label="Owner password"
                fullWidth
                type="password"
                required
                value={form.adminPassword}
                onChange={set('adminPassword')}
                helperText="At least 6 characters"
              />
            </>
          )}
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField select label="Plan" fullWidth value={form.plan} onChange={set('plan')}>
                {PLANS.map((p) => (
                  <MenuItem key={p} value={p}>
                    {p}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField
                select
                label="Status"
                fullWidth
                value={form.status}
                onChange={set('status')}
                disabled={!isEdit}
              >
                {STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                label="Price (INR)"
                fullWidth
                type="number"
                value={form.price}
                onChange={set('price')}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Max printers"
                fullWidth
                type="number"
                value={form.maxPrinters}
                onChange={set('maxPrinters')}
              />
            </Grid>
          </Grid>
          <TextField
            label="Subscription end date"
            fullWidth
            type="date"
            value={form.endDate}
            onChange={set('endDate')}
            InputLabelProps={{ shrink: true }}
            helperText="Leave blank for a lifetime plan"
          />
          {isEdit && (
            <Typography variant="caption" color="text.secondary">
              Set status to SUSPENDED or CANCELLED to immediately block the shop's printing.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}>
          {loading ? <CircularProgress size={20} /> : isEdit ? 'Save' : 'Create Shop'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  CircularProgress,
} from '@mui/material';
import toast from 'react-hot-toast';
import api from '../api';

export default function ChangePasswordDialog({ open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const handleSubmit = async () => {
    if (!current || !next) {
      toast.error('Please fill in all fields');
      return;
    }
    if (next.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (next !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/superadmin/change-password', { currentPassword: current, newPassword: next });
      toast.success('Password updated');
      setCurrent('');
      setNext('');
      setConfirm('');
      onClose();
    } catch (err) {
      // interceptor handles
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Change Password</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Current password"
            type="password"
            fullWidth
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <TextField
            label="New password"
            type="password"
            fullWidth
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <TextField
            label="Confirm new password"
            type="password"
            fullWidth
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}>
          {loading ? <CircularProgress size={20} /> : 'Update'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

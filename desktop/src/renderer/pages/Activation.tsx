import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  CircularProgress,
  InputAdornment,
} from '@mui/material';
import KeyIcon from '@mui/icons-material/Key';
import DnsIcon from '@mui/icons-material/Dns';
import ComputerIcon from '@mui/icons-material/Computer';
import toast from 'react-hot-toast';
import { shopApi } from '../api';
import { useAppStore } from '../store/useAppStore';

const Activation: React.FC = () => {
  const { settings, setSettings, saveSettings } = useAppStore();
  const [apiUrl, setApiUrl] = useState(settings.apiUrl || 'https://patel-autoprint.onrender.com');
  const [activationKey, setActivationKey] = useState('');
  const [loading, setLoading] = useState(false);

  const handleActivate = async () => {
    const key = activationKey.trim().toUpperCase();
    if (!key) {
      toast.error('Please enter your activation key');
      return;
    }
    if (!apiUrl.trim()) {
      toast.error('Please enter the server URL');
      return;
    }
    setLoading(true);
    try {
      const normalizedUrl = apiUrl.trim().replace(/\/$/, '');
      setSettings({ apiUrl: normalizedUrl, machineName: settings.machineName || 'COUNTER-1' });
      const res = await shopApi.activate({
        activationKey: key,
        machineName: settings.machineName || 'COUNTER-1',
        osInfo: `Windows ${navigator.platform || ''}`,
      });
      const { apiKey, shopId, shopName, machineId, activationKey: storedKey } = res.data.data;
      setSettings({
        apiUrl: normalizedUrl,
        apiKey,
        shopId,
        shopName,
        machineId,
        activationKey: storedKey || key,
      });
      saveSettings();
      toast.success('Activation successful!');
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Activation failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #e3f2fd 0%, #f5f5f5 100%)',
        p: 2,
      }}
    >
      <Card sx={{ maxWidth: 460, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box
              component="img"
              src="icon.png"
              alt="Patel AutoPrint"
              sx={{ width: 72, height: 72, borderRadius: 2, mb: 2 }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <Typography variant="h5" fontWeight={700}>Patel AutoPrint</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Activate this machine to start receiving print orders
            </Typography>
          </Box>

          <TextField
            fullWidth
            label="Server URL"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://patel-autoprint.onrender.com"
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><DnsIcon fontSize="small" /></InputAdornment>
              ),
            }}
          />

          <TextField
            fullWidth
            label="Activation Key"
            value={activationKey}
            onChange={(e) => setActivationKey(e.target.value.toUpperCase())}
            placeholder="PATEL-XXXXXXXX"
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><KeyIcon fontSize="small" /></InputAdornment>
              ),
            }}
          />

          <TextField
            fullWidth
            label="Machine Name"
            value={settings.machineName || 'COUNTER-1'}
            onChange={(e) => setSettings({ machineName: e.target.value })}
            disabled={loading}
            sx={{ mb: 3 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><ComputerIcon fontSize="small" /></InputAdornment>
              ),
            }}
          />

          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleActivate}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <KeyIcon />}
          >
            {loading ? 'Activating...' : 'Activate'}
          </Button>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
            Contact your administrator if you don't have an activation key
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Activation;

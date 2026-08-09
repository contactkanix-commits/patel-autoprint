import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  Paper,
  Avatar,
  Link,
} from '@mui/material';
import { KeyOutlined } from '@mui/icons-material';
import { useAuth } from '../AuthContext';
import { getApiUrl, setApiUrl } from '../settings';
import toast from 'react-hot-toast';

export default function ActivationPage() {
  const [apiUrl, setApiUrlState] = useState(getApiUrl());
  const [agentKey, setAgentKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { activate } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      setApiUrl(apiUrl);
      await activate(agentKey.trim());
      toast.success('Shop activated!');
      navigate('/admin');
    } catch (err) {
      setError(err.message || 'Invalid agent key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <Avatar sx={{ m: 1, bgcolor: 'primary.main' }}>
              <KeyOutlined />
            </Avatar>
            <Typography component="h1" variant="h5">
              Patel AutoPrint
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Activate this shop with your Agent Key
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter the Agent Key provided by Patel AutoPrint. You only need to do
            this once — after that, the app opens straight to your dashboard.
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Agent Key"
              value={agentKey}
              onChange={(e) => setAgentKey(e.target.value)}
              margin="normal"
              placeholder="PAP-XXXX-XXXX-XXXX"
              autoFocus
              required
              inputProps={{ style: { textTransform: 'uppercase' } }}
            />
            <TextField
              fullWidth
              label="API URL"
              value={apiUrl}
              onChange={(e) => setApiUrlState(e.target.value)}
              margin="normal"
              placeholder="https://patel-autoprint.onrender.com"
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 1 }}
              disabled={loading}
            >
              {loading ? 'Activating...' : 'Activate'}
            </Button>
          </Box>
          <Box sx={{ textAlign: 'center', mt: 2 }}>
            <Link
              component="button"
              variant="body2"
              onClick={() => navigate('/login')}
              sx={{ textDecoration: 'none' }}
            >
              Sign in with email &amp; password instead
            </Link>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}

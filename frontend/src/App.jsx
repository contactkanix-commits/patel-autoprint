import { Routes, Route, Link } from 'react-router-dom';
import { Box, Button, Container, Typography, Paper } from '@mui/material';
import { ShoppingCart, TrackChanges } from '@mui/icons-material';

import CustomerPortal from './pages/CustomerPortal';
import OrderTracking from './pages/OrderTracking';

function HomePage() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, sm: 8 }, px: { xs: 1.5, sm: 3 } }}>
      <Typography variant="h3" align="center" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.8rem', sm: '2.5rem', md: '3rem' } }}>
        Patel AutoPrint
      </Typography>
      <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: { xs: 3, sm: 6 }, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
        Professional Print Shop - Quick & Easy
      </Typography>

      <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Paper
          elevation={2}
          sx={{
            p: 4,
            textAlign: 'center',
            width: { xs: '100%', sm: 280 },
            cursor: 'pointer',
            transition: '0.2s',
            '&:hover': { elevation: 6, transform: 'translateY(-4px)' },
          }}
          component={Link}
          to="/portal"
        >
          <ShoppingCart sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6">Print Documents</Typography>
          <Typography variant="body2" color="text.secondary">
            Upload files, configure settings, and place your print order
          </Typography>
        </Paper>

        <Paper
          elevation={2}
          sx={{
            p: 4,
            textAlign: 'center',
            width: { xs: '100%', sm: 280 },
            cursor: 'pointer',
            transition: '0.2s',
            '&:hover': { elevation: 6, transform: 'translateY(-4px)' },
          }}
          component={Link}
          to="/tracking"
        >
          <TrackChanges sx={{ fontSize: 48, color: 'secondary.main', mb: 2 }} />
          <Typography variant="h6">Track Order</Typography>
          <Typography variant="body2" color="text.secondary">
            Check the status of your existing print order
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/portal" element={<CustomerPortal />} />
      <Route path="/s/:slug" element={<CustomerPortal />} />
      <Route path="/tracking" element={<OrderTracking />} />
    </Routes>
  );
}

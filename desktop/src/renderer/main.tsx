import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { ThemeProvider as CustomThemeProvider } from './context/ThemeContext';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2', light: '#42a5f5', dark: '#1565c0' },
    secondary: { main: '#43a047', light: '#66bb6a', dark: '#2e7d32' },
    error: { main: '#d32f2f' },
    warning: { main: '#ed6c02' },
    info: { main: '#0288d1' },
    success: { main: '#388e3c' },
    background: { default: '#f5f5f5', paper: '#ffffff' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiCard: { styleOverrides: { root: { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 600 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CustomThemeProvider>
        <CssBaseline />
        <BrowserRouter>
          <App />
          <Toaster position="bottom-right" toastOptions={{ duration: 4000 }} />
        </BrowserRouter>
      </CustomThemeProvider>
    </ThemeProvider>
  </React.StrictMode>
);
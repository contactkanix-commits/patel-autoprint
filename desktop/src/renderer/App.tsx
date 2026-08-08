import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import PrintQueue from './pages/PrintQueue';
import PassportPhotos from './pages/PassportPhotos';
import AadhaarPan from './pages/AadhaarPan';
import WhatsAppBot from './pages/WhatsAppBot';
import DailyStats from './pages/DailyStats';
import Settings from './pages/Settings';
import Activation from './pages/Activation';
import { useAppStore } from './store/useAppStore';

const App: React.FC = () => {
  const { loadSettings, settings } = useAppStore();
  const [loaded, setLoaded] = useState(false);
  
  useEffect(() => {
    loadSettings();
    setLoaded(true);
  }, [loadSettings]);

  if (!loaded) return null;

  if (!settings.apiKey) {
    return <Activation />;
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/print-queue" replace />} />
        <Route path="print-queue" element={<PrintQueue />} />
        <Route path="passport-photos" element={<PassportPhotos />} />
        <Route path="aadhaar-pan" element={<AadhaarPan />} />
        <Route path="whatsapp-bot" element={<WhatsAppBot />} />
        <Route path="daily-stats" element={<DailyStats />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/print-queue" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
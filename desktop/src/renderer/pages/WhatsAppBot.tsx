import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Grid, Card, CardContent, Button, TextField,
  FormControl, InputLabel, Select, MenuItem, Divider, Alert,
  CircularProgress, Tabs, Tab, FormControlLabel, Switch, List, ListItem,
  ListItemAvatar, ListItemText, Avatar, IconButton, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Tooltip,
  Collapse, Accordion, AccordionSummary, AccordionDetails, AccordionActions
} from '@mui/material';
import {
  QrCode, Message, Send, Delete as DeleteIcon, MoreVert,
  Refresh as RefreshIcon, Logout as LogoutIcon, CheckCircle,
  Phone, Person, AttachFile, Mic, EmojiEmotions,
  Notifications as NotificationsIcon, Settings as SettingsIcon,
  QrCodeScanner, Wifi, WifiOff
} from '@mui/icons-material';
import { useAppStore } from '../store/useAppStore';
import { qrCodeApi, whatsappApi } from '../api';
import toast from 'react-hot-toast';

const WhatsAppBot: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoResponses, setAutoResponses] = useState([
    { trigger: 'welcome', message: 'Welcome to Patel AutoPrint! Upload your files at our portal.', enabled: true },
    { trigger: 'price', message: 'B&W: ₹2/page, Color: ₹10/page. Upload for exact quote.', enabled: true },
    { trigger: 'upload', message: 'Files uploaded successfully! Your order will be processed shortly.', enabled: true },
    { trigger: 'payment', message: 'Payment received! Your order is being processed.', enabled: true },
    { trigger: 'printing', message: 'Your order is now printing. Estimated completion: 15 minutes.', enabled: true },
    { trigger: 'completed', message: 'Your order is ready for pickup! Token: #{token}', enabled: true },
  ]);

  const tabs = [
    { id: 'conversations', label: 'Conversations', icon: <Message /> },
    { id: 'qr-login', label: 'QR Login', icon: <QrCodeScanner /> },
    { id: 'auto-responses', label: 'Auto Responses', icon: <SettingsIcon /> },
  ];

  const mockConversations = [
    { id: '1', customerName: 'Amit Patel', phone: '9876543220', lastMessage: 'Please print my document', lastMessageTime: '2 min ago', unread: 2, files: 3, status: 'pending' },
    { id: '2', customerName: 'Sneha Shah', phone: '9876543221', lastMessage: 'Payment done via UPI', lastMessageTime: '15 min ago', unread: 0, files: 1, status: 'paid' },
    { id: '3', customerName: 'Rajesh Kumar', phone: '9876543222', lastMessage: 'When will it be ready?', lastMessageTime: '1 hour ago', unread: 1, files: 2, status: 'printing' },
  ];

  const mockMessages = [
    { id: '1', from: 'customer', text: 'Hello, I want to print some documents', time: '10:00 AM', type: 'text' },
    { id: '2', from: 'bot', text: 'Welcome to Patel AutoPrint! Upload your files at our portal.', time: '10:01 AM', type: 'auto' },
    { id: '3', from: 'customer', text: 'I uploaded 3 PDF files', time: '10:05 AM', type: 'text', files: 3 },
    { id: '4', from: 'bot', text: 'Files uploaded successfully! Your order will be processed shortly.', time: '10:06 AM', type: 'auto' },
    { id: '5', from: 'operator', text: 'Your order #123 is approved and printing', time: '10:10 AM', type: 'text' },
  ];

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await whatsappApi.getConversations();
      if (res.data.success) {
        setConversations(res.data.data);
      }
    } catch (e) {
      setConversations(mockConversations);
    }
  };

  const sendMessage = () => {
    if (!newMessage.trim() || !selectedConversation) return;
    setNewMessage('');
  };

  const sendAutoResponse = (message: string) => {
    if (!selectedConversation) return;
    setNewMessage(message);
    sendMessage();
  };

  const generateQR = async () => {
    setLoading(true);
    try {
      setQrCode('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgZmlsbD0iI2ZmZiIvPjx0ZXh0IHg9IjEyOCIgeT0iMTMwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiPlFSIENvZGU8L3RleHQ+PC9zdmc+');
      setIsConnected(false);
    } catch (e) {
      toast.error('Failed to generate QR');
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    setIsConnected(false);
    setQrCode(null);
    toast.success('Disconnected');
  };

  const toggleAutoResponse = (index: number, enabled: boolean) => {
    setAutoResponses(prev => prev.map((r, i) => i === index ? { ...r, enabled } : r));
  };

  const updateAutoResponse = (index: number, field: string, value: string) => {
    setAutoResponses(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const deleteAutoResponse = (index: number) => {
    if (autoResponses.length <= 1) return;
    setAutoResponses(prev => prev.filter((_, i) => i !== index));
  };

  const addAutoResponse = () => {
    setAutoResponses(prev => [...prev, { trigger: '', message: '', enabled: true }]);
  };

  const startAdornment = (
    <InputAdornment position="start">
      <IconButton><Mic /></IconButton>
    </InputAdornment>
  );

  const endAdornment = (
    <InputAdornment position="end">
      <IconButton><EmojiEmotions /></IconButton>
    </InputAdornment>
  );

  return (
    <Box sx={{ height: 'calc(100vh - 280px)', overflow: 'auto' }}>
      <Typography variant="h5" gutterBottom>WhatsApp Bot</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage customer conversations, auto-replies & QR login
      </Typography>

      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 3 }}>
        {tabs.map(tab => (
          <Tab key={tab.id} label={tab.label} icon={tab.icon} />
        ))}
      </Tabs>

      {activeTab === 0 && (
      <Paper elevation={2} sx={{ p: 0, overflow: 'hidden', height: 'calc(100vh - 280px)' }}>
        <Grid container sx={{ height: '100%' }}>
          {/* Conversations List */}
          <Grid item xs={12} md={4} sx={{ borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="h6">Conversations</Typography>
              <IconButton size="small"><RefreshIcon fontSize="small" /></IconButton>
            </Box>
            <List sx={{ flex: 1, overflow: 'auto' }}>
              {conversations.map(conv => (
                <ListItem
                  key={conv.id}
                  selected={selectedConversation?.id === conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  sx={{ px: 1, py: 1 }}
                >
                  <ListItemAvatar>
                    <Avatar>
                      <Person />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={conv.customerName}
                    secondary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <Typography variant="caption" color="text.secondary">{conv.lastMessage}</Typography>
                        {conv.unread > 0 && <Chip label={conv.unread} size="small" color="error" variant="filled" sx={{ fontSize: 10 }} />}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Grid>

{/* Chat Window */}
          <Grid item xs={12} md={8} sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {selectedConversation ? (
              <>
                {/* Header */}
                <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Avatar><Person /></Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" fontWeight={600} noWrap>{selectedConversation.customerName}</Typography>
                    <Typography variant="caption" color="text.secondary">{selectedConversation.phone}</Typography>
                  </Box>
                  <Chip 
                    label={selectedConversation.status} 
                    size="small" 
                    color={({ pending: 'warning', paid: 'success', printing: 'primary' } as any)[selectedConversation.status] || 'default'}
                  />
                </Box>

                {/* Messages */}
                <Box sx={{ flex: 1, p: 2, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {mockMessages.map(msg => (
                    <Box
                      key={msg.id}
                      sx={{
                        display: 'flex',
                        justifyContent: msg.from === 'customer' ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        alignSelf: msg.from === 'customer' ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <Paper
                        elevation={1}
                        variant={msg.from === 'customer' ? 'outlined' : msg.from === 'operator' ? 'elevation' : 'filled'}
                        sx={{
                          p: 1.5,
                          borderRadius: 2,
                          bgcolor: msg.from === 'customer' ? 'primary.light' : msg.from === 'bot' ? 'grey.100' : 'success.light',
                          borderTopLeftRadius: msg.from === 'customer' ? 2 : 0,
                          borderTopRightRadius: msg.from === 'customer' ? 2 : 2,
                          borderBottomLeftRadius: msg.from === 'customer' ? 2 : 2,
                          borderBottomRightRadius: msg.from === 'customer' ? 2 : 0,
                        }}
                      >
                        {msg.type === 'auto' && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                            <CheckCircle fontSize="small" color="success" />
                            <Typography variant="caption" fontWeight={600} color="success.main">Auto-reply</Typography>
                          </Box>
                        )}
                        <Typography variant="body2" sx={{ mb: 0.5 }}>
                          {msg.text}
                        </Typography>
                        {msg.files && (
                          <Chip label={`${msg.files} file(s) attached`} size="small" color="primary" variant="outlined" sx={{ mt: 0.5 }} />
                        )}
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, textAlign: 'right' }}>
                          {msg.time}
                        </Typography>
                      </Paper>
                    </Box>
                  ))}
                  {/* Typing indicator */}
                  <Box sx={{ height: 20 }} />
                </Box>

                {/* Input */}
                <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <IconButton><AttachFile /></IconButton>
                    <TextField
                      fullWidth
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      multiline
                      maxRows={4}
                      size="small"
                      sx={{ flex: 1 }}
                    />
                    <IconButton color="primary" onClick={sendMessage} disabled={!newMessage.trim()}>
                      <Send />
                    </IconButton>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5, pl: 1 }}>
                    {autoResponses.filter(r => r.enabled).map((resp, i) => (
                      <Chip
                        key={i}
                        label={resp.trigger}
                        size="small"
                        variant="outlined"
                        onClick={() => sendAutoResponse(resp.message)}
                        sx={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Box>
                  </Box>
                </>
              ) : (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
                <Typography variant="h6">Select a conversation to start chatting</Typography>
              </Box>
            )}
          </Grid>
        </Grid>
      </Paper>
    )}

    {activeTab === 1 && (
      <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom>WhatsApp Login</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Scan the QR code with WhatsApp on your phone to connect the bot
        </Typography>
        
        {qrCode ? (
          <Box sx={{ mb: 3 }}>
            <img src={qrCode} alt="WhatsApp QR" style={{ width: 256, height: 256, borderRadius: 8, boxShadow: 3 }} />
          </Box>
        ) : (
          <Box sx={{ width: 256, height: 256, borderRadius: 8, border: '2px dashed', borderColor: 'grey.400', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 3 }}>
            <Typography color="text.secondary">Click "Generate QR" to start</Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button 
            variant="contained" 
            size="large" 
            startIcon={<QrCodeScanner />} 
            onClick={generateQR}
            disabled={loading}
          >
            {loading ? 'Generating...' : 'Generate QR Code'}
          </Button>
          <Button 
            variant="outlined" 
            color="error" 
            startIcon={<LogoutIcon />}
            onClick={disconnect}
            disabled={!isConnected}
          >
            Disconnect
          </Button>
        </Box>

        <Alert severity="info" sx={{ mt: 3 }}>
          <Typography variant="body2">
            <strong>Steps:</strong> Open WhatsApp → Settings → Linked Devices → Link a Device → Scan QR
          </Typography>
        </Alert>

        {isConnected && (
          <Alert severity="success" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <CheckCircle fontSize="small" /> Connected! Bot is now receiving messages.
            </Typography>
          </Alert>
        )}
      </Paper>
    )}

    {activeTab === 2 && (
      <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom>Auto-Response Rules</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Configure automatic replies for common customer triggers
        </Typography>

        {autoResponses.map((resp, index) => (
          <Paper key={resp.trigger} elevation={1} sx={{ mb: 2 }}>
            <Accordion defaultExpanded={false}>
              <AccordionSummary expandIcon={<MoreVert />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                  <Chip label={resp.trigger} color="primary" size="small" />
                  <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>{resp.message}</Typography>
                  <FormControlLabel
                    control={<Switch checked={resp.enabled} onChange={(e) => toggleAutoResponse(index, e.target.checked)} />}
                    label="Enabled"
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Trigger Keyword"
                      value={autoResponses[index].trigger}
                      onChange={(e) => updateAutoResponse(index, 'trigger', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Response Message"
                      value={autoResponses[index].message}
                      onChange={(e) => updateAutoResponse(index, 'message', e.target.value)}
                      multiline
                      rows={2}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button variant="outlined" color="error" onClick={() => deleteAutoResponse(index)}>Delete</Button>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Paper>
        ))}

        <Button variant="outlined" startIcon={<AddIcon />} sx={{ mt: 2 }} onClick={addAutoResponse}>
          Add New Auto-Response
        </Button>
      </Paper>
    )}
    </Box>
  );
}

export default WhatsAppBot;
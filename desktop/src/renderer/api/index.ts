import axios, { AxiosInstance, AxiosError } from 'axios';
import { useAppStore } from '../store/useAppStore';

const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: 'https://patel-autoprint.onrender.com/api',
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  });

  client.interceptors.request.use((config) => {
    const { settings } = useAppStore.getState();
    if (settings.apiKey) {
      config.headers['x-api-key'] = settings.apiKey;
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        // Token expired or invalid
      }
      return Promise.reject(error);
    }
  );

  return client;
};

export const api = createApiClient();

// Shop & Activation
export const shopApi = {
  create: (data: { name: string; ownerName: string; mobile: string; email?: string; address?: string; city?: string; state?: string; planId?: string }) =>
    axios.post('/api/admin/shops', data),
  
  list: () => api.get('/admin/shops'),
  
  activate: (data: { activationKey: string; machineName: string; osInfo?: string }) =>
    axios.post('/activate', data),
};

// Plans
export const planApi = {
  list: () => api.get('/plans'),
};

// Agent
export const agentApi = {
  heartbeat: (apiKey: string) => axios.post('https://patel-autoprint.onrender.com/api/agent/heartbeat', {}, { headers: { 'x-api-key': apiKey } }),
  
  fetchJobs: (apiKey: string) => axios.get('https://patel-autoprint.onrender.com/api/agent/v2/jobs', { headers: { 'x-api-key': apiKey } }),
  
  downloadFile: (apiKey: string, jobId: string) => 
    axios.get(`https://patel-autoprint.onrender.com/api/agent/v2/jobs/${jobId}/file`, { 
      headers: { 'x-api-key': apiKey },
      responseType: 'blob',
    }),
  
  updateJobStatus: (apiKey: string, jobId: string, status: string, errorMessage?: string) =>
    axios.put(`https://patel-autoprint.onrender.com/api/agent/v2/jobs/${jobId}/status`, 
      { status, errorMessage }, 
      { headers: { 'x-api-key': apiKey } }
    ),
  
  log: (apiKey: string, level: string, message: string, metadata?: any) =>
    axios.post('https://patel-autoprint.onrender.com/api/agent/logs', 
      { level, message, metadata },
      { headers: { 'x-api-key': apiKey } }
    ),
};

// Orders
export const orderApi = {
  list: (params?: { status?: string; page?: number; limit?: number; search?: string }) =>
    api.get('/admin/queue', { params }),
  
  get: (id: string) => api.get(`/admin/orders/${id}`),
  
  dispatch: (id: string, printerId: string) => 
    api.put(`/admin/orders/${id}/dispatch`, { printerId }),
  
  updateStatus: (id: string, status: string) =>
    api.put(`/admin/orders/${id}/status`, { status }),
  
  reprint: (id: string, printerId?: string) =>
    api.post(`/admin/orders/${id}/reprint`, { printerId }),
};

// Printers
export const printerApi = {
  list: () => api.get('/printers'),
  
  create: (data: { name: string; ip?: string; colorSupport: boolean; duplexSupport: boolean; paperSizes: string[] }) =>
    api.post('/printers', data),
  
  update: (id: string, data: Partial<any>) => api.put(`/printers/${id}`, data),
  
  delete: (id: string) => api.delete(`/printers/${id}`),
  
  test: (id: string) => api.post(`/printers/${id}/test`),
};

// Notifications
export const notificationApi = {
  list: () => api.get('/notifications'),
  markRead: (id: string) => api.put(`/notifications/${id}/read`),
};

// Dashboard
export const dashboardApi = {
  stats: () => api.get('/dashboard/stats'),
};

// Notifications
export const notificationApi2 = {
  list: () => api.get('/notifications'),
  markRead: (id: string) => api.put(`/notifications/${id}/read`),
};

// Settings
export const settingsApi = {
  get: () => api.get('/settings/pricing'),
  update: (data: any) => api.put('/settings/pricing', data),
  
  uploadQR: (file: File) => {
    const formData = new FormData();
    formData.append('qr', file);
    return api.post('/settings/upi-qr', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Plans
export const plansApi = {
  list: () => api.get('/plans'),
};

// Subscription
export const subscriptionApi = {
  update: (shopId: string, data: { planId: string; status: string; endsAt?: string }) =>
    api.put(`/admin/shops/${shopId}/subscription`, data),
};

// WhatsApp Bot
export const whatsappApi = {
  getConversations: () => api.get('/whatsapp/conversations'),
};

export const qrCodeApi = {
  generate: () => api.post('/whatsapp/qr'),
};

export default api;
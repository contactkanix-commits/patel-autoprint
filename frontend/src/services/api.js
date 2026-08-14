import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
});

const isGuestPath = (url) => {
  const p = url || '';
  return p.startsWith('/guest') || p.startsWith('/settings/public') || p.startsWith('/guest/');
};

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && !isGuestPath(config.url)) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      if (error.response.status === 401 && !isGuestPath(error.config?.url)) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
        toast.error('Session expired. Please login again.');
      } else {
        const message = error.response.data?.message || error.response.data?.error || 'An error occurred';
        toast.error(message);
      }
      return Promise.reject(error.response.data);
    }
    toast.error('Network error. Please check your connection.');
    return Promise.reject({ message: 'Network error' });
  }
);

export default api;

import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('superadmin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      if (error.response.status === 401) {
        localStorage.removeItem('superadmin_token');
        localStorage.removeItem('superadmin_user');
        if (window.location.pathname !== '/superadmin/login') {
          window.location.href = '/superadmin/login';
        }
      } else {
        const message = error.response.data?.message || 'An error occurred';
        toast.error(message);
      }
      return Promise.reject(error.response.data);
    }
    toast.error('Network error. Please check your connection.');
    return Promise.reject({ message: 'Network error' });
  }
);

export default api;

import axios from 'axios';
import toast from 'react-hot-toast';
import { getApiUrl } from './settings';

const api = axios.create();

api.interceptors.request.use(
  (config) => {
    config.baseURL = `${getApiUrl()}/api`;
    const token = localStorage.getItem('token');
    if (token) {
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
      if (error.response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('subscription');
        window.location.hash = '#/activate';
        toast.error('Session expired. Please activate again.');
      } else {
        const message =
          error.response.data?.message ||
          error.response.data?.error ||
          'An error occurred';
        toast.error(message);
      }
      return Promise.reject(error.response.data);
    }
    toast.error('Network error. Please check your connection.');
    return Promise.reject({ message: 'Network error' });
  }
);

export default api;

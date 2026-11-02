import axios from 'axios';
const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api', withCredentials: true, headers: { 'Content-Type': 'application/json' } });
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) delete config.headers['Content-Type'];
  return config;
});
api.interceptors.response.use((r) => r, (error) => {
  if (axios.isCancel(error)) return Promise.reject(error);
  const message = new Error(error.response?.data?.message || 'Unable to reach ReUseCircle. Please try again.');
  message.status = error.response?.status;
  return Promise.reject(message);
});
export default api;

import axios from 'axios';
import { ElMessage } from 'element-plus';

export const http = axios.create({
  baseURL: '/api/v1',
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('exam-workflow-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error?.response?.data?.message ?? '请求失败';
    ElMessage.error(message);
    if (error?.response?.status === 401) {
      localStorage.removeItem('exam-workflow-token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Axios HTTP client configured for the Django backend.
 * Handles JWT token injection and automatic refresh.
 */
import axios from 'axios';

const API_BASE = '/api';

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request Interceptor: attach JWT ──
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response Interceptor: auto-refresh on 401 ──
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refresh = localStorage.getItem('refresh_token');

      if (refresh) {
        try {
          const { data } = await axios.post(`${API_BASE}/token/refresh/`, {
            refresh,
          });
          localStorage.setItem('access_token', data.access);
          originalRequest.headers.Authorization = `Bearer ${data.access}`;
          return client(originalRequest);
        } catch {
          // Refresh failed ─ clear tokens & redirect to login
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// ── API Functions ──

// Auth
export const registerUser             = (data) => client.post('/accounts/register/', data);
export const loginUser                = (data) => client.post('/accounts/login/', data);
export const getProfile               = ()     => client.get('/accounts/profile/');
export const getLanguagePreferences   = ()     => client.get('/accounts/language-preferences/');
export const saveLanguagePreferences  = (data) => client.post('/accounts/language-preferences/', data);

// Meetings
export const getMeetings = (params) => client.get('/meetings/', { params });
export const getMeeting = (id) => client.get(`/meetings/${id}/`);
export const getLiveStatus = (id) => client.get(`/meetings/${id}/live-status/`);
export const createMeeting = (data) => client.post('/meetings/', data);
export const deleteMeeting = (id) => client.delete(`/meetings/${id}/`);
export const startBot = (id) => client.post(`/meetings/${id}/start-bot/`);
export const endBot = (id) => client.post(`/meetings/${id}/end-bot/`);
export const reprocessMeeting = (id) => client.post(`/meetings/${id}/reprocess/`);

// Action Items
export const getActionItems = (params) => client.get('/meetings/action-items/', { params });
export const toggleActionItem = (id) => client.post(`/meetings/action-items/${id}/toggle-complete/`);
export const deleteActionItem = (id) => client.delete(`/meetings/action-items/${id}/`);
export const sendNotifications = (meetingId) => client.post(`/meetings/${meetingId}/send-notifications/`);

export default client;

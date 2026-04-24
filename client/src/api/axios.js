import axios from 'axios';

/**
 * Axios Instance Configuration
 * 
 * - baseURL: Points to the local API server.
 * - Request Interceptor: Injects the JWT from localStorage into every request.
 * - Response Interceptor: Automatically handles 401 Unauthorized by clearing 
 *   local storage and redirecting to the login page.
 */
const api = axios.create({
  baseURL: 'http://localhost:5005/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If we receive a 401, it means the token is invalid or expired
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Redirect to login only if not already there to prevent loops
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

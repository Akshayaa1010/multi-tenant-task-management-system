import { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext(null);

/**
 * AuthProvider Component
 * 
 * Manages the global authentication state:
 * - user: Decoded JWT payload (userId, orgId, role)
 * - token: The raw JWT string
 * 
 * Functions:
 * - login: Stores the token and updates state
 * - logout: Clears the token and updates state
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = () => {
      if (token) {
        try {
          const decoded = jwtDecode(token);
          
          // Check for expiration
          const currentTime = Date.now() / 1000;
          if (decoded.exp < currentTime) {
            logout();
          } else {
            setUser({
              userId: decoded.userId,
              orgId: decoded.orgId,
              role: decoded.role,
              name: decoded.name,
              email: decoded.email
            });
          }
        } catch (err) {
          console.error('Failed to decode token:', err);
          logout();
        }
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, [token]);

  const login = (newToken) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    login,
    logout,
    isAuthenticated: !!token && !!user,
    isLoading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * useAuth Hook
 * 
 * Custom hook to easily access auth state from any functional component.
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

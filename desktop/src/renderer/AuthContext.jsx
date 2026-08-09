import { createContext, useContext, useState, useEffect } from 'react';
import api from './api';
import { getApiUrl } from './settings';

const AuthContext = createContext(null);

function agentAvailable() {
  return typeof window !== 'undefined' && !!window.patelApp?.agent;
}

function agentSetCredentials(token) {
  if (agentAvailable()) {
    window.patelApp.agent.setCredentials(getApiUrl(), token);
  }
}

function agentClearCredentials() {
  if (agentAvailable()) {
    window.patelApp.agent.clearCredentials();
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');

      if (savedToken && savedUser) {
        try {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          const result = await api.get('/auth/profile');
          if (result.success) {
            setUser(result.data);
            localStorage.setItem('user', JSON.stringify(result.data));
          }
          agentSetCredentials(savedToken);
        } catch {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };
    initAuth();

    if (agentAvailable()) {
      return window.patelApp.agent.onAuthExpired(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
        window.location.hash = '#/login';
      });
    }
  }, []);

  const login = async (email, password) => {
    const result = await api.post('/auth/login', { email, password });
    if (result.success) {
      const { token: newToken, user: userData } = result.data;
      setToken(newToken);
      setUser(userData);
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));
      agentSetCredentials(newToken);
      return userData;
    }
    throw new Error(result.message || 'Login failed');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    agentClearCredentials();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        isAuthenticated: !!token && !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

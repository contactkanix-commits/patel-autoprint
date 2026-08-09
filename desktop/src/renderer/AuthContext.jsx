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

function storeSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  agentSetCredentials(token);
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  agentClearCredentials();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      let savedToken = localStorage.getItem('token');

      // If localStorage was cleared, fall back to the main-process credential
      // store so the app opens straight to the dashboard after activation.
      if (!savedToken && agentAvailable()) {
        const creds = await window.patelApp.agent.getCredentials();
        if (creds?.token) {
          savedToken = creds.token;
          localStorage.setItem('token', savedToken);
        }
      }

      if (savedToken) {
        try {
          setToken(savedToken);
          const result = await api.get('/auth/profile');
          if (result.success) {
            setUser(result.data);
            localStorage.setItem('user', JSON.stringify(result.data));
          }
          agentSetCredentials(savedToken);
        } catch {
          clearSession();
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };
    initAuth();

    if (agentAvailable()) {
      return window.patelApp.agent.onAuthExpired(() => {
        clearSession();
        setToken(null);
        setUser(null);
        window.location.hash = '#/activate';
      });
    }
  }, []);

  // One-time activation with the agent key provided by Patel AutoPrint.
  const activate = async (agentKey) => {
    const result = await api.post('/agent/key-login', { agentKey });
    if (result.success) {
      const { token: newToken, user: userData } = result.data;
      setToken(newToken);
      setUser(userData);
      storeSession(newToken, userData);
      return userData;
    }
    throw new Error(result.message || 'Activation failed');
  };

  const login = async (email, password) => {
    const result = await api.post('/auth/login', { email, password });
    if (result.success) {
      const { token: newToken, user: userData } = result.data;
      setToken(newToken);
      setUser(userData);
      storeSession(newToken, userData);
      return userData;
    }
    throw new Error(result.message || 'Login failed');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        activate,
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

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

function storeSession(token, user, subscription) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  if (subscription) {
    localStorage.setItem('subscription', JSON.stringify(subscription));
  }
  agentSetCredentials(token);
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('subscription');
  agentClearCredentials();
}

function loadStoredSubscription() {
  try {
    return JSON.parse(localStorage.getItem('subscription')) || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [subscription, setSubscription] = useState(loadStoredSubscription());
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
            const { subscription: sub, ...userData } = result.data;
            setUser(userData);
            setSubscription(sub || null);
            localStorage.setItem('user', JSON.stringify(userData));
            if (sub) {
              localStorage.setItem('subscription', JSON.stringify(sub));
            }
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
      const { token: newToken, user: userData, subscription: sub } = result.data;
      setToken(newToken);
      setUser(userData);
      setSubscription(sub || null);
      storeSession(newToken, userData, sub);
      return userData;
    }
    throw new Error(result.message || 'Activation failed');
  };

  const login = async (email, password) => {
    const result = await api.post('/auth/login', { email, password });
    if (result.success) {
      const { token: newToken, user: userData, subscription: sub } = result.data;
      setToken(newToken);
      setUser(userData);
      setSubscription(sub || null);
      storeSession(newToken, userData, sub);
      return userData;
    }
    throw new Error(result.message || 'Login failed');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setSubscription(null);
    clearSession();
  };

  // Refresh subscription status so countdown/suspension notices stay current.
  const refreshSubscription = useCallback(async () => {
    if (!token) return null;
    try {
      const result = await api.get('/auth/profile');
      if (result.success) {
        const sub = result.data?.subscription || null;
        setSubscription(sub);
        if (sub) {
          localStorage.setItem('subscription', JSON.stringify(sub));
        }
        return sub;
      }
    } catch {
      // ignore transient errors; next poll will retry
    }
    return null;
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const interval = setInterval(refreshSubscription, 5 * 60 * 1000);
    const onFocus = () => refreshSubscription();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [token, refreshSubscription]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        subscription,
        loading,
        activate,
        login,
        logout,
        refreshSubscription,
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

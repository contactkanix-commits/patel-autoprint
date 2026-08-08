import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Order {
  id: string;
  token: number;
  customerName: string;
  mobile: string;
  files: FileItem[];
  totalPages: number;
  copies: number;
  colorMode: 'bw' | 'color';
  paperSize: string;
  printStyle: 'single' | 'duplex';
  orientation: string;
  pageRange: string;
  nUp: number;
  price: number;
  payment: string;
  status: 'PENDING' | 'APPROVED' | 'PRINTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  assignedPrinter: string;
  createdAt: string;
  actions: string[];
}

export interface FileItem {
  id: string;
  originalName: string;
  fileType: string;
  size: number;
  pageCount: number;
  colorPageCount: number;
  orientation: string;
  settings: any;
}

export interface Printer {
  id: string;
  name: string;
  ip: string;
  colorSupport: boolean;
  duplexSupport: boolean;
  paperSizes: string[];
  status: 'ONLINE' | 'OFFLINE' | 'PRINTING' | 'ERROR' | 'PAUSED' | 'LOW_TONER';
  isDefault: boolean;
  priority: number;
  totalPrints: number;
  totalPages: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'success' | 'warning' | 'error' | 'info';
  message: string;
}

export interface DashboardStats {
  todayOrders: number;
  todayRevenue: number;
  pendingOrders: number;
  printingOrders: number;
  completedToday: number;
  totalCustomers: number;
  activePrinters: number;
  hourlyStats: { hour: number; count: number }[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  isRead: boolean;
  createdAt: string;
}

interface AppState {
  // Agent
  agentStatus: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  agentMessage: string;
  
  // Orders
  orders: Order[];
  selectedOrder: Order | null;
  ordersLoading: boolean;
  
  // Printers
  printers: Printer[];
  
  // Logs
  logs: LogEntry[];
  
  // Dashboard
  dashboardStats: DashboardStats | null;
  
  // Notifications
  notifications: Notification[];
  unreadCount: number;
  
  // Settings
  settings: {
    apiUrl: string;
    apiKey: string;
    machineName: string;
    autoStart: boolean;
    autoPrint: boolean;
    defaultPrinter: string;
    theme: 'light' | 'dark';
    language: 'en' | 'gu' | 'hi';
    shopId: string;
    shopName: string;
    machineId: string;
    activationKey: string;
  };
  
  // UI
  activeTab: string;
  sidebarOpen: boolean;
  
  // Actions
  setAgentStatus: (status: AppState['agentStatus'], message?: string) => void;
  setOrders: (orders: Order[]) => void;
  addOrder: (order: Order) => void;
  updateOrder: (id: string, updates: Partial<Order>) => void;
  removeOrder: (id: string) => void;
  setSelectedOrder: (order: Order | null) => void;
  setPrinters: (printers: Printer[]) => void;
  addPrinter: (printer: Printer) => void;
  updatePrinter: (id: string, updates: Partial<Printer>) => void;
  removePrinter: (id: string) => void;
  addLog: (log: Omit<LogEntry, 'id'>) => void;
  clearLogs: () => void;
  setDashboardStats: (stats: DashboardStats) => void;
  setNotifications: (notifications: Notification[]) => void;
  setUnreadCount: (count: number) => void;
  markNotificationRead: (id: string) => void;
  setSettings: (settings: Partial<AppState['settings']>) => void;
  setActiveTab: (tab: string) => void;
  setSidebarOpen: (open: boolean) => void;
  loadSettings: () => void;
  saveSettings: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      agentStatus: 'stopped',
      agentMessage: '',
      orders: [],
      selectedOrder: null,
      ordersLoading: false,
      printers: [],
      logs: [],
      dashboardStats: null,
      notifications: [],
      unreadCount: 0,
      settings: {
        apiUrl: 'https://patel-autoprint.onrender.com',
        apiKey: '',
        machineName: 'COUNTER-1',
        autoStart: true,
        autoPrint: false,
        defaultPrinter: '',
        theme: 'light',
        language: 'en',
        shopId: '',
        shopName: '',
        machineId: '',
        activationKey: '',
      },
      activeTab: 'print-queue',
      sidebarOpen: true,
      
      // Actions
      setAgentStatus: (status, message) => set({ agentStatus: status, agentMessage: message || '' }),
      
      setOrders: (orders) => set({ orders }),
      
      addOrder: (order) => set(state => ({ orders: [order, ...state.orders] })),
      
      updateOrder: (id, updates) => set(state => ({
        orders: state.orders.map(o => o.id === id ? { ...o, ...updates } : o),
        selectedOrder: state.selectedOrder?.id === id ? { ...state.selectedOrder, ...updates } : state.selectedOrder,
      })),
      
      removeOrder: (id) => set(state => ({
        orders: state.orders.filter(o => o.id !== id),
        selectedOrder: state.selectedOrder?.id === id ? null : state.selectedOrder,
      })),
      
      setSelectedOrder: (order) => set({ selectedOrder: order }),
      
      setPrinters: (printers) => set({ printers }),
      
      addPrinter: (printer) => set(state => ({ printers: [...state.printers, printer] })),
      
      updatePrinter: (id, updates) => set(state => ({
        printers: state.printers.map(p => p.id === id ? { ...p, ...updates } : p),
      })),
      
      removePrinter: (id) => set(state => ({
        printers: state.printers.filter(p => p.id !== id),
      })),
      
      addLog: (log) => set(state => ({
        logs: [{ ...log, id: crypto.randomUUID() }, ...state.logs].slice(0, 1000),
      })),
      
      clearLogs: () => set({ logs: [] }),
      
      setDashboardStats: (stats) => set({ dashboardStats: stats }),
      
      setNotifications: (notifications) => set({ notifications, unreadCount: notifications.filter(n => !n.isRead).length }),
      
      setUnreadCount: (count) => set({ unreadCount: count }),
      
      markNotificationRead: (id) => set(state => ({
        notifications: state.notifications.map(n => n.id === id ? { ...n, isRead: true } : n),
        unreadCount: Math.max(0, state.unreadCount - 1),
      })),
      
      setSettings: (settings) => set(state => ({ settings: { ...state.settings, ...settings } })),
      
      setActiveTab: (tab) => set({ activeTab: tab }),
      
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      
      loadSettings: () => {
        // Load from localStorage
        try {
          const saved = localStorage.getItem('app-settings');
          if (saved) {
            const parsed = JSON.parse(saved);
            set(state => ({ settings: { ...state.settings, ...parsed } }));
          }
        } catch {}
      },
      
      saveSettings: () => {
        const { settings } = get();
        localStorage.setItem('app-settings', JSON.stringify(settings));
      },
    }),
    { name: 'patel-autoprint-store', partialize: (state) => ({ settings: state.settings, activeTab: state.activeTab, sidebarOpen: state.sidebarOpen }) }
  )
);
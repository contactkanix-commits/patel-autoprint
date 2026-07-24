// Shared types for Patel AutoPrint
// These types are used across frontend, backend, and print agent

// ============================================
// ENUMS
// ============================================

export const ShopStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  TRIAL: 'TRIAL',
  INACTIVE: 'INACTIVE',
};

export const SubscriptionPlan = {
  TRIAL: 'TRIAL',
  STARTER: 'STARTER',
  PROFESSIONAL: 'PROFESSIONAL',
  ENTERPRISE: 'ENTERPRISE',
};

export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SHOP_OWNER: 'SHOP_OWNER',
  MANAGER: 'MANAGER',
  OPERATOR: 'OPERATOR',
};

export const OrderStatus = {
  UPLOADED: 'UPLOADED',
  PROCESSING: 'PROCESSING',
  WAITING_PAYMENT: 'WAITING_PAYMENT',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  APPROVED: 'APPROVED',
  HOLD: 'HOLD',
  PRINTING: 'PRINTING',
  COMPLETED: 'COMPLETED',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
};

export const PaymentStatus = {
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
};

export const PaperSize = {
  A4: 'A4',
  A3: 'A3',
  LEGAL: 'LEGAL',
  LETTER: 'LETTER',
  CUSTOM: 'CUSTOM',
};

export const Orientation = {
  AUTO: 'AUTO',
  PORTRAIT: 'PORTRAIT',
  LANDSCAPE: 'LANDSCAPE',
};

export const ColorMode = {
  AUTO: 'AUTO',
  BLACK_WHITE: 'BLACK_WHITE',
  COLOR: 'COLOR',
};

export const DuplexMode = {
  SINGLE: 'SINGLE',
  DUPLEX: 'DUPLEX',
};

export const PrinterCategory = {
  BW_LASER: 'BW_LASER',
  COLOR_LASER: 'COLOR_LASER',
  INKJET: 'INKJET',
  PHOTO: 'PHOTO',
  LARGE_FORMAT: 'LARGE_FORMAT',
};

export const PrinterStatus = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  PRINTING: 'PRINTING',
  ERROR: 'ERROR',
  LOW_TONER: 'LOW_TONER',
  LOW_PAPER: 'LOW_PAPER',
};

export const PaymentMethod = {
  UPI: 'UPI',
  CARD: 'CARD',
  CASH: 'CASH',
  NET_BANKING: 'NET_BANKING',
  WALLET: 'WALLET',
};

// ============================================
// CONSTANTS
// ============================================

export const SUPPORTED_FILE_TYPES = {
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

export const MAX_FILE_SIZE = 104857600; // 100MB

export const ORDER_STATUS_FLOW = [
  'UPLOADED',
  'PROCESSING',
  'WAITING_PAYMENT',
  'WAITING_APPROVAL',
  'APPROVED',
  'PRINTING',
  'COMPLETED',
];

export const N_UP_OPTIONS = [1, 2, 4, 6, 8, 9, 16];

export const PAPER_SIZES = ['A4', 'A3', 'LEGAL', 'LETTER'];

export const CURRENCIES = {
  INR: { symbol: '₹', name: 'Indian Rupee' },
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
};

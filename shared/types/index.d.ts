// Shared TypeScript types for Patel AutoPrint
// These types can be used by both frontend and backend

export interface Shop {
  id: string;
  name: string;
  ownerName: string;
  slug: string;
  address?: string;
  gstNumber?: string;
  contactNumber?: string;
  email?: string;
  logo?: string;
  theme?: Record<string, unknown>;
  currency: string;
  timeZone: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'INACTIVE';
  subscription: 'TRIAL' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  subscriptionExpiry?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  shopId: string;
  name: string;
  email: string;
  mobileNumber?: string;
  role: 'SUPER_ADMIN' | 'SHOP_OWNER' | 'MANAGER' | 'OPERATOR';
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Customer {
  id: string;
  shopId: string;
  name: string;
  mobileNumber: string;
  email?: string;
  address?: string;
  loyaltyPoints: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  publicOrderNumber: string;
  shopId: string;
  customerId: string;
  operatorId?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  estimatedCompletionTime?: number;
  customerNotes?: string;
  operatorNotes?: string;
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  printingAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

export type OrderStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'WAITING_PAYMENT'
  | 'WAITING_APPROVAL'
  | 'APPROVED'
  | 'HOLD'
  | 'PRINTING'
  | 'COMPLETED'
  | 'READY_FOR_PICKUP'
  | 'CANCELLED'
  | 'FAILED';

export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED' | 'PARTIALLY_REFUNDED';

export interface OrderFile {
  id: string;
  orderId: string;
  fileName: string;
  fileType: string;
  originalPath: string;
  convertedPdfPath?: string;
  previewPath?: string;
  thumbnailPath?: string;
  pageCount: number;
  portraitPages: number;
  landscapePages: number;
  colorPageCount: number;
  blankPageCount: number;
  isPasswordProtected: boolean;
  isCorrupted: boolean;
  imageResolution?: {
    width: number;
    height: number;
    density?: number;
  };
  fileSize: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrintInstruction {
  id: string;
  orderFileId: string;
  orderId: string;
  ruleName?: string;
  pageRange: string;
  paperSize: PaperSize;
  orientation: Orientation;
  colorMode: ColorMode;
  duplex: DuplexMode;
  copies: number;
  nUpLayout: number;
  scaling: number;
  bindingMargin: BindingMargin;
  watermark?: string;
  header?: string;
  footer?: string;
  finalSheetCount: number;
  assignedPrinterId?: string;
  processingStatus: ProcessingStatus;
  printReadyPdfPath?: string;
  previewPath?: string;
  priority: Priority;
  createdAt: Date;
  updatedAt: Date;
}

export type PaperSize = 'A4' | 'A3' | 'LEGAL' | 'LETTER' | 'CUSTOM';
export type Orientation = 'AUTO' | 'PORTRAIT' | 'LANDSCAPE';
export type ColorMode = 'AUTO' | 'BLACK_WHITE' | 'COLOR';
export type DuplexMode = 'SINGLE' | 'DUPLEX';
export type BindingMargin = 'NONE' | 'LEFT' | 'RIGHT' | 'TOP';
export type ProcessingStatus =
  | 'PENDING'
  | 'ANALYZING'
  | 'CONVERTING'
  | 'GENERATING_PREVIEW'
  | 'CALCULATING_PRICE'
  | 'GENERATING_PRINT_READY'
  | 'COMPLETED'
  | 'FAILED';
export type Priority = 'NORMAL' | 'HIGH' | 'URGENT';

export interface Printer {
  id: string;
  shopId: string;
  agentId?: string;
  name: string;
  displayName?: string;
  category: PrinterCategory;
  supportedPaperSizes: PaperSize[];
  duplexSupport: boolean;
  status: PrinterStatus;
  isDefault: boolean;
  priority: number;
  lastHeartbeat?: Date;
  lastSuccessfulPrint?: Date;
  currentQueueLength: number;
  createdAt: Date;
  updatedAt: Date;
}

export type PrinterCategory = 'BW_LASER' | 'COLOR_LASER' | 'INKJET' | 'PHOTO' | 'LARGE_FORMAT';
export type PrinterStatus = 'ONLINE' | 'OFFLINE' | 'PRINTING' | 'ERROR' | 'LOW_TONER' | 'LOW_PAPER';

export interface PricingRule {
  id: string;
  shopId: string;
  paperSize: PaperSize;
  colorMode: ColorMode;
  duplex: DuplexMode;
  perSheetPrice: number;
  perPagePrice?: number;
  minimumCharge: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PriceSnapshot {
  id: string;
  orderId: string;
  unitPrices: Record<string, unknown>;
  discounts?: Record<string, unknown>;
  taxes?: Record<string, unknown>;
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  finalTotal: number;
  createdAt: Date;
}

export interface Payment {
  id: string;
  orderId: string;
  method: PaymentMethod;
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  gatewayReference?: string;
  gatewayResponse?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentMethod = 'UPI' | 'CARD' | 'CASH' | 'NET_BANKING' | 'WALLET';

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DashboardStats {
  todayOrders: number;
  todayRevenue: number;
  waitingApproval: number;
  printingNow: number;
  completedToday: number;
  failedToday: number;
}

export interface FileAnalysis {
  pageCount: number;
  paperSize: string;
  portraitPages: number;
  landscapePages: number;
  colorPageCount: number;
  blankPageCount: number;
  imageResolution?: {
    width: number;
    height: number;
    density?: number;
  };
  unsupportedFonts: string[];
  isPasswordProtected: boolean;
  isCorrupted: boolean;
}

export interface PrintJob {
  id: string;
  printInstructionId: string;
  printerId: string;
  agentId: string;
  status: PrintJobStatus;
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type PrintJobStatus =
  | 'WAITING'
  | 'DOWNLOADING'
  | 'PREPARING'
  | 'READY'
  | 'PRINTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RETRY_PENDING';

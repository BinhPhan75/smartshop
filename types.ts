
export interface Product {
  id: string;
  name: string;
  description: string;
  purchasePrice: number;
  sellingPrice: number;
  stock: number;
  imageUrl: string;
  createdAt: number;
}

export interface CustomerInfo {
  fullName: string;
  address: string;
  idCard: string;
}

export interface Sale {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  purchasePrice: number;
  totalAmount: number;
  timestamp: number;
  customer?: CustomerInfo;
}

export type ViewState = 'dashboard' | 'list' | 'add' | 'scan' | 'detail' | 'settings' | 'reports';
export type UserRole = 'admin' | 'user';

export interface ScanResult {
  productId: string | null;
  confidence: number;
  suggestedName?: string;
  description?: string;
}

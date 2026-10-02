import type { Language, OrderStatus, StockStatus } from '@app/shared';

/**
 * The generated words of report exports, in the interface languages (the web
 * app sends its current language as `lang`). Only labels are translated —
 * names, SKUs, notes, and other user data are exported exactly as entered.
 * The web app uses the same words for the same statuses (docs/localization.md).
 */
export interface ExportLabels {
  sheet: { sales: string; orders: string; inventory: string };
  file: { sales: string; orders: string; inventory: string };
  column: {
    date: (timeZone: string) => string;
    created: (timeZone: string) => string;
    orderNumber: string;
    status: string;
    customer: string;
    company: string;
    warehouseCode: string;
    warehouse: string;
    units: string;
    revenue: string;
    currency: string;
    items: string;
    total: string;
    product: string;
    sku: string;
    category: string;
    quantity: string;
    minimumStock: string;
    stockStatus: string;
    productStatus: string;
    warehouseStatus: string;
  };
  orderStatus: Record<OrderStatus, string>;
  stockStatus: Record<StockStatus, string>;
  active: string;
  archived: string;
}

const en: ExportLabels = {
  sheet: { sales: 'Sales', orders: 'Orders', inventory: 'Inventory' },
  file: { sales: 'sales-report', orders: 'orders-report', inventory: 'inventory-report' },
  column: {
    date: (timeZone) => `Date (${timeZone})`,
    created: (timeZone) => `Created (${timeZone})`,
    orderNumber: 'Order number',
    status: 'Status',
    customer: 'Customer',
    company: 'Company',
    warehouseCode: 'Warehouse code',
    warehouse: 'Warehouse',
    units: 'Units',
    revenue: 'Revenue',
    currency: 'Currency',
    items: 'Items',
    total: 'Total',
    product: 'Product',
    sku: 'SKU',
    category: 'Category',
    quantity: 'Quantity',
    minimumStock: 'Minimum stock',
    stockStatus: 'Status',
    productStatus: 'Product status',
    warehouseStatus: 'Warehouse status',
  },
  orderStatus: {
    DRAFT: 'Draft',
    CONFIRMED: 'Confirmed',
    PROCESSING: 'Processing',
    SHIPPED: 'Shipped',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  },
  stockStatus: { IN_STOCK: 'In stock', LOW_STOCK: 'Low stock', OUT_OF_STOCK: 'Out of stock' },
  active: 'Active',
  archived: 'Archived',
};

const tr: ExportLabels = {
  sheet: { sales: 'Satışlar', orders: 'Siparişler', inventory: 'Envanter' },
  file: { sales: 'satis-raporu', orders: 'siparis-raporu', inventory: 'envanter-raporu' },
  column: {
    date: (timeZone) => `Tarih (${timeZone})`,
    created: (timeZone) => `Oluşturulma (${timeZone})`,
    orderNumber: 'Sipariş No',
    status: 'Durum',
    customer: 'Müşteri',
    company: 'Firma',
    warehouseCode: 'Depo kodu',
    warehouse: 'Depo',
    units: 'Adet',
    revenue: 'Ciro',
    currency: 'Para birimi',
    items: 'Kalem',
    total: 'Toplam',
    product: 'Ürün',
    sku: 'SKU',
    category: 'Kategori',
    quantity: 'Miktar',
    minimumStock: 'Minimum stok',
    stockStatus: 'Stok durumu',
    productStatus: 'Ürün durumu',
    warehouseStatus: 'Depo durumu',
  },
  orderStatus: {
    DRAFT: 'Taslak',
    CONFIRMED: 'Onaylandı',
    PROCESSING: 'İşleniyor',
    SHIPPED: 'Kargolandı',
    COMPLETED: 'Tamamlandı',
    CANCELLED: 'İptal edildi',
  },
  stockStatus: { IN_STOCK: 'Stokta', LOW_STOCK: 'Düşük stok', OUT_OF_STOCK: 'Stokta yok' },
  active: 'Aktif',
  archived: 'Arşivlendi',
};

export const EXPORT_LABELS: Record<Language, ExportLabels> = { en, tr };

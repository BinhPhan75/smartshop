
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, ViewState, UserRole, Sale, CustomerInfo } from './types';
import ProductForm from './ProductForm';
import CameraView from './CameraView';
import { searchProductByImage } from './geminiService';
import { 
  saveProductsToDB, 
  getProductsFromDB, 
  saveSaleToDB, 
  getSalesFromDB, 
  saveAllSalesToDB,
  updateProductInDB,
  exportBackup,
  manualSyncAll
} from './storageService';

const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [view, setView] = useState<ViewState>('admin_home');
  const [role, setRole] = useState<UserRole>('admin');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanningStatus, setScanningStatus] = useState<'idle' | 'processing'>('idle');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Tất cả');

  // Bán hàng modal
  const [isSelling, setIsSelling] = useState(false);
  const [sellQuantity, setSellQuantity] = useState(1);
  const [customer, setCustomer] = useState<CustomerInfo>({ fullName: '', address: '', idCard: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Báo cáo
  const [reportFrom, setReportFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [reportTo, setReportTo] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [p, s] = await Promise.all([getProductsFromDB(), getSalesFromDB()]);
        setProducts(p || []);
        setSales(s || []);
      } catch (e) { 
        console.error("Load Data Error:", e); 
      } finally { 
        setTimeout(() => setIsLoading(false), 800); 
      }
    };
    loadData();
  }, []);

  // Tự động sao lưu cục bộ khi có thay đổi danh sách (Trừ khi đang sync)
  useEffect(() => { 
    if (!isLoading && !isSyncing) { 
      saveProductsToDB(products); 
      saveAllSalesToDB(sales); 
    } 
  }, [products, sales, isLoading, isSyncing]);

  const formatCurrency = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

  const generateId = () => Math.random().toString(36).substring(2, 10).toUpperCase();

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const data = await manualSyncAll();
      setProducts(data.products);
      setSales(data.sales);
      alert("Đã đồng bộ dữ liệu mới nhất từ Supabase!");
    } catch (err) {
      alert("Lỗi đồng bộ đám mây. Vui lòng kiểm tra kết nối.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleProductSave = async (data: any) => {
    let updatedProducts;
    if (isEditing && selectedProduct) {
      updatedProducts = products.map(p => p.id === selectedProduct.id ? { ...p, ...data } : p);
    } else {
      const newProduct: Product = {
        ...data,
        id: generateId(),
        createdAt: Date.now()
      };
      updatedProducts = [newProduct, ...products];
    }
    
    setProducts(updatedProducts);
    await saveProductsToDB(updatedProducts);
    
    setIsEditing(false);
    setSelectedProduct(null);
    setView('inventory');
  };

  const handleSale = async () => {
    if (!selectedProduct) return;
    if (sellQuantity > selectedProduct.stock) return alert("Số lượng vượt quá tồn kho!");

    const newSale: Sale = {
      id: generateId(),
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      quantity: sellQuantity,
      sellingPrice: selectedProduct.sellingPrice,
      purchasePrice: selectedProduct.purchasePrice,
      totalAmount: selectedProduct.sellingPrice * sellQuantity,
      timestamp: Date.now(),
      customer: customer.fullName ? customer : undefined,
      status: 'success'
    };

    // Cập nhật State nhanh để phản hồi UI
    const updatedSales = [newSale, ...sales];
    const targetProduct = { ...selectedProduct, stock: selectedProduct.stock - sellQuantity };
    const updatedProducts = products.map(p => p.id === selectedProduct.id ? targetProduct : p);

    setSales(updatedSales);
    setProducts(updatedProducts);
    
    // Đồng bộ Cloud từng bước để tránh treo app
    try {
      const saleResult = await saveSaleToDB(newSale);
      const stockResult = await updateProductInDB(targetProduct);
      
      if (!saleResult.success || !stockResult.success) {
        console.warn("Lưu Local thành công nhưng Cloud thất bại. Dữ liệu sẽ được đồng bộ sau.");
      }
    } catch (e) {
      console.error("Sale Sync Error:", e);
    }

    setIsSelling(false);
    setSellQuantity(1);
    setCustomer({ fullName: '', address: '', idCard: '' });
    setSelectedProduct(null);
    alert("Bán hàng thành công!");
    setView('admin_home');
  };

  const dashboardStats = useMemo(() => {
    const todayStart = new Date().setHours(0,0,0,0);
    const todaySales = sales.filter(s => s.timestamp >= todayStart);
    return {
      revenueToday: todaySales.reduce((acc, s) => acc + s.totalAmount, 0),
      ordersToday: todaySales.length,
      totalInvestment: products.reduce((acc, p) => acc + (p.purchasePrice * p.stock), 0)
    };
  }, [sales, products]);

  const reportData = useMemo(() => {
    const fromDate = new Date(reportFrom).setHours(0, 0, 0, 0);
    const toDate = new Date(reportTo).setHours(23, 59, 59, 999);
    const filtered = sales.filter(s => s.timestamp >= fromDate && s.timestamp <= toDate);
    const revenue = filtered.reduce((sum, s) => sum + s.totalAmount, 0);
    const cost = filtered.reduce((sum, s) => sum + (s.purchasePrice * s.quantity), 0);
    return {
      filteredSales: filtered,
      revenue,
      profit: revenue - cost
    };
  }, [sales, reportFrom, reportTo]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (activeCategory !== 'Tất cả') result = result.filter(p => p.category === activeCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
    }
    return result;
  }, [products, activeCategory, searchQuery]);

  if (isLoading) return <div className="min-h-screen bg-[#020617] flex items-center justify-center text-blue-500 font-black tracking-widest animate-pulse text-xl uppercase">SmartShop Loading...</div>;

  return (
    <div className="min-h-screen pb-32 text-slate-200 bg-[#020617]">
      {/* HEADER */}
      {(view === 'admin_home' || view === 'pos' || view === 'inventory' || view === 'reports' || view === 'settings') && (
        <header className="p-6 pt-12 flex justify-between items-center bg-[#020617]/80 sticky top-0 z-40 border-b border-white/5 backdrop-blur-xl">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 overflow-hidden shadow-inner">
                 <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Admin" alt="avatar" />
              </div>
              <div>
                 <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Cửa hàng</p>
                 <h2 className="text-sm font-black text-white">Admin Store</h2>
              </div>
           </div>
           <div className="flex items-center gap-2">
              {isSyncing && <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping mr-2"></div>}
              <button onClick={() => setView('settings')} className="p-2.5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>
              </button>
           </div>
        </header>
      )}

      <main className="max-w-xl mx-auto px-6 pt-4">
        {view === 'admin_home' && (
          <div className="space-y-10 animate-slide-up pb-48">
             <div className="grid grid-cols-1 gap-4">
                <div className="bg-blue-600 rounded-[2.5rem] p-8 shadow-[0_20px_40px_-10px_rgba(37,99,235,0.4)]">
                   <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-1">Doanh thu hôm nay</p>
                   <h3 className="text-3xl font-black text-white tracking-tight">{formatCurrency(dashboardStats.revenueToday)}</h3>
                </div>
             </div>

             <section className="space-y-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-600 ml-1">Lối tắt</h3>
                <div className="grid grid-cols-2 gap-4">
                   <button onClick={() => setView('inventory')} className="glass-card p-6 rounded-[2rem] text-left hover:border-blue-500/50 active:scale-95 transition-all">
                      <div className="w-12 h-12 bg-amber-400/10 text-amber-400 rounded-2xl flex items-center justify-center mb-4"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg></div>
                      <h4 className="font-bold text-white text-[11px] mb-1 uppercase tracking-wider">Kho hàng</h4>
                   </button>
                   <button onClick={() => setView('pos')} className="glass-card p-6 rounded-[2rem] text-left hover:border-blue-500/50 active:scale-95 transition-all">
                      <div className="w-12 h-12 bg-emerald-400/10 text-emerald-400 rounded-2xl flex items-center justify-center mb-4"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" strokeWidth="2.5"></path></svg></div>
                      <h4 className="font-bold text-white text-[11px] mb-1 uppercase tracking-wider">Bán hàng</h4>
                   </button>
                </div>
             </section>

             <section className="space-y-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-600 ml-1">Đơn hàng mới</h3>
                <div className="space-y-4">
                   {sales.slice(0, 5).map(sale => (
                     <div key={sale.id} className="glass-card p-5 rounded-[1.5rem] flex items-center gap-4 border-none bg-slate-900/40">
                        <div className="flex-1 min-w-0">
                           <h5 className="text-[11px] font-black text-white uppercase truncate mb-0.5">{sale.productName}</h5>
                           <p className="text-[9px] text-slate-500 font-black">{new Date(sale.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {sale.customer?.fullName || "Khách lẻ"}</p>
                        </div>
                        <div className="text-right shrink-0">
                           <p className="text-sm font-black text-white">{formatCurrency(sale.totalAmount)}</p>
                        </div>
                     </div>
                   ))}
                </div>
             </section>

             <div className="pt-10 pb-4 text-center space-y-2 opacity-40">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Bản quyền phần mềm thuộc về BINHPHAN</p>
             </div>
          </div>
        )}

        {view === 'pos' && (
          <div className="space-y-8 animate-slide-up pb-48">
             <div className="relative">
                <input type="text" placeholder="Tìm tên sản phẩm..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full p-5 pl-14 bg-slate-900 border border-slate-800 rounded-[1.5rem] font-bold text-white outline-none focus:border-blue-500" />
                <svg className="w-6 h-6 absolute left-5 top-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
             </div>
             <div className="grid grid-cols-2 gap-4">
                {filteredProducts.map(p => (
                   <div key={p.id} className="glass-card rounded-[2.5rem] overflow-hidden flex flex-col h-full bg-slate-900/60 shadow-xl border-white/5">
                      <div className="relative h-44 overflow-hidden" onClick={() => { setSelectedProduct(p); setView('product_detail'); }}>
                         <img src={p.imageUrl} className="w-full h-full object-cover" alt={p.name} />
                      </div>
                      <div className="p-6 flex flex-col flex-1">
                         <h4 className="text-[11px] font-black text-white uppercase leading-tight mb-3 line-clamp-2">{p.name}</h4>
                         <div className="mt-auto flex justify-between items-end">
                            <p className="text-base font-black text-blue-500">{formatCurrency(p.sellingPrice)}</p>
                            <button onClick={() => { setSelectedProduct(p); setSellQuantity(1); setIsSelling(true); }} disabled={p.stock <= 0} className="p-3 bg-blue-600 text-white rounded-2xl active:scale-90">
                               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth="3"></path></svg>
                            </button>
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          </div>
        )}

        {view === 'inventory' && (
          <div className="space-y-8 animate-slide-up pb-48">
             <header className="flex justify-between items-center">
                <h2 className="text-lg font-black uppercase text-white tracking-widest">Kho hàng</h2>
                <button onClick={() => { setIsEditing(false); setSelectedProduct(null); setView('product_form'); }} className="p-3.5 bg-blue-600 text-white rounded-2xl shadow-2xl active:scale-90 transition-all">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth="3.5"></path></svg>
                </button>
             </header>
             <div className="space-y-4">
                {products.length === 0 ? (
                  <div className="py-20 text-center opacity-30 uppercase font-black text-[10px] tracking-widest">Chưa có sản phẩm nào</div>
                ) : products.map(p => (
                  <div key={p.id} className="glass-card p-4 rounded-[1.5rem] flex items-center gap-4 bg-slate-900/40 border-slate-800/50">
                     <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 border border-white/5">
                        <img src={p.imageUrl} className="w-full h-full object-cover" alt={p.name} />
                     </div>
                     <div className="flex-1 min-w-0" onClick={() => { setSelectedProduct(p); setView('product_detail'); }}>
                        <h4 className="text-[11px] font-black text-white uppercase truncate">{p.name}</h4>
                        <p className="text-[9px] text-slate-500 font-bold">Kho: {p.stock} • {formatCurrency(p.sellingPrice)}</p>
                     </div>
                     <button onClick={() => { setSelectedProduct(p); setIsEditing(true); setView('product_form'); }} className="p-3 text-slate-500 hover:text-blue-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="2.5"></path></svg></button>
                  </div>
                ))}
             </div>
          </div>
        )}

        {view === 'product_form' && (
           <ProductForm initialData={isEditing ? selectedProduct || undefined : undefined} existingProducts={products} onSave={handleProductSave} onCancel={() => setView('inventory')} />
        )}

        {view === 'product_detail' && selectedProduct && (
          <div className="space-y-10 animate-slide-up pb-80">
             <header className="flex justify-between items-center">
                <button onClick={() => setView('inventory')} className="p-3 bg-slate-900 border border-slate-800 rounded-2xl active:scale-90"><svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"></path></svg></button>
                <h2 className="text-lg font-black uppercase text-white tracking-widest">Chi tiết</h2>
                <button onClick={() => { setIsEditing(true); setView('product_form'); }} className="text-xs font-black text-blue-500 uppercase tracking-widest">Sửa</button>
             </header>
             
             <div className="aspect-square rounded-[3.5rem] overflow-hidden border-4 border-slate-900 shadow-2xl bg-slate-900">
                <img src={selectedProduct.imageUrl} className="w-full h-full object-cover" alt="product" />
             </div>
             
             <div className="space-y-6">
                <h2 className="text-3xl font-black text-white leading-tight">{selectedProduct.name}</h2>
                <div className="grid grid-cols-2 gap-4">
                   <div className="glass-card p-6 rounded-[2rem] bg-blue-900/10 border-blue-500/20 shadow-inner">
                      <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-2">Tồn kho</p>
                      <p className="text-3xl font-black text-white tabular-nums">{selectedProduct.stock}</p>
                   </div>
                   <div className="glass-card p-6 rounded-[2rem] bg-emerald-900/10 border-emerald-500/20 shadow-inner">
                      <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-2">Giá bán</p>
                      <p className="text-xl font-black text-white tabular-nums">{formatCurrency(selectedProduct.sellingPrice)}</p>
                   </div>
                </div>
                
                <div className="glass-card p-6 rounded-[2rem] bg-slate-900/40 border-none">
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Thông tin bổ sung</p>
                   <p className="text-sm font-bold text-slate-400">Giá nhập tham khảo: {formatCurrency(selectedProduct.purchasePrice)}</p>
                </div>
             </div>
             
             <div className="fixed bottom-0 left-0 right-0 p-8 pt-16 pb-12 bg-gradient-to-t from-[#020617] via-[#020617]/95 to-transparent z-50">
                <button 
                  onClick={() => { setSellQuantity(1); setIsSelling(true); }} 
                  disabled={selectedProduct.stock <= 0} 
                  className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] shadow-[0_20px_50px_-10px_rgba(37,99,235,0.5)] active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 11-8 0v4M5 9h14l1 12H4L5 9z" strokeWidth="2.5"></path></svg>
                   Tiến hành bán ngay
                </button>
             </div>
          </div>
        )}

        {view === 'reports' && (
          <div className="space-y-8 animate-slide-up pb-48">
             <header className="flex justify-between items-center mb-4">
                <button onClick={() => setView('admin_home')} className="p-3 bg-slate-900 border border-slate-800 rounded-2xl active:scale-90"><svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"></path></svg></button>
                <h2 className="text-lg font-black uppercase text-white tracking-widest">Báo cáo</h2>
                <div className="w-12"></div>
             </header>

             <section className="glass-card p-7 rounded-[2.5rem] space-y-6">
                <div className="grid grid-cols-2 gap-4">
                   <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-2 ml-1">Từ ngày</label><input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="w-full p-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs font-bold text-white" /></div>
                   <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-2 ml-1">Đến ngày</label><input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="w-full p-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs font-bold text-white" /></div>
                </div>
             </section>

             <div className="grid grid-cols-2 gap-4">
                <div className="glass-card p-7 rounded-[2.5rem] border-none bg-blue-600/10">
                   <p className="text-[9px] font-black text-slate-500 uppercase mb-2">Doanh thu</p>
                   <h3 className="text-xl font-black text-white">{formatCurrency(reportData.revenue)}</h3>
                </div>
                <div className="glass-card p-7 rounded-[2.5rem] border-none bg-emerald-600/10">
                   <p className="text-[9px] font-black text-slate-500 uppercase mb-2">Lợi nhuận</p>
                   <h3 className="text-xl font-black text-emerald-500">{formatCurrency(reportData.profit)}</h3>
                </div>
             </div>

             <section className="space-y-4">
                {reportData.filteredSales.map(sale => (
                  <div key={sale.id} className="glass-card p-4 rounded-[1.5rem] flex items-center gap-4 border-none bg-slate-900/40">
                     <div className="flex-1 min-w-0">
                        <h5 className="text-[11px] font-black text-white uppercase truncate">{sale.productName}</h5>
                        <p className="text-[9px] text-slate-500 font-bold">{new Date(sale.timestamp).toLocaleDateString('vi-VN')} • Khách: {sale.customer?.fullName || "Lẻ"}</p>
                     </div>
                     <div className="text-right">
                        <p className="text-xs font-black text-white">{formatCurrency(sale.totalAmount)}</p>
                     </div>
                  </div>
                ))}
             </section>
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-10 animate-slide-up pb-48">
             <header className="flex justify-between items-center">
                <button onClick={() => setView('admin_home')} className="p-3 bg-slate-900 border border-slate-800 rounded-2xl active:scale-90"><svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"></path></svg></button>
                <h2 className="text-lg font-black uppercase text-white tracking-widest">Hệ thống</h2>
                <div className="w-12"></div>
             </header>

             <div className="flex flex-col items-center">
                <div className="w-32 h-32 rounded-full border-4 border-slate-900 p-1 shadow-2xl overflow-hidden mb-4">
                   <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Admin" className="w-full h-full rounded-full bg-slate-800" alt="avatar" />
                </div>
                <h3 className="text-xl font-black text-white mb-1 uppercase tracking-tight">Admin Store</h3>
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">Enterprise Access</p>
             </div>

             <section className="space-y-4">
                <div className="glass-card rounded-[2.5rem] overflow-hidden border-slate-800/50 shadow-xl">
                   {/* Cloud Sync Section */}
                   <button onClick={handleManualSync} disabled={isSyncing} className={`w-full p-7 flex items-center justify-between hover:bg-white/5 transition-all ${isSyncing ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-5">
                         <div className="p-3 bg-blue-600/10 text-blue-500 rounded-2xl"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" strokeWidth="2.5"></path></svg></div>
                         <div className="text-left">
                           <h4 className="text-sm font-black text-white">Đồng bộ đám mây</h4>
                           <p className="text-[9px] font-bold text-slate-500 uppercase">{isSyncing ? 'Đang tải dữ liệu...' : 'Lấy dữ liệu từ Supabase'}</p>
                         </div>
                      </div>
                      <svg className={`w-5 h-5 text-slate-700 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth="2.5"></path></svg>
                   </button>
                   <div className="h-[1px] bg-white/5 mx-6"></div>
                   
                   <button onClick={exportBackup} className="w-full p-7 flex items-center justify-between hover:bg-white/5 transition-all">
                      <div className="flex items-center gap-5">
                         <div className="p-3 bg-emerald-600/10 text-emerald-500 rounded-2xl"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2.5"></path></svg></div>
                         <div className="text-left">
                           <h4 className="text-sm font-black text-white">Xuất Backup</h4>
                           <p className="text-[9px] font-bold text-slate-500 uppercase">Tải tệp tin .JSON</p>
                         </div>
                      </div>
                   </button>
                   <div className="h-[1px] bg-white/5 mx-6"></div>
                   
                   <button onClick={() => fileInputRef.current?.click()} className="w-full p-7 flex items-center justify-between hover:bg-white/5 transition-all">
                      <div className="flex items-center gap-5">
                         <div className="p-3 bg-indigo-600/10 text-indigo-500 rounded-2xl"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4-4m4 4v12" strokeWidth="2.5"></path></svg></div>
                         <h4 className="text-sm font-black text-white">Khôi phục tệp</h4>
                      </div>
                   </button>
                   <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={(e) => {
                       const file = e.target.files?.[0];
                       if (!file) return;
                       const reader = new FileReader();
                       reader.onload = async (ev) => {
                         try {
                           const data = JSON.parse(ev.target?.result as string);
                           if (data.products && data.sales) {
                             setProducts(data.products);
                             setSales(data.sales);
                             await saveProductsToDB(data.products);
                             await saveAllSalesToDB(data.sales);
                             alert("Đã khôi phục dữ liệu thành công!");
                           }
                         } catch (err) { alert("Lỗi tệp tin không đúng định dạng!"); }
                       };
                       reader.readAsText(file);
                    }} />
                </div>
             </section>

             <div className="text-center space-y-2">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest bg-white/5 py-4 rounded-3xl border border-white/5 mx-4">
                   Bản quyền phần mềm thuộc về BINHPHAN
                </p>
             </div>
          </div>
        )}
      </main>

      {/* Nav Bottom */}
      {!isScanning && (view === 'admin_home' || view === 'pos' || view === 'inventory' || view === 'reports' || view === 'settings') && (
        <nav className="fixed bottom-8 left-8 right-8 glass-card p-4 rounded-[2.5rem] z-[100] flex justify-around items-center border border-white/10 bg-slate-900/95 shadow-[0_40px_80px_-15px_rgba(0,0,0,0.8)]">
            <button onClick={() => setView('admin_home')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'admin_home' ? 'active-tab' : 'text-slate-500'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg><span className="text-[9px] font-black uppercase tracking-tighter">HOME</span></button>
            <button onClick={() => setView('inventory')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'inventory' ? 'active-tab' : 'text-slate-500'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg><span className="text-[9px] font-black uppercase tracking-tighter">KHO HÀNG</span></button>
            
            <div className="w-16 h-16 relative -top-8">
               <button onClick={() => setIsScanning(true)} className="absolute w-full h-full bg-blue-600 text-white rounded-[2.2rem] flex items-center justify-center shadow-[0_20px_45px_-5px_rgba(37,99,235,0.8)] border-[8px] border-[#020617] active:scale-90 transition-all">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.8" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
               </button>
            </div>

            <button onClick={() => setView('reports')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'reports' ? 'active-tab' : 'text-slate-500'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg><span className="text-[9px] font-black uppercase tracking-tighter">BÁO CÁO</span></button>
            <button onClick={() => setView('pos')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'pos' ? 'active-tab' : 'text-slate-500'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg><span className="text-[9px] font-black uppercase tracking-tighter">BÁN LẺ</span></button>
        </nav>
      )}

      {/* Sale Modal */}
      {isSelling && selectedProduct && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-2xl animate-in fade-in duration-300">
           <div className="bg-[#1e293b] w-full max-w-sm rounded-[3rem] overflow-hidden shadow-2xl border border-white/10 animate-in zoom-in-95 duration-300">
              <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5">
                 <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Xác nhận đơn</h3>
                 <button onClick={() => { setIsSelling(false); setSelectedProduct(null); }} className="p-2 bg-white/5 rounded-xl text-slate-500 hover:text-white transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg></button>
              </div>
              <div className="p-8 space-y-8">
                 <div className="text-center">
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] mb-2.5">Thanh toán</p>
                    <h4 className="text-lg font-black text-white uppercase leading-tight">{selectedProduct.name}</h4>
                 </div>
                 <div className="bg-slate-950/50 p-7 rounded-[2.5rem] border border-white/5 flex flex-col items-center shadow-inner">
                    <div className="flex items-center gap-8 mb-6">
                       <button onClick={() => setSellQuantity(Math.max(1, sellQuantity - 1))} className="w-14 h-14 rounded-[1.25rem] bg-slate-900 border border-white/5 text-white text-2xl font-black shadow-lg active:scale-90">-</button>
                       <span className="text-4xl font-black text-white tabular-nums tracking-tighter">{sellQuantity}</span>
                       <button onClick={() => setSellQuantity(Math.min(selectedProduct.stock, sellQuantity + 1))} className="w-14 h-14 rounded-[1.25rem] bg-blue-600 text-white text-2xl font-black shadow-lg shadow-blue-500/20 active:scale-90">+</button>
                    </div>
                    <div className="text-center">
                       <p className="text-2xl font-black text-blue-500 tracking-tighter">{formatCurrency(selectedProduct.sellingPrice * sellQuantity)}</p>
                    </div>
                 </div>
                 <div className="space-y-4">
                    <input type="text" placeholder="Tên khách hàng" value={customer.fullName} onChange={e => setCustomer({...customer, fullName: e.target.value})} className="w-full p-5 bg-slate-950 border border-slate-800 rounded-2xl text-[11px] font-bold outline-none focus:border-blue-500 text-white shadow-inner" />
                 </div>
                 <button onClick={handleSale} className="w-full py-6 bg-blue-600 text-white rounded-[1.75rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-blue-500/30 active:scale-95 transition-all">Hoàn tất giao dịch</button>
              </div>
           </div>
        </div>
      )}

      {/* AI Processing Overlay */}
      {scanningStatus === 'processing' && (
         <div className="fixed inset-0 z-[2000] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center">
            <div className="w-20 h-20 border-[6px] border-blue-600 border-t-transparent rounded-full animate-spin mb-10 shadow-[0_0_40px_rgba(37,99,235,0.4)]"></div>
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.5em] animate-pulse">Smart Scan Processing...</p>
         </div>
      )}

      {/* Camera View */}
      {isScanning && (
         <CameraView title="AI VISUAL SEARCH" onClose={() => setIsScanning(false)} onCapture={async (base64) => {
            setIsScanning(false); setScanningStatus('processing');
            try {
               const result = await searchProductByImage(base64, products);
               if (result.productId) {
                  const found = products.find(p => p.id === result.productId);
                  if (found) { setSelectedProduct(found); setView('product_detail'); }
               } else if (result.suggestedName) {
                  setSearchQuery(result.suggestedName); setView('pos');
               } else { alert("Không tìm thấy sản phẩm này trong kho."); }
            } catch (e) { console.error(e); } finally { setScanningStatus('idle'); }
         }} />
      )}
    </div>
  );
};

export default App;

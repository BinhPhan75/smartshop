
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, ViewState, UserRole, Sale, CustomerInfo } from './types';
import ProductForm from './ProductForm';
import CameraView from './CameraView';
import { searchProductByImage } from './geminiService';
import { 
  saveProductsToDB, 
  getProductsFromDB, 
  calculateStorageSize, 
  saveSaleToDB, 
  getSalesFromDB, 
  saveAllSalesToDB,
  exportBackup
} from './storageService';

const removeAccents = (str: string): string => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
};

const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [view, setView] = useState<ViewState>('dashboard');
  const [role, setRole] = useState<UserRole>('user');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanningStatus, setScanningStatus] = useState<'idle' | 'processing'>('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [productFilterId, setProductFilterId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [logoClicks, setLogoClicks] = useState(0);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  
  // Bán hàng
  const [isSelling, setIsSelling] = useState(false);
  const [sellQuantity, setSellQuantity] = useState(1);
  const [customer, setCustomer] = useState<CustomerInfo>({ fullName: '', address: '', idCard: '' });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Báo cáo
  const now = new Date();
  const [reportFrom, setReportFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
  const [reportTo, setReportTo] = useState(now.toISOString().split('T')[0]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedProducts, savedSales] = await Promise.all([getProductsFromDB(), getSalesFromDB()]);
        setProducts(savedProducts || []);
        setSales(savedSales || []);
        const savedRole = localStorage.getItem('userRole') as UserRole;
        if (savedRole) setRole(savedRole);
      } catch (e) { 
        console.error("Initial Data Load Error:", e); 
      } finally { 
        setTimeout(() => setIsLoading(false), 800); 
      }
    };
    loadData();
  }, []);

  // Sync Debounce Logic
  const syncTimeoutRef = useRef<any>(null);
  useEffect(() => {
    if (!isLoading) {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        saveProductsToDB(products);
        saveAllSalesToDB(sales);
      }, 2000);
    }
  }, [products, sales, isLoading]);

  const stats = useMemo(() => ({
    count: products.length,
    totalItems: products.reduce((acc, p) => acc + (Number(p.stock) || 0), 0),
    investment: products.reduce((acc, p) => acc + ((Number(p.purchasePrice) || 0) * (Number(p.stock) || 0)), 0),
  }), [products]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = removeAccents(searchQuery);
    return products.filter(p => removeAccents(`${p.name} ${p.id}`).includes(q));
  }, [products, searchQuery]);

  const soldProductsList = useMemo(() => {
    const unique = new Map<string, string>();
    sales.forEach(s => { if (!unique.has(s.productId)) unique.set(s.productId, s.productName); });
    return Array.from(unique.entries()).map(([id, name]) => ({ id, name }));
  }, [sales]);

  const reportData = useMemo(() => {
    const start = new Date(reportFrom); start.setHours(0, 0, 0, 0);
    const end = new Date(reportTo); end.setHours(23, 59, 59, 999);
    
    let filtered = sales.filter(s => s.timestamp >= start.getTime() && s.timestamp <= end.getTime());
    
    if (customerSearchQuery.trim()) {
      const cq = removeAccents(customerSearchQuery);
      filtered = filtered.filter(s => 
        (s.customer?.fullName && removeAccents(s.customer.fullName).includes(cq)) ||
        (s.customer?.idCard && removeAccents(s.customer.idCard).includes(cq))
      );
    }

    if (productFilterId) filtered = filtered.filter(s => s.productId === productFilterId);

    const revenue = filtered.reduce((acc, s) => acc + (Number(s.totalAmount) || 0), 0);
    const cost = filtered.reduce((acc, s) => acc + ((Number(s.purchasePrice) || 0) * (Number(s.quantity) || 0)), 0);
    
    return {
      sales: filtered.sort((a, b) => b.timestamp - a.timestamp),
      revenue, 
      cost,
      profit: revenue - cost, 
      count: filtered.length
    };
  }, [sales, reportFrom, reportTo, customerSearchQuery, productFilterId]);

  const startSelling = (p: Product) => {
    setSelectedProduct(p);
    setSellQuantity(1);
    setIsSelling(true);
  };

  const handleConfirmSale = () => {
    if (!selectedProduct) return;
    if (!customer.fullName.trim()) return alert("Vui lòng nhập tên khách hàng.");

    const newSale: Sale = {
      id: crypto.randomUUID(),
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      quantity: sellQuantity,
      sellingPrice: selectedProduct.sellingPrice,
      purchasePrice: selectedProduct.purchasePrice,
      totalAmount: selectedProduct.sellingPrice * sellQuantity,
      timestamp: Date.now(),
      customer: { ...customer }
    };

    saveSaleToDB(newSale); // Sync single sale to DB
    setSales(prev => [newSale, ...prev]);
    setProducts(prev => prev.map(p => p.id === selectedProduct.id ? { ...p, stock: p.stock - sellQuantity } : p));
    
    setIsSelling(false);
    setCustomer({ fullName: '', address: '', idCard: '' });
    alert("Giao dịch thành công!");
    setView('dashboard');
  };

  const handlePinInput = (digit: string) => {
    const nextPin = enteredPin + digit;
    if (nextPin.length <= 4) {
      setEnteredPin(nextPin);
      if (nextPin.length === 4) {
        if (nextPin === '1234') { 
          setRole('admin');
          localStorage.setItem('userRole', 'admin');
          setShowLoginModal(false);
          setEnteredPin('');
        } else {
          alert('Mã PIN sai!');
          setEnteredPin('');
        }
      }
    }
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

  if (isLoading) return (
    <div className="min-h-screen bg-indigo-600 flex flex-col items-center justify-center text-white p-10 text-center">
      <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mb-8"></div>
      <h1 className="text-3xl font-black tracking-tighter mb-2">SMARTSHOP</h1>
      <p className="text-xs font-bold opacity-60 uppercase tracking-widest animate-pulse">Đang tải dữ liệu từ Cloud...</p>
    </div>
  );

  return (
    <div className={`min-h-screen ${role === 'admin' ? 'bg-slate-50' : 'bg-white'} pb-24 font-sans selection:bg-indigo-100`}>
      <header className="bg-indigo-600 text-white p-6 pt-12 rounded-b-[2.5rem] shadow-xl sticky top-0 z-40">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <div onClick={() => { setLogoClicks(c => c + 1); if(logoClicks === 4) { setShowLoginModal(true); setLogoClicks(0); } }} className="cursor-pointer active:scale-95 transition-transform">
            <h1 className="text-xl font-black tracking-tighter">SMARTSHOP</h1>
            <p className="text-[9px] font-bold opacity-70 uppercase tracking-widest">{role === 'admin' ? 'QUẢN TRỊ VIÊN' : 'NHÂN VIÊN'}</p>
          </div>
          <button onClick={() => setIsScanning(true)} className="bg-white/20 p-3 rounded-2xl border border-white/10 active:scale-90 transition-all">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-5 space-y-6">
        {view === 'dashboard' && (
          <>
            <div className="relative group">
              <input type="text" placeholder="Tìm tên hoặc mã hàng..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full p-4 pl-12 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-medium transition-all" />
              <svg className="w-5 h-5 absolute left-4 top-4 text-slate-300 group-focus-within:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            
            <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
               <div className="relative z-10">
                  <p className="text-[10px] font-black opacity-60 uppercase mb-1 tracking-widest">{role === 'admin' ? 'VỐN ĐẦU TƯ TỔNG' : 'TỔNG MẶT HÀNG'}</p>
                  <h2 className="text-3xl font-black mb-6 tracking-tight">{role === 'admin' ? formatCurrency(stats.investment) : `${stats.totalItems} Sản phẩm`}</h2>
                  <div className="flex gap-8">
                    <div><p className="text-[9px] font-bold opacity-60 uppercase mb-1 tracking-wider">Mặt hàng</p><p className="font-black text-xl">{stats.count}</p></div>
                    <div><p className="text-[9px] font-bold opacity-60 uppercase mb-1 tracking-wider">Tổng tồn</p><p className="font-black text-xl">{stats.totalItems}</p></div>
                  </div>
               </div>
               <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-700"></div>
            </div>

            {role === 'admin' && (
              <button onClick={() => { setIsEditing(false); setView('add'); }} className="w-full py-5 bg-white border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-black uppercase text-[10px] tracking-[0.2em] hover:border-indigo-500 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all active:scale-[0.98]">+ NHẬP HÀNG MỚI</button>
            )}
            
            <div className="grid grid-cols-1 gap-4">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-20 opacity-20"><p className="font-black text-xs uppercase tracking-widest">Không có dữ liệu</p></div>
              ) : filteredProducts.map(p => (
                <div key={p.id} className="bg-white p-4 rounded-[2rem] border border-slate-100 flex items-center space-x-4 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all group">
                  <div onClick={() => { setSelectedProduct(p); setView('detail'); }} className="flex flex-1 items-center space-x-4 cursor-pointer min-w-0">
                    <img src={p.imageUrl} className="w-16 h-16 rounded-[1.25rem] object-cover bg-slate-50 group-hover:scale-105 transition-transform" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-slate-800 uppercase text-[11px] truncate leading-none mb-1.5">{p.name}</h4>
                      <div className="flex flex-col gap-0.5">
                        {role === 'admin' && (
                          <p className="text-[8px] font-bold text-slate-400 uppercase">Vốn: <span className="text-slate-600 font-black">{formatCurrency(p.purchasePrice)}</span></p>
                        )}
                        <p className="text-indigo-600 font-black text-sm">{formatCurrency(p.sellingPrice)}</p>
                      </div>
                      <div className="mt-1.5">
                         <span className={`text-[8px] font-black px-2.5 py-1 rounded-full border ${p.stock < 5 ? 'bg-red-50 text-red-500 border-red-100 animate-pulse' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>TỒN KHO: {p.stock}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); startSelling(p); }} disabled={p.stock <= 0} className={`p-4 rounded-2xl shadow-lg border transition-all active:scale-90 ${p.stock > 0 ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-100' : 'bg-slate-50 text-slate-200 border-slate-100'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 11-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {view === 'reports' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-10 duration-500">
             <div className="bg-white rounded-[2.5rem] p-6 shadow-xl border border-slate-100">
                <h2 className="text-sm font-black uppercase mb-8 tracking-widest text-slate-400 flex items-center gap-3">
                   <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                   BÁO CÁO KINH DOANH
                </h2>
                
                <div className="grid grid-cols-2 gap-4 mb-6 bg-slate-50 p-5 rounded-3xl border border-slate-100">
                  <div><label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1">Từ ngày</label><input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="w-full p-3 bg-white rounded-xl border border-slate-200 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-indigo-500/20" /></div>
                  <div><label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1">Đến ngày</label><input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="w-full p-3 bg-white rounded-xl border border-slate-200 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-indigo-500/20" /></div>
                </div>

                <div className="space-y-3 mb-8">
                   <select value={productFilterId} onChange={e => setProductFilterId(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none font-bold text-xs appearance-none">
                      <option value="">Tất cả mặt hàng</option>
                      {soldProductsList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                   </select>
                   <input type="text" placeholder="Tìm theo tên khách hàng..." value={customerSearchQuery} onChange={e => setCustomerSearchQuery(e.target.value)} className="w-full p-4 bg-indigo-50/30 border border-indigo-100 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none font-bold text-xs" />
                </div>

                <div className="grid grid-cols-1 gap-4 mb-8">
                  <div className="p-7 bg-slate-900 rounded-[2rem] text-white shadow-xl">
                    <p className="text-[10px] font-black opacity-40 uppercase mb-1 tracking-[0.2em]">TỔNG DOANH THU</p>
                    <h3 className="text-3xl font-black tracking-tight">{formatCurrency(reportData.revenue)}</h3>
                  </div>
                  {role === 'admin' && (
                    <div className="p-7 bg-emerald-600 rounded-[2rem] text-white shadow-xl animate-in zoom-in-95 duration-700">
                      <p className="text-[10px] font-black opacity-40 uppercase mb-1 tracking-[0.2em]">LỢI NHUẬN RÒ</p>
                      <h3 className="text-3xl font-black tracking-tight">{formatCurrency(reportData.profit)}</h3>
                    </div>
                  )}
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                   {reportData.sales.length === 0 ? (
                      <p className="text-center py-10 text-[10px] font-black text-slate-200 uppercase tracking-widest">Không có giao dịch</p>
                   ) : reportData.sales.map(s => (
                    <div key={s.id} className="p-5 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col gap-1.5 active:bg-slate-100 transition-colors">
                       <div className="flex justify-between items-start">
                          <p className="font-black text-slate-800 uppercase text-[10px] truncate max-w-[180px]">{s.productName}</p>
                          <p className="font-black text-indigo-600 text-xs">{formatCurrency(s.totalAmount)}</p>
                       </div>
                       <div className="flex justify-between items-center text-[8px] font-bold">
                          <span className="text-slate-400 uppercase bg-white px-2 py-0.5 rounded-full shadow-sm">{new Date(s.timestamp).toLocaleDateString()} • {s.quantity} SP</span>
                          <span className="text-slate-900 bg-indigo-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">{s.customer?.fullName || "K.LẺ"}</span>
                       </div>
                    </div>
                   ))}
                </div>
             </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 space-y-10 animate-in slide-in-from-bottom-10 duration-500">
             <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">HỆ THỐNG</h2>
             
             <section className="space-y-5">
                <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">CẤP BẬC TRUY CẬP</h3>
                <div className="grid grid-cols-2 gap-4">
                   <button onClick={() => { setRole('user'); localStorage.setItem('userRole', 'user'); setView('dashboard'); }} className={`py-5 rounded-2xl font-black text-[10px] uppercase border transition-all active:scale-95 ${role === 'user' ? 'bg-slate-900 text-white shadow-xl shadow-slate-200' : 'bg-white text-slate-300 border-slate-100'}`}>NHÂN VIÊN</button>
                   <button onClick={() => { if(role !== 'admin') setShowLoginModal(true); }} className={`py-5 rounded-2xl font-black text-[10px] uppercase border transition-all active:scale-95 ${role === 'admin' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'bg-white text-slate-300 border-slate-100'}`}>QUẢN TRỊ</button>
                </div>
             </section>

             {role === 'admin' && (
               <section className="space-y-5 pt-8 border-t border-slate-100 animate-in fade-in duration-1000">
                  <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">QUẢN TRỊ DỮ LIỆU</h3>
                  <div className="space-y-4">
                    <button onClick={exportBackup} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2.5"></path></svg>
                      XUẤT FILE SAO LƯU (.JSON)
                    </button>
                    
                    <button onClick={() => fileInputRef.current?.click()} className="w-full py-5 bg-white border-2 border-indigo-100 text-indigo-600 rounded-2xl font-black text-[11px] uppercase active:scale-95 transition-all hover:bg-indigo-50">
                      KHÔI PHỤC TỪ FILE
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={(e) => {
                       const file = e.target.files?.[0];
                       if (!file) return;
                       const reader = new FileReader();
                       reader.onload = (ev) => {
                         try {
                           const data = JSON.parse(ev.target?.result as string);
                           if (data.products && data.sales) {
                             setProducts(data.products);
                             setSales(data.sales);
                             alert("Dữ liệu đã được khôi phục thành công!");
                           }
                         } catch (err) { alert("File sao lưu không hợp lệ!"); }
                       };
                       reader.readAsText(file);
                    }} />
                  </div>
               </section>
             )}
          </div>
        )}

        <div className="text-center pt-16 pb-6">
           <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.4em] opacity-40">
             SmartShop • Bản quyền thuộc về binhphan
           </p>
        </div>
      </main>

      {/* Nav Bottom */}
      {view !== 'add' && view !== 'detail' && !isScanning && (
        <nav className="fixed bottom-6 left-6 right-6 bg-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.15)] p-4 rounded-[2.5rem] z-30 flex justify-around items-center border border-slate-100">
            <button onClick={() => setView('dashboard')} className={`flex flex-col items-center gap-1.5 transition-colors ${view === 'dashboard' ? 'text-indigo-600' : 'text-slate-300'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg><span className="text-[8px] font-black uppercase tracking-tighter">KHO</span></button>
            <button onClick={() => setView('reports')} className={`flex flex-col items-center gap-1.5 transition-colors ${view === 'reports' ? 'text-indigo-600' : 'text-slate-300'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg><span className="text-[8px] font-black uppercase tracking-tighter">BÁO CÁO</span></button>
            <div className="w-14"></div>
            <button onClick={() => setView('settings')} className={`flex flex-col items-center gap-1.5 transition-colors ${view === 'settings' ? 'text-indigo-600' : 'text-slate-300'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg><span className="text-[8px] font-black uppercase tracking-tighter">HỆ THỐNG</span></button>
            
            {/* Scan Button Center */}
            <button onClick={() => setIsScanning(true)} className="absolute left-1/2 -translate-x-1/2 -top-10 w-22 h-22 bg-indigo-600 text-white rounded-[2.5rem] flex items-center justify-center shadow-2xl border-[10px] border-slate-50 active:scale-90 transition-all z-40">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
            </button>
        </nav>
      )}

      {/* BÁN HÀNG MODAL */}
      {isSelling && selectedProduct && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/90 flex items-center justify-center p-6 backdrop-blur-md">
            <div className="bg-white w-full max-w-sm rounded-[3rem] overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-300 shadow-2xl">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">BÁN HÀNG</h3>
                   <button onClick={() => setIsSelling(false)} className="text-slate-300 p-2 hover:text-red-500 transition-colors"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                </div>
                <div className="p-8 space-y-8 text-center">
                    <div className="space-y-2">
                       <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">SẢN PHẨM</p>
                       <h4 className="text-lg font-black uppercase text-slate-900 leading-tight">{selectedProduct.name}</h4>
                    </div>
                    
                    <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 flex flex-col items-center">
                        <div className="flex items-center gap-8 mb-8">
                            <button onClick={() => setSellQuantity(Math.max(1, sellQuantity - 1))} className="w-14 h-14 bg-white rounded-2xl text-2xl font-black shadow-sm border border-slate-100 active:scale-90 transition-all">-</button>
                            <span className="text-5xl font-black w-20 tabular-nums">{sellQuantity}</span>
                            <button onClick={() => setSellQuantity(Math.min(selectedProduct.stock, sellQuantity + 1))} className="w-14 h-14 bg-white rounded-2xl text-2xl font-black shadow-sm border border-slate-100 active:scale-90 transition-all">+</button>
                        </div>
                        <div className="pt-6 border-t border-slate-200 w-full">
                           <p className="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">THÀNH TIỀN</p>
                           <p className="text-3xl font-black text-indigo-600">{formatCurrency(selectedProduct.sellingPrice * sellQuantity)}</p>
                        </div>
                    </div>

                    <input type="text" placeholder="Họ tên khách hàng *" value={customer.fullName} onChange={e => setCustomer({...customer, fullName: e.target.value})} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm text-center" />
                    
                    <button onClick={handleConfirmSale} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-indigo-100 active:scale-95 transition-all">XÁC NHẬN BÁN</button>
                </div>
            </div>
        </div>
      )}

      {/* LOGIN MODAL */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[1100] bg-slate-900/95 flex items-center justify-center p-8 backdrop-blur-xl">
           <div className="bg-white rounded-[3rem] p-12 w-full max-w-xs text-center shadow-2xl relative animate-in zoom-in-95">
              <button onClick={() => { setShowLoginModal(false); setEnteredPin(''); }} className="absolute top-8 right-8 text-slate-300"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg></button>
              <h2 className="text-xs font-black uppercase mb-10 text-slate-400 tracking-[0.3em]">PIN QUẢN TRỊ</h2>
              <div className="flex justify-center gap-4 mb-10">
                {[0,1,2,3].map(i => <div key={i} className={`w-4 h-4 rounded-full border-2 border-indigo-600 transition-all duration-300 ${enteredPin.length > i ? 'bg-indigo-600 scale-110' : 'bg-transparent'}`}></div>)}
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[1,2,3,4,5,6,7,8,9,0].map(n => <button key={n} onClick={() => handlePinInput(n.toString())} className="w-full aspect-square bg-slate-50 rounded-2xl text-xl font-black active:bg-indigo-600 active:text-white transition-all shadow-sm border border-slate-100">{n}</button>)}
              </div>
           </div>
        </div>
      )}

      {/* LOADING AI OVERLAY */}
      {scanningStatus === 'processing' && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/95 flex flex-col items-center justify-center text-white backdrop-blur-xl">
            <div className="relative w-24 h-24 mb-10">
                <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h3 className="text-xs font-black uppercase tracking-[0.4em] italic animate-pulse text-indigo-400">AI ĐANG NHẬN DIỆN...</h3>
            <p className="text-[10px] font-bold opacity-30 mt-4 uppercase tracking-widest">Vui lòng giữ điện thoại ổn định</p>
        </div>
      )}

      {isScanning && <CameraView title="QUÉT SẢN PHẨM AI" onClose={() => setIsScanning(false)} onCapture={async (base64) => {
        setIsScanning(false); setScanningStatus('processing');
        try {
          const result = await searchProductByImage(base64, products);
          if (result.productId) {
            const found = products.find(p => p.id === result.productId);
            if (found) { setSelectedProduct(found); setView('detail'); }
          } else if (result.suggestedName) {
            setSearchQuery(result.suggestedName); setView('dashboard');
          } else { alert("AI không nhận ra mặt hàng này. Hãy thử chụp rõ nhãn hiệu hơn."); }
        } catch (e: any) { alert(e.message); } finally { setScanningStatus('idle'); }
      }} />}
      
      {view === 'add' && <ProductForm initialData={isEditing ? selectedProduct || undefined : undefined} existingProducts={products} onSave={(data) => {
        if (isEditing && selectedProduct) { setProducts(prev => prev.map(p => p.id === selectedProduct.id ? { ...p, ...data } : p)); setIsEditing(false); }
        else { setProducts(prev => [...prev, { ...data, id: crypto.randomUUID().split('-')[0].toUpperCase(), createdAt: Date.now() }]); }
        setView('dashboard');
      }} onCancel={() => setView('dashboard')} />}

      {view === 'detail' && selectedProduct && (
        <div className="p-5 animate-in slide-in-from-bottom-10 duration-500">
           <div className="bg-white rounded-[3rem] overflow-hidden shadow-2xl border border-slate-100 max-w-lg mx-auto">
              <div className="relative h-80 overflow-hidden">
                <img src={selectedProduct.imageUrl} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent"></div>
                <button onClick={() => setView('dashboard')} className="absolute top-8 left-8 bg-white/90 backdrop-blur p-4 rounded-2xl shadow-xl active:scale-90 transition-transform"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path></svg></button>
              </div>
              <div className="p-10 -mt-8 relative bg-white rounded-t-[3rem] space-y-8">
                <div className="space-y-2">
                   <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em]">THÔNG TIN CHI TIẾT</p>
                   <h2 className="text-2xl font-black uppercase text-slate-900 leading-tight">{selectedProduct.name}</h2>
                </div>
                
                <div className="grid grid-cols-2 gap-5">
                  <div className="p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100/50 overflow-hidden flex flex-col justify-center min-h-[90px]">
                    <p className="text-[9px] font-black text-indigo-400 uppercase mb-1.5 tracking-wider shrink-0">GIÁ BÁN LẺ</p>
                    <p className={`font-black text-indigo-900 whitespace-nowrap leading-none transition-all ${
                      formatCurrency(selectedProduct.sellingPrice).length > 15 ? 'text-[10px]' : 
                      formatCurrency(selectedProduct.sellingPrice).length > 12 ? 'text-sm' : 'text-lg'
                    }`}>
                      {formatCurrency(selectedProduct.sellingPrice)}
                    </p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 overflow-hidden flex flex-col justify-center min-h-[90px]">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1.5 tracking-wider shrink-0">TỒN KHO</p>
                    <p className={`font-black text-slate-800 whitespace-nowrap leading-none transition-all ${
                      (selectedProduct.stock.toString() + " SP").length > 10 ? 'text-sm' : 'text-lg'
                    }`}>
                      {selectedProduct.stock} <span className="text-[10px] font-bold text-slate-400">SP</span>
                    </p>
                  </div>
                </div>

                <div className="space-y-4 pt-4">
                  <button onClick={() => startSelling(selectedProduct)} disabled={selectedProduct.stock <= 0} className={`w-full py-6 rounded-2xl font-black uppercase text-xs tracking-[0.3em] shadow-xl active:scale-[0.98] transition-all ${selectedProduct.stock > 0 ? 'bg-indigo-600 text-white shadow-indigo-100' : 'bg-slate-100 text-slate-300'}`}>BÁN NGAY</button>
                  {role === 'admin' && (
                    <button onClick={() => { setIsEditing(true); setView('add'); }} className="w-full py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-indigo-600 transition-colors">SỬA THÔNG TIN SẢN PHẨM</button>
                  )}
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;

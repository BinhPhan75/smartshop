
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
  exportBackup
} from './storageService';

const removeAccents = (str: string): string => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
};

const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [view, setView] = useState<ViewState>('login');
  const [role, setRole] = useState<UserRole>('user');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanningStatus, setScanningStatus] = useState<'idle' | 'processing'>('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [productFilterId, setProductFilterId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [loginRole, setLoginRole] = useState<UserRole>('user');
  
  const [isSelling, setIsSelling] = useState(false);
  const [sellQuantity, setSellQuantity] = useState(1);
  const [customer, setCustomer] = useState<CustomerInfo>({ fullName: '', address: '', idCard: '' });
  
  const now = new Date();
  const [reportFrom, setReportFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
  const [reportTo, setReportTo] = useState(now.toISOString().split('T')[0]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedProducts, savedSales] = await Promise.all([getProductsFromDB(), getSalesFromDB()]);
        setProducts(savedProducts || []);
        setSales(savedSales || []);
        
        const savedSession = localStorage.getItem('userSession');
        if (savedSession) {
          const session = JSON.parse(savedSession);
          if (Date.now() - session.timestamp < 3600000 * 24) { // 24 hours session
            setRole(session.role);
            setView('dashboard');
          }
        }
      } catch (e) { 
        console.error("Initial Data Load Error:", e); 
      } finally { 
        setTimeout(() => setIsLoading(false), 1200); 
      }
    };
    loadData();
  }, []);

  const syncTimeoutRef = useRef<any>(null);
  useEffect(() => {
    if (!isLoading && view !== 'login') {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        saveProductsToDB(products);
        saveAllSalesToDB(sales);
      }, 2000);
    }
  }, [products, sales, isLoading, view]);

  const stats = useMemo(() => ({
    count: products.length,
    totalItems: products.reduce((acc, p) => acc + (Number(p.stock) || 0), 0),
    investment: products.reduce((acc, p) => acc + ((Number(p.purchasePrice) || 0) * (Number(p.stock) || 0)), 0),
  }), [products]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = removeAccents(searchQuery);
    return products.filter(p => 
      removeAccents(`${p.name} ${p.id} ${p.brand || ''}`).includes(q)
    );
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
      revenue, cost, profit: revenue - cost, count: filtered.length
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
    saveSaleToDB(newSale); 
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
          setRole(loginRole);
          localStorage.setItem('userSession', JSON.stringify({ role: loginRole, timestamp: Date.now() }));
          setView('dashboard');
          setEnteredPin('');
        } else {
          alert('Mã PIN sai! Mặc định là 1234');
          setEnteredPin('');
        }
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('userSession');
    setView('login');
    setRole('user');
    setEnteredPin('');
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

  if (isLoading) return (
    <div className="min-h-screen bg-indigo-700 flex flex-col items-center justify-center text-white p-10 text-center">
      <div className="relative mb-12">
        <div className="w-24 h-24 border-4 border-white/20 rounded-full animate-ping"></div>
        <div className="absolute inset-0 w-24 h-24 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
      </div>
      <h1 className="text-4xl font-black tracking-tighter mb-4 uppercase">DUYHALAM</h1>
      <p className="text-xs font-bold opacity-60 uppercase tracking-[0.4em] animate-pulse">Hệ thống đang khởi động...</p>
    </div>
  );

  if (view === 'login') return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white overflow-hidden">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 -left-20 w-80 h-80 bg-indigo-600 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-0 -right-20 w-80 h-80 bg-emerald-600 rounded-full blur-[100px]"></div>
      </div>
      
      <div className="w-full max-w-sm space-y-12 z-10 text-center">
        <div className="space-y-4">
          <h1 className="text-5xl font-black tracking-tighter uppercase text-white">DUYHALAM</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-400">Quản lý bán hàng chuyên nghiệp</p>
        </div>

        <div className="bg-white/10 backdrop-blur-2xl p-8 rounded-[3rem] border border-white/10 shadow-2xl">
          <h2 className="text-xs font-black uppercase mb-10 text-slate-400 tracking-[0.3em]">Xác thực tài khoản</h2>
          
          <div className="flex gap-4 mb-10">
            <button 
              onClick={() => setLoginRole('user')}
              className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase border transition-all ${loginRole === 'user' ? 'bg-indigo-600 border-indigo-500 shadow-xl' : 'bg-white/5 border-white/10 text-white/50'}`}
            >
              NHÂN VIÊN
            </button>
            <button 
              onClick={() => setLoginRole('admin')}
              className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase border transition-all ${loginRole === 'admin' ? 'bg-indigo-600 border-indigo-500 shadow-xl' : 'bg-white/5 border-white/10 text-white/50'}`}
            >
              QUẢN TRỊ
            </button>
          </div>

          <div className="flex justify-center gap-4 mb-10">
            {[0,1,2,3].map(i => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${enteredPin.length > i ? 'bg-indigo-400 border-indigo-400 scale-125' : 'bg-transparent border-white/20'}`}></div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[1,2,3,4,5,6,7,8,9,0].map(n => (
              <button key={n} onClick={() => handlePinInput(n.toString())} className="w-full aspect-square bg-white/5 hover:bg-white/10 active:scale-90 rounded-2xl text-xl font-black transition-all border border-white/10 flex items-center justify-center">
                {n}
              </button>
            ))}
            <button onClick={() => setEnteredPin('')} className="col-span-2 w-full h-full bg-red-500/10 hover:bg-red-500/20 active:scale-95 rounded-2xl text-[10px] font-black uppercase tracking-widest text-red-400 transition-all border border-red-500/20">XÓA</button>
          </div>
        </div>
        <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Vui lòng nhập mã PIN (1234) để truy cập</p>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${role === 'admin' ? 'bg-slate-50' : 'bg-white'} pb-28 font-sans selection:bg-indigo-100`}>
      <header className="bg-indigo-700 text-white p-6 pt-14 rounded-b-[3rem] shadow-2xl sticky top-0 z-40">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <div className="active:scale-95 transition-transform">
            <h1 className="text-2xl font-black tracking-tighter uppercase">DUYHALAM</h1>
            <p className="text-[9px] font-black opacity-70 uppercase tracking-[0.3em]">{role === 'admin' ? 'QUẢN TRỊ VIÊN' : 'NHÂN VIÊN'}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsScanning(true)} className="bg-white/10 p-3 rounded-2xl border border-white/10 active:scale-90 transition-all backdrop-blur">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-6 space-y-8">
        {view === 'dashboard' && (
          <>
            <div className="relative">
              <input type="text" placeholder="Tìm tên, hiệu hoặc mã..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full p-5 pl-14 bg-white border border-slate-200 rounded-[2rem] shadow-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-sm transition-all" />
              <svg className="w-6 h-6 absolute left-5 top-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            
            <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 rounded-[3rem] p-10 text-white shadow-[0_30px_60px_-15px_rgba(79,70,229,0.5)] relative overflow-hidden group">
               <div className="relative z-10">
                  <p className="text-[10px] font-black opacity-60 uppercase mb-2 tracking-widest">GIÁ TRỊ TỒN KHO</p>
                  <h2 className={`font-black mb-10 tracking-tighter whitespace-nowrap overflow-hidden text-ellipsis flex items-baseline gap-1 text-[clamp(24px,8vw,36px)]`}>
                    {formatCurrency(stats.investment)}
                  </h2>
                  <div className="flex gap-10">
                    <div className="space-y-1">
                      <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest">Mặt hàng</p>
                      <p className="font-black text-2xl">{stats.count}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest">Tổng kho</p>
                      <p className="font-black text-2xl">{stats.totalItems}</p>
                    </div>
                  </div>
               </div>
               <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-white/5 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-1000"></div>
            </div>

            {role === 'admin' && (
              <button onClick={() => { setIsEditing(false); setView('add'); }} className="w-full py-6 bg-white border-2 border-dashed border-slate-200 rounded-[2rem] text-slate-400 font-black uppercase text-[10px] tracking-[0.3em] hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all active:scale-[0.98] shadow-sm">
                + NHẬP KHO SẢN PHẨM MỚI
              </button>
            )}
            
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">DANH SÁCH SẢN PHẨM</h3>
              {filteredProducts.length === 0 ? (
                <div className="text-center py-20 bg-slate-100/50 rounded-[3rem] border border-dashed border-slate-200">
                  <p className="font-black text-[10px] uppercase tracking-widest text-slate-400">Không tìm thấy kết quả</p>
                </div>
              ) : filteredProducts.map(p => (
                <div key={p.id} className="bg-white p-5 rounded-[2.5rem] border border-slate-100 flex items-center space-x-5 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all group active:scale-[0.99]">
                  <div onClick={() => { setSelectedProduct(p); setView('detail'); }} className="flex flex-1 items-center space-x-5 cursor-pointer min-w-0">
                    <div className="relative">
                      <img src={p.imageUrl} className="w-20 h-20 rounded-[1.5rem] object-cover bg-slate-100 group-hover:rotate-2 transition-transform shadow-md" />
                      {p.stock < 5 && <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse"></div>}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2">
                         <h4 className="font-black text-slate-800 uppercase text-[11px] truncate">{p.name}</h4>
                         {p.brand && <span className="text-[7px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-lg font-black uppercase">{p.brand}</span>}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <p className="text-indigo-600 font-black text-lg">{formatCurrency(p.sellingPrice)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                         <span className={`text-[8px] font-black px-3 py-1 rounded-full border ${p.stock < 10 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>KHO: {p.stock}</span>
                         {role === 'admin' && <span className="text-[8px] font-black text-slate-300 uppercase">Vốn: {formatCurrency(p.purchasePrice)}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); startSelling(p); }} disabled={p.stock <= 0} className={`p-5 rounded-2xl shadow-xl transition-all active:scale-90 ${p.stock > 0 ? 'bg-indigo-600 text-white shadow-indigo-100' : 'bg-slate-100 text-slate-300'}`}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 11V7a4 4 0 11-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {view === 'reports' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-10 duration-700">
             <div className="bg-white rounded-[3rem] p-8 shadow-2xl border border-slate-100">
                <div className="flex justify-between items-center mb-10">
                  <h2 className="text-sm font-black uppercase tracking-[0.3em] text-slate-900 flex items-center gap-3">
                    <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.5)]"></div>
                    BÁO CÁO KINH DOANH
                  </h2>
                  <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase">{reportData.count} GIAO DỊCH</div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8 bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 shadow-inner">
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Bắt đầu</label>
                    <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="w-full p-4 bg-white rounded-2xl border border-slate-200 text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-600/20" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Kết thúc</label>
                    <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="w-full p-4 bg-white rounded-2xl border border-slate-200 text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-600/20" />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4 mb-10">
                   <div className="relative">
                     <input type="text" placeholder="Tìm tên khách hoặc mã CCCD..." value={customerSearchQuery} onChange={e => setCustomerSearchQuery(e.target.value)} className="w-full p-4 pl-12 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-600/10 outline-none font-bold text-xs" />
                     <svg className="w-4 h-4 absolute left-4 top-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                   </div>
                   <div className="relative">
                     <select value={productFilterId} onChange={e => setProductFilterId(e.target.value)} className="w-full p-4 pl-12 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-600/10 outline-none font-bold text-xs appearance-none">
                        <option value="">Tất cả mặt hàng đã bán</option>
                        {soldProductsList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                     </select>
                     <svg className="w-4 h-4 absolute left-4 top-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20 7l-8 8-8-8"></path></svg>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-12">
                  <div className="px-1 py-6 bg-indigo-600 rounded-[2.5rem] text-white shadow-lg flex flex-col items-center justify-center min-h-[110px] text-center">
                    <p className="text-[9px] font-black opacity-60 uppercase mb-1 tracking-widest whitespace-nowrap">TỔNG DOANH THU</p>
                    <h3 className="font-black whitespace-nowrap flex items-center justify-center w-full overflow-hidden text-[clamp(10px,5vw,26px)] leading-none">
                      {formatCurrency(reportData.revenue)}
                    </h3>
                  </div>
                  {role === 'admin' && (
                    <>
                      <div className="px-1 py-6 bg-emerald-600 rounded-[2.5rem] text-white shadow-lg flex flex-col items-center justify-center min-h-[110px] text-center">
                        <p className="text-[9px] font-black opacity-60 uppercase mb-1 tracking-widest whitespace-nowrap">LỢI NHUẬN RÒNG</p>
                        <h3 className="font-black whitespace-nowrap flex items-center justify-center w-full overflow-hidden text-[clamp(10px,5vw,26px)] leading-none">
                          {formatCurrency(reportData.profit)}
                        </h3>
                      </div>
                      <div className="px-1 py-6 bg-slate-900 rounded-[2.5rem] text-white shadow-lg flex flex-col items-center justify-center min-h-[110px] text-center">
                        <p className="text-[9px] font-black opacity-60 uppercase mb-1 tracking-widest whitespace-nowrap">TỔNG GIÁ VỐN</p>
                        <h3 className="font-black whitespace-nowrap flex items-center justify-center w-full overflow-hidden text-[clamp(10px,5vw,26px)] leading-none">
                          {formatCurrency(reportData.cost)}
                        </h3>
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-5">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">NHẬT KÝ GIAO DỊCH</h3>
                    <div className="h-px bg-slate-100 flex-1 ml-4"></div>
                  </div>
                  
                  {reportData.sales.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 rounded-[3rem] border border-dashed border-slate-200">
                      <p className="font-black text-[10px] uppercase tracking-widest text-slate-300">Không có dữ liệu bán hàng</p>
                    </div>
                  ) : (
                    reportData.sales.map(s => (
                      <div key={s.id} className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 space-y-4 shadow-sm hover:border-indigo-200 transition-all hover:bg-white active:scale-[0.98]">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-black text-slate-900 text-[12px] uppercase leading-tight truncate">{s.productName}</h4>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[9px] text-indigo-500 font-black">{new Date(s.timestamp).toLocaleTimeString('vi-VN')}</span>
                              <span className="text-slate-300">•</span>
                              <span className="text-[9px] text-slate-400 font-bold">{new Date(s.timestamp).toLocaleDateString('vi-VN')}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                             <p className="text-indigo-600 font-black text-sm">{formatCurrency(s.totalAmount)}</p>
                             <p className="text-[8px] font-black text-slate-400 uppercase mt-0.5">SL: {s.quantity}</p>
                          </div>
                        </div>
                        <div className="flex justify-between items-center border-t border-slate-200/50 pt-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                               <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path></svg>
                            </div>
                            <div className="flex flex-col">
                              <p className="text-[9px] font-black text-slate-900 uppercase">{s.customer?.fullName || "Khách lẻ"}</p>
                              {s.customer?.idCard && <p className="text-[8px] font-bold text-slate-400">CCCD: {s.customer.idCard}</p>}
                            </div>
                          </div>
                          {role === 'admin' && (
                            <div className="text-emerald-600 font-black text-[9px] uppercase bg-emerald-50 px-3 py-1 rounded-full text-center">
                              Lãi: +{formatCurrency(s.totalAmount - (s.purchasePrice * s.quantity))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
             </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="bg-white rounded-[3rem] p-10 shadow-2xl border border-slate-100 space-y-12">
             <div className="text-center space-y-2">
                <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900">HỆ THỐNG</h2>
                <p className="text-[9px] font-black text-indigo-500 tracking-[0.3em] uppercase">Tùy chỉnh & Bảo mật</p>
             </div>

             <section className="space-y-6">
                <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] ml-2">QUẢN LÝ TÀI KHOẢN</h3>
                <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase text-slate-900">{role === 'admin' ? 'QUẢN TRỊ VIÊN' : 'NHÂN VIÊN'}</p>
                        <p className="text-[9px] font-bold text-slate-400">ID: DXH-2025-001</p>
                      </div>
                   </div>
                   <button onClick={handleLogout} className="px-6 py-3 bg-white border border-red-100 text-red-500 text-[10px] font-black uppercase rounded-xl shadow-sm hover:bg-red-50 active:scale-95 transition-all">ĐĂNG XUẤT</button>
                </div>
             </section>

             {role === 'admin' && (
               <section className="space-y-6">
                  <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] ml-2">DỮ LIỆU CLOUD</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <button onClick={exportBackup} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-[11px] uppercase flex items-center justify-center gap-4 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.3)] active:scale-95 transition-all">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                      XUẤT FILE SAO LƯU (.JSON)
                    </button>
                    <p className="text-[9px] text-center text-slate-400 font-bold uppercase tracking-widest italic opacity-50">Dữ liệu được tự động đồng bộ lên Cloud của DuyHaLam</p>
                  </div>
               </section>
             )}

             <div className="pt-10 border-t border-slate-100 text-center">
                <p className="text-[9px] font-black text-slate-200 uppercase tracking-[0.5em]">VERSION 5.0.0 PROFESSIONAL</p>
             </div>
          </div>
        )}
        
        <div className="text-center py-12 opacity-30 select-none pointer-events-none">
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400 whitespace-nowrap">
            Bản quyền phần mềm thuộc về binhphan
          </p>
        </div>
      </main>

      {/* Nav Bottom */}
      {view !== 'add' && view !== 'detail' && view !== 'login' && !isScanning && (
        <nav className="fixed bottom-8 left-8 right-8 bg-white/80 backdrop-blur-2xl shadow-[0_30px_70px_-15px_rgba(0,0,0,0.25)] p-5 rounded-[3rem] z-30 flex justify-around items-center border border-white/40 border-t-white/60">
            <button onClick={() => setView('dashboard')} className={`flex flex-col items-center gap-2 transition-all ${view === 'dashboard' ? 'text-indigo-600 scale-110' : 'text-slate-300'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg><span className="text-[8px] font-black uppercase tracking-tighter">KHO</span></button>
            <button onClick={() => setView('reports')} className={`flex flex-col items-center gap-2 transition-all ${view === 'reports' ? 'text-indigo-600 scale-110' : 'text-slate-300'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg><span className="text-[8px] font-black uppercase tracking-tighter">BÁO CÁO</span></button>
            <div className="w-16"></div>
            <button onClick={() => setView('settings')} className={`flex flex-col items-center gap-2 transition-all ${view === 'settings' ? 'text-indigo-600 scale-110' : 'text-slate-300'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg><span className="text-[8px] font-black uppercase tracking-tighter">HỆ THỐNG</span></button>
            <button onClick={() => setIsScanning(true)} className="absolute left-1/2 -translate-x-1/2 -top-12 w-24 h-24 bg-indigo-600 text-white rounded-[2.5rem] flex items-center justify-center shadow-[0_20px_50px_-10px_rgba(79,70,229,0.6)] border-[10px] border-slate-50 active:scale-90 transition-all z-40 group">
               <svg className="w-10 h-10 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
            </button>
        </nav>
      )}

      {/* VIEW DETAIL */}
      {view === 'detail' && selectedProduct && (
        <div className="p-6 animate-in slide-in-from-bottom-10 duration-700 max-w-lg mx-auto pb-24">
           <div className="bg-white rounded-[3.5rem] overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.15)] border border-slate-100">
              <div className="relative h-[450px] overflow-hidden">
                <img src={selectedProduct.imageUrl} className="w-full h-full object-cover" />
                <button onClick={() => setView('dashboard')} className="absolute top-10 left-10 bg-white/90 backdrop-blur p-5 rounded-[1.5rem] shadow-2xl active:scale-90 transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"></path></svg></button>
              </div>
              <div className="p-12 -mt-16 relative bg-white rounded-t-[4rem] space-y-10 shadow-[0_-20px_40px_rgba(0,0,0,0.05)]">
                <div className="space-y-3 text-center">
                   <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.4em]">CHI TIẾT SẢN PHẨM</p>
                   <h2 className="text-3xl font-black uppercase text-slate-900 leading-tight tracking-tight">{selectedProduct.name}</h2>
                </div>
                
                <div className="grid grid-cols-2 gap-5">
                  <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex flex-col justify-center text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">THƯƠNG HIỆU</p>
                    <p className="font-black text-slate-800 text-lg uppercase leading-none">{selectedProduct.brand || "KHÁC"}</p>
                  </div>
                  <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex flex-col justify-center text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">TỒN KHO</p>
                    <p className="font-black text-slate-800 text-lg uppercase leading-none">{selectedProduct.stock} <span className="text-[10px] opacity-30">SP</span></p>
                  </div>
                  <div className="col-span-2 p-10 bg-indigo-50 rounded-[3rem] border border-indigo-100/50 flex flex-col justify-center text-center">
                    <p className="text-[9px] font-black text-indigo-500 uppercase mb-3 tracking-[0.2em]">GIÁ NIÊM YẾT</p>
                    <p className="font-black text-4xl text-indigo-900 tracking-tighter">{formatCurrency(selectedProduct.sellingPrice)}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <button onClick={() => startSelling(selectedProduct)} disabled={selectedProduct.stock <= 0} className={`w-full py-7 rounded-[2rem] font-black uppercase text-sm tracking-[0.3em] shadow-[0_20px_40px_-10px_rgba(79,70,229,0.5)] transition-all active:scale-95 ${selectedProduct.stock > 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-300'}`}>BÁN SẢN PHẨM</button>
                  {role === 'admin' && (
                    <button onClick={() => { setIsEditing(true); setView('add'); }} className="w-full py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-indigo-600 transition-colors">CHỈNH SỬA THÔNG TIN</button>
                  )}
                </div>
              </div>
           </div>
        </div>
      )}

      {scanningStatus === 'processing' && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/95 flex flex-col items-center justify-center text-white backdrop-blur-3xl">
            <div className="relative mb-12">
                <div className="w-32 h-32 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-4 border-4 border-emerald-500 border-b-transparent rounded-full animate-spin duration-1000"></div>
            </div>
            <h3 className="text-sm font-black uppercase tracking-[0.5em] italic animate-pulse text-indigo-400">AI ĐANG PHÂN TÍCH...</h3>
            <p className="text-[9px] font-bold text-white/30 uppercase mt-4 tracking-widest">Vui lòng giữ máy ảnh ổn định</p>
        </div>
      )}

      {isScanning && <CameraView title="QUÉT SẢN PHẨM" onClose={() => setIsScanning(false)} onCapture={async (base64) => {
        setIsScanning(false); setScanningStatus('processing');
        try {
          const result = await searchProductByImage(base64, products);
          if (result.productId) {
            const found = products.find(p => p.id === result.productId);
            if (found) { setSelectedProduct(found); setView('detail'); }
          } else if (result.suggestedName) {
            setSearchQuery(result.suggestedName); setView('dashboard');
          } else { alert("AI không nhận diện được sản phẩm."); }
        } catch (e: any) { alert(e.message); } finally { setScanningStatus('idle'); }
      }} />}
      
      {view === 'add' && <ProductForm initialData={isEditing ? selectedProduct || undefined : undefined} existingProducts={products} onSave={(data) => {
        if (isEditing && selectedProduct) { 
          setProducts(prev => prev.map(p => p.id === selectedProduct.id ? { ...p, ...data } : p)); 
          setIsEditing(false); 
        } else { 
          setProducts(prev => [...prev, { ...data, id: crypto.randomUUID().split('-')[0].toUpperCase(), createdAt: Date.now() }]); 
        }
        setView('dashboard');
      }} onCancel={() => setView('dashboard')} />}

      {isSelling && selectedProduct && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/90 flex items-center justify-center p-4 backdrop-blur-xl animate-in fade-in">
            <div className="bg-white w-full max-w-sm rounded-[3rem] overflow-hidden flex flex-col relative animate-in zoom-in-95 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                   <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">THANH TOÁN</h3>
                   <button onClick={() => setIsSelling(false)} className="text-slate-300 p-2 active:rotate-90 transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                </div>
                <div className="p-6 space-y-6 text-center">
                    <div className="space-y-1">
                       <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Tên hàng</p>
                       <h4 className="text-lg font-black uppercase text-slate-900 leading-tight line-clamp-2 px-2">{selectedProduct.name}</h4>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 flex flex-col items-center shadow-inner">
                        <div className="flex items-center gap-6 mb-6">
                            <button onClick={() => setSellQuantity(Math.max(1, sellQuantity - 1))} className="w-12 h-12 bg-white rounded-xl text-2xl font-black shadow-lg border border-slate-100 active:scale-90 transition-all">-</button>
                            <span className="text-4xl font-black w-16 tabular-nums text-slate-900">{sellQuantity}</span>
                            <button onClick={() => setSellQuantity(Math.min(selectedProduct.stock, sellQuantity + 1))} className="w-12 h-12 bg-white rounded-xl text-2xl font-black shadow-lg border border-slate-100 active:scale-90 transition-all">+</button>
                        </div>
                        <div className="pt-4 border-t border-slate-200 w-full">
                           <p className="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">TỔNG THANH TOÁN</p>
                           <p className="text-2xl font-black text-indigo-600 tracking-tighter">{formatCurrency(selectedProduct.sellingPrice * sellQuantity)}</p>
                        </div>
                    </div>
                    <div className="space-y-3 text-left">
                       <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-4">KHÁCH HÀNG *</label>
                       <input type="text" placeholder="Họ và tên..." value={customer.fullName} onChange={e => setCustomer({...customer, fullName: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:ring-4 focus:ring-indigo-600/10" />
                       <input type="text" placeholder="Số CCCD (tùy chọn)..." value={customer.idCard} onChange={e => setCustomer({...customer, idCard: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:ring-4 focus:ring-indigo-600/10" />
                    </div>
                    <button onClick={handleConfirmSale} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.2em] shadow-xl active:scale-95 transition-all">HOÀN TẤT GIAO DỊCH</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;


import React, { useState } from 'react';
import { Product } from './types';
import CameraView from './CameraView';
import { searchProductByImage } from './geminiService';

interface ProductFormProps {
  onSave: (product: Omit<Product, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
  initialData?: Product;
  existingProducts: Product[];
}

const ProductForm: React.FC<ProductFormProps> = ({ onSave, onCancel, initialData, existingProducts }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [brand, setBrand] = useState(initialData?.brand || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [purchasePrice, setPurchasePrice] = useState(initialData?.purchasePrice?.toString() || '');
  const [sellingPrice, setSellingPrice] = useState(initialData?.sellingPrice?.toString() || '');
  const [stock, setStock] = useState(initialData?.stock || 0);
  const [newStock, setNewStock] = useState('');
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || '');
  const [showCamera, setShowCamera] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !imageUrl) return alert("Vui lòng nhập tên và chụp ảnh sản phẩm");
    onSave({ 
      name, 
      brand: brand || 'KHÁC',
      description, 
      purchasePrice: Number(purchasePrice) || 0, 
      sellingPrice: Number(sellingPrice) || 0, 
      stock: stock + (Number(newStock) || 0), 
      imageUrl 
    });
  };

  const handleCapture = async (base64: string) => {
    setImageUrl(base64);
    setShowCamera(false);
    
    if (!name.trim()) {
      setIsAiProcessing(true);
      try {
        const result = await searchProductByImage(base64, existingProducts);
        if (result.suggestedName) setName(result.suggestedName);
        if (result.brand) setBrand(result.brand);
      } catch (e: any) {
        console.error("AI Naming Error:", e);
      } finally {
        setIsAiProcessing(false);
      }
    }
  };

  return (
    <div className="p-2 animate-in slide-in-from-bottom-8 pb-24 max-w-lg mx-auto">
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden">
        <div className="p-6 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">
            {initialData ? 'CẬP NHẬT SẢN PHẨM' : 'NHẬP KHO MỚI'}
          </h2>
          <button type="button" onClick={onCancel} className="text-slate-400 p-2 active:scale-90 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="relative cursor-pointer group" onClick={() => setShowCamera(true)}>
            {imageUrl ? (
              <div className="relative">
                <img src={imageUrl} alt="Preview" className="w-full h-56 object-cover rounded-3xl shadow-inner border border-slate-100" />
                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors rounded-3xl flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="bg-white/90 backdrop-blur px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-900 shadow-xl">Đổi ảnh</span>
                </div>
              </div>
            ) : (
              <div className="w-full h-56 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 font-black uppercase text-[10px] group-hover:bg-slate-100/50 transition-colors">
                <svg className="w-10 h-10 mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
                <span>Chạm để chụp ảnh</span>
              </div>
            )}
            {isAiProcessing && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center z-10 animate-in fade-in">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-tighter">AI đang phân tích...</span>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 gap-5">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Tên mặt hàng</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-bold text-slate-800 transition-all" placeholder="Ví dụ: Nước ngọt Coca-Cola 330ml" required />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Thương hiệu</label>
              <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-bold italic text-indigo-900 transition-all" placeholder="Ví dụ: Samsung, Coca-Cola..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Tồn hiện tại</label>
              <input type="number" readOnly value={stock} className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl text-slate-500 font-bold" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-indigo-600 uppercase mb-2 ml-1 tracking-widest">Nhập thêm</label>
              <input type="number" value={newStock} onChange={(e) => setNewStock(e.target.value)} className="w-full p-4 bg-indigo-50 border border-indigo-200 rounded-2xl font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-600" placeholder="+0" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Giá vốn (VND)</label>
              <input type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-600" placeholder="0" required />
            </div>
            <div>
              <label className="block text-[10px] font-black text-emerald-600 uppercase mb-2 ml-1 tracking-widest">Giá bán (VND)</label>
              <input type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className="w-full p-4 bg-emerald-50 border border-emerald-200 rounded-2xl font-black text-emerald-600 outline-none focus:ring-2 focus:ring-emerald-600" placeholder="0" required />
            </div>
          </div>
          
          <button type="submit" className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest active:scale-[0.98] transition-all text-xs">LƯU THÔNG TIN</button>
        </form>
      </div>
      {showCamera && <CameraView title="CHỤP ẢNH SẢN PHẨM" onClose={() => setShowCamera(false)} onCapture={handleCapture} />}
    </div>
  );
};

export default ProductForm;

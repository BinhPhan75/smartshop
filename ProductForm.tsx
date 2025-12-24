
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
    
    // Chỉ hỏi AI nếu chưa có tên
    if (!name.trim()) {
      setIsAiProcessing(true);
      try {
        const result = await searchProductByImage(base64, existingProducts);
        if (result.suggestedName) {
          setName(result.suggestedName);
        }
      } catch (e: any) {
        console.error("AI Naming Error:", e);
        // Không hiện alert để tránh gián đoạn, chỉ log
      } finally {
        setIsAiProcessing(false);
      }
    }
  };

  return (
    <div className="p-2 animate-in slide-in-from-bottom-8 pb-24">
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden">
        <div className="p-6 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">{initialData ? 'CẬP NHẬT' : 'NHẬP KHO'}</h2>
          <button type="button" onClick={onCancel} className="text-slate-400 p-2"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="relative cursor-pointer group" onClick={() => setShowCamera(true)}>
            {imageUrl ? (
              <img src={imageUrl} alt="Preview" className="w-full h-52 object-cover rounded-3xl" />
            ) : (
              <div className="w-full h-52 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 font-black uppercase text-[10px]">
                <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
                Chạm để chụp ảnh
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-active:bg-black/10 transition-colors rounded-3xl"></div>
          </div>
          
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Tên mặt hàng</label>
            <div className="relative">
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-bold pr-12" 
                placeholder={isAiProcessing ? "AI đang nhìn sản phẩm..." : "Tên sản phẩm"} 
                required 
              />
              {isAiProcessing && (
                <div className="absolute right-4 top-4 w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Tồn hiện tại</label><input type="number" readOnly value={stock} className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl text-slate-500 font-bold" /></div>
            <div><label className="block text-[10px] font-black text-indigo-600 uppercase mb-1.5">Nhập thêm</label><input type="number" value={newStock} onChange={(e) => setNewStock(e.target.value)} className="w-full p-4 bg-indigo-50 border border-indigo-200 rounded-2xl font-black text-indigo-600" placeholder="+0" /></div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Giá vốn</label><input type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" placeholder="0" required /></div>
            <div><label className="block text-[10px] font-black text-emerald-600 uppercase mb-1.5">Giá bán</label><input type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className="w-full p-4 bg-emerald-50 border border-emerald-200 rounded-2xl font-black text-emerald-600" placeholder="0" required /></div>
          </div>
          
          <button type="submit" className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest active:scale-95 transition-all text-xs">LƯU THAY ĐỔI</button>
        </form>
      </div>
      {showCamera && <CameraView title="CHỤP ẢNH SẢN PHẨM" onClose={() => setShowCamera(false)} onCapture={handleCapture} />}
    </div>
  );
};

export default ProductForm;

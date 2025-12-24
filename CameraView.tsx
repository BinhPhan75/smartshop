
import React, { useRef, useEffect, useState, useCallback } from 'react';

interface CameraViewProps {
  onCapture: (base64: string) => void;
  onClose: () => void;
  title: string;
}

const CameraView: React.FC<CameraViewProps> = ({ onCapture, onClose, title }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');

  const startCamera = useCallback(async () => {
    // Stop any existing tracks first
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          // Loại bỏ ideal resolution để tăng khả năng tương thích
        },
        audio: false
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
        setError('');
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      if (err.name === 'NotAllowedError') {
        setError('Quyền truy cập Camera bị từ chối. Vui lòng bật trong cài đặt trình duyệt.');
      } else {
        setError('Không thể khởi động Camera. Vui lòng thử lại.');
      }
    }
  }, [stream]);

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      // Sử dụng kích thước thực tế của video stream
      const width = video.videoWidth;
      const height = video.videoHeight;
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        // Nén nhẹ để gửi AI nhanh hơn
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        onCapture(dataUrl);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col animate-in fade-in duration-300">
      <div className="p-4 flex justify-between items-center text-white bg-black/50 z-10 backdrop-blur-md">
        <div className="flex flex-col">
          <h3 className="font-black uppercase text-[10px] tracking-widest">{title}</h3>
          <p className="text-[8px] opacity-50 uppercase font-bold">Vui lòng đưa sản phẩm vào khung hình</p>
        </div>
        <button onClick={onClose} className="p-2 active:scale-90 bg-white/10 rounded-full">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center bg-zinc-900 overflow-hidden">
        {error ? (
          <div className="text-white text-center p-10 max-w-xs">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <p className="mb-6 font-bold text-sm leading-relaxed">{error}</p>
            <button onClick={startCamera} className="w-full py-4 bg-indigo-600 rounded-2xl font-black text-xs uppercase shadow-xl active:scale-95 transition-all">Thử lại ngay</button>
          </div>
        ) : (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted
            className="w-full h-full object-cover" 
          />
        )}
        
        {!error && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-72 h-72 border-2 border-white/20 rounded-[3rem] shadow-[0_0_0_100vw_rgba(0,0,0,0.6)] relative">
                  <div className="absolute inset-0 border-2 border-indigo-500 rounded-[3rem] animate-pulse"></div>
                  {/* Corners */}
                  <div className="absolute -top-1 -left-1 w-10 h-10 border-t-4 border-l-4 border-white rounded-tl-3xl"></div>
                  <div className="absolute -top-1 -right-1 w-10 h-10 border-t-4 border-r-4 border-white rounded-tr-3xl"></div>
                  <div className="absolute -bottom-1 -left-1 w-10 h-10 border-b-4 border-l-4 border-white rounded-bl-3xl"></div>
                  <div className="absolute -bottom-1 -right-1 w-10 h-10 border-b-4 border-r-4 border-white rounded-br-3xl"></div>
              </div>
          </div>
        )}
      </div>

      <div className="p-10 bg-black flex justify-center items-center pb-12">
        {!error && (
          <button onClick={handleCapture} className="group relative flex items-center justify-center">
            <div className="absolute w-24 h-24 rounded-full border-4 border-white/10 animate-ping opacity-20"></div>
            <div className="w-20 h-20 rounded-full border-[6px] border-white/20 flex items-center justify-center active:scale-90 transition-all bg-white/5">
              <div className="w-14 h-14 rounded-full bg-white shadow-2xl shadow-white/20"></div>
            </div>
          </button>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraView;

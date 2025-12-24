
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
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch (err) {
      setError('Không thể truy cập camera. Vui lòng kiểm tra quyền.');
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stream?.getTracks().forEach(track => track.stop());
  }, [startCamera]);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        onCapture(canvas.toDataURL('image/jpeg', 0.8));
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black flex flex-col">
      <div className="p-4 flex justify-between items-center text-white bg-black/50 z-10">
        <h3 className="font-bold uppercase text-xs tracking-widest">{title}</h3>
        <button onClick={onClose} className="p-2 active:scale-90"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
      </div>
      <div className="flex-1 relative flex items-center justify-center bg-zinc-900 overflow-hidden">
        {error ? (
          <div className="text-white text-center p-6"><p className="mb-4">{error}</p><button onClick={startCamera} className="px-6 py-2 bg-indigo-600 rounded-xl">Thử lại</button></div>
        ) : (
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-64 h-64 border-2 border-white/30 rounded-[2rem] shadow-[0_0_0_100vw_rgba(0,0,0,0.5)]"></div>
        </div>
      </div>
      <div className="p-10 bg-black flex justify-center items-center">
        <button onClick={handleCapture} className="w-20 h-20 rounded-full border-[6px] border-white/20 flex items-center justify-center active:scale-90 transition-all">
          <div className="w-14 h-14 rounded-full bg-white shadow-lg"></div>
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraView;

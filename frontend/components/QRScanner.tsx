"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

// BarcodeDetector type declaration for browsers that support it
interface BarcodeDetectorResult {
  rawValue: string;
}
interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>;
}
interface BarcodeDetectorConstructor {
  new (opts: { formats: string[] }): BarcodeDetectorInstance;
  getSupportedFormats(): Promise<string[]>;
}

interface QRScannerProps {
  onScan: (tokenId: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [detected, setDetected] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const rafRef = useRef<number>(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const startScanner = async () => {
      // Check camera API
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera is not supported in this browser. Try using manual input instead.");
        return;
      }

      // Request camera permission
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : String(err);
        if (name === "NotAllowedError") {
          setError("Camera permission denied. Tap the camera icon in your browser's address bar to allow access, then reload.");
        } else if (name === "NotFoundError") {
          setError("No camera found on this device.");
        } else if (name === "NotReadableError") {
          setError("Camera is in use by another app.");
        } else {
          setError(`Camera error: ${name}`);
        }
        return;
      }

      if (!mounted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      // Attach stream to video element
      const video = videoRef.current;
      if (!video) {
        setError("Video element not found.");
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      video.srcObject = stream;
      await video.play();
      if (mounted) setScanning(true);

      // Try BarcodeDetector API first (Chrome, Edge, Safari 15.4+)
      let useBarcodeDetector = false;
      const BD = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
      if (BD) {
        try {
          const formats = await BD.getSupportedFormats();
          if (formats.includes("qr_code")) {
            detectorRef.current = new BD({ formats: ["qr_code"] });
            useBarcodeDetector = true;
          }
        } catch {
          // BarcodeDetector not usable
        }
      }

      if (useBarcodeDetector && detectorRef.current) {
        // Scan loop using BarcodeDetector
        const scanLoop = async () => {
          if (!mounted || !videoRef.current || !detectorRef.current) return;
          try {
            const results = await detectorRef.current.detect(videoRef.current);
            if (results.length > 0 && mounted) {
              const raw = results[0].rawValue;
              handleDetected(raw);
              return;
            }
          } catch {
            // Detection frame error — continue
          }
          rafRef.current = requestAnimationFrame(scanLoop);
        };
        rafRef.current = requestAnimationFrame(scanLoop);
      } else {
        // Fallback: use jsQR library for QR detection (works in Brave, Firefox, etc.)
        try {
          const jsQR = (await import("jsqr")).default;
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas not supported");

          const scanLoop = () => {
            if (!mounted || !videoRef.current) return;
            const v = videoRef.current;
            if (v.readyState === v.HAVE_ENOUGH_DATA) {
              canvas.width = v.videoWidth;
              canvas.height = v.videoHeight;
              ctx.drawImage(v, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
              if (code && mounted) {
                handleDetected(code.data);
                return;
              }
            }
            rafRef.current = requestAnimationFrame(scanLoop);
          };
          rafRef.current = requestAnimationFrame(scanLoop);
        } catch {
          if (mounted) {
            setError("QR scanning not available. Please use manual input.");
          }
        }
      }
    };

    const handleDetected = (decodedText: string) => {
      if (!mounted) return;
      setDetected(true);
      // Pass original raw content so caller can distinguish URL vs raw ID
      setTimeout(() => {
        stopCamera();
        onScanRef.current(decodedText);
      }, 300);
    };

    startScanner();

    return () => {
      mounted = false;
      stopCamera();
    };
  }, [stopCamera]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.9)", backdropFilter: "blur(12px)" }}
    >
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{
          background: "rgba(15,19,36,0.98)",
          border: `1px solid ${detected ? "rgba(0,255,136,0.5)" : "rgba(184,172,255,0.2)"}`,
          transition: "border-color 300ms ease",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <p
              className="text-[0.72rem] uppercase tracking-[0.22em]"
              style={{ color: detected ? "#00ff88" : "var(--cosmic-violet)" }}
            >
              {detected ? "QR Detected!" : "Scan QR Code"}
            </p>
            <p className="text-sm text-white/60 mt-1">
              {detected ? "Processing…" : "Point your camera at the QR code"}
            </p>
          </div>
          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Camera view */}
        <div className="relative p-5">
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              border: `2px solid ${detected ? "rgba(0,255,136,0.6)" : "rgba(184,172,255,0.3)"}`,
              minHeight: "280px",
              transition: "border-color 300ms ease",
              background: "#000",
            }}
          >
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              style={{ display: scanning ? "block" : "none", minHeight: "280px" }}
              playsInline
              muted
              autoPlay
            />
          </div>

          {/* Scan frame overlay */}
          {scanning && !detected && !error?.includes("manual input") && (
            <div className="absolute inset-5 pointer-events-none flex items-center justify-center">
              <div className="relative" style={{ width: "75%", aspectRatio: "1/1" }}>
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" fill="none">
                  <path d="M2 20 L2 2 L20 2" stroke="var(--cosmic-violet)" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M80 2 L98 2 L98 20" stroke="var(--cosmic-violet)" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M2 80 L2 98 L20 98" stroke="var(--cosmic-violet)" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M80 98 L98 98 L98 80" stroke="var(--cosmic-violet)" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <div
                  className="absolute left-[10%] right-[10%] h-0.5 rounded-full"
                  style={{
                    background: "linear-gradient(90deg, transparent, var(--cosmic-violet), transparent)",
                    animation: "scanLine 2.5s ease-in-out infinite",
                    boxShadow: "0 0 12px rgba(138,92,255,0.5)",
                  }}
                />
              </div>
            </div>
          )}

          {/* Success overlay */}
          {detected && (
            <div className="absolute inset-5 flex items-center justify-center rounded-2xl" style={{ background: "rgba(0,255,136,0.08)" }}>
              <div className="text-center">
                <div
                  className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3"
                  style={{ background: "rgba(0,255,136,0.15)", border: "2px solid rgba(0,255,136,0.5)" }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00ff88" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l4 4 10-10" />
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: "#00ff88" }}>QR Code Scanned</p>
              </div>
            </div>
          )}

          {/* Loading */}
          {!scanning && !error && !detected && (
            <div className="absolute inset-5 flex items-center justify-center rounded-2xl bg-black/50">
              <div className="text-center">
                <div
                  className="w-10 h-10 mx-auto rounded-full border-2 border-t-transparent animate-spin mb-3"
                  style={{ borderColor: "var(--cosmic-violet)", borderTopColor: "transparent" }}
                />
                <p className="text-xs text-white/60 uppercase tracking-widest">Starting camera…</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-4 rounded-xl text-center" style={{
              background: "rgba(255,107,186,0.1)",
              border: "1px solid rgba(255,107,186,0.3)",
            }}>
              <p className="text-sm" style={{ color: "var(--aurora-pink)" }}>{error}</p>
              <p className="text-xs text-white/50 mt-2">Try using the manual input instead.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <p className="text-xs text-white/40 text-center">
            {scanning ? "Align the QR code within the frame" : "Hold steady — the scan happens automatically."}
          </p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes scanLine {
          0%, 100% { top: 10%; }
          50% { top: 85%; }
        }
      `}</style>
    </div>,
    document.body
  );
}

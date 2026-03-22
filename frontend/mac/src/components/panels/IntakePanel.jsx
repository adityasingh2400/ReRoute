import { useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Video, Package, Check, Smartphone } from 'lucide-react';
import Badge from '../shared/Badge';
import ProgressRing from '../shared/ProgressRing';

function PhoneQR() {
  const [detectedIP, setDetectedIP] = useState('');

  useState(() => {
    fetch('/api/local-ip')
      .then((r) => r.json())
      .then((d) => { if (d.ip) setDetectedIP(d.ip); })
      .catch(() => {});
  }, []);

  const phoneUrl = useMemo(() => {
    const host = detectedIP || window.location.hostname || 'localhost';
    const port = window.location.port || '8080';
    return `http://${host}:${port}/phone/`;
  }, [detectedIP]);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(phoneUrl)}&bgcolor=12121a&color=f1f1f4`;

  return (
    <div className="phone-qr-section">
      <div className="phone-qr-label">
        <Smartphone size={12} />
        Scan to capture from phone
      </div>
      <div className="phone-qr-card">
        <img src={qrSrc} alt="Phone QR" className="phone-qr-img" />
        <div className="phone-qr-url">{phoneUrl}</div>
      </div>
    </div>
  );
}

function getConditionLabel(item) {
  const visible = item.visible_defects || [];
  const spoken = item.spoken_defects || [];
  if (visible.length + spoken.length === 0) return 'Like New';
  if (visible.some((d) => d.severity === 'major')) return 'Fair';
  return 'Good';
}

export default function IntakePanel({ job, items, onUpload }) {
  const [dragActive, setDragActive] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const inputRef = useRef(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file?.type.startsWith('video/')) {
      setVideoUrl(URL.createObjectURL(file));
      onUpload(file);
    }
  }, [onUpload]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoUrl(URL.createObjectURL(file));
      onUpload(file);
    }
  }, [onUpload]);

  const isProcessing = ['extracting', 'analyzing', 'routing'].includes(job?.status);

  const STATUS_TEXT = {
    extracting: 'Extracting items from video…',
    analyzing: 'Analyzing condition and specs…',
    routing: 'Finding best routes…',
  };

  return (
    <>
      <div className="panel-header">Intake</div>

      {!videoUrl ? (
        <div
          className={`upload-zone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={28} className="upload-icon" />
          <span className="upload-label">Drop video or click to browse</span>
          <span className="upload-hint">MP4, MOV up to 500MB</span>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="upload-input"
            onChange={handleFileSelect}
          />
        </div>
      ) : (
        <div className="video-preview">
          <video src={videoUrl} muted autoPlay loop playsInline />
          <div className="video-overlay">
            <div className="video-status">
              {isProcessing ? (
                <>
                  <ProgressRing progress={job?.progress || 30} size={24} strokeWidth={3} />
                  <span>{STATUS_TEXT[job?.status] || 'Processing…'}</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>{items.length} items detected</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {items.length > 0 && (
          <div className="item-cards">
            {items.map((item, index) => {
              const condition = getConditionLabel(item);
              return (
                <motion.div
                  key={item.item_id}
                  className={`item-card ${selectedItem === item.item_id ? 'selected' : ''}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.08, duration: 0.3 }}
                  onClick={() => setSelectedItem(item.item_id)}
                >
                  <div className="item-thumb">
                    {item.hero_frame_paths?.[0] ? (
                      <img src={item.hero_frame_paths[0]} alt={item.name_guess} />
                    ) : (
                      <Package size={20} />
                    )}
                  </div>
                  <div className="item-info">
                    <div className="item-name">{item.name_guess}</div>
                    <div className="item-meta">
                      {item.confidence != null && (
                        <Badge variant="primary">
                          {Math.round(item.confidence * 100)}%
                        </Badge>
                      )}
                      <Badge variant={condition === 'Like New' ? 'success' : 'warning'}>
                        {condition}
                      </Badge>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      {!videoUrl && items.length === 0 && (
        <div className="empty-state">
          <Video size={32} className="empty-state-icon" />
          <p className="empty-state-text">Upload a video to start identifying items</p>
        </div>
      )}

      <PhoneQR />
    </>
  );
}

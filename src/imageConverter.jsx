/* eslint-disable no-unused-vars */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  UploadCloud,
  FileImage,
  Download,
  Trash2,
  RefreshCw,
  Archive,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Maximize2,
} from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  OUTPUT_FORMATS,
  convertAndOptimizeImage,
  formatBytes,
} from "./imageProcessor";

export default function ImageConverter() {
  const [queue, setQueue] = useState([]);
  const [globalFormat, setGlobalFormat] = useState("image/webp");
  const [quality, setQuality] = useState(0.92);
  const [maintainAspect, setMaintainAspect] = useState(true);
  const [targetWidth, setTargetWidth] = useState("");
  const [targetHeight, setTargetHeight] = useState("");
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);

  // Revoke object URLs to avoid client memory leaks on unmount
  useEffect(() => {
    return () => {
      queue.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        if (item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
      });
    };
  }, [queue]);

  const addFilesToQueue = useCallback((files) => {
    const validFiles = Array.from(files).filter(
      (file) =>
        file.type.startsWith("image/") ||
        file.name.toLowerCase().endsWith(".heic") ||
        file.name.toLowerCase().endsWith(".heif"),
    );

    const newQueueItems = validFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      originalSize: file.size,
      previewUrl: URL.createObjectURL(file),
      convertedBlob: null,
      convertedUrl: null,
      convertedSize: null,
      reductionPercent: null,
      status: "idle", // 'idle' | 'converting' | 'completed' | 'error'
      errorMessage: null,
    }));

    setQueue((prev) => [...prev, ...newQueueItems]);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      addFilesToQueue(e.dataTransfer.files);
    }
  };

  const processQueueItem = async (itemId) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, status: "converting" } : item,
      ),
    );

    const targetItem = queue.find((i) => i.id === itemId);
    if (!targetItem) return;

    try {
      const { blob } = await convertAndOptimizeImage(targetItem.file, {
        outputMime: globalFormat,
        quality: parseFloat(quality),
        customWidth: targetWidth ? parseInt(targetWidth, 10) : null,
        customHeight: targetHeight ? parseInt(targetHeight, 10) : null,
        maintainAspectRatio: maintainAspect,
      });

      const convertedUrl = URL.createObjectURL(blob);
      const reduction =
        ((targetItem.originalSize - blob.size) / targetItem.originalSize) * 100;

      setQueue((prev) =>
        prev.map((item) => {
          if (item.id !== itemId) return item;
          if (item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
          return {
            ...item,
            status: "completed",
            convertedBlob: blob,
            convertedUrl,
            convertedSize: blob.size,
            reductionPercent: Math.round(reduction * 10) / 10,
          };
        }),
      );
    } catch (err) {
      setQueue((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                status: "error",
                errorMessage: err.message || "Conversion failed.",
              }
            : item,
        ),
      );
    }
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    for (const item of queue) {
      if (item.status !== "completed") {
        await processQueueItem(item.id);
      }
    }
    setIsProcessingAll(false);
  };

  const downloadSingle = (item) => {
    if (!item.convertedBlob) return;
    const formatMeta = OUTPUT_FORMATS.find((f) => f.mime === globalFormat);
    const baseName =
      item.name.substring(0, item.name.lastIndexOf(".")) || item.name;
    saveAs(
      item.convertedBlob,
      `${baseName}.${formatMeta ? formatMeta.ext : "img"}`,
    );
  };

  const downloadZip = async () => {
    const completedItems = queue.filter(
      (i) => i.status === "completed" && i.convertedBlob,
    );
    if (!completedItems.length) return;

    const zip = new JSZip();
    const formatMeta = OUTPUT_FORMATS.find((f) => f.mime === globalFormat);
    const ext = formatMeta ? formatMeta.ext : "img";

    completedItems.forEach((item) => {
      const baseName =
        item.name.substring(0, item.name.lastIndexOf(".")) || item.name;
      zip.file(`${baseName}.${ext}`, item.convertedBlob);
    });

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `optimized_images_${Date.now()}.zip`);
  };

  const removeItem = (id) => {
    setQueue((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      if (item?.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearQueue = () => {
    queue.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      if (item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
    });
    setQueue([]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans antialiased">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <FileImage className="w-8 h-8 text-cyan-400" />
              Browser Image Optimizer
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Zero backend round-trips. Local multi-format canvas compression &
              batch conversion.
            </p>
          </div>
          {queue.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={clearQueue}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> Clear All
              </button>
              <button
                onClick={downloadZip}
                disabled={!queue.some((i) => i.status === "completed")}
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 border border-slate-700"
              >
                <Archive className="w-4 h-4 text-cyan-400" /> Download ZIP
              </button>
              <button
                onClick={processAll}
                disabled={isProcessingAll || queue.length === 0}
                className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 px-5 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isProcessingAll ? "animate-spin" : ""}`}
                />
                Process All
              </button>
            </div>
          )}
        </header>

        {/* Global Controls Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
          {/* Format selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Sliders className="w-4 h-4" /> Output Format
            </label>
            <select
              value={globalFormat}
              onChange={(e) => setGlobalFormat(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition"
            >
              {OUTPUT_FORMATS.map((f) => (
                <option key={f.mime} value={f.mime}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quality control */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Quality: {Math.round(quality * 100)}%
              </label>
              <span className="text-xs text-slate-500">
                {globalFormat === "image/png"
                  ? "N/A (Lossless)"
                  : quality >= 0.9
                    ? "Visual Lossless"
                    : "Compressed"}
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.01"
              disabled={globalFormat === "image/png"}
              value={quality}
              onChange={(e) => setQuality(parseFloat(e.target.value))}
              className="w-full accent-cyan-400 disabled:opacity-40"
            />
          </div>

          {/* Custom dimensions */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5" /> Dimensions (px)
              </label>
              <label className="text-xs text-slate-400 flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={maintainAspect}
                  onChange={(e) => setMaintainAspect(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0"
                />
                Keep Aspect
              </label>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Width"
                value={targetWidth}
                onChange={(e) => setTargetWidth(e.target.value)}
                className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <input
                type="number"
                placeholder="Height"
                value={targetHeight}
                onChange={(e) => setTargetHeight(e.target.value)}
                className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>
        </section>

        {/* Upload Zone */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition ${
            isDragging
              ? "border-cyan-400 bg-cyan-950/20"
              : "border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(e) =>
              e.target.files?.length && addFilesToQueue(e.target.files)
            }
          />
          <UploadCloud className="w-12 h-12 text-cyan-400 mb-3" />
          <p className="text-base font-medium text-slate-200">
            Click to upload or drag & drop images
          </p>
          <p className="text-xs text-slate-500 mt-1">
            PNG, JPEG, WEBP, SVG, BMP, GIF, AVIF, HEIC
          </p>
        </section>

        {/* Queue List */}
        {queue.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Conversion Queue ({queue.length})
            </h2>

            <div className="space-y-2">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition hover:border-slate-700"
                >
                  {/* File Metadata */}
                  <div className="flex items-center gap-4 min-w-0">
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      className="w-12 h-12 rounded-lg object-cover bg-slate-950 flex-shrink-0"
                    />
                    <div className="truncate">
                      <p className="text-sm font-medium text-slate-200 truncate">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        <span>Original: {formatBytes(item.originalSize)}</span>
                        {item.convertedSize && (
                          <>
                            <span>•</span>
                            <span className="text-slate-300 font-medium">
                              New: {formatBytes(item.convertedSize)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Status */}
                  <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                    {/* Badge */}
                    {item.status === "completed" && (
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          item.reductionPercent > 0
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : "bg-amber-950 text-amber-400 border border-amber-800"
                        }`}
                      >
                        {item.reductionPercent > 0
                          ? `-${item.reductionPercent}%`
                          : `+${Math.abs(item.reductionPercent)}%`}
                      </span>
                    )}

                    {item.status === "error" && (
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-rose-950 text-rose-400 border border-rose-800 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    )}

                    {/* Convert/Download Single */}
                    {item.status === "completed" ? (
                      <button
                        onClick={() => downloadSingle(item)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2 rounded-lg transition"
                        title="Download file"
                      >
                        <Download className="w-4 h-4 text-cyan-400" />
                      </button>
                    ) : (
                      <button
                        onClick={() => processQueueItem(item.id)}
                        disabled={item.status === "converting"}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2 rounded-lg transition disabled:opacity-50"
                        title="Convert file"
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${item.status === "converting" ? "animate-spin" : ""}`}
                        />
                      </button>
                    )}

                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-slate-500 hover:text-rose-400 p-2 rounded-lg transition"
                      title="Remove file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

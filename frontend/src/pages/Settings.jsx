import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "@/lib/api";
import Layout from "@/components/Layout";
import {
  QrCode,
  UploadSimple,
  Trash,
  ArrowLeft,
  Info,
  CheckCircle,
} from "@phosphor-icons/react";

export default function Settings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [upiId, setUpiId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [imgPreview, setImgPreview] = useState(null); // {b64, dataUrl} for pending upload
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const r = await api.get("/settings/payment");
      setInfo(r.data);
      setUpiId(r.data.upi_id || "");
      setPayeeName(r.data.payee_name || "");
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (f.size > 1.5 * 1024 * 1024) {
      toast.error("Image must be under 1.5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImgPreview({ dataUrl: reader.result });
    };
    reader.readAsDataURL(f);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        upi_id: upiId.trim() || "",
        payee_name: payeeName.trim() || "",
      };
      if (imgPreview) payload.qr_image_base64 = imgPreview.dataUrl;
      const r = await api.post("/settings/payment", payload);
      setInfo(r.data);
      setImgPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Payment details saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const clearImage = async () => {
    if (!window.confirm("Remove uploaded QR image?")) return;
    try {
      const r = await api.post("/settings/payment", { qr_image_base64: "" });
      setInfo(r.data);
      toast.success("Uploaded QR removed");
    } catch {
      toast.error("Failed");
    }
  };

  const clearAll = async () => {
    if (!window.confirm("Remove all payment details?")) return;
    try {
      const r = await api.post("/settings/payment", {
        upi_id: "",
        payee_name: "",
        qr_image_base64: "",
      });
      setInfo(r.data);
      setUpiId("");
      setPayeeName("");
      setImgPreview(null);
      toast.success("Payment details cleared");
    } catch {
      toast.error("Failed");
    }
  };

  const previewSrc = imgPreview?.dataUrl || info?.qr_url;

  return (
    <Layout>
      <button
        data-testid="settings-back-button"
        onClick={() => navigate("/")}
        className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717A] hover:text-[#0A2540] mb-4 inline-flex items-center gap-1"
      >
        <ArrowLeft size={12} weight="bold" /> Back to batches
      </button>

      <div className="mb-8">
        <p className="lyro-eyebrow">Settings</p>
        <h1 className="font-display font-black text-4xl sm:text-5xl mt-1 tracking-tight leading-none">
          Payment QR
        </h1>
        <p className="text-sm text-[#71717A] mt-3 max-w-2xl">
          Set your center&apos;s UPI ID or upload your own QR. LYRO will attach it at
          the bottom of every monthly report so parents can pay directly. We do
          not track or record payments — you check them in your own UPI app.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[#71717A]">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="lyro-card p-6" data-testid="payment-settings-form">
            <p className="lyro-eyebrow">Details</p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="lyro-label">UPI ID</label>
                <input
                  data-testid="upi-id-input"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. yourcenter@ybl"
                  className="lyro-input"
                />
                <p className="text-[11px] text-[#71717A] mt-1">
                  We&apos;ll auto-generate a QR from this UPI ID.
                </p>
              </div>
              <div>
                <label className="lyro-label">Payee name (optional)</label>
                <input
                  data-testid="payee-name-input"
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  placeholder="e.g. Bright Future Classes"
                  className="lyro-input"
                />
              </div>

              <div className="pt-2">
                <label className="lyro-label">Or upload your own QR image</label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    data-testid="choose-qr-file-button"
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="lyro-btn-secondary"
                  >
                    <UploadSimple size={14} weight="bold" /> Choose image
                  </button>
                  {imgPreview && (
                    <span className="text-xs text-[#166534] font-bold uppercase tracking-widest inline-flex items-center gap-1">
                      <CheckCircle size={14} weight="bold" /> Ready to save
                    </span>
                  )}
                  {info?.has_qr_image && !imgPreview && (
                    <button
                      data-testid="remove-qr-image-button"
                      onClick={clearImage}
                      className="lyro-btn-danger"
                    >
                      <Trash size={12} weight="bold" /> Remove uploaded
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    data-testid="qr-file-input"
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={onFile}
                  />
                </div>
                <p className="text-[11px] text-[#71717A] mt-1">
                  If an image is uploaded, it takes priority over the UPI ID QR.
                  Max ~1.5 MB.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-6 pt-6 border-t border-[#E4E4E7]">
              <button
                data-testid="save-payment-settings-button"
                onClick={save}
                disabled={saving}
                className="lyro-btn-primary"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              {info?.configured && (
                <button
                  data-testid="clear-payment-settings-button"
                  onClick={clearAll}
                  className="lyro-btn-danger"
                >
                  <Trash size={12} weight="bold" /> Clear all
                </button>
              )}
            </div>

            <div className="mt-6 p-3 bg-[#F4F4F5] border-l-4 border-[#0A2540] flex gap-2 text-xs text-[#18181B]">
              <Info size={14} weight="bold" className="shrink-0 mt-0.5" />
              <span>
                LYRO does not process, track or record payments. It only shows
                your QR to parents. Verify payments in your UPI app.
              </span>
            </div>
          </div>

          <div className="lyro-card p-6" data-testid="payment-preview-card">
            <p className="lyro-eyebrow">Preview — what parents will see</p>
            <div className="mt-4 flex flex-col items-center">
              {previewSrc ? (
                <>
                  <div className="p-4 bg-white border-2 border-[#0A2540]">
                    <img
                      data-testid="payment-qr-preview"
                      src={previewSrc}
                      alt="Payment QR"
                      className="w-56 h-56 object-contain"
                    />
                  </div>
                  <p className="font-display font-bold text-lg mt-4">
                    {payeeName || info?.payee_name || "Your center"}
                  </p>
                  {upiId && (
                    <p className="font-mono text-sm text-[#71717A] mt-1">
                      {upiId}
                    </p>
                  )}
                  <a
                    data-testid="qr-open-link"
                    href={previewSrc}
                    target="_blank"
                    rel="noreferrer"
                    className="lyro-btn-secondary mt-4"
                  >
                    <QrCode size={14} weight="bold" /> Open full image
                  </a>
                </>
              ) : (
                <div className="w-56 h-56 flex flex-col items-center justify-center border-2 border-dashed border-[#E4E4E7] text-center p-6">
                  <QrCode size={40} weight="bold" color="#A1A1AA" />
                  <p className="text-sm text-[#71717A] mt-3">
                    Add a UPI ID or upload a QR to see the preview.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

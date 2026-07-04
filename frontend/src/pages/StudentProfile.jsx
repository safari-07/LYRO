import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import api from "@/lib/api";
import Layout from "@/components/Layout";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Sparkle,
  WhatsappLogo,
  Copy,
  ArrowLeft,
  Calendar,
  ChartLineUp,
  Medal,
  UserCircle,
  Envelope,
} from "@phosphor-icons/react";

export default function StudentProfile() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [parentMsg, setParentMsg] = useState(null);
  const [msgLoading, setMsgLoading] = useState(false);
  const [monthReport, setMonthReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMonth, setReportMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );

  const load = async () => {
    const r = await api.get(`/students/${studentId}/profile`);
    setData(r.data);
  };

  useEffect(() => {
    load().catch(() => {
      toast.error("Student not found");
      navigate("/");
    });
  }, [studentId]);

  const generateSummary = async () => {
    setSummaryLoading(true);
    try {
      const r = await api.post(`/students/${studentId}/progress-summary`);
      setSummary(r.data.summary);
    } catch {
      toast.error("Failed to generate summary");
    } finally {
      setSummaryLoading(false);
    }
  };

  const generateParentMessage = async () => {
    setMsgLoading(true);
    try {
      const r = await api.post(`/students/${studentId}/parent-message`);
      setParentMsg(r.data);
    } catch {
      toast.error("Failed to generate message");
    } finally {
      setMsgLoading(false);
    }
  };

  const generateMonthlyReport = async () => {
    setReportLoading(true);
    try {
      const r = await api.post(
        `/students/${studentId}/monthly-report?month=${reportMonth}`,
      );
      setMonthReport(r.data);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setReportLoading(false);
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed — long-press to copy manually");
    }
  };

  const shareWhatsApp = (text, phone) => {
    const cleaned = (phone || "").replace(/[^\d]/g, "");
    const url = cleaned
      ? `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  if (!data) {
    return (
      <Layout>
        <p className="text-sm text-[#71717A]">Loading student...</p>
      </Layout>
    );
  }

  const { student, batch, history, rank, batch_size } = data;
  const chartData = history.map((h) => ({
    name: h.name.length > 14 ? h.name.slice(0, 14) + "…" : h.name,
    percent: h.percent,
    score: h.score,
    max: h.max_marks,
    date: h.date,
    subject: h.subject,
  }));
  const course = student.course_override || batch.course;
  const latest = history[history.length - 1];

  return (
    <Layout>
      <button
        data-testid="profile-back-button"
        onClick={() => navigate(`/batches/${batch.id}`)}
        className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717A] hover:text-[#0A2540] mb-4 inline-flex items-center gap-1"
      >
        <ArrowLeft size={12} weight="bold" /> Back to batch
      </button>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-[#0A2540] flex items-center justify-center">
            <UserCircle size={30} weight="fill" color="#fff" />
          </div>
          <div>
            <p className="lyro-eyebrow">
              {batch.name} · {course}
            </p>
            <h1
              className="font-display font-black text-4xl sm:text-5xl mt-1 tracking-tight leading-none"
              data-testid="student-name-title"
            >
              {student.name}
            </h1>
            <p className="text-sm text-[#71717A] mt-2 font-mono">
              📱 {student.parent_whatsapp}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MiniStat
          label="Rank"
          value={rank ? `#${rank}` : "—"}
          sub={`of ${batch_size}`}
          icon={<Medal size={16} weight="bold" />}
          testid="profile-stat-rank"
        />
        <MiniStat
          label="Tests taken"
          value={history.length}
          icon={<Calendar size={16} weight="bold" />}
          testid="profile-stat-tests"
        />
        <MiniStat
          label="Latest score"
          value={latest ? `${latest.score}/${latest.max_marks}` : "—"}
          sub={latest ? `${latest.percent}%` : ""}
          icon={<ChartLineUp size={16} weight="bold" />}
          testid="profile-stat-latest"
        />
        <MiniStat
          label="Avg %"
          value={
            history.length > 0
              ? `${Math.round(
                  (history.reduce((a, h) => a + h.percent, 0) / history.length) *
                    10,
                ) / 10}%`
              : "—"
          }
          icon={<ChartLineUp size={16} weight="bold" />}
          testid="profile-stat-avg"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 lyro-card p-6" data-testid="profile-chart-card">
          <div className="flex items-center justify-between mb-4">
            <p className="lyro-eyebrow">Marks over time</p>
            <span className="text-xs text-[#71717A]">Percentage</span>
          </div>
          {history.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center text-center">
              <p className="font-display font-bold text-xl">No scores yet</p>
              <p className="text-sm text-[#71717A] mt-1 max-w-xs">
                Once you enter marks for this student&apos;s tests, their progress line
                will appear here.
              </p>
            </div>
          ) : (
            <div className="h-72 -ml-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 12, bottom: 10, left: 0 }}
                >
                  <CartesianGrid stroke="#F4F4F5" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    stroke="#71717A"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "#E4E4E7" }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke="#71717A"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "#E4E4E7" }}
                    unit="%"
                  />
                  <ReferenceLine
                    y={40}
                    stroke="#DC2626"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0A2540",
                      border: "none",
                      borderRadius: 0,
                      color: "#fff",
                      fontFamily: "Manrope",
                    }}
                    labelStyle={{ color: "#fff", fontWeight: 700 }}
                    formatter={(v, _, p) => [
                      `${p.payload.score}/${p.payload.max} (${v}%)`,
                      p.payload.subject,
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="percent"
                    stroke="#0A2540"
                    strokeWidth={2.5}
                    dot={{ fill: "#0A2540", strokeWidth: 0, r: 4 }}
                    activeDot={{ r: 6, fill: "#DC2626" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 lyro-card p-6" data-testid="profile-ai-summary">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkle size={18} weight="fill" color="#0A2540" />
              <p className="lyro-eyebrow">AI progress summary</p>
            </div>
          </div>
          <p className="text-sm text-[#71717A] mb-4">
            A warm, plain-English summary for the parent — based on the latest tests.
          </p>
          {summary ? (
            <div className="bg-[#F4F4F5] p-4 border-l-4 border-[#0A2540] text-sm leading-relaxed whitespace-pre-wrap">
              {summary}
            </div>
          ) : (
            <div className="bg-[#F4F4F5] p-4 border-l-4 border-[#E4E4E7] text-sm text-[#71717A]">
              Click Generate to write a fresh summary using Claude Sonnet 4.5.
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              data-testid="generate-summary-button"
              onClick={generateSummary}
              disabled={summaryLoading || history.length === 0}
              className="lyro-btn-primary"
            >
              <Sparkle size={14} weight="bold" />
              {summaryLoading ? "Thinking..." : summary ? "Regenerate" : "Generate"}
            </button>
            {summary && (
              <>
                <button
                  data-testid="copy-summary-button"
                  onClick={() => copy(summary)}
                  className="lyro-btn-secondary"
                >
                  <Copy size={14} weight="bold" /> Copy
                </button>
                <button
                  data-testid="whatsapp-summary-button"
                  onClick={() => shareWhatsApp(summary, student.parent_whatsapp)}
                  className="lyro-btn-whatsapp"
                >
                  <WhatsappLogo size={14} weight="bold" /> Share
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Parent update + Monthly report */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="lyro-card p-6" data-testid="parent-update-card">
          <div className="flex items-center gap-2 mb-3">
            <Envelope size={18} weight="bold" color="#0A2540" />
            <p className="lyro-eyebrow">Parent update message</p>
          </div>
          <p className="text-sm text-[#71717A] mb-4">
            A short WhatsApp-ready message drafted for the parent.
          </p>
          {parentMsg?.message ? (
            <div className="bg-[#F4F4F5] p-4 border-l-4 border-[#25D366] text-sm leading-relaxed whitespace-pre-wrap">
              {parentMsg.message}
            </div>
          ) : (
            <div className="bg-[#F4F4F5] p-4 border-l-4 border-[#E4E4E7] text-sm text-[#71717A]">
              Draft not created yet.
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              data-testid="generate-parent-msg-button"
              onClick={generateParentMessage}
              disabled={msgLoading || history.length === 0}
              className="lyro-btn-primary"
            >
              <Sparkle size={14} weight="bold" />
              {msgLoading ? "Drafting..." : parentMsg ? "Redraft" : "Draft message"}
            </button>
            {parentMsg?.message && (
              <>
                <button
                  data-testid="copy-parent-msg-button"
                  onClick={() => copy(parentMsg.message)}
                  className="lyro-btn-secondary"
                >
                  <Copy size={14} weight="bold" /> Copy
                </button>
                <button
                  data-testid="whatsapp-parent-msg-button"
                  onClick={() =>
                    shareWhatsApp(parentMsg.message, parentMsg.parent_whatsapp)
                  }
                  className="lyro-btn-whatsapp"
                >
                  <WhatsappLogo size={14} weight="bold" /> WhatsApp
                </button>
              </>
            )}
          </div>
        </div>

        <div className="lyro-card p-6" data-testid="monthly-report-card">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={18} weight="bold" color="#0A2540" />
            <p className="lyro-eyebrow">Monthly report</p>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <input
              data-testid="monthly-report-month"
              type="month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              className="lyro-input max-w-[180px]"
            />
          </div>
          {monthReport?.report ? (
            <div className="bg-[#F4F4F5] p-4 border-l-4 border-[#0A2540] text-sm leading-relaxed whitespace-pre-wrap">
              {monthReport.report}
            </div>
          ) : (
            <div className="bg-[#F4F4F5] p-4 border-l-4 border-[#E4E4E7] text-sm text-[#71717A]">
              Pick a month and generate a report to share.
            </div>
          )}
          {monthReport?.payment?.configured && monthReport?.payment?.qr_url && (
            <div
              className="mt-4 border border-[#E4E4E7] p-4 flex flex-col sm:flex-row gap-4 items-center"
              data-testid="monthly-report-qr-block"
            >
              <img
                src={monthReport.payment.qr_url}
                alt="Payment QR"
                className="w-28 h-28 object-contain border border-[#E4E4E7] p-1 bg-white"
                data-testid="monthly-report-qr-image"
              />
              <div className="text-sm text-center sm:text-left">
                <p className="lyro-eyebrow">Attach this QR to the parent</p>
                <p className="font-display font-bold text-lg mt-1">
                  {monthReport.payment.payee_name || "Your center"}
                </p>
                {monthReport.payment.upi_id && (
                  <p className="font-mono text-xs text-[#71717A]">
                    {monthReport.payment.upi_id}
                  </p>
                )}
                <div className="flex gap-2 mt-2 justify-center sm:justify-start">
                  <a
                    href={monthReport.payment.qr_url}
                    target="_blank"
                    rel="noreferrer"
                    className="lyro-btn-secondary"
                    data-testid="open-qr-image-button"
                  >
                    Open QR image
                  </a>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              data-testid="generate-monthly-report-button"
              onClick={generateMonthlyReport}
              disabled={reportLoading}
              className="lyro-btn-primary"
            >
              <Sparkle size={14} weight="bold" />
              {reportLoading
                ? "Writing..."
                : monthReport
                  ? "Regenerate"
                  : "Generate report"}
            </button>
            {monthReport?.report && (
              <>
                <button
                  data-testid="copy-monthly-report-button"
                  onClick={() => copy(monthReport.report)}
                  className="lyro-btn-secondary"
                >
                  <Copy size={14} weight="bold" /> Copy
                </button>
                <button
                  data-testid="whatsapp-monthly-report-button"
                  onClick={() =>
                    shareWhatsApp(monthReport.report, monthReport.parent_whatsapp)
                  }
                  className="lyro-btn-whatsapp"
                >
                  <WhatsappLogo size={14} weight="bold" /> WhatsApp
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* History table */}
      {history.length > 0 && (
        <div className="mt-8 lyro-card p-0 overflow-hidden" data-testid="history-table">
          <div className="p-6 pb-3">
            <p className="lyro-eyebrow">Test history</p>
          </div>
          <div className="overflow-x-auto">
            <table className="lyro-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Test</th>
                  <th className="hidden sm:table-cell">Subject / Chapter</th>
                  <th className="text-right">Score</th>
                  <th className="text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((h) => (
                  <tr key={h.test_id}>
                    <td className="font-mono text-xs">
                      {new Date(h.date).toLocaleDateString()}
                    </td>
                    <td className="font-semibold">{h.name}</td>
                    <td className="hidden sm:table-cell text-[#71717A] text-xs">
                      {h.subject} · {h.chapter}
                    </td>
                    <td className="text-right font-mono">
                      {h.score}/{h.max_marks}
                    </td>
                    <td className="text-right font-mono font-bold">
                      <span
                        className={
                          h.percent >= 60
                            ? "text-[#166534]"
                            : h.percent >= 40
                              ? "text-[#18181B]"
                              : "text-[#DC2626]"
                        }
                      >
                        {h.percent}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}

function MiniStat({ label, value, sub, icon, testid }) {
  return (
    <div className="lyro-card p-4" data-testid={testid}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#71717A]">
          {label}
        </p>
        <span className="text-[#0A2540]">{icon}</span>
      </div>
      <p className="font-display font-black text-2xl sm:text-3xl mt-2 tracking-tight">
        {value}
      </p>
      {sub && <p className="text-xs text-[#71717A] mt-1">{sub}</p>}
    </div>
  );
}

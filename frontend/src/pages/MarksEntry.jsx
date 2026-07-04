import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import api from "@/lib/api";
import Layout from "@/components/Layout";
import { FloppyDisk, ArrowLeft, CheckCircle } from "@phosphor-icons/react";

export default function MarksEntry() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [rows, setRows] = useState([]);
  const [scores, setScores] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const inputRefs = useRef({});

  const load = async () => {
    const r = await api.get(`/tests/${testId}/marks`);
    setTest(r.data.test);
    setRows(r.data.rows);
    const initial = {};
    r.data.rows.forEach((row) => {
      initial[row.student_id] = row.score === null ? "" : String(row.score);
    });
    setScores(initial);
    setDirty(false);
  };

  useEffect(() => {
    load().catch(() => {
      toast.error("Test not found");
      navigate("/");
    });
  }, [testId]);

  const onChange = (studentId, value) => {
    setScores((s) => ({ ...s, [studentId]: value }));
    setDirty(true);
  };

  const onKeyDown = (e, idx) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = rows[idx + 1];
      if (next) inputRefs.current[next.student_id]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = rows[idx - 1];
      if (prev) inputRefs.current[prev.student_id]?.focus();
    }
  };

  const save = async () => {
    if (!test) return;
    setSaving(true);
    try {
      const payload = {
        marks: rows.map((r) => {
          const raw = scores[r.student_id];
          const val = raw === "" || raw === undefined ? null : Number(raw);
          if (raw !== "" && (Number.isNaN(val) || val < 0 || val > test.max_marks)) {
            throw new Error(
              `Score for ${r.student_name} must be 0–${test.max_marks}`,
            );
          }
          return { student_id: r.student_id, score: val };
        }),
      };
      await api.post(`/tests/${testId}/marks`, payload);
      toast.success("Marks saved");
      setDirty(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!test) {
    return (
      <Layout>
        <p className="text-sm text-[#71717A]">Loading...</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <button
        data-testid="marks-back-button"
        onClick={() => navigate(`/batches/${test.batch_id}`)}
        className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717A] hover:text-[#0A2540] mb-4 inline-flex items-center gap-1"
      >
        <ArrowLeft size={12} weight="bold" /> Back to batch
      </button>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <p className="lyro-eyebrow">
            {test.subject} · {test.chapter}
          </p>
          <h1
            className="font-display font-black text-3xl sm:text-4xl mt-1 tracking-tight"
            data-testid="marks-test-title"
          >
            {test.name}
          </h1>
          <p className="text-sm text-[#71717A] mt-1">
            Max marks: <span className="font-bold text-[#18181B]">{test.max_marks}</span> ·{" "}
            {new Date(test.date).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-[#DC2626]">
              ● Unsaved
            </span>
          )}
          <button
            data-testid="save-marks-button"
            onClick={save}
            disabled={saving || !dirty}
            className="lyro-btn-primary"
          >
            <FloppyDisk size={16} weight="bold" />
            {saving ? "Saving..." : "Save all"}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="lyro-card p-8 text-center">
          <p className="font-display font-bold text-xl">No students in this batch</p>
          <p className="text-sm text-[#71717A] mt-1">
            Add students to the batch first.
          </p>
        </div>
      ) : (
        <div className="lyro-card p-0 overflow-hidden">
          <div className="p-4 bg-[#F4F4F5] border-b border-[#E4E4E7] flex items-center gap-2 text-xs text-[#71717A]">
            <span className="font-bold uppercase tracking-widest">
              Tip:
            </span>
            Press Enter or ↓ to jump to the next student. Leave blank to skip.
          </div>
          <div className="overflow-x-auto">
            <table className="lyro-table" data-testid="marks-table">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>Student</th>
                  <th className="text-right w-40">Score / {test.max_marks}</th>
                  <th className="text-right w-24 hidden sm:table-cell">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const val = scores[r.student_id];
                  const num =
                    val === "" || val === undefined ? null : Number(val);
                  const pct =
                    num === null || Number.isNaN(num)
                      ? null
                      : Math.round((num / test.max_marks) * 1000) / 10;
                  return (
                    <tr
                      key={r.student_id}
                      data-testid={`marks-row-${r.student_id}`}
                    >
                      <td className="font-mono text-[#71717A]">{i + 1}</td>
                      <td className="font-semibold">{r.student_name}</td>
                      <td className="text-right">
                        <input
                          data-testid={`score-input-${r.student_id}`}
                          ref={(el) => (inputRefs.current[r.student_id] = el)}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={test.max_marks}
                          value={val ?? ""}
                          onChange={(e) => onChange(r.student_id, e.target.value)}
                          onKeyDown={(e) => onKeyDown(e, i)}
                          placeholder="—"
                          className="w-24 text-right border border-[#E4E4E7] rounded-none px-2 py-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-[#0A2540]"
                        />
                      </td>
                      <td className="text-right font-mono hidden sm:table-cell">
                        {pct === null ? (
                          <span className="text-[#A1A1AA]">—</span>
                        ) : (
                          <span
                            className={
                              pct >= 60
                                ? "text-[#166534] font-bold"
                                : pct >= 40
                                  ? "text-[#18181B]"
                                  : "text-[#DC2626] font-bold"
                            }
                          >
                            {pct}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-[#E4E4E7] flex justify-end sticky bottom-0 bg-white/95 backdrop-blur-xl">
            <button
              data-testid="save-marks-footer-button"
              onClick={save}
              disabled={saving || !dirty}
              className="lyro-btn-primary"
            >
              {saving ? (
                "Saving..."
              ) : dirty ? (
                <>
                  <FloppyDisk size={16} weight="bold" /> Save all
                </>
              ) : (
                <>
                  <CheckCircle size={16} weight="bold" /> All saved
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}

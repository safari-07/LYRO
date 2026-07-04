import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import api from "@/lib/api";
import Layout from "@/components/Layout";
import {
  FloppyDisk,
  ArrowLeft,
  CheckCircle,
  UploadSimple,
  X,
  Warning,
} from "@phosphor-icons/react";

export default function MarksEntry() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [rows, setRows] = useState([]);
  const [scores, setScores] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
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
            data-testid="import-csv-button"
            onClick={() => setShowCsv(true)}
            className="lyro-btn-secondary"
          >
            <UploadSimple size={16} weight="bold" /> Import CSV
          </button>
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

      {showCsv && (
        <CsvImportModal
          onClose={() => setShowCsv(false)}
          rows={rows}
          maxMarks={test.max_marks}
          onApply={(matches) => {
            setScores((prev) => {
              const next = { ...prev };
              matches.forEach(({ student_id, score }) => {
                next[student_id] = String(score);
              });
              return next;
            });
            setDirty(true);
            setShowCsv(false);
            toast.success(`${matches.length} scores imported. Review & save.`);
          }}
        />
      )}

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


function normalizeName(s) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const parsed = [];
  for (const line of lines) {
    // support comma, tab, or semicolon; take first two columns
    const parts = line.split(/[\t,;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) continue;
    const [name, ...rest] = parts;
    const score = rest.join(","); // in case commas inside score field (unlikely)
    parsed.push({ name, rawScore: score });
  }
  // if the first row looks like a header, drop it
  if (
    parsed.length > 0 &&
    ["name", "student", "student name"].includes(normalizeName(parsed[0].name)) &&
    Number.isNaN(parseFloat(parsed[0].rawScore))
  ) {
    parsed.shift();
  }
  return parsed;
}

function CsvImportModal({ onClose, rows, maxMarks, onApply }) {
  const [text, setText] = useState("");
  const fileRef = useRef(null);

  const parsed = parseCsvText(text);
  const byName = new Map(rows.map((r) => [normalizeName(r.student_name), r]));

  const evaluated = parsed.map((p) => {
    const match = byName.get(normalizeName(p.name));
    const scoreNum = parseFloat(String(p.rawScore).replace(/[^0-9.\-]/g, ""));
    const scoreValid =
      !Number.isNaN(scoreNum) && scoreNum >= 0 && scoreNum <= maxMarks;
    return {
      raw: p,
      match,
      score: scoreNum,
      scoreValid,
      status: !match
        ? "unmatched"
        : !scoreValid
          ? "invalid_score"
          : "ok",
    };
  });

  const okCount = evaluated.filter((e) => e.status === "ok").length;
  const unmatched = evaluated.filter((e) => e.status === "unmatched");
  const invalid = evaluated.filter((e) => e.status === "invalid_score");

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 500_000) {
      toast.error("File too large (max 500 KB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ""));
    reader.readAsText(f);
  };

  const apply = () => {
    const matches = evaluated
      .filter((e) => e.status === "ok")
      .map((e) => ({ student_id: e.match.student_id, score: e.score }));
    if (matches.length === 0) {
      toast.error("No valid rows to import");
      return;
    }
    onApply(matches);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      data-testid="csv-import-modal"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#0A2540] w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-[#E4E4E7] flex items-start justify-between">
          <div>
            <p className="lyro-eyebrow">Import marks</p>
            <h2 className="font-display font-black text-2xl mt-1 tracking-tight">
              Paste CSV or upload file
            </h2>
            <p className="text-xs text-[#71717A] mt-2 max-w-lg">
              One student per line, in the format{" "}
              <code className="font-mono font-bold text-[#0A2540]">
                Name, Score
              </code>
              . Works with commas or tabs (copy-paste from Excel / Google Sheets).
              Names are matched to students in this batch (case-insensitive).
            </p>
          </div>
          <button
            onClick={onClose}
            data-testid="csv-close-button"
            className="text-[#71717A] hover:text-[#0A2540]"
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-auto space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="lyro-btn-secondary"
              data-testid="csv-choose-file-button"
            >
              <UploadSimple size={14} weight="bold" /> Upload .csv
            </button>
            <button
              type="button"
              data-testid="csv-download-template-button"
              onClick={() => {
                const csv =
                  "Name,Score\n" +
                  rows.map((r) => `${r.student_name},`).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "marks-template.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="lyro-btn-ghost"
            >
              Download template
            </button>
            <input
              ref={fileRef}
              data-testid="csv-file-input"
              type="file"
              accept=".csv,text/csv,text/plain"
              hidden
              onChange={onFile}
            />
          </div>

          <textarea
            data-testid="csv-textarea"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Aarav Kumar, 82\nPriya Sharma, 74\nRahul Verma, 65"}
            className="lyro-input font-mono text-xs"
          />

          {parsed.length > 0 && (
            <div
              className="border border-[#E4E4E7] p-4 bg-[#F4F4F5]"
              data-testid="csv-preview"
            >
              <div className="flex items-center gap-4 text-xs mb-3">
                <span className="lyro-badge-success">
                  <CheckCircle size={12} weight="bold" /> {okCount} ok
                </span>
                {unmatched.length > 0 && (
                  <span className="lyro-badge-danger">
                    {unmatched.length} unmatched
                  </span>
                )}
                {invalid.length > 0 && (
                  <span className="lyro-badge-danger">
                    {invalid.length} bad score
                  </span>
                )}
                <span className="text-[#71717A]">
                  Max marks: {maxMarks}
                </span>
              </div>
              <div className="max-h-56 overflow-auto">
                <table className="lyro-table">
                  <thead>
                    <tr>
                      <th>CSV name</th>
                      <th>→ Student</th>
                      <th className="text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluated.map((e, i) => (
                      <tr key={i} data-testid={`csv-row-${i}`}>
                        <td className="font-mono text-xs">{e.raw.name}</td>
                        <td>
                          {e.match ? (
                            <span className="font-semibold">
                              {e.match.student_name}
                            </span>
                          ) : (
                            <span className="text-[#DC2626] inline-flex items-center gap-1">
                              <Warning size={12} weight="bold" /> No match
                            </span>
                          )}
                        </td>
                        <td className="text-right font-mono">
                          {e.status === "invalid_score" ? (
                            <span className="text-[#DC2626]">
                              {e.raw.rawScore || "—"} (bad)
                            </span>
                          ) : (
                            <span
                              className={
                                e.status === "ok" ? "font-bold" : "text-[#A1A1AA]"
                              }
                            >
                              {e.raw.rawScore}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-[#E4E4E7] flex justify-end gap-2 bg-white">
          <button
            onClick={onClose}
            className="lyro-btn-secondary"
            data-testid="csv-cancel-button"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={okCount === 0}
            className="lyro-btn-primary"
            data-testid="csv-apply-button"
          >
            <CheckCircle size={14} weight="bold" /> Apply {okCount} score
            {okCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}

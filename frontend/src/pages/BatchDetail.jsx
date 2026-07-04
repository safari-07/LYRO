import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import api from "@/lib/api";
import Layout from "@/components/Layout";
import {
  Plus,
  Users,
  Exam,
  ChartLineUp,
  Trash,
  WarningDiamond,
  Trophy,
  ArrowRight,
  PencilSimpleLine,
  UserCircle,
} from "@phosphor-icons/react";

const TABS = ["dashboard", "students", "tests"];

export default function BatchDetail() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [students, setStudents] = useState([]);
  const [tests, setTests] = useState([]);
  const [syllabus, setSyllabus] = useState(null);

  const loadBatch = async () => {
    const r = await api.get(`/batches/${batchId}`);
    setBatch(r.data);
    const syl = await api.get(`/syllabus/${r.data.course}`);
    setSyllabus(syl.data);
  };
  const loadDashboard = async () => {
    const r = await api.get(`/batches/${batchId}/dashboard`);
    setDashboard(r.data);
  };
  const loadStudents = async () => {
    const r = await api.get(`/batches/${batchId}/students`);
    setStudents(r.data);
  };
  const loadTests = async () => {
    const r = await api.get(`/batches/${batchId}/tests`);
    setTests(r.data);
  };

  useEffect(() => {
    loadBatch().catch(() => {
      toast.error("Batch not found");
      navigate("/");
    });
  }, [batchId]);

  useEffect(() => {
    if (!batch) return;
    if (tab === "dashboard") loadDashboard();
    if (tab === "students") loadStudents();
    if (tab === "tests") loadTests();
  }, [tab, batch]);

  if (!batch) {
    return (
      <Layout>
        <p className="text-sm text-[#71717A]">Loading batch...</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <button
        data-testid="back-to-batches"
        onClick={() => navigate("/")}
        className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717A] hover:text-[#0A2540] mb-4"
      >
        ← All batches
      </button>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <span className="lyro-badge" data-testid="batch-course-badge">
            {batch.course}
          </span>
          <h1
            className="font-display font-black text-4xl sm:text-5xl mt-2 tracking-tight leading-none"
            data-testid="batch-title"
          >
            {batch.name}
          </h1>
        </div>
      </div>

      <div
        className="flex gap-1 border-b border-[#E4E4E7] mb-6 overflow-x-auto"
        data-testid="batch-tabs"
      >
        {TABS.map((t) => (
          <button
            key={t}
            data-testid={`tab-${t}`}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] transition-all border-b-2 -mb-px ${
              tab === t
                ? "text-[#0A2540] border-[#0A2540]"
                : "text-[#71717A] border-transparent hover:text-[#0A2540]"
            }`}
          >
            {t === "dashboard" ? "Overview" : t}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <DashboardTab
          dashboard={dashboard}
          batchId={batchId}
          onGoStudents={() => setTab("students")}
          onGoTests={() => setTab("tests")}
        />
      )}
      {tab === "students" && (
        <StudentsTab
          batchId={batchId}
          students={students}
          reload={loadStudents}
          course={batch.course}
        />
      )}
      {tab === "tests" && (
        <TestsTab
          batchId={batchId}
          tests={tests}
          reload={loadTests}
          syllabus={syllabus}
        />
      )}
    </Layout>
  );
}

/* ---------- Dashboard tab ---------- */
function DashboardTab({ dashboard, batchId, onGoStudents, onGoTests }) {
  const navigate = useNavigate();
  if (!dashboard) return <p className="text-sm text-[#71717A]">Loading...</p>;
  const {
    class_average,
    top_performers,
    at_risk,
    student_count,
    test_count,
    ranking,
  } = dashboard;

  const empty = student_count === 0 || test_count === 0;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Students"
          value={student_count}
          icon={<Users size={18} weight="bold" />}
          testid="stat-students"
          onClick={onGoStudents}
        />
        <StatCard
          label="Tests"
          value={test_count}
          icon={<Exam size={18} weight="bold" />}
          testid="stat-tests"
          onClick={onGoTests}
        />
        <StatCard
          label="Class Avg"
          value={class_average !== null ? `${class_average}%` : "—"}
          icon={<ChartLineUp size={18} weight="bold" />}
          testid="stat-class-avg"
        />
        <StatCard
          label="At Risk"
          value={at_risk.length}
          icon={<WarningDiamond size={18} weight="bold" />}
          testid="stat-at-risk"
          danger={at_risk.length > 0}
        />
      </div>

      {empty && (
        <div className="lyro-card p-6 bg-[#F4F4F5]">
          <p className="lyro-eyebrow">Get started</p>
          <h3 className="font-display font-bold text-xl mt-1">
            Add students → create a test → enter marks
          </h3>
          <p className="text-sm text-[#71717A] mt-2">
            The dashboard lights up once you have at least one test with marks.
          </p>
          <div className="flex gap-2 mt-4">
            <button
              data-testid="quick-add-students"
              onClick={onGoStudents}
              className="lyro-btn-primary"
            >
              <Plus size={14} weight="bold" /> Add students
            </button>
            <button
              data-testid="quick-add-test"
              onClick={onGoTests}
              className="lyro-btn-secondary"
            >
              <Plus size={14} weight="bold" /> Create test
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lyro-card p-6" data-testid="top-performers-card">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={18} weight="fill" color="#0A2540" />
            <p className="lyro-eyebrow">Top performers</p>
          </div>
          {top_performers.length === 0 ? (
            <p className="text-sm text-[#71717A]">No scores yet.</p>
          ) : (
            <ul className="divide-y divide-[#E4E4E7]">
              {top_performers.map((p, i) => (
                <li
                  key={p.student_id}
                  className="py-3 flex items-center justify-between cursor-pointer hover:bg-[#F4F4F5] -mx-3 px-3"
                  onClick={() => navigate(`/students/${p.student_id}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-display font-black text-2xl text-[#0A2540] w-8">
                      #{i + 1}
                    </span>
                    <span className="font-semibold">{p.name}</span>
                  </div>
                  <span className="font-mono font-bold text-[#166534]">
                    {p.avg_percent}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className={`lyro-card p-6 ${at_risk.length > 0 ? "border-[#DC2626]" : ""}`}
          data-testid="at-risk-card"
        >
          <div className="flex items-center gap-2 mb-4">
            <WarningDiamond
              size={18}
              weight="fill"
              color={at_risk.length > 0 ? "#DC2626" : "#71717A"}
            />
            <p className="lyro-eyebrow">
              At risk (dropped &gt; 15% vs previous test)
            </p>
          </div>
          {at_risk.length === 0 ? (
            <p className="text-sm text-[#71717A]">
              Nobody on the danger list. Keep it up.
            </p>
          ) : (
            <ul className="divide-y divide-[#E4E4E7]">
              {at_risk.map((r) => (
                <li
                  key={r.student_id}
                  data-testid={`at-risk-row-${r.student_id}`}
                  className="py-3 flex items-center justify-between cursor-pointer hover:bg-[#FEF2F2] -mx-3 px-3"
                  onClick={() => navigate(`/students/${r.student_id}`)}
                >
                  <div>
                    <p className="font-semibold text-[#DC2626]">{r.name}</p>
                    <p className="text-xs text-[#71717A] mt-0.5">
                      {r.previous_percent}% → {r.latest_percent}%
                    </p>
                  </div>
                  <span className="lyro-badge-danger">
                    ↓ {r.drop_percent}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {ranking && ranking.length > 0 && (
        <div className="lyro-card p-0 overflow-hidden" data-testid="ranking-table">
          <div className="p-6 pb-3 flex items-center justify-between">
            <p className="lyro-eyebrow">Full ranking</p>
            <span className="text-xs text-[#71717A]">Click a row to open profile</span>
          </div>
          <div className="overflow-x-auto">
            <table className="lyro-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Student</th>
                  <th className="text-right">Avg %</th>
                  <th className="text-right hidden sm:table-cell">Latest</th>
                  <th className="text-right hidden sm:table-cell">Tests</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr
                    key={r.student_id}
                    onClick={() => navigate(`/students/${r.student_id}`)}
                    className="cursor-pointer hover:bg-[#F4F4F5]"
                    data-testid={`ranking-row-${r.student_id}`}
                  >
                    <td className="font-mono font-bold">
                      {r.avg_percent === null ? "—" : `#${i + 1}`}
                    </td>
                    <td className="font-semibold">{r.name}</td>
                    <td className="text-right font-mono">
                      {r.avg_percent === null ? "—" : `${r.avg_percent}%`}
                    </td>
                    <td className="text-right font-mono hidden sm:table-cell">
                      {r.latest_percent === null ? "—" : `${r.latest_percent}%`}
                    </td>
                    <td className="text-right font-mono hidden sm:table-cell">
                      {r.test_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, testid, danger, onClick }) {
  return (
    <div
      data-testid={testid}
      onClick={onClick}
      className={`lyro-card p-5 ${onClick ? "cursor-pointer lyro-card-interactive" : ""} ${
        danger ? "border-[#DC2626] bg-[#FEF2F2]" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${danger ? "text-[#DC2626]" : "text-[#71717A]"}`}>
          {label}
        </p>
        <span className={danger ? "text-[#DC2626]" : "text-[#0A2540]"}>{icon}</span>
      </div>
      <p
        className={`font-display font-black text-4xl mt-2 tracking-tight ${
          danger ? "text-[#DC2626]" : "text-[#18181B]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/* ---------- Students tab ---------- */
function StudentsTab({ batchId, students, reload, course }) {
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [override, setOverride] = useState("");
  const [saving, setSaving] = useState(false);

  const onAdd = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setSaving(true);
    try {
      await api.post(`/batches/${batchId}/students`, {
        name,
        parent_whatsapp: phone,
        course_override: override || null,
      });
      toast.success("Student added");
      setName("");
      setPhone("");
      setOverride("");
      reload();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (s) => {
    if (!window.confirm(`Remove ${s.name}?`)) return;
    await api.delete(`/students/${s.id}`);
    toast.success("Student removed");
    reload();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="lyro-eyebrow">
          {students.length} student{students.length !== 1 ? "s" : ""}
        </p>
        <button
          data-testid="show-add-student-button"
          onClick={() => setShowAdd((v) => !v)}
          className="lyro-btn-primary"
        >
          <Plus size={14} weight="bold" /> Add student
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={onAdd}
          data-testid="add-student-form"
          className="lyro-card p-6 mb-6 animate-in slide-in-from-top-2 duration-200"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="lyro-label">Student name</label>
              <input
                data-testid="student-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="lyro-input"
                required
              />
            </div>
            <div>
              <label className="lyro-label">Parent WhatsApp</label>
              <input
                data-testid="student-phone-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98..."
                className="lyro-input"
                required
              />
            </div>
            <div>
              <label className="lyro-label">Course override (optional)</label>
              <select
                data-testid="student-override-select"
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                className="lyro-input"
              >
                <option value="">Same as batch ({course})</option>
                {["JEE", "NEET", "NDA", "Boards"]
                  .filter((c) => c !== course)
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              data-testid="submit-student-button"
              disabled={saving}
              className="lyro-btn-primary"
            >
              {saving ? "Adding..." : "Add student"}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="lyro-btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {students.length === 0 ? (
        <div className="lyro-card p-8 text-center">
          <div className="w-12 h-12 mx-auto bg-[#F4F4F5] flex items-center justify-center mb-3">
            <Users size={24} weight="bold" color="#0A2540" />
          </div>
          <p className="font-display font-bold text-xl">No students yet</p>
          <p className="text-sm text-[#71717A] mt-1">
            Add your students to start tracking marks.
          </p>
        </div>
      ) : (
        <div className="lyro-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="lyro-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="hidden sm:table-cell">Parent WhatsApp</th>
                  <th>Course</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr
                    key={s.id}
                    data-testid={`student-row-${s.id}`}
                    className="hover:bg-[#F4F4F5]"
                  >
                    <td>
                      <button
                        data-testid={`open-student-${s.id}`}
                        onClick={() => navigate(`/students/${s.id}`)}
                        className="flex items-center gap-2 font-semibold hover:text-[#0A2540]"
                      >
                        <UserCircle size={18} weight="bold" color="#0A2540" />
                        {s.name}
                      </button>
                    </td>
                    <td className="hidden sm:table-cell font-mono text-xs">
                      {s.parent_whatsapp}
                    </td>
                    <td>
                      <span className="lyro-badge">
                        {s.course_override || course}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        data-testid={`delete-student-${s.id}`}
                        onClick={() => onDelete(s)}
                        className="text-[#71717A] hover:text-[#DC2626]"
                      >
                        <Trash size={15} weight="bold" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Tests tab ---------- */
function TestsTab({ batchId, tests, reload, syllabus }) {
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [maxMarks, setMaxMarks] = useState(100);
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);

  const subjects = syllabus?.subjects || [];
  const chapters = useMemo(
    () => subjects.find((s) => s.name === subject)?.chapters || [],
    [subject, subjects],
  );

  const onAdd = async (e) => {
    e.preventDefault();
    if (!name || !subject || !chapter || !maxMarks || !date) return;
    setSaving(true);
    try {
      await api.post(`/batches/${batchId}/tests`, {
        name,
        subject,
        chapter,
        max_marks: Number(maxMarks),
        date,
      });
      toast.success("Test created");
      setName("");
      setSubject("");
      setChapter("");
      setMaxMarks(100);
      setShowAdd(false);
      reload();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (t) => {
    if (!window.confirm(`Delete "${t.name}" and its marks?`)) return;
    await api.delete(`/tests/${t.id}`);
    toast.success("Test deleted");
    reload();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="lyro-eyebrow">
          {tests.length} test{tests.length !== 1 ? "s" : ""}
        </p>
        <button
          data-testid="show-add-test-button"
          onClick={() => setShowAdd((v) => !v)}
          className="lyro-btn-primary"
        >
          <Plus size={14} weight="bold" /> New test
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={onAdd}
          data-testid="add-test-form"
          className="lyro-card p-6 mb-6 animate-in slide-in-from-top-2 duration-200"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="lyro-label">Test name</label>
              <input
                data-testid="test-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Weekly Test 3 — Kinematics"
                className="lyro-input"
                required
              />
            </div>
            <div>
              <label className="lyro-label">Subject</label>
              <select
                data-testid="test-subject-select"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setChapter("");
                }}
                className="lyro-input"
                required
              >
                <option value="">Select subject</option>
                {subjects.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
                {subjects.length === 0 && (
                  <option value="__custom">
                    (Syllabus not populated — type freely)
                  </option>
                )}
              </select>
              {subjects.length === 0 && (
                <input
                  className="lyro-input mt-2"
                  placeholder="Type subject"
                  value={subject === "__custom" ? "" : subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              )}
            </div>
            <div>
              <label className="lyro-label">Chapter</label>
              {chapters.length > 0 ? (
                <select
                  data-testid="test-chapter-select"
                  value={chapter}
                  onChange={(e) => setChapter(e.target.value)}
                  className="lyro-input"
                  required
                >
                  <option value="">Select chapter</option>
                  {chapters.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  data-testid="test-chapter-input"
                  className="lyro-input"
                  placeholder="Type chapter"
                  value={chapter}
                  onChange={(e) => setChapter(e.target.value)}
                  required
                />
              )}
            </div>
            <div>
              <label className="lyro-label">Max marks</label>
              <input
                data-testid="test-max-marks-input"
                type="number"
                min={1}
                value={maxMarks}
                onChange={(e) => setMaxMarks(e.target.value)}
                className="lyro-input"
                required
              />
            </div>
            <div>
              <label className="lyro-label">Date</label>
              <input
                data-testid="test-date-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="lyro-input"
                required
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              data-testid="submit-test-button"
              disabled={saving}
              className="lyro-btn-primary"
            >
              {saving ? "Creating..." : "Create test"}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="lyro-btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {tests.length === 0 ? (
        <div className="lyro-card p-8 text-center">
          <div className="w-12 h-12 mx-auto bg-[#F4F4F5] flex items-center justify-center mb-3">
            <Exam size={24} weight="bold" color="#0A2540" />
          </div>
          <p className="font-display font-bold text-xl">No tests yet</p>
          <p className="text-sm text-[#71717A] mt-1">
            Create a test to start entering marks.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tests.map((t) => (
            <div
              key={t.id}
              data-testid={`test-card-${t.id}`}
              className="lyro-card p-5 lyro-card-interactive flex flex-col"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#71717A]">
                    {t.subject} · {t.chapter}
                  </p>
                  <h3 className="font-display font-bold text-lg mt-1 leading-tight">
                    {t.name}
                  </h3>
                </div>
                <button
                  data-testid={`delete-test-${t.id}`}
                  onClick={() => onDelete(t)}
                  className="text-[#71717A] hover:text-[#DC2626]"
                >
                  <Trash size={15} weight="bold" />
                </button>
              </div>
              <div className="flex items-center gap-4 mt-4 text-xs text-[#71717A]">
                <span>Max {t.max_marks}</span>
                <span>· {new Date(t.date).toLocaleDateString()}</span>
              </div>
              <div className="mt-4 pt-4 border-t border-[#E4E4E7] flex items-center justify-between">
                <button
                  data-testid={`enter-marks-${t.id}`}
                  onClick={() => navigate(`/tests/${t.id}/marks`)}
                  className="text-xs font-bold uppercase tracking-widest text-[#0A2540] hover:underline inline-flex items-center gap-1"
                >
                  <PencilSimpleLine size={14} weight="bold" /> Enter marks
                </button>
                <ArrowRight size={14} weight="bold" color="#0A2540" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

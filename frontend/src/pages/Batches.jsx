import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "@/lib/api";
import Layout from "@/components/Layout";
import {
  Plus,
  Users,
  Exam,
  ArrowRight,
  Trash,
  BookOpen,
} from "@phosphor-icons/react";

const COURSES = ["JEE", "NEET", "NDA", "Boards"];

export default function Batches() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [course, setCourse] = useState("JEE");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const r = await api.get("/batches");
      setBatches(r.data);
    } catch (e) {
      toast.error("Failed to load batches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.post("/batches", { name, course });
      setName("");
      setCourse("JEE");
      setShowCreate(false);
      toast.success("Batch created");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (b) => {
    if (!window.confirm(`Delete batch "${b.name}"? All tests & marks will be removed.`))
      return;
    try {
      await api.delete(`/batches/${b.id}`);
      toast.success("Batch deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <p className="lyro-eyebrow">Your batches</p>
          <h1 className="font-display font-black text-4xl sm:text-5xl mt-1 tracking-tight leading-none">
            Every mark tells a story.
          </h1>
          <p className="text-sm text-[#71717A] mt-3 max-w-xl">
            Create a batch, add students, enter test scores, and let LYRO turn them
            into progress notes parents actually understand.
          </p>
        </div>
        <button
          data-testid="new-batch-button"
          onClick={() => setShowCreate((v) => !v)}
          className="lyro-btn-primary"
        >
          <Plus size={16} weight="bold" /> New batch
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={onCreate}
          data-testid="create-batch-form"
          className="lyro-card p-6 mb-8 animate-in slide-in-from-top-2 duration-200"
        >
          <p className="lyro-eyebrow mb-4">Create batch</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="lyro-label">Batch name</label>
              <input
                data-testid="batch-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. JEE Batch 2026 – Alpha"
                className="lyro-input"
                required
              />
            </div>
            <div>
              <label className="lyro-label">Course</label>
              <select
                data-testid="batch-course-select"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="lyro-input"
              >
                {COURSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              data-testid="submit-batch-button"
              disabled={saving}
              className="lyro-btn-primary"
            >
              {saving ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="lyro-btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-[#71717A]">Loading...</p>
      ) : batches.length === 0 ? (
        <div className="lyro-card p-10 text-center">
          <div className="w-14 h-14 mx-auto bg-[#F4F4F5] flex items-center justify-center mb-4">
            <BookOpen size={28} weight="bold" color="#0A2540" />
          </div>
          <p className="font-display font-bold text-2xl">No batches yet</p>
          <p className="text-sm text-[#71717A] mt-2">
            Start by creating your first batch — takes 5 seconds.
          </p>
          <button
            data-testid="empty-create-batch-button"
            onClick={() => setShowCreate(true)}
            className="lyro-btn-primary mt-6"
          >
            <Plus size={16} weight="bold" /> Create first batch
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map((b) => (
            <div
              key={b.id}
              data-testid={`batch-card-${b.id}`}
              className="lyro-card lyro-card-interactive p-6 flex flex-col cursor-pointer group"
              onClick={() => navigate(`/batches/${b.id}`)}
            >
              <div className="flex items-start justify-between mb-4">
                <span className="lyro-badge">{b.course}</span>
                <button
                  data-testid={`delete-batch-${b.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(b);
                  }}
                  className="text-[#71717A] hover:text-[#DC2626] transition-colors"
                >
                  <Trash size={16} weight="bold" />
                </button>
              </div>
              <h3 className="font-display font-black text-2xl leading-tight tracking-tight mb-4">
                {b.name}
              </h3>
              <div className="flex items-center gap-4 text-xs text-[#71717A] mt-auto">
                <span className="inline-flex items-center gap-1.5">
                  <Users size={14} weight="bold" /> {b.student_count} students
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Exam size={14} weight="bold" /> {b.test_count} tests
                </span>
              </div>
              <div className="mt-4 pt-4 border-t border-[#E4E4E7] flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-[#0A2540]">
                  Open
                </span>
                <ArrowRight
                  size={16}
                  weight="bold"
                  className="text-[#0A2540] group-hover:translate-x-1 transition-transform"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}

import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { signalAPI } from "@/api/signals";
import { DEFAULT_CRITERIA, MEDIUM_IDS, MEDIUMS, WINDOWS } from "@/lib/signalOptions";
import PlatformHeader from "@/components/signals/PlatformHeader";
import MediumIcon from "@/components/signals/MediumIcon";
import Footer from "@/components/podcast/Footer";

const ease = [0.16, 1, 0.3, 1];
const inputClass =
  "w-full bg-transparent border-b border-graphite/15 focus:border-cobalt outline-none py-2 font-body text-sm text-graphite placeholder:text-graphite/30";

function defaultStructure(medium) {
  return MEDIUMS.find((m) => m.id === medium)?.defaultStructure || "";
}

const EMPTY = {
  title: "",
  description: "",
  medium: "podcast",
  model: "",
  structure_prompt: defaultStructure("podcast"),
  criteria: DEFAULT_CRITERIA,
  visibility: "public",
};

export default function SignalEditor() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const editing = Boolean(slug);
  const navigate = useNavigate();
  const requestedMedium = MEDIUM_IDS.includes(params.get("medium")) ? params.get("medium") : "podcast";
  const [form, setForm] = useState(EMPTY);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const work = [signalAPI.options()];
    if (editing) work.push(signalAPI.get(slug));
    Promise.all(work)
      .then(([options, existing]) => {
        setModels(options.models || []);
        if (existing) {
          if (!existing.signal.is_owner) {
            navigate(`/signals/${slug}`, { replace: true });
            return;
          }
          const s = existing.signal;
          setForm({
            title: s.title,
            description: s.description,
            medium: s.medium,
            model: s.model,
            structure_prompt: s.structure_prompt,
            criteria: { ...DEFAULT_CRITERIA, ...s.criteria },
            visibility: s.visibility,
          });
        } else {
          setForm((f) => ({
            ...f,
            medium: requestedMedium,
            structure_prompt: defaultStructure(requestedMedium),
            model: options.default_model || options.models?.[0] || "",
          }));
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug, editing, requestedMedium, navigate]);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function setCriteria(field, value) {
    setForm((f) => ({ ...f, criteria: { ...f.criteria, [field]: value } }));
  }

  function pickMedium(medium) {
    setForm((f) => {
      const untouched = !f.structure_prompt.trim() || f.structure_prompt === defaultStructure(f.medium);
      return { ...f, medium, structure_prompt: untouched ? defaultStructure(medium) : f.structure_prompt };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data = editing ? await signalAPI.update(slug, form) : await signalAPI.create(form);
      navigate(`/signals/${data.signal.slug}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this collection and everything it generated?")) return;
    try {
      await signalAPI.remove(slug);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  const c = form.criteria;

  return (
    <div className="min-h-screen bg-alabaster">
      <PlatformHeader />
      <div className="max-w-3xl mx-auto px-6 md:px-16 pt-8 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease }}
          className="mb-12 space-y-4"
        >
          <p className="font-mono text-[11px] tracking-[0.4em] uppercase text-cobalt">
            {editing ? "Edit collection" : "New collection"}
          </p>
          <h1 className="font-heading text-4xl md:text-5xl font-bold text-graphite italic">
            {editing ? "Update this collection" : "Start a collection"}
          </h1>
          <p className="font-body text-sm text-graphite/55 max-w-xl">
            A collection is a topic plus a format. Choose how papers should be presented —
            podcast, TED-style talk, slides, or video — then search PubMed or upload a PDF later.
          </p>
        </motion.div>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-graphite/10 border-t-cobalt rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-14">
            <Section number="01" title="Name it">
              <Field label="Title">
                <input required value={form.title} onChange={set("title")} placeholder="Pancreatic Cancer Weekly" className={inputClass} maxLength={80} />
              </Field>
              <Field label="Description">
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={set("description")}
                  placeholder="What this collection covers and who it is for"
                  className={`${inputClass} resize-none`}
                  maxLength={600}
                />
              </Field>
            </Section>

            <Section number="02" title="How should each paper be presented?">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {MEDIUMS.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => pickMedium(m.id)}
                    aria-pressed={form.medium === m.id}
                    className={`text-left rounded-xl border p-4 transition-colors ${
                      form.medium === m.id ? "border-cobalt bg-cobalt/5" : "border-graphite/10 bg-white hover:border-graphite/30"
                    }`}
                  >
                    <MediumIcon medium={m.id} className={`w-5 h-5 ${form.medium === m.id ? "text-cobalt" : "text-graphite/40"}`} />
                    <p className="font-heading text-lg font-semibold text-graphite mt-2">{m.action}</p>
                    <p className="font-body text-xs text-graphite/50 mt-1">{m.blurb}</p>
                  </button>
                ))}
              </div>
              <p className="font-body text-xs text-graphite/40">This is the default format. You can pick a different one each time you convert a paper.</p>
            </Section>

            <Section number="03" title="Model and structure">
              <Field label="Model">
                <select value={form.model} onChange={set("model")} className={`${inputClass} font-mono text-xs`}>
                  {models.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </Field>
              <Field label="How should the content be structured?">
                <textarea
                  rows={6}
                  value={form.structure_prompt}
                  onChange={set("structure_prompt")}
                  className="w-full bg-white border border-graphite/15 focus:border-cobalt outline-none p-3 font-body text-sm text-graphite rounded-lg"
                  maxLength={4000}
                />
                <div className="flex items-center justify-between">
                  <p className="font-body text-xs text-graphite/40">
                    Describe the arc, tone, audience, and what to emphasize. Source-accuracy rules always apply.
                  </p>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, structure_prompt: defaultStructure(f.medium) }))}
                    className="font-mono text-[10px] uppercase tracking-widest text-graphite/40 hover:text-cobalt shrink-0 ml-4"
                  >
                    Reset to template
                  </button>
                </div>
              </Field>
            </Section>

            <Section number="04" title="Which papers?">
              <Field label="Keywords (comma separated)">
                <input
                  value={c.keywords}
                  onChange={(e) => setCriteria("keywords", e.target.value)}
                  placeholder="pancreatic cancer, KRAS, liquid biopsy"
                  className={inputClass}
                />
                <p className="font-body text-xs text-graphite/40">Matched against titles and abstracts; any keyword counts.</p>
              </Field>
              <Field label="Advanced PubMed query (optional)">
                <input
                  value={c.topic_query}
                  onChange={(e) => setCriteria("topic_query", e.target.value)}
                  placeholder='pancreatic neoplasms[mh] AND "single-cell"[tiab]'
                  className={`${inputClass} font-mono text-xs`}
                />
                <p className="font-body text-xs text-graphite/40">
                  Uses <a href="https://pubmed.ncbi.nlm.nih.gov/help/#search-tags" target="_blank" rel="noopener noreferrer" className="text-cobalt hover:underline">PubMed search tags</a>. Combined with keywords using AND.
                </p>
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Field label="Published within">
                  <select value={c.window} onChange={(e) => setCriteria("window", e.target.value)} className={`${inputClass} font-mono text-xs`}>
                    {WINDOWS.map((w) => (
                      <option key={w.id} value={w.id}>{w.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="space-y-3">
                <Toggle checked={c.require_nci} onChange={(v) => setCriteria("require_nci", v)} label="NCI-supported papers only" hint="Keeps papers with a National Cancer Institute (CA) grant." />
                <Toggle checked={c.journals_only} onChange={(v) => setCriteria("journals_only", v)} label="Flagship journals only" hint="Nature, Science, Cell, Cancer Cell, Nature Cancer / Medicine / Genetics, Cancer Discovery." />
                <Toggle checked={c.require_outputs} onChange={(v) => setCriteria("require_outputs", v)} label="Must share data or code" hint="Keeps papers whose title, abstract, or PubMed record names a deposit (GEO, SRA, dbGaP, GitHub, Zenodo, Figshare, PRIDE, ArrayExpress, and similar). Generation then scans the full paper for every reusable link." />
              </div>
              <p className="font-body text-xs text-graphite/40">
                Matching papers are ranked by PubMed Trending. You pick which ones to convert.
              </p>
            </Section>

            <Section number="05" title="Who can see it?">
              <div className="flex flex-wrap gap-3">
                {[
                  { id: "public", label: "Public", hint: "Listed with community collections" },
                  { id: "unlisted", label: "Unlisted", hint: "Only people with the link" },
                ].map((v) => (
                  <button
                    type="button"
                    key={v.id}
                    onClick={() => setForm((f) => ({ ...f, visibility: v.id }))}
                    aria-pressed={form.visibility === v.id}
                    className={`text-left rounded-xl border px-4 py-3 ${form.visibility === v.id ? "border-cobalt bg-cobalt/5" : "border-graphite/10 bg-white"}`}
                  >
                    <p className="font-mono text-xs uppercase tracking-widest text-graphite">{v.label}</p>
                    <p className="font-body text-xs text-graphite/45 mt-1">{v.hint}</p>
                  </button>
                ))}
              </div>
            </Section>

            {error && <p className="font-mono text-xs text-red-500">{error}</p>}

            <div className="flex flex-wrap items-center gap-6">
              <button
                type="submit"
                disabled={saving}
                className="font-mono text-xs uppercase tracking-widest bg-cobalt text-white px-6 py-3 rounded-full hover:bg-cobalt/90 disabled:opacity-50"
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Create collection"}
              </button>
              {editing && (
                <button type="button" onClick={handleDelete} className="font-mono text-xs uppercase tracking-widest text-graphite/40 hover:text-red-500">
                  Delete collection
                </button>
              )}
            </div>
          </form>
        )}
      </div>
      <Footer platform />
    </div>
  );
}

function Section({ number, title, children }) {
  return (
    <section className="space-y-6">
      <div className="flex items-baseline gap-3 border-b border-graphite/10 pb-3">
        <span className="font-mono text-[11px] text-cobalt">{number}</span>
        <h2 className="font-heading text-2xl font-semibold text-graphite">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] tracking-widest uppercase text-graphite/40">{label}</p>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-cobalt" />
      <span>
        <span className="font-body text-sm text-graphite">{label}</span>
        <span className="block font-body text-xs text-graphite/40">{hint}</span>
      </span>
    </label>
  );
}

import { useState, useEffect, useRef } from 'react';
import { authFetch } from '../auth';

// No page for this ever existed even though the server API (routes/resumes.js)
// was fully built — resumeRouting.js (agents/resumeRouting.js) always found
// zero ResumeVariant documents as a result, so every application submitted
// so far went out with NO resume file attached (apply-adapters only upload
// when resumeVariant?.storageKey is truthy, silently skipping otherwise).
export default function ResumesPage() {
  const [variants, setVariants] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [label, setLabel] = useState('');
  const [tags, setTags] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const fileRef = useRef(null);

  const load = () => {
    authFetch('/resumes')
      .then(r => r.json())
      .then(setVariants)
      .catch(() => setVariants([]));
  };

  useEffect(() => { load(); }, []);

  const upload = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Choose a PDF or Word file first.'); return; }
    if (!label.trim()) { setError('Give this resume a label, e.g. "Fullstack-Generic".'); return; }

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('label', label.trim());
      formData.append('tags', tags);
      formData.append('isDefault', String(makeDefault));

      const res = await authFetch('/resumes', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setLabel(''); setTags(''); setMakeDefault(false);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const setDefault = async (id) => {
    await authFetch(`/resumes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    });
    load();
  };

  const remove = async (id) => {
    await authFetch(`/resumes/${id}`, { method: 'DELETE' });
    load();
  };

  if (!variants) return <main><p className="msg">Loading resumes…</p></main>;

  return (
    <main>
      <div className="profile-page">
        <div className="profile-section-label">
          <span>Resumes</span>
          <span className="profile-section-label-sub">
            Uploaded here is the ONLY way a resume file gets attached to an application — resumeRouting picks among these by tag overlap with the job description, and the apply-adapters upload whichever one it picks. Without at least one uploaded, every submission goes out with no resume.
          </span>
        </div>

        <div className="profile-section">
          <div className="profile-section-top">
            <span className="profile-section-icon">📄</span>
            <div className="profile-section-meta">
              <div className="profile-section-title">Upload a resume</div>
              <div className="profile-section-desc">PDF or Word, up to 8MB. Tag it (e.g. "react, frontend") so routing can match it to relevant jobs.</div>
            </div>
          </div>
          <form className="cpf-project-form" onSubmit={upload}>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="tag-input" />
            <input className="tag-input" value={label} onChange={e => setLabel(e.target.value)} placeholder='Label, e.g. "Fullstack-Generic"' />
            <input className="tag-input" value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags, comma-separated, e.g. react, node, fullstack" />
            <label className="cpf-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={makeDefault} onChange={e => setMakeDefault(e.target.checked)} />
              Set as default
            </label>
            <button className="tag-add-btn" type="submit" disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload resume'}
            </button>
          </form>
          {error && <p className="msg error">{error}</p>}
        </div>

        <div className="profile-section">
          <div className="profile-section-top">
            <span className="profile-section-icon">🗂️</span>
            <div className="profile-section-meta">
              <div className="profile-section-title">Your resumes</div>
              <div className="profile-section-desc">The default is used when no tag clearly wins for a given job.</div>
            </div>
            <span className="profile-tag-count">{variants.length}</span>
          </div>
          {variants.length === 0 ? (
            <p className="aq-row-sub">No resumes uploaded yet — applications will go out with no resume attached until you add one.</p>
          ) : (
            <div className="cpf-row-list">
              {variants.map(v => (
                <div className="cpf-project-row" key={v._id}>
                  <div className="cpf-row-main">
                    {v.label} {v.isDefault && <span className="cpf-fact-id">default</span>}
                  </div>
                  <div className="cpf-row-sub">{v.originalFileName} · {(v.size / 1024).toFixed(0)} KB</div>
                  {v.tags?.length > 0 && <div className="cpf-row-tech">{v.tags.join(' · ')}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    {!v.isDefault && (
                      <button className="tag-add-btn" onClick={() => setDefault(v._id)}>Make default</button>
                    )}
                    <button className="tag-remove" onClick={() => remove(v._id)} title="Remove">×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

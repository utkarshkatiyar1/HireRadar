import { useState, useEffect, useRef } from 'react';
import { authFetch } from '../auth';

// Repeatable skill row (skill name + years) — TagEditor only handles
// single-value tags, this handles name+number pairs.
function SkillEditor({ skills, onChange }) {
  const [name, setName] = useState('');
  const [years, setYears] = useState('');
  const nameRef = useRef(null);

  const add = () => {
    const n = name.trim();
    if (!n) return;
    onChange([...skills, { name: n, yearsExp: Number(years) || 0, evidenceIds: [] }]);
    setName(''); setYears('');
    nameRef.current?.focus();
  };

  const remove = (idx) => onChange(skills.filter((_, i) => i !== idx));

  return (
    <div className="cpf-repeat-editor">
      {skills.length > 0 && (
        <div className="cpf-row-list">
          {skills.map((s, i) => (
            <div className="cpf-row" key={i}>
              <span className="cpf-row-main">{s.name}</span>
              <span className="cpf-row-sub">{s.yearsExp} yr{s.yearsExp === 1 ? '' : 's'}</span>
              <button className="tag-remove" onClick={() => remove(i)} title="Remove">×</button>
            </div>
          ))}
        </div>
      )}
      <div className="tag-input-row">
        <input ref={nameRef} className="tag-input" value={name} onChange={e => setName(e.target.value)} placeholder="Skill name, e.g. React" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <input className="cpf-years-input" type="number" min="0" value={years} onChange={e => setYears(e.target.value)} placeholder="Years" />
        <button className="tag-add-btn" onClick={add}>Add</button>
      </div>
    </div>
  );
}

// Repeatable project block (title + description + tech).
function ProjectEditor({ projects, onChange }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tech, setTech] = useState('');

  const add = () => {
    if (!title.trim()) return;
    onChange([...projects, { title: title.trim(), description: description.trim(), techStack: tech.split(',').map(t => t.trim()).filter(Boolean) }]);
    setTitle(''); setDescription(''); setTech('');
  };

  const remove = (idx) => onChange(projects.filter((_, i) => i !== idx));

  return (
    <div className="cpf-repeat-editor">
      {projects.length > 0 && (
        <div className="cpf-row-list">
          {projects.map((p, i) => (
            <div className="cpf-project-row" key={i}>
              <div className="cpf-row-main">{p.title}</div>
              <div className="cpf-row-sub">{p.description}</div>
              {p.techStack?.length > 0 && <div className="cpf-row-tech">{p.techStack.join(' · ')}</div>}
              <button className="tag-remove" onClick={() => remove(i)} title="Remove">×</button>
            </div>
          ))}
        </div>
      )}
      <div className="cpf-project-form">
        <input className="tag-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Project title" />
        <textarea className="cpf-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description — only facts you can stand behind; the answer agent quotes this directly" />
        <input className="tag-input" value={tech} onChange={e => setTech(e.target.value)} placeholder="Tech stack (comma-separated)" />
        <button className="tag-add-btn" onClick={add}>Add project</button>
      </div>
    </div>
  );
}

// Repeatable fact row — the actual truth-store entries the answer agent is
// allowed to cite (factIds). Each needs a stable id and evidence pointer.
function FactEditor({ facts, onChange }) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [evidence, setEvidence] = useState('');

  const add = () => {
    if (!id.trim() || !value.trim()) return;
    onChange([...facts, { id: id.trim(), label: label.trim() || id.trim(), value: value.trim(), evidence: evidence.trim(), approved: true }]);
    setId(''); setLabel(''); setValue(''); setEvidence('');
  };

  const remove = (factId) => onChange(facts.filter(f => f.id !== factId));

  return (
    <div className="cpf-repeat-editor">
      {facts.length > 0 && (
        <div className="cpf-row-list">
          {facts.map(f => (
            <div className="cpf-project-row" key={f.id}>
              <div className="cpf-row-main">{f.label} <span className="cpf-fact-id">{f.id}</span></div>
              <div className="cpf-row-sub">{f.value}</div>
              {f.evidence && <div className="cpf-row-tech">Evidence: {f.evidence}</div>}
              <button className="tag-remove" onClick={() => remove(f.id)} title="Remove">×</button>
            </div>
          ))}
        </div>
      )}
      <div className="cpf-project-form">
        <input className="tag-input" value={id} onChange={e => setId(e.target.value)} placeholder="Fact id, e.g. employment.acme.startDate" />
        <input className="tag-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="Label, e.g. Start date at Acme" />
        <input className="tag-input" value={value} onChange={e => setValue(e.target.value)} placeholder="Value — the exact claim the answer agent may quote" />
        <input className="tag-input" value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Evidence (optional), e.g. Offer letter" />
        <button className="tag-add-btn" onClick={add}>Add fact</button>
      </div>
    </div>
  );
}

const EMPTY = {
  fullName: '', phone: '', currentCTC: '', expectedCTC: '', noticePeriodDays: '', totalExpYears: '',
  skills: [], projects: [], education: [], links: { github: '', linkedin: '', portfolio: '' },
  workAuthorization: '', facts: [],
};

export default function CandidateProfilePage() {
  const [profile, setProfile] = useState(null);
  const [savedProfile, setSavedProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    authFetch('/profile/candidate')
      .then(r => r.json())
      .then(data => {
        const merged = { ...EMPTY, ...data, links: { ...EMPTY.links, ...data.links } };
        setProfile(merged);
        setSavedProfile(merged);
      })
      .catch(() => { setProfile({ ...EMPTY }); setSavedProfile({ ...EMPTY }); });
  }, []);

  const isDirty = profile && savedProfile && JSON.stringify(profile) !== JSON.stringify(savedProfile);

  const set = (key) => (val) => setProfile(p => ({ ...p, [key]: val }));
  const setLink = (key) => (val) => setProfile(p => ({ ...p, links: { ...p.links, [key]: val } }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch('/profile/candidate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setSavedProfile(profile);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError('Failed to save. Try again.');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return <main><p className="msg">Loading candidate profile…</p></main>;

  return (
    <main>
      <div className="profile-page">
        <div className="profile-section-label">
          <span>Candidate Truth Store</span>
          <span className="profile-section-label-sub">
            The ONLY facts the answer-drafting agent is allowed to use — it never invents anything not listed here
          </span>
        </div>

        <div className="profile-section">
          <div className="profile-section-top">
            <span className="profile-section-icon">👤</span>
            <div className="profile-section-meta">
              <div className="profile-section-title">Basics</div>
              <div className="profile-section-desc">Compensation, notice period, total experience.</div>
            </div>
          </div>
          <div className="cpf-grid">
            <label className="cpf-field">Full name
              <input className="tag-input" value={profile.fullName} onChange={e => set('fullName')(e.target.value)} />
            </label>
            <label className="cpf-field">Phone
              <input className="tag-input" value={profile.phone} onChange={e => set('phone')(e.target.value)} />
            </label>
            <label className="cpf-field">Current CTC
              <input className="tag-input" type="number" value={profile.currentCTC} onChange={e => set('currentCTC')(Number(e.target.value))} />
            </label>
            <label className="cpf-field">Expected CTC
              <input className="tag-input" type="number" value={profile.expectedCTC} onChange={e => set('expectedCTC')(Number(e.target.value))} />
            </label>
            <label className="cpf-field">Notice period (days)
              <input className="tag-input" type="number" value={profile.noticePeriodDays} onChange={e => set('noticePeriodDays')(Number(e.target.value))} />
            </label>
            <label className="cpf-field">Total experience (years)
              <input className="tag-input" type="number" value={profile.totalExpYears} onChange={e => set('totalExpYears')(Number(e.target.value))} />
            </label>
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-section-top">
            <span className="profile-section-icon">🔗</span>
            <div className="profile-section-meta">
              <div className="profile-section-title">Links</div>
              <div className="profile-section-desc">Used for direct link-fields in applications.</div>
            </div>
          </div>
          <div className="cpf-grid">
            <label className="cpf-field">GitHub
              <input className="tag-input" value={profile.links.github} onChange={e => setLink('github')(e.target.value)} />
            </label>
            <label className="cpf-field">LinkedIn
              <input className="tag-input" value={profile.links.linkedin} onChange={e => setLink('linkedin')(e.target.value)} />
            </label>
            <label className="cpf-field">Portfolio
              <input className="tag-input" value={profile.links.portfolio} onChange={e => setLink('portfolio')(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-section-top">
            <span className="profile-section-icon">🛂</span>
            <div className="profile-section-meta">
              <div className="profile-section-title">Work Authorization</div>
              <div className="profile-section-desc">Exact, honest statement — the answer agent quotes this verbatim for authorization/sponsorship questions.</div>
            </div>
          </div>
          <textarea className="cpf-textarea" value={profile.workAuthorization} onChange={e => set('workAuthorization')(e.target.value)} placeholder="e.g. Indian citizen, no US work authorization, would require sponsorship" />
        </div>

        <div className="profile-section">
          <div className="profile-section-top">
            <span className="profile-section-icon">⚡</span>
            <div className="profile-section-meta">
              <div className="profile-section-title">Skills</div>
              <div className="profile-section-desc">Used for semantic fit-scoring and resume routing.</div>
            </div>
            <span className="profile-tag-count">{profile.skills.length}</span>
          </div>
          <SkillEditor skills={profile.skills} onChange={set('skills')} />
        </div>

        <div className="profile-section">
          <div className="profile-section-top">
            <span className="profile-section-icon">🧩</span>
            <div className="profile-section-meta">
              <div className="profile-section-title">Projects</div>
              <div className="profile-section-desc">Evidence for skill claims — only describe what actually happened.</div>
            </div>
            <span className="profile-tag-count">{profile.projects.length}</span>
          </div>
          <ProjectEditor projects={profile.projects} onChange={set('projects')} />
        </div>

        <div className="profile-section">
          <div className="profile-section-top">
            <span className="profile-section-icon">📌</span>
            <div className="profile-section-meta">
              <div className="profile-section-title">Facts</div>
              <div className="profile-section-desc">
                Every application answer must cite one of these fact IDs — an answer with no matching fact is left blank, never guessed.
              </div>
            </div>
            <span className="profile-tag-count">{profile.facts.length}</span>
          </div>
          <FactEditor facts={profile.facts} onChange={set('facts')} />
        </div>

        <div className={`profile-save-bar${isDirty ? ' dirty' : ''}`}>
          {error && <span className="profile-error">{error}</span>}
          {isDirty && !error && <span className="profile-unsaved">Unsaved changes</span>}
          {!isDirty && !error && <span className="profile-saved-note">{saved ? '✓ Saved' : 'All changes saved'}</span>}
          <div className="profile-save-bar-actions">
            <button className={`profile-save-btn${saved ? ' saved' : ''}`} onClick={save} disabled={saving || !isDirty}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

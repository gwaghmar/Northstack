/**
 * LeftPanel.tsx
 * Left sidebar: Personas (Personal/Work), Storage, History, Enterprise, Settings, Profile.
 */
import React, { useState, useEffect, useRef } from "react";
import { useLiveAPIContext } from "@/contexts/LiveAPIContext";
import CustomPersonaDialog, { CustomPersona } from "@/components/custom-persona/CustomPersonaDialog";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const PERSONAL_PERSONAS = [
  { id: "accent_coach", label: "Northstack Coach", icon: "record_voice_over" },
  { id: "workout", label: "Workout Coach", icon: "fitness_center" },
];

const WORK_PERSONAS = [
  { id: "analyst", label: "Data Analyst", icon: "bar_chart" },
  { id: "finance_dashboard", label: "Finance Dashboard", icon: "account_balance" },
  { id: "marketing_dashboard", label: "Marketing Dashboard", icon: "campaign" },
  { id: "meeting_assistant", label: "Meeting Assistant", icon: "groups" },
  { id: "tax_rep", label: "Tax Rep", icon: "receipt_long" },
];

type Section = "personas" | "storage" | "history" | "enterprise" | "settings" | "profile";

interface StorageFile {
  name: string;
  size: number;
  source: string;
  folder: string;
}

interface HistorySession {
  id: string;
  title?: string;
  role?: string;
  timestamp?: string;
  turn_count?: number;
}

interface GCPConfig {
  project_id: string;
  gcs_bucket: string;
  region: string;
  connected: boolean;
  connection_error?: string;
}

interface LeftPanelProps {
  selectedRole?: string;
  onRoleSelect: (role: string | undefined) => void;
}

export default function LeftPanel({ selectedRole, onRoleSelect }: LeftPanelProps) {
  const { client, connected } = useLiveAPIContext();
  const [activeSection, setActiveSection] = useState<Section | null>("personas");
  const [storageFiles, setStorageFiles] = useState<StorageFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sendingFile, setSendingFile] = useState<string | null>(null);
  const [customPersonas, setCustomPersonas] = useState<CustomPersona[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // GCP config state
  const [gcpConfig, setGcpConfig] = useState<GCPConfig>({ project_id: "", gcs_bucket: "", region: "us-central1", connected: false });
  const [savingGcp, setSavingGcp] = useState(false);
  const [gcpSaved, setGcpSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("customPersonas") || "[]");
      setCustomPersonas(stored);
    } catch { setCustomPersonas([]); }
  }, []);

  useEffect(() => {
    if (activeSection === "storage") {
      setLoadingFiles(true);
      fetch(`${API_URL}/storage/files`)
        .then((r) => r.json())
        .then((data) => setStorageFiles(data.files || []))
        .catch(() => setStorageFiles([]))
        .finally(() => setLoadingFiles(false));
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === "history" || activeSection === "settings") {
      setLoadingHistory(true);
      fetch(`${API_URL}/history`)
        .then((r) => r.json())
        .then((data) => setHistory(data.sessions || []))
        .catch(() => setHistory([]))
        .finally(() => setLoadingHistory(false));
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === "enterprise") {
      fetch(`${API_URL}/config/gcp`)
        .then((r) => r.json())
        .then((data) => setGcpConfig(data))
        .catch(() => {});
    }
  }, [activeSection]);

  const handleFileClick = async (file: StorageFile) => {
    if (!connected) { alert("Connect to Gemini first."); return; }
    setSendingFile(file.name);
    try {
      const res = await fetch(`${API_URL}/storage/files/${encodeURIComponent(file.name)}`);
      const data = await res.json();
      if (data.content) {
        client.send([{ text: `I'm sharing a file named "${file.name}". Please analyze it.\n\n\`\`\`\n${data.content}\n\`\`\`` }]);
      }
    } catch (err) { console.error(err); }
    finally { setSendingFile(null); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError("");
    const formData = new FormData();
    formData.append("file", files[0]);
    try {
      const res = await fetch(`${API_URL}/storage/upload`, { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        setUploadError(err.detail || "Upload failed");
      } else {
        const data = await res.json();
        setStorageFiles((prev) => [...prev, { name: data.filename, size: data.size, source: "local", folder: "" }]);
      }
    } catch { setUploadError("Upload failed. Backend offline?"); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleCreateFolder = async () => {
    if (!newFolder.trim()) return;
    await fetch(`${API_URL}/storage/folders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newFolder.trim() }) });
    setNewFolder("");
    setShowNewFolder(false);
  };

  const handleSaveGcp = async () => {
    setSavingGcp(true);
    try {
      const data = await fetch(`${API_URL}/config/gcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gcpConfig) }).then((r) => r.json());
      setGcpConfig(data);
      setGcpSaved(true);
      setTimeout(() => setGcpSaved(false), 3000);
    } catch { } finally { setSavingGcp(false); }
  };

  const handlePersonaCreated = (persona: CustomPersona) => {
    setCustomPersonas((prev) => [...prev, persona]);
    setShowCreateDialog(false);
    onRoleSelect(persona.id);
  };

  const handleDeleteCustomPersona = (id: string, e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    const updated = customPersonas.filter((p) => p.id !== id);
    setCustomPersonas(updated);
    localStorage.setItem("customPersonas", JSON.stringify(updated));
    if (selectedRole === id) onRoleSelect(undefined);
  };

  const toggleSection = (section: Section) => setActiveSection((prev) => prev === section ? null : section);

  const navItems: { id: Section; icon: string; label: string }[] = [
    { id: "personas", icon: "person", label: "Personas" },
    { id: "storage", icon: "folder", label: "Storage" },
    { id: "history", icon: "history", label: "History" },
    { id: "enterprise", icon: "business", label: "Enterprise" },
    { id: "settings", icon: "settings", label: "Settings" },
    { id: "profile", icon: "account_circle", label: "Profile" },
  ];

  const fileIcon = (name: string) => {
    if (name.endsWith(".csv")) return "table_chart";
    if (name.endsWith(".pdf")) return "picture_as_pdf";
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "grid_on";
    if (name.endsWith(".txt") || name.endsWith(".md")) return "description";
    if (name.endsWith(".json")) return "data_object";
    return "insert_drive_file";
  };

  return (
    <>
      <div className={`left-panel ${activeSection ? "left-panel--expanded" : ""}`}>
        <div className="left-panel__nav">
          {navItems.map((item) => (
            <button key={item.id} className={`left-panel__nav-btn ${activeSection === item.id ? "left-panel__nav-btn--active" : ""}`} title={item.label} onClick={() => toggleSection(item.id)}>
              <span className="material-symbols-outlined">{item.icon}</span>
            </button>
          ))}
        </div>

        {activeSection && (
          <div className="left-panel__content">

            {/* PERSONAS */}
            {activeSection === "personas" && (
              <div className="left-panel__section">
                {/* General */}
                <button className={`persona-item ${!selectedRole ? "persona-item--active" : ""}`} onClick={() => onRoleSelect(undefined)}>
                  <span className="material-symbols-outlined">smart_toy</span>
                  <span>General Assistant</span>
                </button>

                {/* Personal */}
                <div className="left-panel__section-title" style={{ marginTop: 12 }}>Personal</div>
                {PERSONAL_PERSONAS.map((p) => (
                  <button key={p.id} className={`persona-item ${selectedRole === p.id ? "persona-item--active" : ""}`} onClick={() => onRoleSelect(p.id)}>
                    <span className="material-symbols-outlined">{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                ))}

                {/* Work */}
                <div className="left-panel__section-title" style={{ marginTop: 12 }}>Work</div>
                {WORK_PERSONAS.map((p) => (
                  <button key={p.id} className={`persona-item ${selectedRole === p.id ? "persona-item--active" : ""}`} onClick={() => onRoleSelect(p.id)}>
                    <span className="material-symbols-outlined">{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                ))}

                {/* Custom */}
                {customPersonas.length > 0 && (
                  <>
                    <div className="left-panel__section-title" style={{ marginTop: 12 }}>
                      Custom <span className="left-panel__section-badge">{customPersonas.length}</span>
                    </div>
                    {customPersonas.map((p) => (
                      <button key={p.id} className={`persona-item ${selectedRole === p.id ? "persona-item--active" : ""}`} onClick={() => onRoleSelect(p.id)} style={{ position: "relative" }}>
                        <span className="material-symbols-outlined">{p.icon}</span>
                        <span style={{ flex: 1 }}>{p.label}</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, opacity: 0.4 }} onClick={(e) => handleDeleteCustomPersona(p.id, e)} title="Remove">close</span>
                      </button>
                    ))}
                  </>
                )}

                <button className="persona-create-btn" onClick={() => setShowCreateDialog(true)}>
                  <span className="material-symbols-outlined">add_circle</span>
                  <span>Create your own persona</span>
                </button>
              </div>
            )}

            {/* STORAGE */}
            {activeSection === "storage" && (
              <div className="left-panel__section">
                <div className="left-panel__section-title">
                  Storage
                  <span className="left-panel__section-badge">Local</span>
                </div>

                {/* Upload + folder actions */}
                <div className="storage-actions">
                  <input ref={fileInputRef} type="file" accept=".csv,.txt,.md,.pdf,.xlsx,.xls,.json" style={{ display: "none" }} onChange={handleUpload} />
                  <button className="storage-action-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Upload file">
                    <span className="material-symbols-outlined">{uploading ? "sync" : "upload_file"}</span>
                    <span>{uploading ? "Uploading…" : "Upload File"}</span>
                  </button>
                  <button className="storage-action-btn" onClick={() => setShowNewFolder((v) => !v)} title="New folder">
                    <span className="material-symbols-outlined">create_new_folder</span>
                    <span>New Folder</span>
                  </button>
                </div>

                {showNewFolder && (
                  <div className="storage-new-folder">
                    <input className="storage-folder-input" placeholder="Folder name" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()} />
                    <button className="storage-folder-create" onClick={handleCreateFolder}>Create</button>
                  </div>
                )}

                {uploadError && <p className="left-panel__error">{uploadError}</p>}
                <p className="left-panel__hint">Supported: CSV, PDF, Excel, TXT, JSON. Click to send to agent.</p>

                {loadingFiles ? (
                  <div style={{ padding: "8px 0" }}>
                    <div className="skeleton-row skeleton-row--full" style={{ height: 32, marginBottom: 6 }} />
                    <div className="skeleton-row skeleton-row--full" style={{ height: 32, marginBottom: 6 }} />
                    <div className="skeleton-row skeleton-row--medium" style={{ height: 32 }} />
                  </div>
                ) : storageFiles.length === 0 ? (
                  <div className="left-panel__empty">No files yet. Upload one to get started.</div>
                ) : (
                  storageFiles.map((f) => (
                    <button key={f.name} className={`file-item ${sendingFile === f.name ? "file-item--sending" : ""}`} onClick={() => handleFileClick(f)} disabled={!connected || sendingFile !== null} title={f.name}>
                      <span className="material-symbols-outlined file-item__icon">{fileIcon(f.name)}</span>
                      <span className="file-item__name">{f.name.split("/").pop()}</span>
                      <span className="file-item__size">{(f.size / 1024).toFixed(1)}KB</span>
                      {sendingFile === f.name && <span className="material-symbols-outlined file-item__spinner">sync</span>}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* HISTORY */}
            {activeSection === "history" && (
              <div className="left-panel__section">
                <div className="left-panel__section-title">History</div>
                {loadingHistory ? (
                  <div style={{ padding: "8px 0" }}>
                    <div className="skeleton-row skeleton-row--full" style={{ height: 48, marginBottom: 6 }} />
                    <div className="skeleton-row skeleton-row--full" style={{ height: 48, marginBottom: 6 }} />
                    <div className="skeleton-row skeleton-row--medium" style={{ height: 48 }} />
                  </div>
                ) : history.length === 0 ? (
                  <div className="left-panel__empty">No sessions saved yet. Sessions are saved when you disconnect.</div>
                ) : (
                  history.map((s) => (
                    <div key={s.id} className="history-item">
                      <span className="material-symbols-outlined history-item__icon">chat</span>
                      <div className="history-item__info">
                        <div className="history-item__title">{s.title || `Session — ${s.role || "General"}`}</div>
                        {s.timestamp && <div className="history-item__time">{new Date(s.timestamp).toLocaleString()}</div>}
                        {s.turn_count && <div className="history-item__time">{s.turn_count} turns</div>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ENTERPRISE */}
            {activeSection === "enterprise" && (
              <div className="left-panel__section">
                <div className="left-panel__section-title">GCP Configuration</div>

                <label className="enterprise-field-label">Project ID</label>
                <input className="enterprise-input" placeholder="my-gcp-project" value={gcpConfig.project_id} onChange={(e) => setGcpConfig((c) => ({ ...c, project_id: e.target.value }))} />

                <label className="enterprise-field-label">GCS Bucket</label>
                <input className="enterprise-input" placeholder="my-bucket-name" value={gcpConfig.gcs_bucket} onChange={(e) => setGcpConfig((c) => ({ ...c, gcs_bucket: e.target.value }))} />

                <label className="enterprise-field-label">Region</label>
                <input className="enterprise-input" placeholder="us-central1" value={gcpConfig.region} onChange={(e) => setGcpConfig((c) => ({ ...c, region: e.target.value }))} />

                <label className="enterprise-field-label">Service Account JSON Path (optional)</label>
                <input className="enterprise-input" placeholder="/path/to/key.json" onChange={(e) => setGcpConfig((c) => ({ ...c, service_account_path: e.target.value }))} />

                <div className="enterprise-status">
                  <span className={`status-dot ${gcpConfig.connected ? "status-dot--online" : "status-dot--offline"}`} />
                  <span style={{ fontSize: 11, color: "var(--Neutral-60)" }}>
                    {gcpConfig.connected ? "Connected" : gcpConfig.connection_error ? "Not connected" : "Not tested"}
                  </span>
                </div>
                {gcpConfig.connection_error && <p className="left-panel__error">{gcpConfig.connection_error}</p>}

                <button className="enterprise-save-btn" onClick={handleSaveGcp} disabled={savingGcp}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{savingGcp ? "sync" : "save"}</span>
                  {gcpSaved ? "Saved" : savingGcp ? "Saving…" : "Save & Test Connection"}
                </button>

                <div className="left-panel__section-title" style={{ marginTop: 16 }}>MCP Connections</div>
                <p className="left-panel__hint">Connect external data sources via Model Context Protocol. Configure in Settings.</p>
                <button className="enterprise-save-btn" onClick={() => window.open("http://localhost:8000/docs#/default/get_mcp_config_config_mcp_get", "_blank")} style={{ background: "var(--Neutral-20)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>hub</span>
                  Manage MCP Servers
                </button>
              </div>
            )}

            {/* SETTINGS + ANALYTICS */}
            {activeSection === "settings" && (
              <div className="left-panel__section">
                <div className="left-panel__section-title">Settings</div>
                <div className="settings-item"><span className="settings-item__label">Model</span><span className="settings-item__value">gemini-2.5-flash</span></div>
                <div className="settings-item"><span className="settings-item__label">Voice</span><span className="settings-item__value">Aoede</span></div>
                <div className="settings-item"><span className="settings-item__label">API Version</span><span className="settings-item__value">v1alpha</span></div>
                <div className="settings-item"><span className="settings-item__label">Backend</span><span className="settings-item__value">localhost:8000</span></div>

                <div className="left-panel__section-title" style={{ marginTop: 16 }}>Session Analytics</div>
                <div className="analytics-panel">
                  <div className="analytics-stat">
                    <span className="analytics-stat__label">
                      <span className="material-symbols-outlined">history</span>
                      Total sessions
                    </span>
                    <span className="analytics-stat__value">{history.length}</span>
                  </div>
                  <div className="analytics-stat">
                    <span className="analytics-stat__label">
                      <span className="material-symbols-outlined">forum</span>
                      Total turns
                    </span>
                    <span className="analytics-stat__value">
                      {history.reduce((acc, s) => acc + (s.turn_count || 0), 0)}
                    </span>
                  </div>
                  <div className="analytics-stat">
                    <span className="analytics-stat__label">
                      <span className="material-symbols-outlined">person</span>
                      Top persona
                    </span>
                    <span className="analytics-stat__value" style={{ fontSize: 11, textTransform: "capitalize" }}>
                      {(() => {
                        const freq: Record<string, number> = {};
                        history.forEach((s) => { if (s.role) freq[s.role] = (freq[s.role] || 0) + 1; });
                        const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
                        return top ? top[0].replace("_", " ") : "—";
                      })()}
                    </span>
                  </div>
                </div>

                {history.length > 0 && (
                  <div className="analytics-chart" style={{ marginTop: 12 }}>
                    <div className="analytics-chart__label">Turns per session (last 7)</div>
                    <div className="analytics-chart__bars">
                      {history.slice(-7).map((s, i) => {
                        const maxTurns = Math.max(...history.slice(-7).map((h) => h.turn_count || 0), 1);
                        const pct = ((s.turn_count || 0) / maxTurns) * 100;
                        return (
                          <div
                            key={s.id}
                            className={`analytics-chart__bar ${i === history.slice(-7).length - 1 ? "analytics-chart__bar--active" : ""}`}
                            style={{ height: `${Math.max(4, pct)}%` }}
                            data-label={`${s.turn_count || 0} turns`}
                            title={`${s.title || s.role || "Session"}: ${s.turn_count || 0} turns`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PROFILE */}
            {activeSection === "profile" && (
              <div className="left-panel__section">
                <div className="left-panel__section-title">Profile</div>
                <div className="profile-card">
                  <div className="profile-card__avatar"><span className="material-symbols-outlined">account_circle</span></div>
                  <div className="profile-card__name">Govind Waghmare</div>
                  <div className="profile-card__role">BI Developer</div>
                </div>
                <div className="settings-item"><span className="settings-item__label">Memory</span><span className="settings-item__value">Enabled</span></div>
                <div className="settings-item"><span className="settings-item__label">Knowledge Base</span><span className="settings-item__value">Active</span></div>
              </div>
            )}

          </div>
        )}
      </div>

      {showCreateDialog && <CustomPersonaDialog onClose={() => setShowCreateDialog(false)} onCreated={handlePersonaCreated} />}
    </>
  );
}

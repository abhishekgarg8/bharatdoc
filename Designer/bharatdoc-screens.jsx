// BharatDoc — Bharat Warmth direction
// Hero screens: Dashboard, Recording, Summary, PDF preview

const BD = {
  // Palette
  paper: '#FAF5EA',           // cream prescription-pad background
  paperDeep: '#F2EADB',       // secondary cream
  ink: '#1C1712',             // near-black ink
  inkSoft: '#3D332A',
  inkMuted: '#7A6E60',
  inkFaint: '#AEA395',
  rule: '#E5DAC5',            // paper-edge divider
  ruleSoft: '#EFE6D3',
  terracotta: '#C24A2A',      // primary warm red — brand
  terracottaDeep: '#9A3A20',
  saffron: '#D68A3C',
  ochre: '#B97E2E',
  sage: '#5F7A52',             // success
  indigoInk: '#2C4A6B',        // transcribed (cool contrast)
  stamp: '#8B2E20',            // stamp/seal red
  shadow: 'rgba(55, 35, 15, 0.06)',
};

const BD_FONT_DISP = "'Instrument Serif', 'Cormorant Garamond', Georgia, serif";
const BD_FONT_BODY = "'Figtree', 'Manrope', -apple-system, system-ui, sans-serif";
const BD_FONT_MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

// ─────────────────────────────────────────────────────────
// Tiny icon set (outline, 1.75 stroke)
// ─────────────────────────────────────────────────────────
const Icon = ({ d, size = 20, stroke = 'currentColor', fill = 'none', sw = 1.75, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);
const IconMic = (p) => <Icon {...p} d={<>
  <rect x="9" y="2" width="6" height="12" rx="3"/>
  <path d="M5 10a7 7 0 0 0 14 0"/>
  <path d="M12 17v4"/><path d="M8 21h8"/>
</>}/>;
const IconSearch = (p) => <Icon {...p} d={<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>}/>;
const IconSettings = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>}/>;
const IconHome = (p) => <Icon {...p} d="M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>;
const IconFile = (p) => <Icon {...p} d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/></>}/>;
const IconWifiOff = (p) => <Icon {...p} d={<><path d="M1 1l22 22"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a11 11 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></>}/>;
const IconChevron = (p) => <Icon {...p} d="m9 6 6 6-6 6"/>;
const IconPause = (p) => <Icon {...p} d={<><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>} fill="currentColor" stroke="none"/>;
const IconStop = (p) => <Icon {...p} d={<rect x="6" y="6" width="12" height="12" rx="2"/>} fill="currentColor" stroke="none"/>;
const IconPlus = (p) => <Icon {...p} d={<><path d="M12 5v14"/><path d="M5 12h14"/></>}/>;
const IconCheck = (p) => <Icon {...p} d="m5 12 5 5L20 7"/>;
const IconPlay = (p) => <Icon {...p} d="M7 5v14l12-7z" fill="currentColor" stroke="none"/>;
const IconDownload = (p) => <Icon {...p} d={<><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>}/>;
const IconShare = (p) => <Icon {...p} d={<><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v14"/></>}/>;
const IconSparkle = (p) => <Icon {...p} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>;

// Status tick (WhatsApp-inspired) for lifecycle
const StatusTick = ({ state }) => {
  // recorded=1 open tick, transcribed=2 ticks gray, summary=2 ticks saffron, pdf=2 ticks green
  const map = {
    recorded:    { ticks: 1, color: BD.inkFaint,   label: 'Recorded' },
    transcribed: { ticks: 2, color: BD.indigoInk,  label: 'Transcribed' },
    summary:     { ticks: 2, color: BD.saffron,    label: 'Summary ready' },
    pdf:         { ticks: 2, color: BD.sage,       label: 'PDF saved' },
  };
  const m = map[state];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
      color: m.color, fontFamily: BD_FONT_BODY, fontWeight: 500 }}>
      <svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke={m.color}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m1 6 3.5 3.5L11 3" />
        {m.ticks === 2 && <path d="m6 6 3.5 3.5L16 3" />}
      </svg>
      {m.label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────
// Shared: Paper background with subtle fibre texture
// ─────────────────────────────────────────────────────────
const paperBg = {
  background: `
    radial-gradient(ellipse at 20% 0%, rgba(214, 138, 60, 0.04), transparent 50%),
    radial-gradient(ellipse at 80% 100%, rgba(194, 74, 42, 0.03), transparent 50%),
    ${BD.paper}
  `,
};

// ─────────────────────────────────────────────────────────
// STATUS BAR (custom, warm)
// ─────────────────────────────────────────────────────────
function WarmStatusBar({ dark = false }) {
  const c = dark ? '#FAF5EA' : BD.ink;
  return (
    <div style={{
      height: 38, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', fontFamily: BD_FONT_BODY, flexShrink: 0,
    }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: c, letterSpacing: 0.2 }}>9:41</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="16" height="11" viewBox="0 0 16 11" fill={c}>
          <path d="M8 10.5L.67 3.17a10.37 10.37 0 0114.66 0L8 10.5z"/>
        </svg>
        <svg width="15" height="11" viewBox="0 0 16 11" fill={c}>
          <path d="M13.67 10.67V.33L.33 10.67h13.34z"/>
        </svg>
        <svg width="22" height="11" viewBox="0 0 22 11" fill="none">
          <rect x="0.5" y="0.5" width="18" height="10" rx="2" stroke={c} />
          <rect x="2" y="2" width="13" height="7" rx="1" fill={c}/>
          <rect x="19.5" y="3.5" width="1.5" height="4" rx="0.5" fill={c}/>
        </svg>
      </div>
    </div>
  );
}

// Home-indicator pill (replaces 3-button nav)
function WarmNavHandle({ dark = false }) {
  return (
    <div style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <div style={{ width: 108, height: 4, borderRadius: 2,
        background: dark ? '#FAF5EA' : BD.ink, opacity: 0.45 }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// DEVICE (412 × 892)
// ─────────────────────────────────────────────────────────
function Device({ children, dark = false, label }) {
  return (
    <div style={{
      width: 412, height: 892, borderRadius: 44, overflow: 'hidden',
      background: dark ? '#1C1712' : BD.paper,
      border: `10px solid #2A221A`,
      boxShadow: '0 30px 80px rgba(55, 35, 15, 0.18), 0 8px 20px rgba(55, 35, 15, 0.08)',
      display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
      position: 'relative',
    }}>
      <WarmStatusBar dark={dark} />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      <WarmNavHandle dark={dark} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// BOTTOM NAV (Home / Search / Settings)
// ─────────────────────────────────────────────────────────
function BottomNav({ active = 'home' }) {
  const items = [
    { id: 'home',     label: 'Home',    icon: IconHome },
    { id: 'search',   label: 'Search',  icon: IconSearch },
    { id: 'settings', label: 'Settings', icon: IconSettings, badge: 1 },
  ];
  return (
    <div style={{
      background: BD.paper, borderTop: `1px solid ${BD.rule}`,
      padding: '10px 24px 14px', display: 'flex', justifyContent: 'space-around',
      fontFamily: BD_FONT_BODY, flexShrink: 0,
    }}>
      {items.map(it => {
        const act = it.id === active;
        return (
          <div key={it.id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            color: act ? BD.terracotta : BD.inkMuted, position: 'relative',
          }}>
            <it.icon size={24} stroke={act ? BD.terracotta : BD.inkMuted} sw={act ? 2 : 1.6}/>
            <span style={{ fontSize: 11, fontWeight: act ? 700 : 500, letterSpacing: 0.3 }}>{it.label}</span>
            {it.badge && (
              <span style={{
                position: 'absolute', top: -2, right: 14,
                minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
                background: BD.terracotta, color: '#fff',
                fontSize: 10, fontWeight: 700, fontFamily: BD_FONT_BODY,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{it.badge}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// SCREEN 1 — DASHBOARD
// ─────────────────────────────────────────────────────────
function DashboardScreen() {
  const records = [
    { pid: 'P-10482', time: 'Today, 11:42', dur: '8:14', doc: 'You',     state: 'recorded',     offline: true },
    { pid: 'P-10481', time: 'Today, 10:55', dur: '12:03', doc: 'You',     state: 'transcribed' },
    { pid: 'P-10478', time: 'Today, 09:30', dur: '6:47', doc: 'You',     state: 'summary' },
    { pid: 'P-10470', time: 'Yest, 18:20',  dur: '14:22', doc: 'Dr. Rao', state: 'pdf' },
    { pid: 'P-10469', time: 'Yest, 17:05',  dur: '9:15', doc: 'Dr. Rao', state: 'pdf' },
    { pid: 'P-10462', time: 'Yest, 15:40',  dur: '7:32', doc: 'You',     state: 'pdf' },
  ];

  return (
    <div style={{ ...paperBg, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 22px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 22, background: BD.terracotta, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: BD_FONT_DISP, fontSize: 22, fontWeight: 400, flexShrink: 0,
        }}>A</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontFamily: BD_FONT_BODY, fontWeight: 600, color: BD.ink, lineHeight: 1.1 }}>
            Dr. Aparna Iyer
          </div>
          <div style={{ fontSize: 12, fontFamily: BD_FONT_BODY, color: BD.inkMuted, marginTop: 2,
            display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 4, height: 4, borderRadius: 2, background: BD.saffron }} />
            Sunrise Clinic, Pune
          </div>
        </div>
        <div style={{
          width: 40, height: 40, borderRadius: 20, background: BD.paperDeep,
          border: `1px solid ${BD.rule}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: BD.inkSoft,
          position: 'relative',
        }}>
          <IconSettings size={18}/>
          <span style={{
            position: 'absolute', top: -3, right: -3,
            width: 18, height: 18, borderRadius: 9, background: BD.terracotta,
            color: '#fff', fontSize: 10, fontWeight: 700, fontFamily: BD_FONT_BODY,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `2px solid ${BD.paper}`,
          }}>1</span>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 22px 14px' }}>
        <div style={{
          background: BD.paperDeep, border: `1px solid ${BD.rule}`, borderRadius: 14,
          padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <IconSearch size={18} stroke={BD.inkMuted}/>
          <span style={{ fontSize: 14, fontFamily: BD_FONT_BODY, color: BD.inkFaint, flex: 1 }}>
            Search by Patient ID
          </span>
          <span style={{ fontSize: 11, fontFamily: BD_FONT_MONO, color: BD.inkMuted,
            background: BD.paper, padding: '2px 6px', borderRadius: 4,
            border: `1px solid ${BD.rule}` }}>clinic</span>
        </div>
      </div>

      {/* Recent — section header */}
      <div style={{ padding: '4px 22px 10px', display: 'flex', alignItems: 'baseline',
        justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: BD_FONT_DISP, fontSize: 28, color: BD.ink,
            fontStyle: 'italic', lineHeight: 1, letterSpacing: -0.3 }}>
            Today's consultations
          </div>
          <div style={{ fontSize: 12, fontFamily: BD_FONT_BODY, color: BD.inkMuted, marginTop: 6 }}>
            6 records · 1 pending transcription
          </div>
        </div>
      </div>

      {/* Records list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 100px' }}>
        {records.map((r, i) => (
          <div key={r.pid} style={{
            background: BD.paper, borderRadius: 14,
            border: `1px solid ${BD.rule}`,
            padding: '14px 16px', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: i === 0 ? `0 1px 0 ${BD.rule}` : 'none',
          }}>
            {/* Left: patient id + paper chit vibe */}
            <div style={{
              minWidth: 68, padding: '6px 8px', borderRadius: 6,
              background: BD.paperDeep,
              border: `1px dashed ${BD.ochre}`,
              textAlign: 'center', flexShrink: 0,
            }}>
              <div style={{ fontSize: 9, fontFamily: BD_FONT_BODY, fontWeight: 600,
                color: BD.ochre, letterSpacing: 1, textTransform: 'uppercase' }}>Patient</div>
              <div style={{ fontFamily: BD_FONT_MONO, fontSize: 13, fontWeight: 600,
                color: BD.ink, marginTop: 1 }}>{r.pid}</div>
            </div>

            {/* Middle: meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontFamily: BD_FONT_BODY, fontWeight: 600, color: BD.ink }}>
                  {r.time}
                </span>
                {r.offline && (
                  <span style={{ color: BD.terracotta, display: 'inline-flex' }}>
                    <IconWifiOff size={12} stroke={BD.terracotta}/>
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, fontFamily: BD_FONT_BODY, color: BD.inkMuted,
                marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{r.dur}</span>
                <span style={{ width: 2, height: 2, borderRadius: 1, background: BD.inkFaint }} />
                <span>{r.doc}</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <StatusTick state={r.state}/>
              </div>
            </div>

            <IconChevron size={18} stroke={BD.inkFaint}/>
          </div>
        ))}
      </div>

      {/* Floating Record CTA */}
      <div style={{
        position: 'absolute', bottom: 88, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <button style={{
          pointerEvents: 'auto',
          background: BD.terracotta, color: '#fff', border: 'none',
          padding: '16px 28px 16px 20px', borderRadius: 999,
          display: 'flex', alignItems: 'center', gap: 12,
          fontFamily: BD_FONT_BODY, fontSize: 16, fontWeight: 700, letterSpacing: 0.2,
          boxShadow: '0 10px 24px rgba(194, 74, 42, 0.35), 0 2px 0 rgba(0,0,0,0.08)',
          cursor: 'pointer',
        }}>
          <span style={{
            width: 36, height: 36, borderRadius: 18,
            background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconMic size={20} stroke="#fff"/>
          </span>
          Start recording
        </button>
      </div>

      <BottomNav active="home"/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// SCREEN 2 — RECORDING (active, dark warm)
// ─────────────────────────────────────────────────────────
function RecordingScreen() {
  // Generate a fake waveform
  const bars = Array.from({ length: 44 }, (_, i) => {
    // two phases — active (taller, saturated) then quieter
    const t = i / 43;
    const noise = Math.sin(i * 1.8) * 0.3 + Math.sin(i * 0.7) * 0.4;
    const base = 0.5 + noise * 0.4;
    const amp = i > 30 ? base * 0.6 : base;
    return Math.max(0.12, Math.min(1, amp));
  });

  return (
    <div style={{
      background: BD.ink,
      color: '#FAF5EA',
      display: 'flex', flexDirection: 'column', height: '100%',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* decorative grain */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(circle at 50% 30%, rgba(214, 138, 60, 0.12), transparent 60%),
                     radial-gradient(circle at 50% 80%, rgba(194, 74, 42, 0.18), transparent 70%)`,
      }}/>

      {/* Header */}
      <div style={{
        padding: '18px 22px 0', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'relative', zIndex: 1,
      }}>
        <button style={{
          background: 'transparent', border: `1px solid rgba(250, 245, 234, 0.18)`,
          color: '#FAF5EA', padding: '8px 14px', borderRadius: 999,
          fontFamily: BD_FONT_BODY, fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
        }}>
          <Icon d="m15 18-6-6 6-6" stroke="#FAF5EA" size={16}/>
          Cancel
        </button>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(194, 74, 42, 0.18)',
          border: `1px solid rgba(194, 74, 42, 0.4)`,
          padding: '6px 12px', borderRadius: 999,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: BD.terracotta,
            boxShadow: `0 0 0 4px rgba(194, 74, 42, 0.25)`,
            animation: 'bd-pulse 1.4s ease-in-out infinite',
          }}/>
          <span style={{ fontSize: 11, fontFamily: BD_FONT_BODY, fontWeight: 700,
            letterSpacing: 1, textTransform: 'uppercase', color: '#F8D7C4' }}>Recording</span>
        </div>
      </div>

      {/* Clinic context */}
      <div style={{ padding: '20px 22px 0', textAlign: 'center', zIndex: 1 }}>
        <div style={{ fontSize: 11, fontFamily: BD_FONT_BODY, fontWeight: 600,
          color: 'rgba(250, 245, 234, 0.5)', letterSpacing: 2, textTransform: 'uppercase' }}>
          Sunrise Clinic · Dr. Aparna Iyer
        </div>
      </div>

      {/* Timer — serif, massive */}
      <div style={{ textAlign: 'center', padding: '24px 0 0', zIndex: 1 }}>
        <div style={{
          fontFamily: BD_FONT_DISP, fontSize: 96, fontWeight: 400,
          color: '#FAF5EA', letterSpacing: -2, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>
          04<span style={{ color: BD.saffron }}>:</span>37
        </div>
        <div style={{ fontSize: 12, fontFamily: BD_FONT_BODY, color: 'rgba(250, 245, 234, 0.55)',
          marginTop: 6, letterSpacing: 0.3 }}>
          of 60:00 · chunk saved 12s ago
        </div>
      </div>

      {/* Waveform — organic, orange flame */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px', zIndex: 1,
      }}>
        <div style={{
          width: '100%', height: 180, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 3,
        }}>
          {bars.map((h, i) => {
            const active = i < 34;
            return (
              <div key={i} style={{
                flex: 1,
                height: `${h * 100}%`,
                minHeight: 6,
                borderRadius: 3,
                background: active
                  ? (i > 28
                    ? `linear-gradient(to top, ${BD.terracotta}, ${BD.saffron})`
                    : `linear-gradient(to top, rgba(214, 138, 60, 0.6), rgba(214, 138, 60, 0.85))`)
                  : 'rgba(250, 245, 234, 0.14)',
                boxShadow: active && i > 28 ? '0 0 10px rgba(214, 138, 60, 0.5)' : 'none',
                transition: 'height 0.3s ease',
              }}/>
            );
          })}
        </div>
      </div>

      {/* Patient ID chip */}
      <div style={{ padding: '0 22px 20px', zIndex: 1, display: 'flex', justifyContent: 'center' }}>
        <button style={{
          background: 'rgba(250, 245, 234, 0.06)',
          border: `1px dashed rgba(250, 245, 234, 0.25)`,
          color: 'rgba(250, 245, 234, 0.75)',
          padding: '10px 16px', borderRadius: 10,
          fontFamily: BD_FONT_BODY, fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
        }}>
          <IconPlus size={14} stroke="rgba(250, 245, 234, 0.75)"/>
          Tag patient ID · optional
        </button>
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 32, padding: '0 22px 42px', zIndex: 1,
      }}>
        <button style={{
          width: 64, height: 64, borderRadius: 32,
          background: 'rgba(250, 245, 234, 0.08)',
          border: `1px solid rgba(250, 245, 234, 0.2)`,
          color: '#FAF5EA',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <IconPause size={22}/>
        </button>
        <button style={{
          width: 92, height: 92, borderRadius: 46,
          background: BD.terracotta,
          border: '4px solid rgba(250, 245, 234, 0.95)',
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          boxShadow: '0 10px 40px rgba(194, 74, 42, 0.55), 0 0 0 8px rgba(194, 74, 42, 0.12)',
        }}>
          <IconStop size={30}/>
        </button>
        <button style={{
          width: 64, height: 64, borderRadius: 32,
          background: 'rgba(250, 245, 234, 0.08)',
          border: `1px solid rgba(250, 245, 234, 0.2)`,
          color: 'rgba(250, 245, 234, 0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'not-allowed',
        }}>
          <IconSparkle size={22}/>
        </button>
      </div>

      <style>{`
        @keyframes bd-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.9); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// SCREEN 3 — SUMMARY (review + edit)
// ─────────────────────────────────────────────────────────
function SummaryScreen() {
  return (
    <div style={{ ...paperBg, display: 'flex', flexDirection: 'column', height: '100%',
      overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px 14px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: `1px solid ${BD.rule}`,
      }}>
        <button style={{
          width: 36, height: 36, borderRadius: 18, background: 'transparent',
          border: `1px solid ${BD.rule}`, color: BD.inkSoft,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <Icon d="m15 18-6-6 6-6" size={16} stroke={BD.inkSoft}/>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontFamily: BD_FONT_BODY, fontWeight: 600, color: BD.ink,
            lineHeight: 1.1 }}>
            Consultation summary
          </div>
          <div style={{ fontSize: 11, fontFamily: BD_FONT_MONO, color: BD.inkMuted, marginTop: 2 }}>
            P-10478 · 23 Apr 2026, 09:30
          </div>
        </div>
        <StatusTick state="summary"/>
      </div>

      {/* AI banner */}
      <div style={{
        margin: '12px 18px 0', padding: '10px 12px', borderRadius: 10,
        background: 'rgba(214, 138, 60, 0.12)',
        border: `1px solid rgba(214, 138, 60, 0.28)`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <IconSparkle size={16} stroke={BD.ochre}/>
        <div style={{ flex: 1, fontSize: 11.5, fontFamily: BD_FONT_BODY, color: BD.inkSoft,
          lineHeight: 1.35 }}>
          <span style={{ fontWeight: 600 }}>AI draft — verify before saving.</span>
          {' '}Generated in 7.2s using your custom prompt.
        </div>
      </div>

      {/* Summary scroll */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 16px' }}>
        {/* Section */}
        <Section title="Chief Complaint">
          Persistent dry cough for the past <Em>10 days</Em>, worse at night. No fever reported.
        </Section>

        <Section title="History of Present Illness">
          Patient reports gradual onset of symptoms following exposure to seasonal dust. Occasional wheezing on exertion. No prior asthma diagnosis. OTC cough syrup tried without relief.
        </Section>

        <Section title="Key Findings / Symptoms">
          <BulletList items={[
            'Dry, non-productive cough',
            'Mild wheezing on auscultation (bilateral lower lobes)',
            <>Resting SpO₂ <Em>97%</Em></>,
            'No signs of respiratory distress',
          ]}/>
        </Section>

        <Section title="Provisional Diagnosis" editing>
          Allergic bronchitis, likely dust-induced. Rule out early asthma.
        </Section>

        <Section title="Treatment / Prescription">
          <BulletList items={[
            <><Em>Levocetirizine 5mg</Em> · 1 tab at bedtime × 7 days</>,
            <><Em>Ambroxol 30mg</Em> · thrice daily × 5 days</>,
            'Steam inhalation twice daily',
          ]}/>
        </Section>

        <Section title="Follow-up">
          Review after 1 week. Spirometry if symptoms persist.
        </Section>
      </div>

      {/* Footer actions */}
      <div style={{
        padding: '12px 18px 16px', borderTop: `1px solid ${BD.rule}`,
        background: BD.paper, display: 'flex', gap: 10, flexShrink: 0,
      }}>
        <button style={{
          flex: 1, padding: '14px', borderRadius: 12,
          background: 'transparent', border: `1px solid ${BD.rule}`,
          color: BD.inkSoft, fontFamily: BD_FONT_BODY, fontSize: 14, fontWeight: 600,
          cursor: 'pointer',
        }}>
          Regenerate
        </button>
        <button style={{
          flex: 1.6, padding: '14px', borderRadius: 12,
          background: BD.ink, color: BD.paper, border: 'none',
          fontFamily: BD_FONT_BODY, fontSize: 14, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 8,
          boxShadow: '0 4px 12px rgba(28, 23, 18, 0.25)',
        }}>
          <IconCheck size={16} stroke={BD.paper}/>
          Save as PDF
        </button>
      </div>
    </div>
  );
}

function Section({ title, children, editing }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <div style={{
          fontFamily: BD_FONT_DISP, fontStyle: 'italic', fontSize: 19,
          color: BD.ink, letterSpacing: -0.2, lineHeight: 1.1,
        }}>{title}</div>
        {editing && (
          <span style={{
            fontSize: 9, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.ochre,
            textTransform: 'uppercase', letterSpacing: 1,
            background: 'rgba(214, 138, 60, 0.14)', padding: '2px 6px', borderRadius: 4,
          }}>Edited</span>
        )}
      </div>
      <div style={{
        fontFamily: BD_FONT_BODY, fontSize: 14, color: BD.inkSoft,
        lineHeight: 1.55, letterSpacing: 0.1,
      }}>
        {children}
      </div>
    </div>
  );
}
function Em({ children }) {
  return <span style={{ color: BD.ink, fontWeight: 600 }}>{children}</span>;
}
function BulletList({ items }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((it, i) => (
        <li key={i} style={{
          display: 'flex', gap: 10, marginBottom: 4, alignItems: 'flex-start',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: 3, background: BD.terracotta,
            marginTop: 8, flexShrink: 0,
          }}/>
          <span style={{ flex: 1 }}>{it}</span>
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────
// SCREEN 4 — PDF PREVIEW (prescription letterhead)
// ─────────────────────────────────────────────────────────
function PdfPreviewScreen() {
  return (
    <div style={{ background: BD.paperDeep, display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10,
        background: BD.paper, borderBottom: `1px solid ${BD.rule}`,
      }}>
        <button style={{
          width: 36, height: 36, borderRadius: 18, background: 'transparent',
          border: `1px solid ${BD.rule}`, color: BD.inkSoft,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <Icon d="m15 18-6-6 6-6" size={16} stroke={BD.inkSoft}/>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontFamily: BD_FONT_BODY, fontWeight: 600, color: BD.ink }}>
            Consultation_P-10478.pdf
          </div>
          <div style={{ fontSize: 11, fontFamily: BD_FONT_BODY, color: BD.sage, marginTop: 1,
            display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconCheck size={12} stroke={BD.sage}/>
            Saved · 142 KB
          </div>
        </div>
        <button style={{
          width: 36, height: 36, borderRadius: 18, background: 'transparent',
          border: `1px solid ${BD.rule}`, color: BD.inkSoft,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <IconShare size={16} stroke={BD.inkSoft}/>
        </button>
      </div>

      {/* PDF preview area */}
      <div style={{
        flex: 1, overflow: 'auto', padding: '20px 16px',
        background: '#E8DFCD',
      }}>
        <div style={{
          background: '#FDFAF1',
          borderRadius: 4,
          boxShadow: '0 4px 20px rgba(55, 35, 15, 0.18), 0 1px 3px rgba(55, 35, 15, 0.1)',
          padding: '24px 22px 28px',
          position: 'relative',
          fontFamily: BD_FONT_BODY,
        }}>
          {/* Letterhead */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12,
            paddingBottom: 12, borderBottom: `2px solid ${BD.terracotta}` }}>
            <div style={{
              width: 44, height: 44, borderRadius: 6, background: BD.terracotta, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: BD_FONT_DISP, fontSize: 24, fontWeight: 400, flexShrink: 0,
            }}>S</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: BD_FONT_DISP, fontSize: 22, fontStyle: 'italic',
                color: BD.ink, lineHeight: 1, letterSpacing: -0.3 }}>
                Sunrise Clinic
              </div>
              <div style={{ fontSize: 10, color: BD.inkMuted, marginTop: 3, lineHeight: 1.4 }}>
                24 Baner Road, Pune 411045 · +91 98765 43210
              </div>
            </div>
          </div>

          {/* Doctor row */}
          <div style={{ display: 'flex', justifyContent: 'space-between',
            marginTop: 12, fontSize: 11, color: BD.inkSoft }}>
            <div>
              <div style={{ fontWeight: 700, color: BD.ink }}>Dr. Aparna Iyer</div>
              <div style={{ color: BD.inkMuted, marginTop: 1 }}>General Physician</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: BD_FONT_MONO, fontSize: 10, color: BD.inkMuted }}>
                MCI-MH-45231
              </div>
              <div style={{ fontFamily: BD_FONT_MONO, fontSize: 10, color: BD.inkMuted, marginTop: 1 }}>
                23 Apr 2026 · 09:30
              </div>
            </div>
          </div>

          {/* Patient strip */}
          <div style={{
            marginTop: 14, padding: '8px 10px', background: BD.paperDeep,
            border: `1px solid ${BD.rule}`, borderRadius: 4,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: 10, color: BD.inkMuted, fontWeight: 600,
              letterSpacing: 1, textTransform: 'uppercase' }}>Patient ID</div>
            <div style={{ fontFamily: BD_FONT_MONO, fontSize: 13, fontWeight: 700, color: BD.ink }}>
              P-10478
            </div>
          </div>

          {/* Sections (compact) */}
          <PdfSection label="Chief Complaint">
            Persistent dry cough for the past 10 days, worse at night. No fever reported.
          </PdfSection>

          <PdfSection label="Key Findings">
            Dry cough · mild bilateral wheeze · SpO₂ 97% · no respiratory distress.
          </PdfSection>

          <PdfSection label="Diagnosis">
            Allergic bronchitis, likely dust-induced. R/O early asthma.
          </PdfSection>

          <PdfSection label="Prescription">
            <div style={{ fontFamily: BD_FONT_MONO, fontSize: 10.5, color: BD.ink,
              lineHeight: 1.7 }}>
              Rx&nbsp;&nbsp;Levocetirizine 5mg — 1 HS × 7d<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;Ambroxol 30mg — TID × 5d<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;Steam inhalation — BD
            </div>
          </PdfSection>

          <PdfSection label="Follow-up">
            Review after 1 week. Spirometry if symptoms persist.
          </PdfSection>

          {/* Signature */}
          <div style={{
            marginTop: 22, display: 'flex', justifyContent: 'flex-end',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: BD_FONT_DISP, fontStyle: 'italic', fontSize: 18,
                color: BD.stamp, letterSpacing: -0.3, transform: 'rotate(-4deg)' }}>
                A. Iyer
              </div>
              <div style={{ width: 80, height: 1, background: BD.inkFaint, marginTop: 2 }}/>
              <div style={{ fontSize: 9, color: BD.inkMuted, marginTop: 3 }}>Signature</div>
            </div>
          </div>

          {/* BharatDoc stamp */}
          <div style={{
            position: 'absolute', top: 20, right: 14,
            border: `1.5px solid ${BD.stamp}`,
            color: BD.stamp, padding: '3px 8px', borderRadius: 3,
            fontFamily: BD_FONT_BODY, fontSize: 8, fontWeight: 700,
            letterSpacing: 1.5, textTransform: 'uppercase',
            transform: 'rotate(6deg)', opacity: 0.7,
          }}>
            AI · Draft
          </div>

          {/* Footer */}
          <div style={{
            marginTop: 20, paddingTop: 10, borderTop: `1px dashed ${BD.rule}`,
            fontSize: 9, color: BD.inkFaint, textAlign: 'center', lineHeight: 1.5,
          }}>
            Generated by BharatDoc · AI-assisted — verify before clinical use
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div style={{
        display: 'flex', gap: 10, padding: '12px 18px 16px',
        background: BD.paper, borderTop: `1px solid ${BD.rule}`, flexShrink: 0,
      }}>
        <button style={{
          flex: 1, padding: '14px', borderRadius: 12,
          background: 'transparent', border: `1px solid ${BD.rule}`, color: BD.inkSoft,
          fontFamily: BD_FONT_BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <IconDownload size={16} stroke={BD.inkSoft}/>
          Download
        </button>
        <button style={{
          flex: 1, padding: '14px', borderRadius: 12,
          background: BD.terracotta, border: 'none', color: '#fff',
          fontFamily: BD_FONT_BODY, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          boxShadow: '0 4px 12px rgba(194, 74, 42, 0.3)',
        }}>
          <IconShare size={16} stroke="#fff"/>
          Share via WhatsApp
        </button>
      </div>
    </div>
  );
}

function PdfSection({ label, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        fontSize: 9, fontWeight: 700, color: BD.terracotta,
        letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3,
      }}>{label}</div>
      <div style={{ fontSize: 11, color: BD.inkSoft, lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// STYLE TILE (design system summary)
// ─────────────────────────────────────────────────────────
function StyleTile() {
  const swatch = (c, name, hex) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: c,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)', flexShrink: 0 }}/>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontFamily: BD_FONT_BODY, fontWeight: 600, color: BD.ink,
          whiteSpace: 'nowrap' }}>
          {name}
        </div>
        <div style={{ fontSize: 10, fontFamily: BD_FONT_MONO, color: BD.inkMuted,
          whiteSpace: 'nowrap' }}>{hex}</div>
      </div>
    </div>
  );

  return (
    <div style={{
      width: 780, minHeight: 892, padding: 40, ...paperBg,
      fontFamily: BD_FONT_BODY, color: BD.ink,
      borderRadius: 8, border: `1px solid ${BD.rule}`,
      boxSizing: 'border-box',
    }}>
      <div style={{ fontFamily: BD_FONT_MONO, fontSize: 11, color: BD.ochre, letterSpacing: 1,
        marginBottom: 6 }}>
        v1 · BharatDoc
      </div>
      <div style={{ fontFamily: BD_FONT_DISP, fontSize: 56, fontStyle: 'italic',
        lineHeight: 1, letterSpacing: -1.5, color: BD.ink, whiteSpace: 'nowrap',
        marginBottom: 10 }}>
        Bharat Warmth
      </div>
      <div style={{ fontSize: 14, color: BD.inkMuted, maxWidth: 520, lineHeight: 1.5,
        marginBottom: 28 }}>
        A paper-and-ink aesthetic for Indian clinic software. Warm, familiar,
        unmistakably medical — without feeling sterile.
      </div>

      {/* Colors */}
      <SectionHdr>Palette</SectionHdr>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14,
        marginBottom: 28 }}>
        {swatch(BD.paper, 'Paper', '#FAF5EA')}
        {swatch(BD.paperDeep, 'Deep', '#F2EADB')}
        {swatch(BD.ink, 'Ink', '#1C1712')}
        {swatch(BD.terracotta, 'Terracotta', '#C24A2A')}
        {swatch(BD.saffron, 'Saffron', '#D68A3C')}
        {swatch(BD.ochre, 'Ochre', '#B97E2E')}
        {swatch(BD.sage, 'Sage', '#5F7A52')}
        {swatch(BD.indigoInk, 'Indigo', '#2C4A6B')}
        {swatch(BD.stamp, 'Stamp', '#8B2E20')}
      </div>

      {/* Type */}
      <SectionHdr>Typography</SectionHdr>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: BD_FONT_DISP, fontStyle: 'italic', fontSize: 48,
          lineHeight: 1, letterSpacing: -1, color: BD.ink }}>Instrument Serif</div>
        <div style={{ fontSize: 11, color: BD.inkMuted, marginTop: 4 }}>
          Display · section titles, timer, serifs in the letterhead
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: BD_FONT_BODY, fontSize: 22, fontWeight: 600, color: BD.ink }}>
          Figtree — Body and UI
        </div>
        <div style={{ fontSize: 11, color: BD.inkMuted, marginTop: 2 }}>
          400 / 500 / 600 / 700 — buttons, labels, paragraphs
        </div>
      </div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: BD_FONT_MONO, fontSize: 18, color: BD.ink }}>
          P-10478 · MCI-MH-45231 · 09:30
        </div>
        <div style={{ fontSize: 11, color: BD.inkMuted, marginTop: 2 }}>
          JetBrains Mono — IDs, timestamps, codes
        </div>
      </div>

      {/* Status ticks */}
      <SectionHdr>Status lifecycle</SectionHdr>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
        <StatusTick state="recorded"/>
        <StatusTick state="transcribed"/>
        <StatusTick state="summary"/>
        <StatusTick state="pdf"/>
      </div>

      {/* Principles */}
      <SectionHdr>Principles</SectionHdr>
      <ul style={{ fontSize: 13, color: BD.inkSoft, lineHeight: 1.6, paddingLeft: 18,
        marginTop: 4 }}>
        <li>Paper over plastic — cream backgrounds, subtle warm shadows, never pure white.</li>
        <li>Italic serifs carry voice; monospace carries data; sans carries everything else.</li>
        <li>Status = ticks, not badges. Borrow the WhatsApp mental model doctors already know.</li>
        <li>Recording screen is the one dark screen — it should feel like a listening room.</li>
        <li>PDF previews mimic a prescription pad, not a React component.</li>
      </ul>
    </div>
  );
}
function SectionHdr({ children }) {
  return (
    <div style={{
      fontSize: 11, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.terracotta,
      letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12,
      paddingBottom: 4, borderBottom: `1px solid ${BD.rule}`,
    }}>{children}</div>
  );
}

Object.assign(window, {
  DashboardScreen, RecordingScreen, SummaryScreen, PdfPreviewScreen, StyleTile, Device,
  BD, BD_FONT_DISP, BD_FONT_BODY, BD_FONT_MONO,
  Icon, IconMic, IconSearch, IconSettings, IconHome, IconFile, IconWifiOff, IconChevron,
  IconPause, IconStop, IconPlus, IconCheck, IconPlay, IconDownload, IconShare, IconSparkle,
  StatusTick, BottomNav, paperBg, WarmStatusBar, WarmNavHandle, Section, Em, BulletList,
});

// BharatDoc — palette variations on the Dashboard
// Three palettes, each rendered through a shared PaletteDashboard component

const PALETTES = {
  warmth: {
    name: 'Bharat Warmth',
    subtitle: 'Terracotta & cream · prescription-pad warmth',
    paper:     '#FAF5EA',
    paperDeep: '#F2EADB',
    ink:       '#1C1712',
    inkSoft:   '#3D332A',
    inkMuted:  '#7A6E60',
    inkFaint:  '#AEA395',
    rule:      '#E5DAC5',
    primary:   '#C24A2A',   // terracotta
    accent:    '#D68A3C',   // saffron
    ochre:     '#B97E2E',
    success:   '#5F7A52',
    cool:      '#2C4A6B',
    ctaShadow: 'rgba(194, 74, 42, 0.35)',
    chitBorder: '#B97E2E',
  },
  monsoon: {
    name: 'Monsoon Ink',
    subtitle: 'Deep teal & bone · monsoon sky after rain',
    paper:     '#F4F2EB',
    paperDeep: '#EAE6DA',
    ink:       '#0F1E23',
    inkSoft:   '#2A3A40',
    inkMuted:  '#6B7A7F',
    inkFaint:  '#A6B0B3',
    rule:      '#D8D5CA',
    primary:   '#0F6B6B',   // deep teal
    accent:    '#C97A2F',   // burnt marigold (cross-cultural warm)
    ochre:     '#A6791E',
    success:   '#3F7D5B',
    cool:      '#264C5C',
    ctaShadow: 'rgba(15, 107, 107, 0.35)',
    chitBorder: '#0F6B6B',
  },
  haldi: {
    name: 'Haldi & Indigo',
    subtitle: 'Turmeric gold & indigo · bazaar textile',
    paper:     '#FBF5E3',
    paperDeep: '#F2E9CB',
    ink:       '#1A1833',
    inkSoft:   '#2D2A4D',
    inkMuted:  '#6E6A86',
    inkFaint:  '#A8A3B8',
    rule:      '#E8DFBF',
    primary:   '#2B3A8C',   // indigo dye
    accent:    '#E0A617',   // haldi / turmeric
    ochre:     '#B07A0C',
    success:   '#4E7A3A',
    cool:      '#1F2E6F',
    ctaShadow: 'rgba(43, 58, 140, 0.38)',
    chitBorder: '#E0A617',
  },
};

const F_DISP = "'Instrument Serif', Georgia, serif";
const F_BODY = "'Figtree', -apple-system, system-ui, sans-serif";
const F_MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

const Ic = ({ d, size = 20, stroke = 'currentColor', fill = 'none', sw = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {typeof d === 'string' ? <path d={d}/> : d}
  </svg>
);
const IMic = (p) => <Ic {...p} d={<><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4"/><path d="M8 21h8"/></>}/>;
const ISearch = (p) => <Ic {...p} d={<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>}/>;
const ISettings = (p) => <Ic {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>}/>;
const IHome = (p) => <Ic {...p} d="M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>;
const IWifiOff = (p) => <Ic {...p} d={<><path d="M1 1l22 22"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a11 11 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></>}/>;
const IChev = (p) => <Ic {...p} d="m9 6 6 6-6 6"/>;

const Tick = ({ state, p }) => {
  const map = {
    recorded:    { ticks: 1, color: p.inkFaint,  label: 'Recorded' },
    transcribed: { ticks: 2, color: p.cool,      label: 'Transcribed' },
    summary:     { ticks: 2, color: p.accent,    label: 'Summary ready' },
    pdf:         { ticks: 2, color: p.success,   label: 'PDF saved' },
  };
  const m = map[state];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
      color: m.color, fontFamily: F_BODY, fontWeight: 500 }}>
      <svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke={m.color}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m1 6 3.5 3.5L11 3"/>
        {m.ticks === 2 && <path d="m6 6 3.5 3.5L16 3"/>}
      </svg>
      {m.label}
    </span>
  );
};

function StatusBar({ p }) {
  return (
    <div style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', fontFamily: F_BODY, flexShrink: 0 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: p.ink, letterSpacing: 0.2 }}>9:41</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="16" height="11" viewBox="0 0 16 11" fill={p.ink}><path d="M8 10.5L.67 3.17a10.37 10.37 0 0114.66 0L8 10.5z"/></svg>
        <svg width="15" height="11" viewBox="0 0 16 11" fill={p.ink}><path d="M13.67 10.67V.33L.33 10.67h13.34z"/></svg>
        <svg width="22" height="11" viewBox="0 0 22 11" fill="none">
          <rect x="0.5" y="0.5" width="18" height="10" rx="2" stroke={p.ink}/>
          <rect x="2" y="2" width="13" height="7" rx="1" fill={p.ink}/>
          <rect x="19.5" y="3.5" width="1.5" height="4" rx="0.5" fill={p.ink}/>
        </svg>
      </div>
    </div>
  );
}

function NavHandle({ p }) {
  return (
    <div style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <div style={{ width: 108, height: 4, borderRadius: 2, background: p.ink, opacity: 0.45 }}/>
    </div>
  );
}

function BottomNavP({ p }) {
  const items = [
    { id: 'home',    label: 'Home',     icon: IHome, active: true },
    { id: 'search',  label: 'Search',   icon: ISearch },
    { id: 'set',     label: 'Settings', icon: ISettings, badge: 1 },
  ];
  return (
    <div style={{ background: p.paper, borderTop: `1px solid ${p.rule}`,
      padding: '10px 24px 14px', display: 'flex', justifyContent: 'space-around',
      fontFamily: F_BODY, flexShrink: 0 }}>
      {items.map(it => (
        <div key={it.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 4, color: it.active ? p.primary : p.inkMuted, position: 'relative' }}>
          <it.icon size={24} stroke={it.active ? p.primary : p.inkMuted} sw={it.active ? 2 : 1.6}/>
          <span style={{ fontSize: 11, fontWeight: it.active ? 700 : 500, letterSpacing: 0.3 }}>{it.label}</span>
          {it.badge && (
            <span style={{ position: 'absolute', top: -2, right: 14,
              minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
              background: p.primary, color: '#fff',
              fontSize: 10, fontWeight: 700, fontFamily: F_BODY,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.badge}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function PaletteDashboard({ palette }) {
  const p = palette;
  const records = [
    { pid: 'P-10482', time: 'Today, 11:42', dur: '8:14', doc: 'You', state: 'recorded', offline: true },
    { pid: 'P-10481', time: 'Today, 10:55', dur: '12:03', doc: 'You', state: 'transcribed' },
    { pid: 'P-10478', time: 'Today, 09:30', dur: '6:47', doc: 'You', state: 'summary' },
    { pid: 'P-10470', time: 'Yest, 18:20', dur: '14:22', doc: 'Dr. Rao', state: 'pdf' },
    { pid: 'P-10469', time: 'Yest, 17:05', dur: '9:15', doc: 'Dr. Rao', state: 'pdf' },
    { pid: 'P-10462', time: 'Yest, 15:40', dur: '7:32', doc: 'You', state: 'pdf' },
  ];
  const bg = {
    background: `radial-gradient(ellipse at 20% 0%, ${hexA(p.accent, 0.04)}, transparent 50%),
                 radial-gradient(ellipse at 80% 100%, ${hexA(p.primary, 0.03)}, transparent 50%),
                 ${p.paper}`,
  };
  return (
    <div style={{
      width: 412, height: 892, borderRadius: 44, overflow: 'hidden',
      background: p.paper, border: `10px solid #2A221A`,
      boxShadow: '0 30px 80px rgba(55, 35, 15, 0.18), 0 8px 20px rgba(55, 35, 15, 0.08)',
      display: 'flex', flexDirection: 'column', boxSizing: 'border-box', position: 'relative',
    }}>
      <StatusBar p={p}/>
      <div style={{ ...bg, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '14px 22px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: p.primary, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: F_DISP, fontSize: 22, flexShrink: 0 }}>A</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontFamily: F_BODY, fontWeight: 600, color: p.ink, lineHeight: 1.1 }}>
              Dr. Aparna Iyer
            </div>
            <div style={{ fontSize: 12, fontFamily: F_BODY, color: p.inkMuted, marginTop: 2,
              display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 4, height: 4, borderRadius: 2, background: p.accent }}/>
              Sunrise Clinic, Pune
            </div>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: p.paperDeep,
            border: `1px solid ${p.rule}`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: p.inkSoft, position: 'relative' }}>
            <ISettings size={18}/>
            <span style={{ position: 'absolute', top: -3, right: -3,
              width: 18, height: 18, borderRadius: 9, background: p.primary,
              color: '#fff', fontSize: 10, fontWeight: 700, fontFamily: F_BODY,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${p.paper}` }}>1</span>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '0 22px 14px' }}>
          <div style={{ background: p.paperDeep, border: `1px solid ${p.rule}`, borderRadius: 14,
            padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ISearch size={18} stroke={p.inkMuted}/>
            <span style={{ fontSize: 14, fontFamily: F_BODY, color: p.inkFaint, flex: 1 }}>
              Search by Patient ID
            </span>
            <span style={{ fontSize: 11, fontFamily: F_MONO, color: p.inkMuted,
              background: p.paper, padding: '2px 6px', borderRadius: 4,
              border: `1px solid ${p.rule}` }}>clinic</span>
          </div>
        </div>

        {/* Section */}
        <div style={{ padding: '4px 22px 10px' }}>
          <div style={{ fontFamily: F_DISP, fontSize: 28, color: p.ink,
            fontStyle: 'italic', lineHeight: 1, letterSpacing: -0.3 }}>
            Today's consultations
          </div>
          <div style={{ fontSize: 12, fontFamily: F_BODY, color: p.inkMuted, marginTop: 6 }}>
            6 records · 1 pending transcription
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 100px' }}>
          {records.map((r) => (
            <div key={r.pid} style={{ background: p.paper, borderRadius: 14,
              border: `1px solid ${p.rule}`, padding: '14px 16px', marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ minWidth: 68, padding: '6px 8px', borderRadius: 6,
                background: p.paperDeep, border: `1px dashed ${p.chitBorder}`,
                textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontFamily: F_BODY, fontWeight: 600,
                  color: p.chitBorder, letterSpacing: 1, textTransform: 'uppercase' }}>Patient</div>
                <div style={{ fontFamily: F_MONO, fontSize: 13, fontWeight: 600,
                  color: p.ink, marginTop: 1 }}>{r.pid}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontFamily: F_BODY, fontWeight: 600, color: p.ink }}>
                    {r.time}
                  </span>
                  {r.offline && <IWifiOff size={12} stroke={p.primary}/>}
                </div>
                <div style={{ fontSize: 11.5, fontFamily: F_BODY, color: p.inkMuted,
                  marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{r.dur}</span>
                  <span style={{ width: 2, height: 2, borderRadius: 1, background: p.inkFaint }}/>
                  <span>{r.doc}</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Tick state={r.state} p={p}/>
                </div>
              </div>
              <IChev size={18} stroke={p.inkFaint}/>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ position: 'absolute', bottom: 88, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <button style={{ pointerEvents: 'auto',
            background: p.primary, color: '#fff', border: 'none',
            padding: '16px 28px 16px 20px', borderRadius: 999,
            display: 'flex', alignItems: 'center', gap: 12,
            fontFamily: F_BODY, fontSize: 16, fontWeight: 700, letterSpacing: 0.2,
            boxShadow: `0 10px 24px ${p.ctaShadow}, 0 2px 0 rgba(0,0,0,0.08)`,
            cursor: 'pointer' }}>
            <span style={{ width: 36, height: 36, borderRadius: 18,
              background: 'rgba(255,255,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IMic size={20} stroke="#fff"/>
            </span>
            Start recording
          </button>
        </div>

        <BottomNavP p={p}/>
      </div>
      <NavHandle p={p}/>
    </div>
  );
}

// Swatch strip for the header of each option
function SwatchStrip({ palette }) {
  const p = palette;
  const cols = [
    { c: p.paper, label: 'paper' },
    { c: p.paperDeep, label: 'deep' },
    { c: p.ink, label: 'ink' },
    { c: p.primary, label: 'primary' },
    { c: p.accent, label: 'accent' },
    { c: p.success, label: 'success' },
    { c: p.cool, label: 'cool' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
      {cols.map((s, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: s.c,
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}/>
          <div style={{ fontSize: 9, fontFamily: F_MONO, color: '#7A6E60', letterSpacing: 0.5 }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function PaletteOption({ palette }) {
  const p = palette;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 18 }}>
      <div>
        <div style={{ fontFamily: F_DISP, fontStyle: 'italic', fontSize: 36,
          color: '#1C1712', lineHeight: 1, letterSpacing: -0.5 }}>
          {p.name}
        </div>
        <div style={{ fontFamily: F_BODY, fontSize: 13, color: '#7A6E60', marginTop: 4 }}>
          {p.subtitle}
        </div>
        <SwatchStrip palette={p}/>
      </div>
      <PaletteDashboard palette={p}/>
    </div>
  );
}

// small helper to mix in alpha to a hex
function hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

Object.assign(window, { PALETTES, PaletteOption, PaletteDashboard });

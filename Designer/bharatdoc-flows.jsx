// BharatDoc — Remaining screens (all flows from PRD)
// Relies on bharatdoc-screens.jsx exports: BD, fonts, icons, Device, BottomNav, StatusTick, etc.

const {
  BD, BD_FONT_DISP, BD_FONT_BODY, BD_FONT_MONO,
  Icon, IconMic, IconSearch, IconSettings, IconHome, IconFile, IconWifiOff, IconChevron,
  IconPause, IconStop, IconPlus, IconCheck, IconPlay, IconDownload, IconShare, IconSparkle,
  StatusTick, BottomNav, paperBg,
} = window;

// ─── Additional icons ──────────────────────────────────
const IconBack = (p) => <Icon {...p} d="m15 18-6-6 6-6"/>;
const IconEdit = (p) => <Icon {...p} d={<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></>}/>;
const IconX = (p) => <Icon {...p} d={<><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>}/>;
const IconCopy = (p) => <Icon {...p} d={<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>}/>;
const IconMoreH = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>}/>;
const IconClock = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>}/>;
const IconAlert = (p) => <Icon {...p} d={<><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>}/>;
const IconLogo = ({ size = 40 }) => (
  <div style={{
    width: size, height: size, borderRadius: size * 0.28,
    background: BD.terracotta, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: BD_FONT_DISP, fontSize: size * 0.52, fontStyle: 'italic',
    letterSpacing: -1, lineHeight: 1, paddingBottom: 2,
    boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.08)',
  }}>B</div>
);

// ─── Shared UI atoms ──────────────────────────────────
const Field = ({ label, value, placeholder, mono, suffix, multiline, active }) => (
  <div style={{ marginBottom: 16 }}>
    {label && <div style={{ fontSize: 11, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.inkMuted,
      letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>}
    <div style={{
      background: BD.paper, border: `1.5px solid ${active ? BD.terracotta : BD.rule}`,
      borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center',
      fontFamily: mono ? BD_FONT_MONO : BD_FONT_BODY, fontSize: mono ? 18 : 15,
      color: value ? BD.ink : BD.inkFaint, minHeight: multiline ? 80 : 'auto',
      letterSpacing: mono ? 4 : 'normal', fontWeight: mono ? 600 : 500,
    }}>
      <div style={{ flex: 1, alignSelf: multiline ? 'flex-start' : 'center' }}>
        {value || placeholder}
      </div>
      {suffix && <div style={{ fontSize: 12, color: BD.inkMuted, fontFamily: BD_FONT_BODY }}>{suffix}</div>}
    </div>
  </div>
);

const Btn = ({ children, onClick, variant = 'primary', full, size = 'md', icon, style }) => {
  const base = { fontFamily: BD_FONT_BODY, fontWeight: 700, letterSpacing: 0.2,
    borderRadius: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', gap: 8, transition: 'all 0.15s',
    padding: size === 'sm' ? '10px 14px' : '14px 18px',
    fontSize: size === 'sm' ? 13 : 15,
    width: full ? '100%' : 'auto', border: 'none' };
  const variants = {
    primary: { background: BD.terracotta, color: '#fff',
      boxShadow: '0 4px 12px rgba(194, 74, 42, 0.28)' },
    ink: { background: BD.ink, color: BD.paper },
    ghost: { background: 'transparent', color: BD.inkSoft, border: `1px solid ${BD.rule}` },
    danger: { background: 'transparent', color: BD.stamp, border: `1px solid rgba(139, 46, 32, 0.3)` },
    success: { background: BD.sage, color: '#fff' },
  };
  return <button onClick={onClick} style={{ ...base, ...variants[variant], ...style }}>
    {icon}{children}
  </button>;
};

const TopBar = ({ title, subtitle, onBack = true, right }) => (
  <div style={{
    padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
    borderBottom: `1px solid ${BD.rule}`, background: BD.paper, flexShrink: 0,
  }}>
    {onBack && (
      <button style={{
        width: 36, height: 36, borderRadius: 18, background: 'transparent',
        border: `1px solid ${BD.rule}`, color: BD.inkSoft, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}><IconBack size={16} stroke={BD.inkSoft}/></button>
    )}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: BD_FONT_BODY, fontSize: 15, fontWeight: 700, color: BD.ink,
        lineHeight: 1.1 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11.5, fontFamily: BD_FONT_BODY, color: BD.inkMuted,
        marginTop: 2 }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);

const SerifH = ({ children, size = 32, style }) => (
  <div style={{
    fontFamily: BD_FONT_DISP, fontStyle: 'italic', fontSize: size,
    lineHeight: 1, letterSpacing: -0.5, color: BD.ink, ...style,
  }}>{children}</div>
);

// ═══════════════════════════════════════════════════════
// 01 · PHONE ENTRY
// ═══════════════════════════════════════════════════════
function PhoneEntryScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column',
      padding: '40px 28px' }}>
      <IconLogo size={56}/>
      <div style={{ marginTop: 40 }}>
        <SerifH size={40}>Welcome to BharatDoc</SerifH>
        <div style={{ fontFamily: BD_FONT_BODY, fontSize: 14, color: BD.inkMuted,
          marginTop: 10, lineHeight: 1.5 }}>
          Record consultations. Get AI-drafted clinical summaries. Save to PDF in one tap.
        </div>
      </div>
      <div style={{ marginTop: 36 }}>
        <div style={{ fontSize: 11, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.inkMuted,
          letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
          Mobile number
        </div>
        <div style={{
          background: BD.paper, border: `1.5px solid ${BD.terracotta}`,
          borderRadius: 10, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: 12,
            borderRight: `1px solid ${BD.rule}` }}>
            <span style={{ fontSize: 16 }}>🇮🇳</span>
            <span style={{ fontFamily: BD_FONT_MONO, fontSize: 15, color: BD.ink, fontWeight: 600 }}>+91</span>
          </div>
          <span style={{ fontFamily: BD_FONT_MONO, fontSize: 18, color: BD.ink, letterSpacing: 2,
            fontWeight: 600 }}>98765 43210</span>
          <span style={{ width: 2, height: 20, background: BD.terracotta, marginLeft: 2,
            animation: 'bd-blink 1s infinite' }}/>
        </div>
        <div style={{ fontSize: 11, fontFamily: BD_FONT_BODY, color: BD.inkMuted, marginTop: 8 }}>
          We'll send a 6-digit OTP via SMS.
        </div>
      </div>
      <div style={{ flex: 1 }}/>
      <Btn full variant="primary">Send OTP</Btn>
      <div style={{ fontSize: 11, fontFamily: BD_FONT_BODY, color: BD.inkFaint,
        textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>
        By continuing you agree to BharatDoc's<br/>
        <span style={{ color: BD.inkSoft, textDecoration: 'underline' }}>Terms</span> and{' '}
        <span style={{ color: BD.inkSoft, textDecoration: 'underline' }}>Privacy Policy</span>.
      </div>
      <style>{`@keyframes bd-blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 02 · OTP VERIFY
// ═══════════════════════════════════════════════════════
function OtpVerifyScreen() {
  const digits = ['4', '2', '7', '1', '', ''];
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column',
      padding: '40px 28px' }}>
      <button style={{ width: 40, height: 40, borderRadius: 20, background: 'transparent',
        border: `1px solid ${BD.rule}`, alignSelf: 'flex-start', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <IconBack size={16} stroke={BD.inkSoft}/>
      </button>
      <div style={{ marginTop: 32 }}>
        <SerifH size={36}>Enter the code</SerifH>
        <div style={{ fontFamily: BD_FONT_BODY, fontSize: 13, color: BD.inkMuted,
          marginTop: 10, lineHeight: 1.5 }}>
          Sent to <span style={{ color: BD.ink, fontFamily: BD_FONT_MONO }}>+91 98765 43210</span>
          {' · '}<span style={{ color: BD.terracotta, fontWeight: 600 }}>Change</span>
        </div>
      </div>
      <div style={{ marginTop: 36, display: 'flex', gap: 10, justifyContent: 'space-between' }}>
        {digits.map((d, i) => (
          <div key={i} style={{
            width: 48, height: 60,
            background: BD.paper,
            border: `1.5px solid ${i === 4 ? BD.terracotta : (d ? BD.rule : BD.rule)}`,
            borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: BD_FONT_MONO, fontSize: 26, fontWeight: 700, color: BD.ink,
            boxShadow: i === 4 ? `0 0 0 3px rgba(194, 74, 42, 0.12)` : 'none',
          }}>
            {d || (i === 4 ? <span style={{ width: 2, height: 28, background: BD.terracotta,
              animation: 'bd-blink 1s infinite' }}/> : '')}
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 20, padding: '10px 14px', borderRadius: 10,
        background: 'rgba(214, 138, 60, 0.1)',
        border: `1px solid rgba(214, 138, 60, 0.2)`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <IconClock size={14} stroke={BD.ochre}/>
        <span style={{ fontSize: 12, fontFamily: BD_FONT_BODY, color: BD.inkSoft }}>
          Resend OTP in <span style={{ fontFamily: BD_FONT_MONO, color: BD.ochre, fontWeight: 700 }}>0:24</span>
        </span>
      </div>
      <div style={{ flex: 1 }}/>
      <Btn full variant="primary">Verify &amp; continue</Btn>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 03 · PROFILE SETUP
// ═══════════════════════════════════════════════════════
function ProfileSetupScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="Your profile" subtitle="Step 2 of 3"/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 20px' }}>
        <SerifH size={30}>A little about you</SerifH>
        <div style={{ fontSize: 12.5, color: BD.inkMuted, marginTop: 8, marginBottom: 24,
          fontFamily: BD_FONT_BODY, lineHeight: 1.5 }}>
          This appears on every PDF you generate.
        </div>

        {/* Photo picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: BD.paperDeep,
            border: `1.5px dashed ${BD.rule}`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: BD.inkFaint, flexShrink: 0 }}>
            <IconPlus size={20} stroke={BD.inkFaint}/>
          </div>
          <div>
            <div style={{ fontSize: 13, fontFamily: BD_FONT_BODY, fontWeight: 600, color: BD.ink }}>
              Add profile photo
            </div>
            <div style={{ fontSize: 11, color: BD.inkMuted, marginTop: 2 }}>Optional · shown in app header</div>
          </div>
        </div>

        <Field label="Full name" value="Aparna Iyer" />
        <Field label="Specialization" value="General Physician" suffix="Required"/>
        <div style={{
          marginTop: 8, padding: '10px 12px', borderRadius: 8,
          background: BD.paperDeep, border: `1px solid ${BD.rule}`,
          fontSize: 11.5, color: BD.inkMuted, fontFamily: BD_FONT_BODY, lineHeight: 1.5,
        }}>
          Fields marked <span style={{ color: BD.terracotta, fontWeight: 700 }}>required</span> must be filled to continue.
          Your phone number (<span style={{ fontFamily: BD_FONT_MONO }}>+91 98765 43210</span>) is verified.
        </div>
      </div>
      <div style={{ padding: '14px 22px 16px', background: BD.paper,
        borderTop: `1px solid ${BD.rule}`, display: 'flex', gap: 10, flexShrink: 0 }}>
        <Btn variant="ghost" style={{ flex: 1 }}>Back</Btn>
        <Btn variant="primary" style={{ flex: 1.6 }}>Continue</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 04 · CLINIC CHOICE (Create vs Join)
// ═══════════════════════════════════════════════════════
function ClinicChoiceScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="Your clinic" subtitle="Step 3 of 3"/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 22px' }}>
        <SerifH size={32}>Where do you work?</SerifH>
        <div style={{ fontSize: 12.5, color: BD.inkMuted, marginTop: 8, marginBottom: 28,
          fontFamily: BD_FONT_BODY, lineHeight: 1.5 }}>
          Clinics group doctors together so records can be shared across the team.
        </div>

        {/* Join existing */}
        <div style={{
          background: BD.paper, border: `1.5px solid ${BD.terracotta}`, borderRadius: 14,
          padding: '18px 16px', marginBottom: 14,
          boxShadow: '0 4px 12px rgba(194, 74, 42, 0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(194, 74, 42, 0.12)',
              color: BD.terracotta, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconFile size={16} stroke={BD.terracotta}/>
            </div>
            <div style={{ fontSize: 15, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.ink }}>
              Join an existing clinic
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: BD.inkMuted, marginBottom: 14, fontFamily: BD_FONT_BODY,
            lineHeight: 1.5 }}>
            Enter the 6-character code shared by your clinic owner.
          </div>
          <Field mono value="MED42X" active/>
          <div style={{ padding: '10px 12px', background: BD.paperDeep, borderRadius: 8,
            border: `1px solid ${BD.rule}`, marginTop: -4, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.inkMuted,
              letterSpacing: 1, textTransform: 'uppercase' }}>Clinic found</div>
            <div style={{ fontFamily: BD_FONT_DISP, fontStyle: 'italic', fontSize: 22, color: BD.ink,
              marginTop: 2, lineHeight: 1.1 }}>Sunrise Clinic</div>
            <div style={{ fontSize: 11, color: BD.inkMuted, marginTop: 2 }}>
              Baner Road, Pune · 3 doctors
            </div>
          </div>
          <Btn full variant="primary" size="sm">Request to join</Btn>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 14px' }}>
          <div style={{ flex: 1, height: 1, background: BD.rule }}/>
          <span style={{ fontSize: 10, fontFamily: BD_FONT_BODY, color: BD.inkFaint,
            letterSpacing: 1.5, textTransform: 'uppercase' }}>OR</span>
          <div style={{ flex: 1, height: 1, background: BD.rule }}/>
        </div>

        {/* Create new */}
        <div style={{
          background: BD.paperDeep, border: `1px solid ${BD.rule}`, borderRadius: 14,
          padding: '16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
        }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: BD.paper,
            border: `1px solid ${BD.rule}`, color: BD.inkSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconPlus size={18} stroke={BD.inkSoft}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.ink }}>
              Create a new clinic
            </div>
            <div style={{ fontSize: 11.5, color: BD.inkMuted, marginTop: 2, lineHeight: 1.4 }}>
              You'll become the owner and can approve other doctors.
            </div>
          </div>
          <IconChevron size={18} stroke={BD.inkFaint}/>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 05 · CREATE CLINIC FORM
// ═══════════════════════════════════════════════════════
function CreateClinicScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="New clinic" subtitle="You'll be the owner"/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
        <SerifH size={28}>Clinic details</SerifH>
        <div style={{ fontSize: 12, color: BD.inkMuted, marginTop: 6, marginBottom: 22,
          fontFamily: BD_FONT_BODY, lineHeight: 1.5 }}>
          Appears on every PDF letterhead.
        </div>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 68, height: 68, borderRadius: 12, background: BD.paperDeep,
            border: `1.5px dashed ${BD.rule}`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: BD.inkFaint, flexShrink: 0 }}>
            <IconPlus size={22} stroke={BD.inkFaint}/>
          </div>
          <div>
            <div style={{ fontSize: 13, fontFamily: BD_FONT_BODY, fontWeight: 600, color: BD.ink }}>
              Upload clinic logo
            </div>
            <div style={{ fontSize: 11, color: BD.inkMuted, marginTop: 2 }}>Optional · PNG/JPG · shown on PDFs</div>
          </div>
        </div>

        <Field label="Clinic name" value="Sunrise Clinic" active/>
        <Field label="Address" placeholder="24 Baner Road, Pune 411045" multiline suffix="Optional"/>

        <div style={{
          marginTop: 8, padding: '14px', borderRadius: 10,
          background: 'rgba(214, 138, 60, 0.1)',
          border: `1px solid rgba(214, 138, 60, 0.25)`,
        }}>
          <div style={{ fontSize: 11, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.ochre,
            letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
            Your Clinic Code
          </div>
          <div style={{ fontSize: 12, color: BD.inkSoft, fontFamily: BD_FONT_BODY, lineHeight: 1.5 }}>
            Generated after you create your clinic. Share this 6-character code with doctors you want to join your team.
          </div>
        </div>
      </div>
      <div style={{ padding: '14px 22px 16px', background: BD.paper,
        borderTop: `1px solid ${BD.rule}`, flexShrink: 0 }}>
        <Btn full variant="primary">Create clinic &amp; continue</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 06 · PENDING APPROVAL (locked screen)
// ═══════════════════════════════════════════════════════
function PendingApprovalScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '40px 28px', textAlign: 'center' }}>
      <div style={{
        width: 120, height: 120, borderRadius: 60,
        background: 'rgba(214, 138, 60, 0.12)',
        border: `2px dashed ${BD.ochre}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 28, position: 'relative',
      }}>
        <IconClock size={48} stroke={BD.ochre}/>
        <div style={{ position: 'absolute', inset: -8, borderRadius: 64,
          border: `2px solid rgba(214, 138, 60, 0.18)`,
          animation: 'bd-ring 2.4s ease-out infinite' }}/>
      </div>
      <SerifH size={32}>Waiting for approval</SerifH>
      <div style={{ fontFamily: BD_FONT_BODY, fontSize: 14, color: BD.inkSoft,
        marginTop: 14, lineHeight: 1.6, maxWidth: 320 }}>
        Your request to join <span style={{ fontWeight: 700, color: BD.ink }}>Sunrise Clinic</span> is
        pending review by the clinic owner. You'll be notified once approved.
      </div>
      <div style={{
        marginTop: 28, padding: '14px 16px', borderRadius: 12,
        background: BD.paper, border: `1px solid ${BD.rule}`, width: '100%',
        display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12,
          fontFamily: BD_FONT_BODY }}>
          <span style={{ color: BD.inkMuted }}>Requested on</span>
          <span style={{ color: BD.ink, fontWeight: 600 }}>23 Apr 2026, 09:14 AM</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12,
          fontFamily: BD_FONT_BODY }}>
          <span style={{ color: BD.inkMuted }}>Clinic code</span>
          <span style={{ color: BD.ink, fontFamily: BD_FONT_MONO, fontWeight: 700, letterSpacing: 1 }}>MED42X</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12,
          fontFamily: BD_FONT_BODY }}>
          <span style={{ color: BD.inkMuted }}>Owner</span>
          <span style={{ color: BD.ink, fontWeight: 600 }}>Dr. Kavita Rao</span>
        </div>
      </div>
      <div style={{ marginTop: 28, fontSize: 11, color: BD.inkMuted, fontFamily: BD_FONT_BODY }}>
        Not hearing back?{' '}
        <span style={{ color: BD.terracotta, fontWeight: 700 }}>Contact owner via WhatsApp</span>
      </div>
      <div style={{ flex: 1 }}/>
      <Btn variant="ghost" size="sm">Sign out</Btn>
      <style>{`@keyframes bd-ring {
        0% { transform: scale(1); opacity: 0.8; }
        100% { transform: scale(1.25); opacity: 0; }
      }`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 07 · REJECTED SCREEN
// ═══════════════════════════════════════════════════════
function RejectedScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '40px 28px', textAlign: 'center' }}>
      <div style={{
        width: 120, height: 120, borderRadius: 60,
        background: 'rgba(139, 46, 32, 0.08)',
        border: `2px solid rgba(139, 46, 32, 0.25)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28,
      }}>
        <IconAlert size={48} stroke={BD.stamp}/>
      </div>
      <SerifH size={32}>Access not granted</SerifH>
      <div style={{ fontFamily: BD_FONT_BODY, fontSize: 14, color: BD.inkSoft,
        marginTop: 14, lineHeight: 1.6, maxWidth: 320 }}>
        Your request to join <span style={{ fontWeight: 700, color: BD.ink }}>Sunrise Clinic</span> was not approved by the clinic owner.
      </div>
      <div style={{
        marginTop: 24, padding: '14px 16px', borderRadius: 12,
        background: BD.paper, border: `1px solid ${BD.rule}`, width: '100%',
        textAlign: 'left',
      }}>
        <div style={{ fontSize: 10, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.stamp,
          letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
          Reason from owner
        </div>
        <div style={{ fontSize: 13, color: BD.inkSoft, fontFamily: BD_FONT_BODY, lineHeight: 1.5,
          fontStyle: 'italic' }}>
          "Please use the clinic code I share via our group WhatsApp. I don't recognise this registration."
        </div>
      </div>
      <div style={{ flex: 1 }}/>
      <Btn full variant="primary">Join a different clinic</Btn>
      <Btn variant="ghost" size="sm" style={{ marginTop: 10 }}>Sign out</Btn>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 08 · MIC PERMISSION
// ═══════════════════════════════════════════════════════
function MicPermissionScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column',
      padding: '32px 28px' }}>
      <button style={{ width: 40, height: 40, borderRadius: 20, background: 'transparent',
        border: `1px solid ${BD.rule}`, alignSelf: 'flex-start', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <IconX size={16} stroke={BD.inkSoft}/>
      </button>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{
          width: 120, height: 120, borderRadius: 60, background: BD.terracotta,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 20px 60px rgba(194, 74, 42, 0.3)',
        }}>
          <IconMic size={54} stroke="#fff"/>
        </div>
        <SerifH size={34} style={{ marginTop: 28 }}>Let BharatDoc<br/>use your microphone</SerifH>
        <div style={{ fontFamily: BD_FONT_BODY, fontSize: 14, color: BD.inkSoft,
          marginTop: 16, lineHeight: 1.6, maxWidth: 320 }}>
          We need microphone access to record consultations. Audio stays on your device until you choose to upload it.
        </div>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8,
          textAlign: 'left', width: '100%', maxWidth: 300 }}>
          {[
            'Recording only starts when you tap',
            'Audio saved locally while you work',
            'Nothing uploads without your approval',
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 13, color: BD.inkSoft, fontFamily: BD_FONT_BODY }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: BD.sage,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0 }}>
                <IconCheck size={11} stroke="#fff" sw={2.5}/>
              </div>
              {t}
            </div>
          ))}
        </div>
      </div>
      <Btn full variant="primary">Allow microphone access</Btn>
      <Btn variant="ghost" size="sm" style={{ marginTop: 10, alignSelf: 'center' }}>Not now</Btn>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 09 · PRE-RECORDING (before tap)
// ═══════════════════════════════════════════════════════
function PreRecordScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="New consultation" subtitle="Sunrise Clinic"/>
      <div style={{ padding: '20px 22px', flex: 1, overflowY: 'auto' }}>
        <Field label="Patient ID" placeholder="e.g. P-10483 · optional, can add later" mono/>
        <Field label="Consultation label" placeholder="e.g. Follow-up, First visit" suffix="Optional"/>

        <div style={{
          marginTop: 16, padding: '14px', borderRadius: 12,
          background: BD.paperDeep, border: `1px solid ${BD.rule}`,
        }}>
          <div style={{ fontSize: 11, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.inkMuted,
            letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
            Before you start
          </div>
          <div style={{ fontSize: 12.5, color: BD.inkSoft, fontFamily: BD_FONT_BODY,
            lineHeight: 1.6 }}>
            You have <span style={{ color: BD.ink, fontWeight: 700 }}>60 minutes</span> per
            consultation. Audio saves every 30s — safe even if your phone dies.
          </div>
        </div>
      </div>
      <div style={{ padding: '24px 28px 36px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button style={{
          width: 108, height: 108, borderRadius: 54, background: BD.terracotta, border: 'none',
          color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 12px 40px rgba(194, 74, 42, 0.4), 0 0 0 10px rgba(194, 74, 42, 0.08)',
        }}>
          <IconMic size={40} stroke="#fff"/>
        </button>
        <div style={{ fontFamily: BD_FONT_BODY, fontSize: 13, fontWeight: 600, color: BD.ink,
          marginTop: 6 }}>Tap to start recording</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 10 · RECORDING PAUSED
// ═══════════════════════════════════════════════════════
function RecordingPausedScreen() {
  return (
    <div style={{ background: BD.ink, color: '#FAF5EA', height: '100%',
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 50% 40%, rgba(214, 138, 60, 0.08), transparent 70%)` }}/>
      <div style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', position: 'relative' }}>
        <button style={{ background: 'transparent', border: `1px solid rgba(250, 245, 234, 0.18)`,
          color: '#FAF5EA', padding: '8px 14px', borderRadius: 999,
          fontFamily: BD_FONT_BODY, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          Cancel
        </button>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(214, 138, 60, 0.15)',
          border: `1px solid rgba(214, 138, 60, 0.35)`,
          padding: '6px 12px', borderRadius: 999,
        }}>
          <IconPause size={12}/>
          <span style={{ fontSize: 11, fontFamily: BD_FONT_BODY, fontWeight: 700,
            letterSpacing: 1, textTransform: 'uppercase', color: BD.saffron }}>Paused</span>
        </div>
      </div>
      <div style={{ padding: '20px 0 0', textAlign: 'center', position: 'relative' }}>
        <div style={{ fontSize: 11, fontFamily: BD_FONT_BODY, fontWeight: 600,
          color: 'rgba(250, 245, 234, 0.5)', letterSpacing: 2, textTransform: 'uppercase' }}>
          Sunrise Clinic · Dr. Aparna Iyer
        </div>
      </div>
      <div style={{ textAlign: 'center', padding: '28px 0 0', position: 'relative' }}>
        <div style={{ fontFamily: BD_FONT_DISP, fontSize: 96, fontStyle: 'italic', lineHeight: 1,
          color: 'rgba(250, 245, 234, 0.7)', letterSpacing: -2, fontVariantNumeric: 'tabular-nums' }}>
          04<span style={{ color: BD.saffron }}>:</span>37
        </div>
        <div style={{ fontSize: 12, fontFamily: BD_FONT_BODY, color: 'rgba(250, 245, 234, 0.55)',
          marginTop: 6 }}>
          Paused · tap resume when ready
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px', position: 'relative' }}>
        <div style={{ width: '100%', height: 120, display: 'flex', alignItems: 'center', gap: 3 }}>
          {Array.from({ length: 44 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: `${30 + Math.sin(i) * 15 + i * 0.6}%`,
              background: 'rgba(250, 245, 234, 0.18)', borderRadius: 3, minHeight: 6 }}/>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
        padding: '0 22px 42px', position: 'relative' }}>
        <button style={{
          width: 64, height: 64, borderRadius: 32,
          background: 'rgba(250, 245, 234, 0.08)', border: `1px solid rgba(250, 245, 234, 0.2)`,
          color: '#FAF5EA', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconStop size={22}/>
        </button>
        <button style={{
          width: 92, height: 92, borderRadius: 46,
          background: BD.sage, border: '4px solid rgba(250, 245, 234, 0.95)',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 40px rgba(95, 122, 82, 0.5), 0 0 0 8px rgba(95, 122, 82, 0.12)',
        }}>
          <IconPlay size={34}/>
        </button>
        <div style={{ width: 64 }}/>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 11 · POST-RECORDING (playback + actions)
// ═══════════════════════════════════════════════════════
function PostRecordScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="Recording complete" subtitle="Review and transcribe"/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
        <div style={{
          background: BD.paper, border: `1px solid ${BD.rule}`, borderRadius: 14,
          padding: '16px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <SerifH size={28}>8:14</SerifH>
            <span style={{ fontSize: 11, fontFamily: BD_FONT_MONO, color: BD.inkMuted,
              letterSpacing: 0.5 }}>11:42 · 23 Apr</span>
          </div>
          {/* Waveform + scrubber */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 52,
            marginTop: 14, marginBottom: 4 }}>
            {Array.from({ length: 60 }).map((_, i) => {
              const h = 0.25 + Math.abs(Math.sin(i * 0.6) * 0.7 + Math.cos(i * 0.2) * 0.2);
              const played = i < 22;
              return (
                <div key={i} style={{
                  flex: 1, height: `${h * 100}%`, minHeight: 3, borderRadius: 2,
                  background: played ? BD.terracotta : BD.rule,
                }}/>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10,
            fontFamily: BD_FONT_MONO, color: BD.inkMuted, marginBottom: 12 }}>
            <span>3:02</span>
            <span>8:14</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
            <button style={{ width: 44, height: 44, borderRadius: 22, background: BD.paperDeep,
              border: `1px solid ${BD.rule}`, color: BD.inkSoft, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconBack size={16} stroke={BD.inkSoft}/>
            </button>
            <button style={{ width: 56, height: 56, borderRadius: 28, background: BD.ink,
              color: BD.paper, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconPlay size={22} stroke={BD.paper}/>
            </button>
            <button style={{ width: 44, height: 44, borderRadius: 22, background: BD.paperDeep,
              border: `1px solid ${BD.rule}`, color: BD.inkSoft, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transform: 'scaleX(-1)' }}>
              <IconBack size={16} stroke={BD.inkSoft}/>
            </button>
          </div>
        </div>

        {/* Required fields */}
        <Field label="Patient ID · required" mono placeholder="P-10483 · tap to enter" active/>
        <Field label="Consultation label" placeholder="e.g. Follow-up, First visit" suffix="Optional"/>
      </div>

      <div style={{ padding: '14px 22px 16px', background: BD.paper,
        borderTop: `1px solid ${BD.rule}`, display: 'flex', gap: 10, flexShrink: 0 }}>
        <Btn variant="ghost" style={{ flex: 1 }}>Save, transcribe later</Btn>
        <Btn variant="primary" style={{ flex: 1.2 }} icon={<IconSparkle size={14} stroke="#fff"/>}>
          Transcribe now
        </Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 12 · TRANSCRIBING (processing)
// ═══════════════════════════════════════════════════════
function TranscribingScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="Transcribing…" subtitle="P-10482 · 8:14"/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '20px 28px', textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 140, height: 140, marginBottom: 28 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 70,
            border: `3px solid ${BD.rule}` }}/>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 70,
            border: `3px solid ${BD.terracotta}`,
            borderTopColor: 'transparent', borderRightColor: 'transparent',
            animation: 'bd-spin 1.4s linear infinite' }}/>
          <div style={{ position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center' }}>
            <IconSparkle size={36} stroke={BD.terracotta}/>
          </div>
        </div>
        <SerifH size={28}>Listening carefully</SerifH>
        <div style={{ fontFamily: BD_FONT_BODY, fontSize: 13.5, color: BD.inkMuted,
          marginTop: 10, lineHeight: 1.5 }}>
          Converting your audio to text.<br/>This usually takes 20–45 seconds.
        </div>

        {/* Progress strip */}
        <div style={{ marginTop: 28, width: '100%', padding: '14px',
          background: BD.paper, border: `1px solid ${BD.rule}`, borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12,
            fontFamily: BD_FONT_BODY, color: BD.inkSoft, marginBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>Uploading audio</span>
            <span style={{ fontFamily: BD_FONT_MONO, color: BD.sage, fontWeight: 700 }}>100%</span>
          </div>
          <div style={{ height: 6, background: BD.paperDeep, borderRadius: 3, overflow: 'hidden',
            marginBottom: 12 }}>
            <div style={{ width: '100%', height: '100%', background: BD.sage }}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12,
            fontFamily: BD_FONT_BODY, color: BD.inkSoft, marginBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>Transcribing</span>
            <span style={{ fontFamily: BD_FONT_MONO, color: BD.terracotta, fontWeight: 700 }}>62%</span>
          </div>
          <div style={{ height: 6, background: BD.paperDeep, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: '62%', height: '100%',
              background: `linear-gradient(to right, ${BD.terracotta}, ${BD.saffron})` }}/>
          </div>
        </div>
      </div>
      <div style={{ padding: '14px 22px 16px', borderTop: `1px solid ${BD.rule}`,
        background: BD.paper, flexShrink: 0 }}>
        <Btn variant="ghost" full>Continue in background</Btn>
      </div>
      <style>{`@keyframes bd-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 13 · TRANSCRIPT VIEW
// ═══════════════════════════════════════════════════════
function TranscriptScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="Transcript" subtitle="P-10482 · 23 Apr, 11:42"
        right={<StatusTick state="transcribed"/>}/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{
          padding: '10px 12px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(44, 74, 107, 0.08)', border: `1px solid rgba(44, 74, 107, 0.2)`,
          fontSize: 11.5, color: BD.inkSoft, fontFamily: BD_FONT_BODY, lineHeight: 1.4,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <IconCheck size={14} stroke={BD.indigoInk}/>
          <span>Transcribed in 31s · Hindi + English auto-detected</span>
        </div>
        {[
          { t: '0:12', s: 'Doctor:', text: 'Namaste, please have a seat. What brings you in today?' },
          { t: '0:16', s: 'Patient:', text: 'Doctor sahab, mujhe pichle das din se khaansi ho rahi hai. Rat ko bahut badh jati hai.' },
          { t: '0:28', s: 'Doctor:', text: 'Any fever along with the cough? Sputum or dry?' },
          { t: '0:34', s: 'Patient:', text: 'Nahi, bukhaar nahi hai. Dry cough hai. Kuch sardi bhi nahi.' },
          { t: '0:42', s: 'Doctor:', text: 'Koi allergies, ya dust exposure recently?' },
          { t: '0:47', s: 'Patient:', text: 'Haan, ghar renovation chal raha tha. Bahut dust thi do hafte pehle.' },
        ].map((l, i) => (
          <div key={i} style={{ marginBottom: 14, display: 'flex', gap: 10 }}>
            <span style={{ fontFamily: BD_FONT_MONO, fontSize: 11, color: BD.inkFaint,
              flexShrink: 0, minWidth: 36, paddingTop: 2 }}>{l.t}</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 11, fontFamily: BD_FONT_BODY, fontWeight: 700,
                color: l.s === 'Doctor:' ? BD.terracotta : BD.sage, letterSpacing: 0.3,
                textTransform: 'uppercase', marginRight: 6 }}>{l.s}</span>
              <span style={{ fontFamily: BD_FONT_BODY, fontSize: 14, color: BD.inkSoft,
                lineHeight: 1.55 }}>{l.text}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '14px 22px 16px', background: BD.paper,
        borderTop: `1px solid ${BD.rule}`, display: 'flex', gap: 10, flexShrink: 0 }}>
        <Btn variant="ghost" style={{ flex: 1 }}>Edit transcript</Btn>
        <Btn variant="primary" style={{ flex: 1.2 }} icon={<IconSparkle size={14} stroke="#fff"/>}>
          Generate summary
        </Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 14 · TRANSCRIPTION ERROR
// ═══════════════════════════════════════════════════════
function TranscriptionErrorScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="Couldn't transcribe" subtitle="P-10482 · 8:14"/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '20px 28px', textAlign: 'center' }}>
        <div style={{
          width: 100, height: 100, borderRadius: 50,
          background: 'rgba(139, 46, 32, 0.08)',
          border: `2px solid rgba(139, 46, 32, 0.25)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
        }}>
          <IconAlert size={42} stroke={BD.stamp}/>
        </div>
        <SerifH size={28}>Transcription failed</SerifH>
        <div style={{ fontFamily: BD_FONT_BODY, fontSize: 13.5, color: BD.inkSoft,
          marginTop: 12, lineHeight: 1.6, maxWidth: 300 }}>
          We tried 3 times but couldn't reach OpenAI's transcription service. Your audio is safe.
        </div>
        <div style={{
          marginTop: 20, padding: '12px 14px', borderRadius: 10,
          background: BD.paper, border: `1px solid ${BD.rule}`,
          fontSize: 11, fontFamily: BD_FONT_MONO, color: BD.inkMuted, textAlign: 'left',
          width: '100%', lineHeight: 1.4,
        }}>
          <span style={{ color: BD.stamp, fontWeight: 700 }}>ERR_NETWORK</span>
          {' '}· Connection timed out after 45s. Your network may be weak.
        </div>
      </div>
      <div style={{ padding: '14px 22px 16px', background: BD.paper,
        borderTop: `1px solid ${BD.rule}`, display: 'flex', gap: 10, flexShrink: 0 }}>
        <Btn variant="ghost" style={{ flex: 1 }}>Try later</Btn>
        <Btn variant="primary" style={{ flex: 1.2 }}>Retry now</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 15 · CRASH RECOVERY
// ═══════════════════════════════════════════════════════
function CrashRecoveryScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column',
      padding: '40px 28px 28px' }}>
      <IconLogo size={44}/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{
          padding: '18px', borderRadius: 14,
          background: 'rgba(214, 138, 60, 0.12)',
          border: `1.5px solid rgba(214, 138, 60, 0.35)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <IconAlert size={20} stroke={BD.ochre}/>
            <SerifH size={22}>Unfinished recording found</SerifH>
          </div>
          <div style={{ fontSize: 13, color: BD.inkSoft, fontFamily: BD_FONT_BODY,
            lineHeight: 1.5, marginBottom: 14 }}>
            BharatDoc saved <span style={{ fontWeight: 700, color: BD.ink }}>4:37 of audio</span>
            {' '}before the app closed unexpectedly. Would you like to continue?
          </div>
          <div style={{
            padding: '10px 12px', background: BD.paper, borderRadius: 8,
            border: `1px solid ${BD.rule}`, marginBottom: 4,
            display: 'flex', justifyContent: 'space-between', fontSize: 11.5,
            fontFamily: BD_FONT_BODY, color: BD.inkMuted,
          }}>
            <span>Started</span>
            <span style={{ color: BD.ink, fontWeight: 600 }}>Today, 09:12 AM</span>
          </div>
          <div style={{
            padding: '10px 12px', background: BD.paper, borderRadius: 8,
            border: `1px solid ${BD.rule}`, marginTop: 6,
            display: 'flex', justifyContent: 'space-between', fontSize: 11.5,
            fontFamily: BD_FONT_BODY, color: BD.inkMuted,
          }}>
            <span>Patient</span>
            <span style={{ color: BD.ink, fontWeight: 600, fontFamily: BD_FONT_MONO }}>Not tagged</span>
          </div>
        </div>
      </div>
      <Btn full variant="primary">Resume recording</Btn>
      <Btn variant="danger" size="sm" style={{ marginTop: 10, alignSelf: 'center' }}>Discard recording</Btn>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 16 · PATIENT SEARCH
// ═══════════════════════════════════════════════════════
function PatientSearchScreen() {
  const results = [
    { date: '23 Apr 2026', time: '09:30', doc: 'Dr. Aparna Iyer', label: 'Follow-up', state: 'pdf' },
    { date: '08 Apr 2026', time: '16:15', doc: 'Dr. Kavita Rao',  label: 'First visit', state: 'pdf' },
    { date: '18 Feb 2026', time: '10:42', doc: 'Dr. Aparna Iyer', label: 'Annual review', state: 'pdf' },
  ];
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 22px 12px' }}>
        <SerifH size={28}>Patient records</SerifH>
        <div style={{ fontSize: 12, fontFamily: BD_FONT_BODY, color: BD.inkMuted, marginTop: 4 }}>
          Search across all doctors at Sunrise Clinic
        </div>
      </div>
      <div style={{ padding: '0 22px 14px' }}>
        <div style={{
          background: BD.paper, border: `1.5px solid ${BD.terracotta}`, borderRadius: 14,
          padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <IconSearch size={18} stroke={BD.terracotta}/>
          <span style={{ fontSize: 15, fontFamily: BD_FONT_MONO, color: BD.ink, flex: 1,
            fontWeight: 600, letterSpacing: 0.5 }}>P-10478</span>
          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer',
            color: BD.inkMuted, display: 'flex', padding: 0 }}>
            <IconX size={16} stroke={BD.inkMuted}/>
          </button>
        </div>
      </div>

      {/* Results header */}
      <div style={{
        padding: '10px 22px', background: BD.paperDeep, borderTop: `1px solid ${BD.rule}`,
        borderBottom: `1px solid ${BD.rule}`,
        fontSize: 11, fontFamily: BD_FONT_BODY, color: BD.inkSoft,
      }}>
        Showing <span style={{ fontWeight: 700, color: BD.ink, fontFamily: BD_FONT_MONO }}>3 records</span>
        {' '}for patient{' '}
        <span style={{ fontWeight: 700, color: BD.terracotta, fontFamily: BD_FONT_MONO }}>P-10478</span>
        {' '}across Sunrise Clinic
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 100px' }}>
        {results.map((r, i) => (
          <div key={i} style={{
            background: BD.paper, borderRadius: 14, border: `1px solid ${BD.rule}`,
            padding: '14px 16px', marginBottom: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginBottom: 6 }}>
              <div>
                <span style={{ fontFamily: BD_FONT_BODY, fontSize: 14, fontWeight: 700, color: BD.ink }}>
                  {r.date}
                </span>
                <span style={{ fontFamily: BD_FONT_MONO, fontSize: 12, color: BD.inkMuted,
                  marginLeft: 6 }}>{r.time}</span>
              </div>
              <StatusTick state={r.state}/>
            </div>
            <div style={{ fontSize: 12, fontFamily: BD_FONT_BODY, color: BD.inkMuted, marginBottom: 8,
              display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{r.doc}</span>
              <span style={{ width: 2, height: 2, borderRadius: 1, background: BD.inkFaint }}/>
              <span style={{ fontStyle: 'italic' }}>{r.label}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ padding: '6px 10px', borderRadius: 8,
                background: BD.paperDeep, border: `1px solid ${BD.rule}`, color: BD.inkSoft,
                fontFamily: BD_FONT_BODY, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                View PDF
              </button>
              <button style={{ padding: '6px 10px', borderRadius: 8,
                background: BD.paperDeep, border: `1px solid ${BD.rule}`, color: BD.inkSoft,
                fontFamily: BD_FONT_BODY, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <IconShare size={11} stroke={BD.inkSoft}/> Share
              </button>
            </div>
          </div>
        ))}
      </div>
      <BottomNav active="search"/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 17 · SETTINGS MAIN
// ═══════════════════════════════════════════════════════
function SettingsScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="Settings"/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 100px' }}>
        {/* Profile card */}
        <div style={{ background: BD.paper, border: `1px solid ${BD.rule}`, borderRadius: 14,
          padding: '16px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 26, background: BD.terracotta,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: BD_FONT_DISP, fontSize: 26, flexShrink: 0 }}>A</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.ink }}>
              Dr. Aparna Iyer
            </div>
            <div style={{ fontSize: 12, color: BD.inkMuted, marginTop: 2 }}>General Physician</div>
            <div style={{ fontSize: 11, color: BD.inkFaint, marginTop: 2, fontFamily: BD_FONT_MONO }}>
              +91 98765 43210
            </div>
          </div>
          <IconEdit size={18} stroke={BD.inkSoft}/>
        </div>

        {/* Clinic admin (owner only) */}
        <SettingsGroup title="Clinic admin">
          <SettingsRow title="Pending approvals" subtitle="1 doctor waiting"
            badge="1" accent/>
          <SettingsRow title="Active doctors" subtitle="3 members"/>
          <SettingsRow title="Clinic profile"
            subtitle={<span>Code: <span style={{ fontFamily: BD_FONT_MONO, color: BD.terracotta,
              fontWeight: 700 }}>MED42X</span></span>}/>
        </SettingsGroup>

        <SettingsGroup title="Transcription">
          <SettingsRow title="Language" subtitle="Auto-detect · Hindi + English"/>
          <SettingsRow title="Summary prompt" subtitle="Custom prompt active"
            right={<span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1,
              textTransform: 'uppercase', color: BD.ochre,
              background: 'rgba(214, 138, 60, 0.14)', padding: '3px 6px', borderRadius: 4 }}>
              Edited
            </span>}/>
        </SettingsGroup>

        <SettingsGroup title="About">
          <SettingsRow title="Help &amp; support"/>
          <SettingsRow title="Terms and privacy"/>
          <SettingsRow title="Version" subtitle="v0.9.1 · MVP"/>
        </SettingsGroup>

        <SettingsGroup title="Account">
          <SettingsRow title="Sign out" danger/>
          <SettingsRow title="Delete account" subtitle="Permanently erase records" danger/>
        </SettingsGroup>
      </div>
      <BottomNav active="settings"/>
    </div>
  );
}
function SettingsGroup({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.terracotta,
        letterSpacing: 1.8, textTransform: 'uppercase', margin: '4px 6px 8px' }}>
        {title}
      </div>
      <div style={{ background: BD.paper, border: `1px solid ${BD.rule}`, borderRadius: 14,
        overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}
function SettingsRow({ title, subtitle, badge, right, danger, accent }) {
  return (
    <div style={{
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
      borderBottom: `1px solid ${BD.rule}`,
      background: accent ? 'rgba(194, 74, 42, 0.04)' : 'transparent',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontFamily: BD_FONT_BODY, fontWeight: 600,
          color: danger ? BD.stamp : BD.ink }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: BD.inkMuted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {badge && (
        <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10,
          background: BD.terracotta, color: '#fff',
          fontSize: 11, fontWeight: 700, fontFamily: BD_FONT_BODY,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{badge}</span>
      )}
      {right}
      {!danger && <IconChevron size={16} stroke={BD.inkFaint}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 18 · PROMPT EDITOR
// ═══════════════════════════════════════════════════════
function PromptEditorScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="Summary prompt" subtitle="Customize how AI writes summaries"
        right={<Btn variant="ghost" size="sm">Reset</Btn>}/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{
          padding: '10px 12px', borderRadius: 10,
          background: 'rgba(214, 138, 60, 0.1)',
          border: `1px solid rgba(214, 138, 60, 0.25)`,
          fontSize: 11.5, color: BD.inkSoft, fontFamily: BD_FONT_BODY, lineHeight: 1.5,
          marginBottom: 16,
        }}>
          Must contain{' '}
          <span style={{ fontFamily: BD_FONT_MONO, background: BD.paperDeep, padding: '1px 6px',
            borderRadius: 4, color: BD.ink, fontWeight: 600 }}>
            {`{{transcript}}`}
          </span>
          {' '}where the conversation should be inserted.
        </div>

        {/* Editor */}
        <div style={{
          background: BD.paper, border: `1.5px solid ${BD.terracotta}`, borderRadius: 12,
          padding: 14, fontFamily: BD_FONT_MONO, fontSize: 12.5, color: BD.inkSoft,
          lineHeight: 1.6, whiteSpace: 'pre-wrap',
          minHeight: 240,
        }}>
          You are a clinical documentation assistant. Based on the following doctor-patient conversation, generate a <span style={{ color: BD.terracotta, fontWeight: 700 }}>structured clinical summary</span> with these sections:
          {'\n\n'}- Chief Complaint
          {'\n'}- History of Present Illness
          {'\n'}- Key Findings / Symptoms Mentioned
          {'\n'}- Provisional Diagnosis (if mentioned)
          {'\n'}- Treatment / Prescription (if mentioned)
          {'\n'}- Follow-up Instructions (if mentioned)
          {'\n\n'}Be concise, clinical, and factual. Do not infer anything not explicitly mentioned.
          {'\n\n'}Transcript:
          {'\n'}<span style={{ background: 'rgba(214, 138, 60, 0.2)', color: BD.ochre,
            padding: '0 4px', borderRadius: 3, fontWeight: 700 }}>{`{{transcript}}`}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 11, fontFamily: BD_FONT_MONO, color: BD.sage, fontWeight: 600 }}>
            ✓ Valid
          </span>
          <span style={{ fontSize: 11, fontFamily: BD_FONT_MONO, color: BD.inkMuted }}>
            412 / 2000 chars
          </span>
        </div>
      </div>
      <div style={{ padding: '14px 22px 16px', background: BD.paper,
        borderTop: `1px solid ${BD.rule}`, display: 'flex', gap: 10, flexShrink: 0 }}>
        <Btn variant="ghost" style={{ flex: 1 }} icon={<IconSparkle size={14} stroke={BD.inkSoft}/>}>
          Test with sample
        </Btn>
        <Btn variant="primary" style={{ flex: 1 }}>Save prompt</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 19 · TRANSCRIPTION LANG
// ═══════════════════════════════════════════════════════
function TranscriptionLangScreen() {
  const langs = [
    { id: 'auto', name: 'Auto-detect', desc: 'Best for Hinglish conversations', active: true },
    { id: 'hi', name: 'Hindi', desc: 'हिन्दी', active: false },
    { id: 'en', name: 'English', desc: 'Default for English-only practices', active: false },
    { id: 'hien', name: 'Hinglish', desc: 'Mixed Hindi + English', active: false },
  ];
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="Transcription language" subtitle="Used to improve Whisper accuracy"/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
        {langs.map(l => (
          <div key={l.id} style={{
            background: BD.paper,
            border: `1.5px solid ${l.active ? BD.terracotta : BD.rule}`, borderRadius: 14,
            padding: '14px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: 11,
              border: `2px solid ${l.active ? BD.terracotta : BD.rule}`,
              background: l.active ? BD.terracotta : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {l.active && <div style={{ width: 8, height: 8, borderRadius: 4, background: '#fff' }}/>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.ink }}>
                {l.name}
              </div>
              <div style={{ fontSize: 12, color: BD.inkMuted, marginTop: 2 }}>{l.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 20 · OWNER ADMIN — Pending approvals
// ═══════════════════════════════════════════════════════
function AdminPendingScreen() {
  const pending = [
    { n: 'Dr. Meera Shah', spec: 'Pediatrician', phone: '+91 98340 12340', when: '2 hrs ago', init: 'M' },
    { n: 'Dr. Nikhil Deshmukh', spec: 'ENT Specialist', phone: '+91 98220 45612', when: '1 day ago', init: 'N' },
  ];
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="Clinic admin" subtitle="Sunrise Clinic · Owner view"/>
      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 14px', gap: 4, borderBottom: `1px solid ${BD.rule}`,
        background: BD.paper, flexShrink: 0 }}>
        {[
          { id: 'pending', label: 'Pending', count: 2, active: true },
          { id: 'active', label: 'Active', count: 3 },
          { id: 'profile', label: 'Profile' },
          { id: 'rejected', label: 'Rejected' },
        ].map(t => (
          <div key={t.id} style={{
            padding: '12px 10px', fontFamily: BD_FONT_BODY, fontSize: 13,
            fontWeight: t.active ? 700 : 500, color: t.active ? BD.terracotta : BD.inkMuted,
            borderBottom: t.active ? `2px solid ${BD.terracotta}` : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          }}>
            {t.label}
            {t.count && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                background: t.active ? BD.terracotta : BD.paperDeep,
                color: t.active ? '#fff' : BD.inkMuted, fontFamily: BD_FONT_BODY }}>
                {t.count}
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
        <div style={{
          padding: '10px 12px', borderRadius: 10, marginBottom: 12,
          background: 'rgba(214, 138, 60, 0.1)',
          border: `1px solid rgba(214, 138, 60, 0.25)`,
          fontSize: 11.5, color: BD.inkSoft, fontFamily: BD_FONT_BODY,
        }}>
          <span style={{ fontWeight: 700, color: BD.ink }}>2 doctors</span> are waiting for your approval.
        </div>
        {pending.map((p, i) => (
          <div key={i} style={{ background: BD.paper, border: `1px solid ${BD.rule}`, borderRadius: 14,
            padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: BD.paperDeep,
                border: `1px solid ${BD.rule}`, color: BD.inkSoft,
                fontFamily: BD_FONT_DISP, fontSize: 22, fontStyle: 'italic',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {p.init}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.ink }}>
                  {p.n}
                </div>
                <div style={{ fontSize: 12, color: BD.inkMuted, marginTop: 2 }}>{p.spec}</div>
                <div style={{ fontSize: 11, fontFamily: BD_FONT_MONO, color: BD.inkFaint, marginTop: 2 }}>
                  {p.phone} · requested {p.when}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="danger" size="sm" style={{ flex: 1 }}>Reject</Btn>
              <Btn variant="success" size="sm" style={{ flex: 1.6 }}
                icon={<IconCheck size={13} stroke="#fff"/>}>Approve</Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 21 · OWNER ADMIN — Active doctors
// ═══════════════════════════════════════════════════════
function AdminActiveScreen() {
  const docs = [
    { n: 'Dr. Kavita Rao', spec: 'Pediatrician', badge: 'Owner', init: 'K', records: 284, since: 'Jan 2024', you: true },
    { n: 'Dr. Aparna Iyer', spec: 'General Physician', init: 'A', records: 156, since: 'Mar 2024' },
    { n: 'Dr. Sameer Patil', spec: 'Dermatologist', init: 'S', records: 92, since: 'Sep 2025' },
  ];
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="Clinic admin" subtitle="Sunrise Clinic · Owner view"/>
      <div style={{ display: 'flex', padding: '0 14px', gap: 4, borderBottom: `1px solid ${BD.rule}`,
        background: BD.paper, flexShrink: 0 }}>
        {[
          { id: 'pending', label: 'Pending', count: 2 },
          { id: 'active', label: 'Active', count: 3, active: true },
          { id: 'profile', label: 'Profile' },
          { id: 'rejected', label: 'Rejected' },
        ].map(t => (
          <div key={t.id} style={{
            padding: '12px 10px', fontFamily: BD_FONT_BODY, fontSize: 13,
            fontWeight: t.active ? 700 : 500, color: t.active ? BD.terracotta : BD.inkMuted,
            borderBottom: t.active ? `2px solid ${BD.terracotta}` : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          }}>
            {t.label}
            {t.count && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px',
              borderRadius: 8, background: t.active ? BD.terracotta : BD.paperDeep,
              color: t.active ? '#fff' : BD.inkMuted, fontFamily: BD_FONT_BODY }}>{t.count}</span>}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
        {docs.map((d, i) => (
          <div key={i} style={{
            background: BD.paper, border: `1px solid ${BD.rule}`, borderRadius: 14,
            padding: '14px 16px', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 22,
              background: d.badge === 'Owner' ? BD.terracotta : BD.paperDeep,
              color: d.badge === 'Owner' ? '#fff' : BD.inkSoft,
              border: d.badge === 'Owner' ? 'none' : `1px solid ${BD.rule}`,
              fontFamily: BD_FONT_DISP, fontSize: 22, fontStyle: 'italic',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {d.init}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.ink }}>
                  {d.n}
                </span>
                {d.badge && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    background: BD.terracotta, color: '#fff', letterSpacing: 0.5,
                    textTransform: 'uppercase', fontFamily: BD_FONT_BODY }}>{d.badge}</span>
                )}
                {d.you && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    background: BD.paperDeep, color: BD.inkMuted, letterSpacing: 0.5,
                    textTransform: 'uppercase', fontFamily: BD_FONT_BODY }}>You</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: BD.inkMuted, marginTop: 2 }}>{d.spec}</div>
              <div style={{ fontSize: 11, color: BD.inkFaint, marginTop: 2,
                display: 'flex', gap: 8 }}>
                <span><span style={{ fontFamily: BD_FONT_MONO, color: BD.inkSoft,
                  fontWeight: 600 }}>{d.records}</span> records</span>
                <span style={{ width: 2, height: 2, borderRadius: 1, background: BD.inkFaint,
                  alignSelf: 'center' }}/>
                <span>Since {d.since}</span>
              </div>
            </div>
            {!d.you && (
              <button style={{ width: 32, height: 32, borderRadius: 16, background: 'transparent',
                border: `1px solid ${BD.rule}`, color: BD.inkMuted, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconMoreH size={16} stroke={BD.inkMuted}/>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 22 · OWNER ADMIN — Clinic profile (with code)
// ═══════════════════════════════════════════════════════
function AdminProfileScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="Clinic admin" subtitle="Sunrise Clinic · Owner view"/>
      <div style={{ display: 'flex', padding: '0 14px', gap: 4, borderBottom: `1px solid ${BD.rule}`,
        background: BD.paper, flexShrink: 0 }}>
        {[
          { id: 'pending', label: 'Pending', count: 2 },
          { id: 'active', label: 'Active', count: 3 },
          { id: 'profile', label: 'Profile', active: true },
          { id: 'rejected', label: 'Rejected' },
        ].map(t => (
          <div key={t.id} style={{
            padding: '12px 10px', fontFamily: BD_FONT_BODY, fontSize: 13,
            fontWeight: t.active ? 700 : 500, color: t.active ? BD.terracotta : BD.inkMuted,
            borderBottom: t.active ? `2px solid ${BD.terracotta}` : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          }}>
            {t.label}
            {t.count && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px',
              borderRadius: 8, background: t.active ? BD.terracotta : BD.paperDeep,
              color: t.active ? '#fff' : BD.inkMuted, fontFamily: BD_FONT_BODY }}>{t.count}</span>}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
        {/* Clinic code — hero card */}
        <div style={{
          background: BD.paper, borderRadius: 16, overflow: 'hidden',
          border: `1.5px solid ${BD.terracotta}`,
          boxShadow: '0 4px 16px rgba(194, 74, 42, 0.12)', marginBottom: 18,
        }}>
          <div style={{
            background: `linear-gradient(135deg, ${BD.terracotta}, ${BD.saffron})`,
            padding: '18px 20px', color: '#fff', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120,
              borderRadius: 60, background: 'rgba(255,255,255,0.08)' }}/>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
              opacity: 0.9, marginBottom: 10, fontFamily: BD_FONT_BODY, position: 'relative' }}>
              Your clinic code
            </div>
            <div style={{ fontFamily: BD_FONT_MONO, fontSize: 44, fontWeight: 700,
              letterSpacing: 6, lineHeight: 1, position: 'relative' }}>
              MED42X
            </div>
            <div style={{ fontSize: 11.5, opacity: 0.9, marginTop: 10, lineHeight: 1.5,
              fontFamily: BD_FONT_BODY, position: 'relative' }}>
              Share this code with doctors you want to add to Sunrise Clinic.
            </div>
          </div>
          <div style={{ display: 'flex', padding: '12px', gap: 8 }}>
            <Btn variant="ghost" size="sm" style={{ flex: 1 }}
              icon={<IconCopy size={13} stroke={BD.inkSoft}/>}>Copy</Btn>
            <Btn variant="primary" size="sm" style={{ flex: 1.4 }}
              icon={<IconShare size={13} stroke="#fff"/>}>Share via WhatsApp</Btn>
          </div>
        </div>

        <div style={{ fontSize: 11, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.terracotta,
          letterSpacing: 1.8, textTransform: 'uppercase', margin: '4px 6px 8px' }}>
          Clinic details
        </div>
        <div style={{ background: BD.paper, border: `1px solid ${BD.rule}`, borderRadius: 14,
          overflow: 'hidden' }}>
          <InfoRow label="Clinic name" value="Sunrise Clinic"/>
          <InfoRow label="Address" value="24 Baner Road, Pune 411045"/>
          <InfoRow label="Logo"
            value={<span style={{ fontFamily: BD_FONT_BODY, color: BD.sage, display: 'inline-flex',
              alignItems: 'center', gap: 4 }}>
              <IconCheck size={12} stroke={BD.sage}/> Uploaded
            </span>}/>
          <InfoRow label="Created" value="12 Jan 2024"/>
        </div>
      </div>
    </div>
  );
}
function InfoRow({ label, value }) {
  return (
    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', borderBottom: `1px solid ${BD.rule}`, gap: 12 }}>
      <div style={{ fontSize: 12, fontFamily: BD_FONT_BODY, fontWeight: 600, color: BD.inkMuted,
        letterSpacing: 0.2 }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: BD_FONT_BODY, color: BD.ink, fontWeight: 500,
        textAlign: 'right', maxWidth: '60%' }}>{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 23 · REJECT CONFIRM (owner)
// ═══════════════════════════════════════════════════════
function RejectConfirmScreen() {
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column',
      position: 'relative' }}>
      {/* backdrop dim */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(28, 23, 18, 0.45)',
        backdropFilter: 'blur(2px)' }}/>
      {/* Bottom sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: BD.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '14px 22px 28px', boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ width: 44, height: 4, borderRadius: 2, background: BD.rule,
          margin: '4px auto 18px' }}/>
        <SerifH size={26}>Reject Dr. Meera Shah?</SerifH>
        <div style={{ fontSize: 13, color: BD.inkSoft, fontFamily: BD_FONT_BODY,
          lineHeight: 1.5, marginTop: 10, marginBottom: 18 }}>
          They won't be able to access BharatDoc under this clinic. You can re-approve later from the Rejected tab.
        </div>
        <div style={{ fontSize: 11, fontFamily: BD_FONT_BODY, fontWeight: 700, color: BD.inkMuted,
          letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
          Reason · optional
        </div>
        <div style={{
          background: BD.paper, border: `1.5px solid ${BD.rule}`, borderRadius: 10,
          padding: '12px 14px', fontSize: 13, color: BD.inkSoft, fontFamily: BD_FONT_BODY,
          minHeight: 68, lineHeight: 1.5,
        }}>
          Please use the clinic code shared in our WhatsApp group…
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <Btn variant="ghost" style={{ flex: 1 }}>Cancel</Btn>
          <Btn variant="danger" style={{ flex: 1.3,
            background: BD.stamp, color: '#fff', border: 'none',
            boxShadow: '0 4px 12px rgba(139, 46, 32, 0.3)' }}>Reject doctor</Btn>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 24 · DASHBOARD OFFLINE BANNER
// ═══════════════════════════════════════════════════════
function DashboardOfflineScreen() {
  const records = [
    { pid: 'P-10482', time: 'Today, 11:42', dur: '8:14', state: 'recorded', offline: true },
    { pid: 'P-10483', time: 'Today, 12:15', dur: '4:22', state: 'recorded', offline: true },
    { pid: 'P-10481', time: 'Today, 10:55', dur: '12:03', state: 'transcribed' },
  ];
  return (
    <div style={{ ...paperBg, height: '100%', display: 'flex', flexDirection: 'column',
      position: 'relative' }}>
      {/* Offline banner */}
      <div style={{
        background: BD.ink, color: BD.paper, padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <IconWifiOff size={16} stroke={BD.saffron}/>
        <div style={{ flex: 1, fontSize: 12, fontFamily: BD_FONT_BODY, lineHeight: 1.4 }}>
          <div style={{ fontWeight: 700, color: BD.saffron }}>You're offline</div>
          <div style={{ opacity: 0.7, marginTop: 1 }}>
            2 recordings saved locally · transcribe when connected
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 22px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: BD.terracotta,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: BD_FONT_DISP, fontSize: 22, flexShrink: 0 }}>A</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontFamily: BD_FONT_BODY, fontWeight: 600, color: BD.ink }}>
            Dr. Aparna Iyer
          </div>
          <div style={{ fontSize: 12, color: BD.inkMuted, marginTop: 2 }}>Sunrise Clinic, Pune</div>
        </div>
      </div>

      <div style={{ padding: '4px 22px 10px' }}>
        <SerifH size={28}>Today's consultations</SerifH>
        <div style={{ fontSize: 12, fontFamily: BD_FONT_BODY, color: BD.inkMuted, marginTop: 6 }}>
          3 records · 2 pending upload
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 100px' }}>
        {records.map((r) => (
          <div key={r.pid} style={{
            background: BD.paper, borderRadius: 14,
            border: `1px solid ${r.offline ? 'rgba(194, 74, 42, 0.3)' : BD.rule}`,
            padding: '14px 16px', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ minWidth: 68, padding: '6px 8px', borderRadius: 6,
              background: BD.paperDeep, border: `1px dashed ${BD.ochre}`,
              textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 9, fontFamily: BD_FONT_BODY, fontWeight: 600,
                color: BD.ochre, letterSpacing: 1, textTransform: 'uppercase' }}>Patient</div>
              <div style={{ fontFamily: BD_FONT_MONO, fontSize: 13, fontWeight: 600, color: BD.ink }}>
                {r.pid}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontFamily: BD_FONT_BODY, fontWeight: 600, color: BD.ink }}>
                  {r.time}
                </span>
                {r.offline && <IconWifiOff size={12} stroke={BD.terracotta}/>}
              </div>
              <div style={{ fontSize: 11.5, fontFamily: BD_FONT_BODY, color: BD.inkMuted,
                marginTop: 2 }}>{r.dur}</div>
              <div style={{ marginTop: 8 }}><StatusTick state={r.state}/></div>
            </div>
          </div>
        ))}
      </div>
      <BottomNav active="home"/>
    </div>
  );
}

// Export everything
Object.assign(window, {
  PhoneEntryScreen, OtpVerifyScreen, ProfileSetupScreen, ClinicChoiceScreen,
  CreateClinicScreen, PendingApprovalScreen, RejectedScreen, MicPermissionScreen,
  PreRecordScreen, RecordingPausedScreen, PostRecordScreen, TranscribingScreen,
  TranscriptScreen, TranscriptionErrorScreen, CrashRecoveryScreen, PatientSearchScreen,
  SettingsScreen, PromptEditorScreen, TranscriptionLangScreen,
  AdminPendingScreen, AdminActiveScreen, AdminProfileScreen, RejectConfirmScreen,
  DashboardOfflineScreen,
});

// src/BottomNav.jsx — 하단 탭바 (홈 / 그룹 / 마이페이지)
const ACCENT = '#ff7a45'

function Icon({ name, active }) {
  const c = active ? ACCENT : 'var(--mp-muted)'
  const sw = active ? 2.2 : 1.8
  if (name === 'home') return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 3.5c-3.6 0-6.5 2.9-6.5 6.5 0 4.6 6.5 10.5 6.5 10.5s6.5-5.9 6.5-10.5c0-3.6-2.9-6.5-6.5-6.5Z" stroke={c} strokeWidth={sw} strokeLinejoin="round"/>
      <circle cx="12" cy="10" r="2.4" stroke={c} strokeWidth={sw}/>
    </svg>
  )
  if (name === 'group') return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8.5" r="3" stroke={c} strokeWidth={sw}/>
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 14.2c2.2.5 3.9 2.3 3.9 4.8" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
    </svg>
  )
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.4" stroke={c} strokeWidth={sw}/>
      <path d="M5 20c0-3.4 3.1-5.6 7-5.6s7 2.2 7 5.6" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
    </svg>
  )
}

export default function BottomNav({ active, onChange }) {
  const tabs = [
    { key: 'home', label: '홈' },
    { key: 'group', label: '그룹' },
    { key: 'mypage', label: '마이페이지' },
  ]
  return (
    <div style={S.wrap}>
      {tabs.map(t => {
        const on = active === t.key
        return (
          <button key={t.key} style={S.tab} onClick={() => onChange(t.key)}>
            <span style={{ ...S.bar, background: on ? ACCENT : 'transparent' }} />
            <Icon name={t.key} active={on} />
            <span style={{ ...S.label, color: on ? ACCENT : 'var(--mp-muted)', fontWeight: on ? 700 : 500 }}>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}

const S = {
  wrap: {
    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 2000,
    display: 'flex', justifyContent: 'space-around',
    background: 'var(--mp-topbar)', backdropFilter: 'blur(14px)',
    borderTop: '1px solid var(--mp-line)',
    padding: '0 0 max(env(safe-area-inset-bottom,0px), 6px)',
    maxWidth: 480, margin: '0 auto',
  },
  tab: { position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, border: 'none', background: 'none', fontFamily: 'inherit', cursor: 'pointer', padding: '10px 0 6px' },
  bar: { position: 'absolute', top: 0, width: 26, height: 3, borderRadius: '0 0 3px 3px', transition: 'background .2s' },
  label: { fontSize: 11, letterSpacing: '-.2px' },
}

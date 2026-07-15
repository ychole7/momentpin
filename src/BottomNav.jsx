// src/BottomNav.jsx — 하단 탭바 (홈 / 그룹 / 마이페이지)
export default function BottomNav({ active, onChange }) {
  const tabs = [
    { key: 'home', label: '홈', icon: '📍' },
    { key: 'group', label: '그룹', icon: '👥' },
    { key: 'mypage', label: '마이페이지', icon: '👤' },
  ]
  return (
    <div style={S.wrap}>
      {tabs.map(t => (
        <button key={t.key} style={S.tab} onClick={() => onChange(t.key)}>
          <span style={{ ...S.icon, opacity: active === t.key ? 1 : .45 }}>{t.icon}</span>
          <span style={{ ...S.label, color: active === t.key ? 'var(--mp-coral2, #ff7a45)' : 'var(--mp-muted)', fontWeight: active === t.key ? 700 : 500 }}>{t.label}</span>
        </button>
      ))}
    </div>
  )
}

const S = {
  wrap: {
    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 2000,
    display: 'flex', justifyContent: 'space-around',
    background: 'var(--mp-topbar)', backdropFilter: 'blur(12px)',
    borderTop: '1px solid var(--mp-line)',
    padding: '8px 0 max(env(safe-area-inset-bottom,0px), 8px)',
    maxWidth: 480, margin: '0 auto',
  },
  tab: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, border: 'none', background: 'none', fontFamily: 'inherit', cursor: 'pointer', padding: '4px 0' },
  icon: { fontSize: 20, lineHeight: 1 },
  label: { fontSize: 11 },
}

// src/App.jsx
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import GroupGate from './GroupGate'
import Home from './Home'
import MyPage from './MyPage'
import Stats from './Stats'
import Onboarding from './Onboarding'
import Privacy from './Privacy'
import Terms from './Terms'

export default function App() {
  const [session, setSession] = useState(null)
  const [group, setGroup] = useState(null)
  const [booting, setBooting] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [statsMembers, setStatsMembers] = useState([])
  const [myGroups, setMyGroups] = useState([])
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [profileVersion, setProfileVersion] = useState(0)  // 프로필 변경 시 증가 → Home 멤버 리로드
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  async function loadMyGroups() {
    if (!session) return
    let res = await supabase.from('members').select('group_id, groups(id,name,invite_code,created_by)').eq('user_id', session.user.id)
    if (!res.error && res.data) {
      const gs = res.data.map(r => r.groups).filter(Boolean)
      setMyGroups(gs)
    }
  }

  useEffect(() => { if (session && group) loadMyGroups() }, [session, group])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setBooting(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) { setGroup(null); setShowSettings(false) }
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (group) localStorage.setItem('mp_group', group.id)
  }, [group])

  useEffect(() => {
    if (session) {
      try { if (!localStorage.getItem('mp_onboarded')) setShowOnboarding(true) } catch {}
    } else {
      setShowOnboarding(false)
    }
  }, [session])

  function finishOnboarding() {
    try { localStorage.setItem('mp_onboarded', '1') } catch {}
    setShowOnboarding(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    localStorage.removeItem('mp_group')
    setGroup(null)
    setShowSettings(false)
  }

  if (booting) return <div style={center}>모먼핀 여는 중…</div>
  if (!session) return <Auth />
  if (showOnboarding) return <Onboarding onDone={finishOnboarding} />
  if (!group) return <GroupGate user={session.user} onReady={setGroup} />

  if (showPrivacy) return <Privacy onClose={() => { setShowPrivacy(false); setShowSettings(true) }} />
  if (showTerms) return <Terms onClose={() => { setShowTerms(false); setShowSettings(true) }} />

  if (showStats) return (
    <Stats
      user={session.user}
      group={group}
      members={statsMembers}
      onClose={() => { setShowStats(false); setShowSettings(true) }}
    />
  )

    if (showSettings) return (
    <MyPage
      user={session.user}
      group={group}
      members={statsMembers}
      onClose={() => setShowSettings(false)}
      onOpenStats={(m) => { setStatsMembers(m || []); setShowStats(true); setShowSettings(false) }}
      onGroupUpdate={(g) => setGroup(g)}
      onProfileUpdate={() => setProfileVersion(v => v + 1)}
      onLeaveGroup={() => { setShowSettings(false); setGroup(null) }}
      onSignOut={signOut}
      onOpenPrivacy={() => { setShowPrivacy(true); setShowSettings(false) }}
      onOpenTerms={() => { setShowTerms(true); setShowSettings(false) }}
    />
  )

  return (
    <>
      <Home
        user={session.user}
        group={group}
        profileVersion={profileVersion}
        onOpenSettings={() => setShowSettings(true)}
        onMembersLoaded={(m) => setStatsMembers(m || [])}
        onOpenSwitcher={() => { loadMyGroups(); setShowSwitcher(true) }}
      />
      {showSwitcher && (
        <div style={sheet.overlay} onClick={() => setShowSwitcher(false)}>
          <div style={sheet.card} onClick={e => e.stopPropagation()}>
            <div style={sheet.handle} />
            <div style={sheet.title}>그룹 전환</div>
            {myGroups.map(g => (
              <button key={g.id} style={{ ...sheet.row, ...(g.id === group.id ? sheet.rowActive : {}) }}
                onClick={() => { if (g.id !== group.id) { setGroup(g); localStorage.setItem('mp_group', g.id) } setShowSwitcher(false) }}>
                <span style={{ fontWeight: 700 }}>{g.name}</span>
                {g.id === group.id && <span style={sheet.current}>현재</span>}
                {g.created_by === session.user.id && <span style={sheet.owner}>👑</span>}
              </button>
            ))}
            <button style={sheet.addBtn} onClick={() => { setShowSwitcher(false); setGroup(null) }}>＋ 새 그룹 만들기 / 참여하기</button>
          </div>
        </div>
      )}
    </>
  )
}

const sheet = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 5000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 480, background: 'var(--mp-card)', borderRadius: '22px 22px 0 0', padding: '10px 18px 28px', maxHeight: '70vh', overflowY: 'auto' },
  handle: { width: 40, height: 4, borderRadius: 2, background: '#e0e0e6', margin: '6px auto 14px' },
  title: { fontWeight: 700, fontSize: 16, marginBottom: 12, padding: '0 2px' },
  row: { width: '100%', display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid var(--mp-line)', background: 'var(--mp-card)', borderRadius: 14, padding: '15px 16px', marginBottom: 8, fontFamily: 'inherit', fontSize: 15, cursor: 'pointer', textAlign: 'left' },
  rowActive: { borderColor: '#ff7a45', background: '#fff8f5' },
  current: { fontSize: 11, fontWeight: 700, color: '#ff4d5e', background: '#fff1ed', padding: '2px 8px', borderRadius: 8 },
  owner: { marginLeft: 'auto', fontSize: 13 },
  addBtn: { width: '100%', border: '1.5px dashed var(--mp-line2)', background: 'var(--mp-card)', color: 'var(--mp-sub)', borderRadius: 14, padding: 15, marginTop: 4, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
}

const center = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--mp-muted)', fontFamily: "'Outfit','Gowun Dodum',sans-serif", background: 'var(--mp-bg)',
}

// src/App.jsx
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import GroupGate from './GroupGate'
import Home from './Home'
import Settings from './Settings'
import Stats from './Stats'

export default function App() {
  const [session, setSession] = useState(null)
  const [group, setGroup] = useState(null)
  const [booting, setBooting] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [statsMembers, setStatsMembers] = useState([])

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

  async function signOut() {
    await supabase.auth.signOut()
    localStorage.removeItem('mp_group')
    setGroup(null)
    setShowSettings(false)
  }

  if (booting) return <div style={center}>모먼핀 여는 중…</div>
  if (!session) return <Auth />
  if (!group) return <GroupGate user={session.user} onReady={setGroup} />

  if (showStats) return (
    <Stats
      user={session.user}
      group={group}
      members={statsMembers}
      onClose={() => setShowStats(false)}
    />
  )

    if (showSettings) return (
    <Settings
      user={session.user}
      group={group}
      onClose={() => setShowSettings(false)}
      onGroupUpdate={(g) => setGroup(g)}
      onLeaveGroup={() => { setShowSettings(false); setGroup(null) }}
    />
  )

  return (
    <Home
      user={session.user}
      group={group}
      onOpenSettings={() => setShowSettings(true)}
      onOpenStats={(m) => { setStatsMembers(m || []); setShowStats(true) }}
      onLeaveGroup={() => setGroup(null)}
      onSignOut={signOut}
    />
  )
}

const center = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#9b9ba3', fontFamily: "'Outfit','Gowun Dodum',sans-serif", background: '#fafafa',
}

// src/Stats_moments.jsx — 우리의 순간들
import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'

function kstKey(ts){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts))}
function kstDate(ts){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',weekday:'short'}).format(new Date(ts))}
function kstTime(ts){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(ts))}
function fmtStart(ts){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric'}).format(new Date(ts)).replaceAll('-','.')}

export default function StatsMoments({user,group,members,onClose}){
  const [loading,setLoading]=useState(true), [rows,setRows]=useState([]), [stats,setStats]=useState(null), [selected,setSelected]=useState(null)
  useEffect(()=>{load()},[group.id])

  async function load(){
    setLoading(true)
    const [mr,pr]=await Promise.all([
      supabase.from('moments').select('id,fired_at,deadline').eq('group_id',group.id).order('fired_at',{ascending:false}),
      supabase.from('posts').select('id,moment_id,user_id,img_back,lat,lng,place_label,created_at,is_late').eq('group_id',group.id).order('created_at',{ascending:true})
    ])
    const moments=mr.data||[], posts=pr.data||[]
    const byMoment={}
    posts.forEach(p=>(byMoment[p.moment_id]??=[]).push(p))
    const allJoined=moments.filter(m=>new Set((byMoment[m.id]||[]).map(p=>p.user_id)).size===members.length&&members.length>0).length
    const byUser={}; posts.forEach(p=>byUser[p.user_id]=(byUser[p.user_id]||0)+1)
    const ranking=members.map(m=>({name:m.display_name,color:m.color,count:byUser[m.user_id]||0,me:m.user_id===user.id})).sort((a,b)=>b.count-a.count)
    const first=moments.length?moments[moments.length-1].fired_at:null
    const days=first?Math.max(1,Math.ceil((Date.now()-new Date(first).getTime())/86400000)):0
    setStats({totalMoments:moments.length,totalPosts:posts.length,allJoinedCount:allJoined,lateCount:posts.filter(p=>p.is_late).length,days,firstDate:first?fmtStart(first):'-',ranking})
    const grouped=moments.map(m=>({moment:m,posts:byMoment[m.id]||[]})).filter(x=>x.posts.length).map(x=>({...x,key:kstKey(x.moment.fired_at)}))
    setRows(grouped)
    setLoading(false)
  }

  const visibleRows=useMemo(()=>rows.slice(0,30),[rows])

  return <div style={S.app}>
    <div style={S.top}><button style={S.back} onClick={onClose}>←</button><div style={S.title}>우리의 순간들</div><div style={{width:36}}/></div>
    {loading?<div style={S.loading}>우리의 기록을 모아보는 중…</div>:<div style={S.body}>
      <div style={S.hero}>
        <div style={S.heroShade}/><div style={{position:'relative',zIndex:2}}>
          <div style={S.heroTag}>{group.name}</div><div style={S.heroBig}>{stats.days}일째</div>
          <div style={S.heroSub}>{stats.firstDate}부터 함께</div>
          <div style={S.heroCopy}>서로의 하루가 모여<br/>특별한 시간이 되었어요. ♡</div>
        </div>
      </div>
      <div style={S.cards}>
        <Stat n={stats.totalMoments} label="함께한 안부" sub="우리가 주고받은 오늘"/>
        <Stat n={stats.totalPosts} label="함께한 순간" sub="함께 남긴 사진"/>
        <Stat n={stats.allJoinedCount} label="전원 참여한 날" sub="모두가 함께한 날"/>
        <Stat n={stats.lateCount} label="늦참한 날" sub="아쉬웠던 순간"/>
      </div>
      <div style={S.sectionTitle}>우리가 함께했던 날</div>
      <div style={S.sectionSub}>같은 시간, 서로의 공간에서 닿았던 기록이에요.</div>
      <div style={S.timeline}>{visibleRows.map((r,i)=><MomentRow key={r.moment.id} row={r} members={members} onClick={()=>setSelected(r)}/>)}</div>
      {!visibleRows.length&&<div style={S.empty}>아직 함께한 순간이 없어요.<br/>첫 안부를 남기면 여기에 기록돼요.</div>}
      <div style={S.sectionTitle}>참여 랭킹</div>
      <div style={S.rankCard}>{stats.ranking.map((r,i)=><div key={r.name} style={S.rankRow}><div style={S.rankNo}>{i<3?['🥇','🥈','🥉'][i]:i+1}</div><div style={{...S.rankDot,background:r.color}}/><div style={{flex:1,fontWeight:650}}>{r.name}{r.me&&<span style={S.meTag}>나</span>}</div><div style={S.rankCount}>{r.count}회</div></div>)}</div>
      <div style={S.note}>♡ 함께 보내는 시간이<br/>우리의 하루를 조금 더 특별하게 만들어요.</div>
    </div>}
    {selected&&<MomentDetail row={selected} members={members} onClose={()=>setSelected(null)}/>} 
  </div>
}
function Stat({n,label,sub}){return <div style={S.statCard}><div style={S.statNum}>{n}</div><div style={S.statLabel}>{label}</div><div style={S.statSub}>{sub}</div></div>}
function MomentRow({row,members,onClick}){const p=row.posts;return <button style={S.momentRow} onClick={onClick}><div style={S.dateBox}><b>{new Date(row.moment.fired_at).toLocaleDateString('ko-KR',{month:'numeric',timeZone:'Asia/Seoul'}).replace('월','')}</b><strong>{new Date(row.moment.fired_at).toLocaleDateString('ko-KR',{day:'numeric',timeZone:'Asia/Seoul'}).replace('일','')}</strong><small>{new Date(row.moment.fired_at).toLocaleDateString('ko-KR',{weekday:'short',timeZone:'Asia/Seoul'})}</small></div><div style={{flex:1,minWidth:0}}><div style={S.rowTitle}>{new Set(p.map(x=>x.user_id)).size===members.length?'3명이 함께한 날':'함께한 안부'}</div><div style={S.rowMeta}>{kstTime(row.moment.fired_at)} · {p.map(x=>x.place_label).filter(Boolean).slice(0,3).join(' · ')||'서로의 공간'}</div><div style={S.thumbs}>{p.slice(0,3).map((x,i)=><Thumb key={x.id} path={x.img_back} label={i===2&&p.length>3?`+${p.length-2}`:''}/>)}</div></div><span style={S.chev}>›</span></button>}
function Thumb({path,label}){const [url,setUrl]=useState('');useEffect(()=>{let live=true;if(path)supabase.storage.from('moments').createSignedUrl(path,3600).then(r=>{if(live&&!r.error)setUrl(r.data.signedUrl)});return()=>{live=false}},[path]);return <div style={{...S.thumb,backgroundImage:url?`url(${url})`:'none'}}>{!url&&<span>사진</span>}{label&&<b style={{position:'absolute',right:3,bottom:3,background:'rgba(0,0,0,.55)',color:'#fff',fontSize:9,padding:'2px 4px',borderRadius:5}}>{label}</b>}</div>}
function MomentDetail({row,members,onClose}){return <div style={S.detailWrap}><div style={S.detailTop}><button style={S.back} onClick={onClose}>←</button><div style={S.title}>{kstDate(row.moment.fired_at)}</div><div style={{width:36}}/></div><div style={S.detailBody}><div style={S.detailHero}><div style={S.detailOverlay}>같은 하늘 아래,<br/>서로를 생각한 하루 ♡</div><div style={S.detailTime}>{kstTime(row.moment.fired_at)}</div><div style={S.detailCount}>{row.posts.length}명이 함께 안부를 전했어요.</div></div><div style={S.memberStrip}>{row.posts.map(p=><div key={p.id} style={S.memberCard}><Thumb path={p.img_back}/><div style={{fontWeight:700,marginTop:7}}>{members.find(m=>m.user_id===p.user_id)?.display_name||'멤버'}</div><div style={S.smallMeta}>{kstTime(p.created_at)} · {p.place_label||'위치 비공개'}</div></div>)}</div><div style={S.note}>♡ 우리가 같은 시간에,<br/>각자의 자리에서 닿았던 특별한 순간이에요.</div><button style={S.returnBtn} onClick={onClose}>〈 목록으로 돌아가기</button></div></div>}

const S={
 app:{width:'100%',maxWidth:480,margin:'0 auto',minHeight:'100dvh',background:'#f8f7f3',fontFamily:"-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif",color:'#1e2746',paddingBottom:40},
 top:{position:'sticky',top:0,zIndex:100,background:'rgba(248,247,243,.94)',backdropFilter:'blur(16px)',borderBottom:'1px solid #e6e7eb',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'},back:{width:36,height:36,border:0,borderRadius:'50%',background:'#f0f1f3',color:'#1e2746',fontSize:20},title:{fontWeight:750,fontSize:18},body:{padding:'18px 16px 44px'},loading:{padding:80,textAlign:'center',color:'#8b92a1'},hero:{position:'relative',overflow:'hidden',borderRadius:24,background:'linear-gradient(135deg,#20233a,#3a2830)',color:'#fff',padding:'24px 22px',marginBottom:16,boxShadow:'0 14px 38px rgba(30,39,70,.16)'},heroShade:{position:'absolute',width:220,height:220,right:-80,top:-80,borderRadius:'50%',background:'rgba(229,107,98,.32)',filter:'blur(18px)'},heroTag:{fontSize:12,opacity:.78,letterSpacing:.4},heroBig:{fontSize:38,fontWeight:800,letterSpacing:-1.5,marginTop:4},heroSub:{fontSize:14,opacity:.82},heroCopy:{fontSize:13,lineHeight:1.6,marginTop:22,opacity:.9},cards:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:24},statCard:{background:'#fff',borderRadius:18,padding:'17px 10px',textAlign:'center',boxShadow:'0 6px 24px rgba(30,39,70,.055)'},statNum:{fontSize:30,fontWeight:800,color:'#e56b62'},statLabel:{fontSize:13,fontWeight:700,marginTop:3},statSub:{fontSize:10.5,color:'#8b92a1',marginTop:4},sectionTitle:{fontSize:17,fontWeight:800,margin:'8px 4px 4px'},sectionSub:{fontSize:12,color:'#8b92a1',margin:'0 4px 11px'},timeline:{display:'grid',gap:8,marginBottom:26},momentRow:{width:'100%',display:'flex',alignItems:'center',gap:12,textAlign:'left',border:0,background:'#fff',borderRadius:17,padding:'12px 10px',boxShadow:'0 5px 20px rgba(30,39,70,.045)',color:'#1e2746'},dateBox:{width:42,flex:'none',textAlign:'center',display:'flex',flexDirection:'column',lineHeight:1.05},rowTitle:{fontSize:13,fontWeight:750},rowMeta:{fontSize:10.5,color:'#8b92a1',marginTop:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'},thumbs:{display:'flex',gap:5,marginTop:8},thumb:{width:52,height:40,borderRadius:8,background:'#eef0f2 center/cover no-repeat',position:'relative',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',color:'#a0a5ae',fontSize:9,flex:'none'},chev:{fontSize:23,color:'#9aa0ad'},rankCard:{background:'#fff',borderRadius:18,padding:'6px 14px',boxShadow:'0 6px 24px rgba(30,39,70,.055)',marginBottom:20},rankRow:{display:'flex',alignItems:'center',gap:10,padding:'12px 0',borderBottom:'1px solid #edf0f2'},rankNo:{width:24,textAlign:'center'},rankDot:{width:10,height:10,borderRadius:'50%',flex:'none'},rankCount:{fontWeight:750},meTag:{fontSize:10,color:'#8b92a1',marginLeft:6},note:{background:'#fff3ef',borderRadius:18,padding:'18px 18px',fontSize:13,color:'#5f6678',lineHeight:1.65,marginTop:10},empty:{background:'#fff',borderRadius:18,padding:28,textAlign:'center',color:'#8b92a1',lineHeight:1.6},detailWrap:{position:'fixed',inset:0,zIndex:5000,background:'#f8f7f3',overflowY:'auto'},detailTop:{position:'sticky',top:0,zIndex:2,background:'rgba(248,247,243,.94)',backdropFilter:'blur(16px)',borderBottom:'1px solid #e6e7eb',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'},detailBody:{padding:'16px',maxWidth:480,margin:'0 auto'},detailHero:{height:210,borderRadius:22,background:'#dfe4e9 center/cover no-repeat',overflow:'hidden',position:'relative',color:'#fff',display:'flex',flexDirection:'column',justifyContent:'flex-end',padding:20,backgroundImage:'linear-gradient(180deg,transparent 25%,rgba(0,0,0,.62)),linear-gradient(135deg,#7c8795,#26334a)'},detailOverlay:{fontSize:17,fontWeight:750,lineHeight:1.5},detailTime:{fontSize:12,marginTop:6,opacity:.9},detailCount:{fontSize:11,opacity:.82,marginTop:2},memberStrip:{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,marginTop:12},memberCard:{background:'#fff',borderRadius:16,padding:10,boxShadow:'0 5px 20px rgba(30,39,70,.05)'},smallMeta:{fontSize:10,color:'#8b92a1',marginTop:3},returnBtn:{width:'100%',marginTop:14,padding:13,border:'1px solid #dfe1e5',background:'#fff',borderRadius:14,color:'#1e2746',fontWeight:700}
}

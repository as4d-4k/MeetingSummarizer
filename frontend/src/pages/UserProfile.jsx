import{useState,useEffect,useCallback,useRef}from'react';
import{useParams,useNavigate}from'react-router-dom';
import{getTeamMemberProfile}from'../api/client';
import{RANKS,getRank,getNextRank,ptsToNext,BadgeImage,initials,fmtTime,fmtDate,fmtDateFull,scoreColor,ScoreGauge,RadarChart,Sparkline,SentimentArea,MiniSparkline,computeAchievements,hasStreak}from'./profileCharts';
import'./userProfile.css';

function useCountUp(target,dur=1200){const[v,setV]=useState(0);useEffect(()=>{let start=null;const step=ts=>{if(!start)start=ts;const p=Math.min((ts-start)/dur,1);setV(Math.round(p*target));if(p<1)requestAnimationFrame(step)};requestAnimationFrame(step)},[target,dur]);return v}

function AnimVal({value,color,suffix=''}){const v=useCountUp(value);return<span style={{color}}>{typeof value==='string'?value:v}{suffix}</span>}

function Confetti(){const pieces=Array.from({length:40},(_,i)=>({id:i,left:`${Math.random()*100}%`,bg:['#FFD700','#B388FF','#00C896','#FF6B6B','#7EE8FA','#FF8C00'][i%6],delay:`${Math.random()*2}s`,dur:`${2+Math.random()*2}s`,size:`${6+Math.random()*6}px`}));return<div className="gp-confetti">{pieces.map(p=><div key={p.id} className="gp-confetti-piece" style={{left:p.left,background:p.bg,width:p.size,height:p.size,animationDelay:p.delay,animationDuration:p.dur,opacity:1}}/>)}</div>}

function HexAvatar({name,glowColor}){return<div className="gp-hex-frame" style={{'--hex-glow':glowColor}}><svg className="gp-hex-bg" viewBox="0 0 120 120"><polygon points="60,5 110,30 110,90 60,115 10,90 10,30" fill="none" stroke={glowColor} strokeWidth="2.5" opacity=".6"/><polygon points="60,12 104,34 104,86 60,108 16,86 16,34" fill="rgba(108,99,255,0.08)" stroke="none"/></svg><div className="gp-hex-inner">{initials(name)}</div></div>}

export default function UserProfile(){
const{id}=useParams();const nav=useNavigate();
const[profile,setProfile]=useState(null);const[loading,setLoading]=useState(true);const[snippet,setSnippet]=useState(null);const[showConfetti,setShowConfetti]=useState(false);const[showBadgesModal,setShowBadgesModal]=useState(false);
const fetchProfile=useCallback(async()=>{try{const{data}=await getTeamMemberProfile(id);setProfile(data);if(data.overall_score>=86)setShowConfetti(true)}catch(e){console.error(e)}finally{setLoading(false)}},[id]);
useEffect(()=>{fetchProfile()},[fetchProfile]);
useEffect(()=>{if(showConfetti){const t=setTimeout(()=>setShowConfetti(false),4000);return()=>clearTimeout(t)}},[showConfetti]);

if(loading)return<div className="gp-root">{[80,200,100,200].map((h,i)=><div key={i} className="skeleton" style={{height:h,borderRadius:16,marginBottom:16}}/>)}</div>;
if(!profile)return<div className="gp-root" style={{textAlign:'center',paddingTop:80}}><h2 style={{color:'var(--text-primary)'}}>Profile not found</h2><button onClick={()=>nav('/team')} style={{marginTop:16,color:'#6C63FF',background:'none',border:'none',cursor:'pointer',fontSize:14}}>← Back</button></div>;

const{member,overall_score,total_score:rawTotalScore,total_meetings,total_words,total_talk_time,best_score,worst_score,rank,leaderboard,meeting_history}=profile;
const totalScore=rawTotalScore||meeting_history.reduce((s,m)=>s+m.performance_score,0);
const rnk=getRank(totalScore);const badges=computeAchievements(meeting_history);const streak=hasStreak(meeting_history);
const nextRnk=getNextRank(totalScore);const xpPct=!nextRnk?100:Math.round(((totalScore-rnk.min)/(nextRnk.min-rnk.min))*100);const remaining=ptsToNext(totalScore);

return(<div className="gp-root">
{showConfetti&&<Confetti/>}
<button className="gp-back" onClick={()=>nav('/team')}>
<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>Back to Team</button>

{/* BANNER */}
<div className="gp-banner"><div className="gp-banner-inner">
<div className="gp-avatar-wrap" style={{'--hex-glow':rnk.color}}>
<BadgeImage rank={rnk} size={80}/>
</div>
<div className="gp-banner-info">
<div className="gp-name">{member.name}</div>
<div className="gp-rank-title" style={{color:rnk.color}}>{rnk.label} Rank</div>
<div className="gp-kd-bar">
<div className="gp-kd-item"><div className="gp-kd-val"><AnimVal value={total_meetings}/></div><div className="gp-kd-lbl">Meetings</div></div>
<div className="gp-kd-item"><div className="gp-kd-val"><AnimVal value={best_score} color="#00C896"/></div><div className="gp-kd-lbl">Best</div></div>
<div className="gp-kd-item"><div className="gp-kd-val"><AnimVal value={worst_score} color="#FF6B6B"/></div><div className="gp-kd-lbl">Worst</div></div>
<div className="gp-kd-item"><div className="gp-kd-val">#{rank}</div><div className="gp-kd-lbl">Rank</div></div>
<div className="gp-kd-item"><div className="gp-kd-val"><AnimVal value={total_words}/></div><div className="gp-kd-lbl">Words</div></div>
<div className="gp-kd-item"><div className="gp-kd-val">{fmtTime(total_talk_time)}</div><div className="gp-kd-lbl">Talk Time</div></div>
</div>
<div className="gp-xp-bar">
<div className="gp-xp-labels"><span className="gp-xp-from" style={{color:rnk.color}}>Lv{rnk.level} {rnk.label}</span>{nextRnk&&<span className="gp-xp-to" style={{color:nextRnk.color}}>Lv{nextRnk.level} {nextRnk.label}</span>}</div>
<div className="gp-xp-track"><div className="gp-xp-fill" style={{'--xp-pct':`${xpPct}%`,background:`linear-gradient(90deg,${rnk.color},${nextRnk?nextRnk.color:rnk.color})`}}><span className="gp-xp-pts">{Math.round(totalScore).toLocaleString()} XP</span></div></div>
{remaining>0&&<div style={{fontSize:11,color:'var(--text-muted)',marginTop:4,textAlign:'center'}}>{remaining.toLocaleString()} pts to {nextRnk.label}</div>}
<button onClick={()=>setShowBadgesModal(true)} style={{
  marginTop:8,display:'flex',alignItems:'center',gap:6,margin:'8px auto 0',
  padding:'6px 16px',borderRadius:20,fontSize:11,fontWeight:600,
  background:'rgba(108,99,255,0.1)',border:'1px solid rgba(108,99,255,0.25)',
  color:'#9B8FFF',cursor:'pointer',fontFamily:'var(--font-body)',transition:'all 0.2s',
}}>
  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
  Show All Badges
</button>
</div>
</div>
<div className="gp-banner-score" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 130, height: 130, borderRadius: '50%', background: 'rgba(0,0,0,0.2)', border: `4px solid #6C63FF`, animation: 'gpScorePulse 2s infinite ease-in-out' }}>
  <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)', textShadow: `0 0 10px rgba(108,99,255,0.6)` }}>{Math.round(totalScore).toLocaleString()}</div>
  <div className="gp-banner-score-lbl" style={{ marginTop: 4, fontSize: 11, color: '#6C63FF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Score</div>
</div>
</div></div>

{/* STREAK */}
{streak&&<div className="gp-streak"><span className="gp-streak-emoji">🔥</span>On a 3-meeting winning streak! Scores are climbing!</div>}

{/* INFO */}
<div className="gp-info-row">
<div className="gp-info-item"><div className="gp-info-icon" style={{background:'rgba(108,99,255,.12)',color:'#9B8FFF'}}>✉</div><div><div className="gp-info-lbl">Email</div><div className="gp-info-val">{member.email||'—'}</div></div></div>
<div className="gp-info-item"><div className="gp-info-icon" style={{background:'rgba(0,200,150,.12)',color:'#00C896'}}>💬</div><div><div className="gp-info-lbl">Slack ID</div><div className="gp-info-val">{member.slack_id||'—'}</div></div></div>
<div className="gp-info-item"><div className="gp-info-icon" style={{background:'rgba(255,184,0,.12)',color:'#FFB800'}}>🔑</div><div><div className="gp-info-lbl">Employee Key</div><div className="gp-info-val">{member.key||'—'}</div></div></div>
<div className="gp-info-item"><div className="gp-info-icon" style={{background:'rgba(255,107,107,.12)',color:'#FF6B6B'}}>📅</div><div><div className="gp-info-lbl">Joined</div><div className="gp-info-val">{member.created_at?fmtDateFull(member.created_at):'—'}</div></div></div>
</div>

{/* ACHIEVEMENTS */}
<div className="gp-section-title">🏆 Achievements</div>
<div className="gp-badges">{badges.map(b=>(
<div key={b.id} className={`gp-badge ${b.unlocked?'gp-badge-unlocked':'gp-badge-locked'}`}>
<div className="gp-badge-flipper">
<div className="gp-badge-front" style={b.unlocked?{background:`linear-gradient(135deg,${b.color}22,${b.color}11)`,borderColor:`${b.color}66`,boxShadow:`0 0 20px ${b.color}33`}:{borderColor:'rgba(255,255,255,.1)',background:'rgba(255,255,255,.03)'}}><img src={b.image} alt={b.name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', filter: b.unlocked ? `drop-shadow(0 0 8px ${b.color}88)` : 'grayscale(100%) opacity(0.4)' }} /></div>
<div className="gp-badge-back" style={{borderColor:b.unlocked?`${b.color}44`:'rgba(255,255,255,.1)'}}><strong style={{color:b.unlocked?b.color:'var(--text-muted)',fontSize:10}}>{b.name}</strong><br/>{b.desc}<br/><span style={{color:b.unlocked?'#00C896':'#FF6B6B'}}>{b.unlocked?'✅ Unlocked':'🔒 Locked'}</span></div>
</div>
<div className="gp-badge-name">{b.name}</div>
</div>))}</div>

{/* CHARTS */}
<div className="gp-charts">
<div className="gp-chart-card"><div className="gp-section-title">🎯 Performance Radar</div><RadarChart data={meeting_history}/></div>
<div className="gp-chart-card"><div className="gp-section-title">📈 Last 10 Meetings</div><Sparkline data={meeting_history}/><div style={{marginTop:12,fontSize:11,color:'var(--text-muted)',textAlign:'center'}}>{meeting_history.length>0?`${Math.min(10,meeting_history.length)} recent meetings`:'Join some meetings first!'}</div></div>
</div>

{/* SENTIMENT */}
<div className="gp-chart-card" style={{marginBottom:24}}>
<div className="gp-section-title">💭 Sentiment Timeline</div>
<SentimentArea data={meeting_history} onClickPoint={p=>setSnippet(p.contribution_summary?p:null)}/>
{snippet&&<div style={{marginTop:16,padding:16,background:'rgba(108,99,255,.06)',borderRadius:12,border:'1px solid rgba(108,99,255,.15)',fontSize:13,color:'var(--text-secondary)',lineHeight:1.7,position:'relative'}}>
<button onClick={()=>setSnippet(null)} style={{position:'absolute',top:8,right:12,background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:16}}>×</button>
<strong style={{color:'var(--text-primary)'}}>{snippet.meeting_title}</strong> — {fmtDateFull(snippet.meeting_date)}<p style={{marginTop:6}}>{snippet.contribution_summary||'No snippet available.'}</p></div>}
</div>

{/* MEETINGS */}
{meeting_history.length>0&&<div className="gp-matches"><div className="gp-section-title">🎮 Recent Meetings</div><div style={{overflowX:'auto'}}><table><thead><tr><th>Date</th><th>Meeting</th><th>Score</th><th>Words</th><th>Duration</th><th>Sentiment</th><th></th></tr></thead><tbody>
{[...meeting_history].reverse().slice(0,15).map(m=>{const sc=m.performance_score,sC=scoreColor(sc),cls=sc>=70?'gp-match-green':sc>=40?'gp-match-amber':'gp-match-red';return(
<tr key={m.id} className={cls} onClick={()=>nav(`/meetings/${m.meeting_id}`)}>
<td style={{whiteSpace:'nowrap',color:'var(--text-muted)'}}>{fmtDateFull(m.meeting_date)}</td>
<td style={{fontWeight:600,color:'var(--text-primary)'}}>{m.meeting_title}</td>
<td><span className="gp-score-pill" style={{color:sC,background:`${sC}18`}}>{Math.round(sc)}</span></td>
<td>{m.word_count.toLocaleString()}</td><td>{fmtTime(m.talk_time_seconds)}</td>
<td><div className="gp-sent-row"><span style={{color:'#00C896'}}>+{m.sentiment_positive}</span><span style={{color:'#8B92B8'}}>~{m.sentiment_neutral}</span><span style={{color:'#FF6B6B'}}>−{m.sentiment_negative}</span></div></td>
<td><span className="gp-replay" onClick={e=>{e.stopPropagation();nav(`/meetings/${m.meeting_id}`)}}>Replay →</span></td>
</tr>)})}
</tbody></table></div></div>}

{/* ALL BADGES MODAL */}
{showBadgesModal&&(
<div onClick={()=>setShowBadgesModal(false)} style={{
  position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,0.7)',
  backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',
}}>
<div onClick={e=>e.stopPropagation()} style={{
  background:'rgba(18,18,35,0.97)',border:'1px solid rgba(108,99,255,0.2)',
  borderRadius:20,padding:'28px 32px',maxWidth:520,width:'90%',
  boxShadow:'0 24px 80px rgba(0,0,0,0.5)',
}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
  <h3 style={{margin:0,color:'var(--text-primary)',fontSize:18,fontWeight:700}}>🏅 All Badge Levels</h3>
  <button onClick={()=>setShowBadgesModal(false)} style={{
    background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',
    borderRadius:8,width:32,height:32,cursor:'pointer',color:'var(--text-muted)',
    display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,
  }}>✕</button>
</div>
<div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:14}}>
{RANKS.map(r=>{
  const unlocked=totalScore>=r.min;
  return(
  <div key={r.level} style={{
    background:unlocked?`linear-gradient(135deg, ${r.color}15, ${r.color}08)`:'rgba(255,255,255,0.02)',
    border:`1px solid ${unlocked?r.color+'44':'rgba(255,255,255,0.06)'}`,
    borderRadius:14,padding:16,textAlign:'center',
    opacity:unlocked?1:0.5,transition:'all 0.3s',
    boxShadow:unlocked?`0 0 20px ${r.color}22`:'none',
  }}>
    <img src={r.badge} alt={r.label} width={48} height={48} style={{
      objectFit:'contain',filter:`drop-shadow(0 0 8px ${r.color}${unlocked?'66':'22'})`,
    }} />
    <div style={{fontSize:12,fontWeight:700,color:unlocked?r.color:'var(--text-muted)',marginTop:8}}>
      Lv{r.level} {r.label}
    </div>
    <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4}}>
      {r.min===0?'Starting rank':`${r.min.toLocaleString()} pts`}
    </div>
    <div style={{
      fontSize:9,fontWeight:600,marginTop:6,padding:'2px 8px',borderRadius:10,
      display:'inline-block',
      background:unlocked?'rgba(0,200,150,0.15)':'rgba(255,107,107,0.1)',
      color:unlocked?'#00C896':'#FF6B6B',
    }}>
      {unlocked?'✅ Unlocked':'🔒 Locked'}
    </div>
  </div>);
})}
</div>
<div style={{marginTop:16,textAlign:'center',fontSize:12,color:'var(--text-muted)'}}>
  Score: <strong style={{color:rnk.color}}>{Math.round(totalScore).toLocaleString()} XP</strong>
  {remaining>0&&<> · <span style={{color:nextRnk.color}}>{remaining.toLocaleString()} pts to {nextRnk.label}</span></>}
</div>
</div>
</div>
)}

{/* FLOATING CARD */}
<div className="gp-float"><span className="gp-float-emoji" style={{fontSize:20}}>Lv{rnk.level}</span><div className="gp-float-info"><span className="gp-float-name">{member.name}</span><span className="gp-float-score" style={{color:scoreColor(overall_score)}}>{overall_score} · {rnk.label}</span></div></div>
</div>)}

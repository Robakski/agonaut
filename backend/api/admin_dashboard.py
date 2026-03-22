"""
Private Admin Dashboard — Airdrop analytics & user activity.

Protected by ADMIN_KEY query parameter. Single self-contained HTML page.
Access: https://api.agonaut.io/admin/dashboard?key=<ADMIN_KEY>
"""

import os
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["admin"])

ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


def _check_key(key: str):
    if not ADMIN_KEY or key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/admin/dashboard", response_class=HTMLResponse)
async def admin_dashboard(key: str = Query("")):
    _check_key(key)
    return DASHBOARD_HTML.replace("__ADMIN_KEY__", key)


DASHBOARD_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Agonaut — Admin Dashboard</title>
<style>
  :root{--bg:#f8fafc;--card:#fff;--border:#e2e8f0;--text:#0f172a;--muted:#64748b;--accent:#d97706;--green:#059669;--red:#dc2626;--blue:#2563eb}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.5;padding:24px;max-width:1400px;margin:0 auto}
  h1{font-size:22px;font-weight:800;letter-spacing:-0.5px}
  h2{font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px}
  h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:8px}
  .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border)}
  .header .meta{font-size:12px;color:var(--muted)}
  .live{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--green)}
  .live::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px}
  .stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px}
  .stat .val{font-size:24px;font-weight:800;color:var(--text)}
  .stat .label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-top:2px}
  .stat.accent .val{color:var(--accent)}
  .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;padding:8px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border);cursor:pointer;user-select:none}
  th:hover{color:var(--text)}
  th.sorted{color:var(--accent)}
  td{padding:8px 12px;border-bottom:1px solid #f1f5f9}
  tr:hover td{background:#f8fafc}
  .mono{font-family:'SF Mono',Consolas,monospace;font-size:12px}
  .badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700}
  .badge-sponsor{background:#fef3c7;color:#92400e}
  .badge-agent{background:#dbeafe;color:#1e40af}
  .badge-both{background:#d1fae5;color:#065f46}
  .badge-visitor{background:#f1f5f9;color:#64748b}
  .controls{display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
  .controls select,.controls input{padding:6px 12px;border:1px solid var(--border);border-radius:8px;font-size:12px;background:var(--card)}
  .controls button{padding:6px 16px;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;background:var(--text);color:#fff}
  .controls button:hover{opacity:.9}
  .controls button.secondary{background:var(--card);color:var(--text);border:1px solid var(--border)}
  .detail-panel{position:fixed;top:0;right:0;width:420px;height:100vh;background:var(--card);border-left:1px solid var(--border);box-shadow:-4px 0 24px rgba(0,0,0,.08);padding:24px;overflow-y:auto;z-index:100;transform:translateX(100%);transition:transform .2s}
  .detail-panel.open{transform:translateX(0)}
  .detail-panel .close{position:absolute;top:16px;right:16px;background:none;border:none;font-size:18px;cursor:pointer;color:var(--muted)}
  .event-list{max-height:300px;overflow-y:auto}
  .event{padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px}
  .event .type{font-weight:700;color:var(--accent)}
  .event .time{color:var(--muted);font-size:11px}
  .chart-bar{display:flex;align-items:center;gap:8px;margin-bottom:4px}
  .chart-bar .bar{height:20px;border-radius:4px;background:linear-gradient(90deg,var(--accent),#fbbf24);min-width:2px}
  .chart-bar .lbl{font-size:11px;color:var(--muted);min-width:80px}
  .chart-bar .ct{font-size:11px;font-weight:600;color:var(--text)}
  #loading{text-align:center;padding:40px;color:var(--muted);font-size:14px}
  .refresh-btn{font-size:11px;color:var(--accent);cursor:pointer;border:none;background:none;font-weight:600}
  @media(max-width:768px){body{padding:12px}.stats{grid-template-columns:1fr 1fr}.detail-panel{width:100%}}
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>🦁 Agonaut Admin</h1>
    <div class="meta">Airdrop Activity Tracker · Private Dashboard</div>
  </div>
  <div style="text-align:right">
    <span class="live">Live</span>
    <div class="meta" id="lastUpdate"></div>
    <button class="refresh-btn" onclick="loadAll()">↻ Refresh</button>
  </div>
</div>

<div id="loading">Loading dashboard...</div>
<div id="content" style="display:none">

<!-- Aggregate Stats -->
<div class="stats" id="statsGrid"></div>

<!-- Role Distribution -->
<div class="card">
  <h2>Role Distribution</h2>
  <div id="roleChart"></div>
</div>

<!-- Activity Timeline -->
<div class="card">
  <h2>Daily Connections (Last 30 Days)</h2>
  <div id="timelineChart" style="height:120px;display:flex;align-items:flex-end;gap:2px"></div>
</div>

<!-- User Feedback -->
<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <h2 style="margin:0">💡 User Feedback</h2>
    <div style="display:flex;gap:4px">
      <select id="feedbackFilter" onchange="loadFeedback()" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:11px">
        <option value="">All</option>
        <option value="new">New</option>
        <option value="idea">Ideas</option>
        <option value="bug">Bugs</option>
        <option value="ux">UX</option>
      </select>
    </div>
  </div>
  <div id="feedbackList"></div>
  <div id="feedbackCount" style="margin-top:8px;font-size:11px;color:var(--muted)"></div>
</div>

<!-- Wallet Table -->
<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <h2 style="margin:0">All Wallets</h2>
    <button class="controls button secondary" onclick="exportCSV()" style="padding:4px 12px;border:1px solid var(--border);border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;background:var(--card)">Export CSV</button>
  </div>
  <div class="controls">
    <select id="filterRole" onchange="loadWallets()">
      <option value="">All Roles</option>
      <option value="sponsor">Sponsors</option>
      <option value="agent">Agents</option>
      <option value="both">Dual Role</option>
      <option value="visitor">Visitors</option>
    </select>
    <select id="sortField" onchange="loadWallets()">
      <option value="last_seen">Last Seen</option>
      <option value="first_seen">First Seen</option>
      <option value="total_sessions">Sessions</option>
      <option value="total_duration_sec">Duration</option>
      <option value="bounties_created">Bounties</option>
      <option value="solutions_submitted">Solutions</option>
      <option value="wins">Wins</option>
      <option value="streak_days">Streak</option>
      <option value="pages_visited">Pages</option>
    </select>
    <input type="number" id="minSessions" placeholder="Min sessions" min="0" style="width:100px" onchange="loadWallets()">
  </div>
  <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th>Wallet</th>
          <th>Role</th>
          <th>First Seen</th>
          <th>Sessions</th>
          <th>Duration</th>
          <th>Streak</th>
          <th>Bounties</th>
          <th>Solutions</th>
          <th>Wins</th>
          <th>Pages</th>
        </tr>
      </thead>
      <tbody id="walletTable"></tbody>
    </table>
  </div>
  <div id="walletCount" style="margin-top:8px;font-size:11px;color:var(--muted)"></div>
</div>

</div>

<!-- Detail Panel -->
<div class="detail-panel" id="detailPanel">
  <button class="close" onclick="closeDetail()">✕</button>
  <div id="detailContent"></div>
</div>

<script>
const API = window.location.origin + '/api/v1';
const KEY = '__ADMIN_KEY__';
const q = (p) => fetch(`${API}${p}${p.includes('?')?'&':'?'}key=${KEY}`).then(r=>r.json());

async function loadAll(){
  try{
    const [stats, wallets] = await Promise.all([
      q('/activity/stats'),
      q('/activity/wallets?limit=500&sort=last_seen&order=desc'),
    ]);
    renderStats(stats);
    renderWallets(wallets);
    renderRoleChart(stats);
    await loadTimeline();
    document.getElementById('loading').style.display='none';
    document.getElementById('content').style.display='block';
    document.getElementById('lastUpdate').textContent='Updated: '+new Date().toLocaleTimeString();
  }catch(e){
    document.getElementById('loading').textContent='Error loading data: '+e.message;
  }
}

function renderStats(s){
  const items=[
    {v:s.total_wallets,l:'Total Wallets'},
    {v:s.sponsors,l:'Sponsors'},
    {v:s.agents,l:'Agents'},
    {v:s.dual_role,l:'Dual Role',accent:true},
    {v:s.with_bounties,l:'Created Bounties'},
    {v:s.with_submissions,l:'Submitted Solutions'},
    {v:s.with_wins,l:'Won Rounds'},
    {v:s.total_events,l:'Total Events'},
    {v:s.avg_sessions,l:'Avg Sessions'},
    {v:s.avg_streak_days+'d',l:'Avg Streak'},
  ];
  document.getElementById('statsGrid').innerHTML=items.map(i=>
    `<div class="stat${i.accent?' accent':''}"><div class="val">${i.v}</div><div class="label">${i.l}</div></div>`
  ).join('');
}

function renderRoleChart(s){
  const roles=[
    {l:'Sponsors',v:s.sponsors,c:'#f59e0b'},
    {l:'Agents',v:s.agents,c:'#3b82f6'},
    {l:'Dual Role',v:s.dual_role,c:'#10b981'},
    {l:'Visitors',v:Math.max(0,s.total_wallets-s.sponsors-s.agents+s.dual_role),c:'#94a3b8'},
  ];
  const max=Math.max(...roles.map(r=>r.v),1);
  document.getElementById('roleChart').innerHTML=roles.map(r=>
    `<div class="chart-bar"><div class="lbl">${r.l}</div><div class="bar" style="width:${(r.v/max)*100}%;background:${r.c}"></div><div class="ct">${r.v}</div></div>`
  ).join('');
}

async function loadTimeline(){
  try{
    // Build from wallet first_seen data
    const data=await q('/activity/wallets?limit=1000&sort=first_seen&order=asc');
    const byDay={};
    const now=Date.now()/1000;
    data.wallets.forEach(w=>{
      const d=new Date(w.first_seen*1000).toISOString().slice(0,10);
      byDay[d]=(byDay[d]||0)+1;
    });
    // Last 30 days
    const days=[];
    for(let i=29;i>=0;i--){
      const d=new Date(Date.now()-i*86400000).toISOString().slice(0,10);
      days.push({d,v:byDay[d]||0});
    }
    const max=Math.max(...days.map(d=>d.v),1);
    document.getElementById('timelineChart').innerHTML=days.map(d=>
      `<div title="${d.d}: ${d.v}" style="flex:1;background:${d.v?'linear-gradient(var(--accent),#fbbf24)':'#e2e8f0'};height:${Math.max(d.v/max*100,2)}%;border-radius:3px 3px 0 0;cursor:pointer" onclick="alert('${d.d}: ${d.v} new wallets')"></div>`
    ).join('');
  }catch(e){}
}

let allWallets=[];
function renderWallets(data){
  allWallets=data.wallets;
  _renderTable(allWallets);
}

async function loadWallets(){
  const role=document.getElementById('filterRole').value;
  const sort=document.getElementById('sortField').value;
  const minS=document.getElementById('minSessions').value;
  let url=`/activity/wallets?limit=500&sort=${sort}&order=desc`;
  if(role)url+=`&role=${role}`;
  if(minS)url+=`&min_sessions=${minS}`;
  const data=await q(url);
  allWallets=data.wallets;
  _renderTable(allWallets);
}

function _renderTable(wallets){
  const fmt=(ts)=>ts?new Date(ts*1000).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})+' '+new Date(ts*1000).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'—';
  const dur=(s)=>{if(!s)return'0m';if(s<3600)return Math.round(s/60)+'m';return(s/3600).toFixed(1)+'h'};
  const badge=(r)=>`<span class="badge badge-${r}">${r}</span>`;
  const short=(a)=>a?a.slice(0,6)+'…'+a.slice(-4):'';

  document.getElementById('walletTable').innerHTML=wallets.map(w=>`<tr onclick="showDetail('${w.address}')" style="cursor:pointer">
    <td class="mono">${short(w.address)}${w.ens_name?' <span style="color:var(--accent)">'+w.ens_name+'</span>':''}</td>
    <td>${badge(w.role)}</td>
    <td style="font-size:11px;color:var(--muted)">${fmt(w.first_seen)}</td>
    <td style="font-weight:600">${w.total_sessions}</td>
    <td>${dur(w.total_duration_sec)}</td>
    <td>${w.streak_days?w.streak_days+'d':'—'}</td>
    <td>${w.bounties_created||'—'}</td>
    <td>${w.solutions_submitted||'—'}</td>
    <td>${w.wins?'<span style="color:var(--green);font-weight:700">'+w.wins+'</span>':'—'}</td>
    <td>${w.pages_visited||0}</td>
  </tr>`).join('');
  document.getElementById('walletCount').textContent=wallets.length+' wallets';
}

async function showDetail(addr){
  const data=await q(`/activity/wallets/${addr}`);
  const w=data.wallet;
  const fmt=(ts)=>ts?new Date(ts*1000).toLocaleString('de-DE'):'—';
  const dur=(s)=>{if(!s)return'0m';if(s<3600)return Math.round(s/60)+'m';return(s/3600).toFixed(1)+'h'};
  const weiToEth=(wei)=>(parseInt(wei||'0')/1e18).toFixed(6);

  let html=`
    <h2 style="margin-bottom:16px">Wallet Detail</h2>
    <div class="mono" style="font-size:13px;margin-bottom:16px;word-break:break-all">${w.address}</div>
    ${w.ens_name?'<div style="color:var(--accent);font-weight:600;margin-bottom:16px">'+w.ens_name+'</div>':''}
    <div class="stats" style="grid-template-columns:1fr 1fr;margin-bottom:20px">
      <div class="stat"><div class="val">${w.role}</div><div class="label">Role</div></div>
      <div class="stat"><div class="val">${w.total_sessions}</div><div class="label">Sessions</div></div>
      <div class="stat"><div class="val">${dur(w.total_duration_sec)}</div><div class="label">Total Time</div></div>
      <div class="stat"><div class="val">${w.streak_days||0}d</div><div class="label">Streak</div></div>
      <div class="stat"><div class="val">${w.bounties_created}</div><div class="label">Bounties</div></div>
      <div class="stat"><div class="val">${weiToEth(w.total_deposited_wei)} ETH</div><div class="label">Deposited</div></div>
      <div class="stat"><div class="val">${w.solutions_submitted}</div><div class="label">Solutions</div></div>
      <div class="stat"><div class="val">${weiToEth(w.total_entry_fees_wei)} ETH</div><div class="label">Fees Paid</div></div>
      <div class="stat accent"><div class="val">${w.wins}</div><div class="label">Wins</div></div>
      <div class="stat accent"><div class="val">${weiToEth(w.total_earned_wei)} ETH</div><div class="label">Earned</div></div>
    </div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:4px">First seen: ${fmt(w.first_seen)}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:4px">Last seen: ${fmt(w.last_seen)}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:4px">Agent registered: ${w.agent_registered?'✅ '+fmt(w.agent_registered_at):'❌'}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:16px">Unique pages: ${w.unique_pages?JSON.parse(w.unique_pages).length:0}</div>

    <h3>Recent Events</h3>
    <div class="event-list">
      ${(data.recent_events||[]).map(e=>`<div class="event">
        <span class="type">${e.event}</span>
        ${e.detail?' · <span>'+e.detail+'</span>':''}
        ${e.page?' · <span class="mono" style="font-size:10px">'+e.page+'</span>':''}
        <div class="time">${fmt(e.ts)}</div>
      </div>`).join('')}
    </div>
  `;
  document.getElementById('detailContent').innerHTML=html;
  document.getElementById('detailPanel').classList.add('open');
}

function closeDetail(){
  document.getElementById('detailPanel').classList.remove('open');
}

function exportCSV(){
  if(!allWallets.length)return;
  const hdr=['address','role','first_seen','last_seen','sessions','duration_sec','streak','bounties','solutions','wins','pages'];
  const rows=allWallets.map(w=>[w.address,w.role,w.first_seen,w.last_seen,w.total_sessions,w.total_duration_sec,w.streak_days,w.bounties_created,w.solutions_submitted,w.wins,w.pages_visited]);
  const csv=[hdr,...rows].map(r=>r.join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='agonaut_wallets_'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
}

// Feedback
async function loadFeedback(){
  try{
    const filter=document.getElementById('feedbackFilter').value;
    let url='/feedback/list?key='+KEY+'&limit=50';
    if(filter==='new')url+='&status=new';
    else if(filter)url+='&type='+filter;
    const data=await q(url.replace('/api/v1',''));
    // fix: feedback endpoint is at /api/v1/feedback/list
    const res=await fetch(`${API}/feedback/list?key=${KEY}&limit=50${filter==='new'?'&status=new':filter?'&type='+filter:''}`);
    const d=await res.json();
    renderFeedback(d);
  }catch(e){
    document.getElementById('feedbackList').innerHTML='<div style="color:var(--muted);font-size:12px;padding:12px">No feedback yet</div>';
  }
}

function renderFeedback(data){
  const items=data.items||[];
  const fmt=(ts)=>ts?new Date(ts*1000).toLocaleString('de-DE'):'—';
  const typeEmoji={idea:'💡',bug:'🐛',ux:'✨',other:'💬'};
  const statusColor={new:'color:var(--accent);font-weight:700',reviewed:'color:var(--green)',done:'color:var(--green)',dismissed:'color:var(--muted)'};

  if(!items.length){
    document.getElementById('feedbackList').innerHTML='<div style="color:var(--muted);font-size:12px;padding:20px;text-align:center">No feedback yet — the widget is live on the site!</div>';
    document.getElementById('feedbackCount').textContent='';
    return;
  }

  document.getElementById('feedbackList').innerHTML=items.map(f=>`
    <div style="border-bottom:1px solid #f1f5f9;padding:12px 0">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
        <div>
          <span style="font-size:14px">${typeEmoji[f.type]||'💬'}</span>
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-left:4px">${f.type}</span>
          <span style="font-size:10px;margin-left:8px;${statusColor[f.status]||''}">${f.status}</span>
        </div>
        <div style="font-size:10px;color:var(--muted)">${fmt(f.ts)}</div>
      </div>
      <div style="font-size:13px;color:var(--text);margin:6px 0;line-height:1.5">${f.message.replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>
      <div style="display:flex;gap:8px;font-size:10px;color:var(--muted)">
        ${f.wallet?'<span class="mono">'+f.wallet.slice(0,6)+'…'+f.wallet.slice(-4)+'</span>':''}
        ${f.page?'<span>'+f.page+'</span>':''}
        ${f.email?'<span>📧 '+f.email+'</span>':''}
      </div>
      <div style="margin-top:6px;display:flex;gap:4px">
        <button onclick="updateFeedbackStatus(${f.id},'reviewed')" style="font-size:10px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;cursor:pointer;background:var(--card)">✓ Reviewed</button>
        <button onclick="updateFeedbackStatus(${f.id},'done')" style="font-size:10px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;cursor:pointer;background:var(--card)">✅ Done</button>
        <button onclick="updateFeedbackStatus(${f.id},'dismissed')" style="font-size:10px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;cursor:pointer;background:var(--card)">✕</button>
      </div>
    </div>
  `).join('');
  document.getElementById('feedbackCount').textContent=data.total+' total feedback items';
}

async function updateFeedbackStatus(id,status){
  await fetch(`${API}/feedback/update-status?id=${id}&status=${status}&key=${KEY}`,{method:'POST'});
  loadFeedback();
}

// Auto-refresh every 60 seconds
loadAll();
loadFeedback();
setInterval(()=>{loadAll();loadFeedback()},60000);

// Keyboard: Escape closes detail
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail()});
</script>
</body>
</html>"""

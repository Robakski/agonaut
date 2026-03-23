"""
Private Admin Dashboard — Airdrop analytics & user activity.

Protected by password login with session cookie.
Access: https://api.agonaut.io/admin/dashboard → login page → session cookie
"""

import os
import hashlib
import secrets
import time
from fastapi import APIRouter, Query, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

router = APIRouter(tags=["admin"])

ADMIN_KEY = os.environ.get("ADMIN_KEY", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_DASHBOARD_PASSWORD", "")

# Session store — in-memory, survives until restart (fine for single admin)
_sessions: dict[str, float] = {}
SESSION_MAX_AGE = 86400 * 7  # 7 days


def _check_session(request: Request) -> bool:
    """Check if request has a valid session cookie."""
    token = request.cookies.get("agonaut_admin_session")
    if not token or token not in _sessions:
        return False
    if time.time() - _sessions[token] > SESSION_MAX_AGE:
        del _sessions[token]
        return False
    return True


def _check_key(key: str):
    """Legacy API key check for backend API endpoints."""
    if not ADMIN_KEY or key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


def _check_auth(request: Request, key: str = ""):
    """Check either session cookie or API key."""
    if _check_session(request):
        return True
    if key and ADMIN_KEY and key == ADMIN_KEY:
        return True
    raise HTTPException(status_code=403, detail="Forbidden")


# ── Login Page ─────────────────────────────────────────────

LOGIN_HTML = r"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Agonaut Admin — Login</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .login{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:40px;width:100%;max-width:380px;box-shadow:0 4px 24px rgba(0,0,0,.04)}
  h1{font-size:20px;font-weight:800;letter-spacing:-0.5px;text-align:center;margin-bottom:4px}
  .sub{font-size:12px;color:#64748b;text-align:center;margin-bottom:24px}
  label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#64748b;display:block;margin-bottom:6px}
  input[type=password]{width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;outline:none;transition:border .2s}
  input[type=password]:focus{border-color:#d97706;box-shadow:0 0 0 3px rgba(217,119,6,.1)}
  button{width:100%;padding:10px;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;background:#0f172a;color:#fff;margin-top:16px;transition:opacity .2s}
  button:hover{opacity:.9}
  .error{color:#dc2626;font-size:12px;text-align:center;margin-top:12px;display:none}
  .logo{text-align:center;font-size:28px;margin-bottom:12px}
</style>
</head><body>
<form class="login" method="POST" action="/admin/login">
  <div class="logo">🦁</div>
  <h1>Agonaut Admin</h1>
  <div class="sub">Private Dashboard</div>
  <label for="pw">Password</label>
  <input type="password" id="pw" name="password" placeholder="Enter admin password" autocomplete="current-password" autofocus>
  <input type="hidden" name="username" value="admin" autocomplete="username">
  <button type="submit">Sign In</button>
  <div class="error" id="err">__ERROR__</div>
</form>
</body></html>"""


class LoginForm(BaseModel):
    password: str


@router.get("/admin/login", response_class=HTMLResponse)
async def login_page(request: Request, error: str = ""):
    """Show login page."""
    if _check_session(request):
        return RedirectResponse("/admin/dashboard", status_code=302)
    html = LOGIN_HTML.replace("__ERROR__", error)
    if error:
        html = html.replace("display:none", "display:block")
    return html


@router.post("/admin/login")
async def login_submit(request: Request):
    """Handle login form submission."""
    form = await request.form()
    password = form.get("password", "")

    if not ADMIN_PASSWORD:
        # Fallback: use ADMIN_KEY as password if ADMIN_DASHBOARD_PASSWORD not set
        valid = password == ADMIN_KEY
    else:
        valid = password == ADMIN_PASSWORD

    if not valid:
        html = LOGIN_HTML.replace("__ERROR__", "Wrong password").replace("display:none", "display:block")
        return HTMLResponse(html, status_code=401)

    # Create session
    token = secrets.token_urlsafe(48)
    _sessions[token] = time.time()

    response = RedirectResponse("/admin/dashboard", status_code=302)
    response.set_cookie(
        "agonaut_admin_session",
        token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
    )
    return response


@router.get("/admin/logout")
async def logout(request: Request):
    """Clear session and redirect to login."""
    token = request.cookies.get("agonaut_admin_session")
    if token and token in _sessions:
        del _sessions[token]
    response = RedirectResponse("/admin/login", status_code=302)
    response.delete_cookie("agonaut_admin_session")
    return response


@router.get("/admin/dashboard", response_class=HTMLResponse)
async def admin_dashboard(request: Request):
    if not _check_session(request):
        return RedirectResponse("/admin/login", status_code=302)
    # Pass ADMIN_KEY for API calls from dashboard JS
    return DASHBOARD_HTML.replace("__ADMIN_KEY__", ADMIN_KEY)


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
    <a href="/admin/logout" style="font-size:11px;color:var(--muted);text-decoration:none;margin-left:8px">🔒 Logout</a>
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

<!-- Email Inbox -->
<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <h2 style="margin:0">📧 Email — contact@agonaut.io <span id="emailUnread" style="font-size:11px;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:6px;font-weight:700;margin-left:8px"></span></h2>
    <div style="display:flex;gap:8px">
      <button onclick="openCompose()" style="padding:4px 12px;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;background:var(--text);color:#fff">✉ New Email</button>
      <button class="refresh-btn" onclick="loadEmails()">↻ Refresh</button>
    </div>
  </div>
  <div id="emailList" style="max-height:500px;overflow-y:auto"></div>
</div>

<!-- Email Read Panel -->
<div class="detail-panel" id="emailPanel" style="width:560px">
  <button class="close" onclick="closeEmailPanel()">✕</button>
  <div id="emailContent"></div>
</div>

<!-- Compose Panel -->
<div class="detail-panel" id="composePanel" style="width:500px">
  <button class="close" onclick="closeCompose()">✕</button>
  <h2 style="margin-bottom:16px">New Email</h2>
  <div style="display:flex;flex-direction:column;gap:12px">
    <input id="composeTo" type="email" placeholder="To" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px">
    <input id="composeSubject" type="text" placeholder="Subject" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px">
    <textarea id="composeBody" rows="12" placeholder="Message..." style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button onclick="closeCompose()" style="padding:6px 16px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;background:var(--card)">Cancel</button>
      <button onclick="sendComposedEmail()" id="sendBtn" style="padding:6px 16px;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;background:var(--accent);color:#fff">Send</button>
    </div>
    <div id="composeStatus" style="font-size:11px"></div>
  </div>
</div>

</div>

<!-- Detail Panel -->
<div class="detail-panel" id="detailPanel">
  <button class="close" onclick="closeDetail()">✕</button>
  <div id="detailContent"></div>
</div>

<script>
function escHtml(s){if(!s)return'';return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\n/g,'<br>');}
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
      <div style="font-size:13px;color:var(--text);margin:6px 0;line-height:1.5">${escHtml(f.message)}</div>
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

// ── Email Functions ──────────────────────────────────────

async function loadEmails(){
  try{
    const r=await fetch(`${location.origin}/admin/email/inbox?key=__ADMIN_KEY__&limit=30`);
    if(!r.ok)throw new Error('Email fetch failed');
    const d=await r.json();
    const el=document.getElementById('emailList');
    const unreadEl=document.getElementById('emailUnread');
    unreadEl.textContent=d.unread>0?`${d.unread} unread`:'';
    if(!d.messages||d.messages.length===0){
      el.innerHTML='<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">No emails yet</div>';
      return;
    }
    el.innerHTML=d.messages.map(m=>{
      const dt=m.timestamp?new Date(m.timestamp*1000).toLocaleString('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'';
      const readStyle=m.is_read?'color:var(--muted);font-weight:400':'color:var(--text);font-weight:600';
      return `<div onclick="readEmail('${m.uid}')" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;transition:background .1s" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
        <div style="flex:1;min-width:0">
          <div style="display:flex;gap:8px;align-items:center">
            ${!m.is_read?'<span style="width:6px;height:6px;border-radius:50%;background:var(--accent);flex-shrink:0"></span>':''}
            <span style="font-size:12px;font-weight:600;color:var(--text)">${escHtml(m.sender_name)}</span>
            <span style="font-size:11px;color:var(--muted)">&lt;${escHtml(m.sender)}&gt;</span>
          </div>
          <div style="font-size:13px;${readStyle};margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(m.subject)}</div>
        </div>
        <div style="font-size:11px;color:var(--muted);flex-shrink:0;margin-left:12px">${dt}</div>
      </div>`;
    }).join('');
  }catch(e){
    document.getElementById('emailList').innerHTML='<div style="padding:16px;color:var(--red);font-size:12px">Email not configured — add GMAIL_APP_PASSWORD to .env</div>';
  }
}

async function readEmail(uid){
  const panel=document.getElementById('emailPanel');
  const content=document.getElementById('emailContent');
  content.innerHTML='<div style="padding:24px;color:var(--muted)">Loading...</div>';
  panel.classList.add('open');
  try{
    const r=await fetch(`${location.origin}/admin/email/read/${uid}?key=__ADMIN_KEY__`);
    const m=await r.json();
    const dt=m.timestamp?new Date(m.timestamp*1000).toLocaleString('de-DE',{dateStyle:'full',timeStyle:'short'}):'';
    content.innerHTML=`
      <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
        <h2 style="font-size:16px;margin-bottom:8px">${escHtml(m.subject)}</h2>
        <div style="font-size:12px;color:var(--muted)">
          <div><strong>From:</strong> ${escHtml(m.sender_name)} &lt;${escHtml(m.sender)}&gt;</div>
          <div><strong>To:</strong> ${escHtml(m.to)}</div>
          <div><strong>Date:</strong> ${dt}</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button onclick="replyToEmail('${escHtml(m.sender)}','${escHtml(m.subject).replace(/'/g,"\\'")}')" style="padding:4px 12px;border:1px solid var(--border);border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;background:var(--card)">↩ Reply</button>
          <button onclick="forwardEmail('${uid}')" style="padding:4px 12px;border:1px solid var(--border);border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;background:var(--card)">↗ Forward</button>
        </div>
      </div>
      <div style="font-size:13px;line-height:1.7;white-space:pre-wrap">${m.body_html?m.body_html:escHtml(m.body_text||'(No content)')}</div>
    `;
    loadEmails(); // refresh unread count
  }catch(e){
    content.innerHTML='<div style="padding:24px;color:var(--red)">Failed to load email</div>';
  }
}

function closeEmailPanel(){document.getElementById('emailPanel').classList.remove('open')}

function openCompose(to='',subject='',body=''){
  document.getElementById('composeTo').value=to;
  document.getElementById('composeSubject').value=subject;
  document.getElementById('composeBody').value=body;
  document.getElementById('composeStatus').textContent='';
  document.getElementById('composePanel').classList.add('open');
}

function closeCompose(){document.getElementById('composePanel').classList.remove('open')}

function replyToEmail(sender,subject){
  closeEmailPanel();
  const re=subject.startsWith('Re:')?subject:`Re: ${subject}`;
  openCompose(sender,re,'');
}

async function forwardEmail(uid){
  const to=prompt('Forward to email address:');
  if(!to)return;
  const comment=prompt('Add a comment (optional):','');
  try{
    const r=await fetch(`${location.origin}/admin/email/forward?key=__ADMIN_KEY__`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({uid,to,comment:comment||''})
    });
    if(r.ok)alert('Email forwarded!');
    else alert('Forward failed');
  }catch(e){alert('Forward failed: '+e)}
}

async function sendComposedEmail(){
  const to=document.getElementById('composeTo').value;
  const subject=document.getElementById('composeSubject').value;
  const body=document.getElementById('composeBody').value;
  const status=document.getElementById('composeStatus');
  const btn=document.getElementById('sendBtn');
  if(!to||!subject||!body){status.textContent='Please fill all fields';status.style.color='var(--red)';return}
  btn.disabled=true;btn.textContent='Sending...';
  try{
    const r=await fetch(`${location.origin}/admin/email/send?key=__ADMIN_KEY__`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({to,subject,body})
    });
    if(r.ok){status.textContent='✅ Sent!';status.style.color='var(--green)';setTimeout(closeCompose,1500);loadEmails()}
    else{const e=await r.json();status.textContent='Failed: '+(e.detail||'Unknown error');status.style.color='var(--red)'}
  }catch(e){status.textContent='Failed: '+e;status.style.color='var(--red)'}
  btn.disabled=false;btn.textContent='Send';
}

// Auto-refresh every 60 seconds
loadAll();
loadFeedback();
loadEmails();
setInterval(()=>{loadAll();loadFeedback();loadEmails()},60000);

// Keyboard: Escape closes panels
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDetail();closeEmailPanel();closeCompose()}});
</script>
</body>
</html>"""

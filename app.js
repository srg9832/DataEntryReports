"use strict";

// Static GitHub Pages client. This is a public publishable key, NEVER a service-role key.
// All member and record queries are authorized by server-side Supabase RPCs.
const SUPABASE_URL = "https://vosvdkkuiijywwmqzdiu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jlCywbu7vWBsZyw1dbfbvg_kezvqwvr";

const $ = (id) => document.getElementById(id);
const state = {
  client: null, user: null, isAdmin: false, units: [], report: null,
  loading: false, epoch: 0, grants: [], profiles: [], adminOpen: false,
  passwordRequired: false
};
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
})[ch]);
const monthKey = (date) => date ? String(date).slice(0,7) : "";
const monthOffset = (month, step) => {
  const [y,m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y,m-1+step,1));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth()+1).padStart(2,"0");
};
const monthLabel = (month) => {
  const [y,m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US",{month:"short",year:"numeric",timeZone:"UTC"})
    .format(new Date(Date.UTC(y,m-1,1)));
};
const dateLabel = (date) => {
  if (!date) return "Date unknown";
  const [y,m,d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"})
    .format(new Date(Date.UTC(y,m-1,d)));
};
const currentMonth = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
};
const sortedMembers = (members) => [...members].sort((a,b)=>
  String(a.last_name||"").localeCompare(String(b.last_name||"")) ||
  String(a.first_name||"").localeCompare(String(b.first_name||"")) ||
  String(a.capid||"").localeCompare(String(b.capid||""))
);
function errorMessage(err) { return err?.message || String(err || "An unexpected error occurred."); }
function showError(id, text) { $(id).textContent=text; $(id).classList.toggle("hidden",!text); }
function showFlash(msg) { showError("flash",msg); }
function showLogin() {
  $("login").classList.remove("hidden"); $("workspace").classList.add("hidden");
}
function showWorkspace() {
  $("login").classList.add("hidden"); $("workspace").classList.remove("hidden");
}
function setBusy(on,text) {
  state.loading=on;
  $("loadStatus").textContent=on?(text||"Loading…"):"";
  $("refresh").disabled=on;
  $("csv").disabled=on || !state.report;
  $("print").disabled=on || !state.report;
}
async function rpc(name,params) {
  const {data,error} = await state.client.rpc(name,params||{});
  if (error) throw error;
  return data;
}

async function signIn(event) {
  event.preventDefault();
  showError("loginError","");
  const button=$("loginButton");
  button.disabled=true;button.textContent="Signing in…";
  try {
    const {error}=await state.client.auth.signInWithPassword({
      email:$("email").value.trim(),password:$("password").value
    });
    if (error) throw error;
    $("password").value="";
    await enterApp();
  } catch(err) {showError("loginError",errorMessage(err));}
  finally {button.disabled=false;button.textContent="Sign in";}
}
async function enterApp() {
  const {data,error}=await state.client.auth.getUser();
  if (error || !data?.user) {showLogin();return;}
  state.user=data.user;
  const {data:profile}=await state.client.from("profiles")
    .select("display_name,must_change_password").eq("id",state.user.id).maybeSingle();
  $("accountName").textContent=profile?.display_name || data.user.email || "Signed in";
  state.passwordRequired=Boolean(profile?.must_change_password);
  const info=await rpc("data_entry_get_units");
  state.isAdmin=Boolean(info?.is_admin);
  state.units=Array.isArray(info?.units)?info.units:[];
  $("adminToggle").classList.toggle("hidden",!state.isAdmin);
  showWorkspace();
  renderUnits();
  if (state.passwordRequired) openPassword(true);
  if (state.units.length) await loadReport();
  else {
    $("reportPanel").classList.add("hidden");
    $("accessMessage").classList.remove("hidden");
    $("accessMessage").textContent="Your account has not been granted Data Entry Reports access. Ask a CAP Applications administrator to grant your unit.";
  }
}

function renderUnits() {
  const old=$("unit").value;
  const previous=localStorage.getItem("cap-dataentry-unit");
  $("unit").innerHTML=state.units.map(u =>
    '<option value="'+safe(u.id)+'">'+safe(u.charter_number || u.name || "Unit")+
    (u.charter_number && u.name?" — "+safe(u.name):"")+"</option>").join("");
  const preferred=[old,previous,state.units[0]?.id].find(x=>state.units.some(u=>u.id===x));
  if(preferred) $("unit").value=preferred;
  $("unit").disabled=state.units.length===0;
}
function selectedUnit() {return state.units.find(x=>x.id===$("unit").value);}
function canMark() {return Boolean(selectedUnit()?.can_mark);}
async function loadReport() {
  if (!state.user || !state.units.length || state.passwordRequired) return;
  const unitId=$("unit").value;
  const month=$("month").value;
  if (!unitId || !/^\d{4}-\d{2}$/.test(month)) return;
  localStorage.setItem("cap-dataentry-unit",unitId);
  const token=++state.epoch;
  setBusy(true,"Reading live records…");showFlash("");
  try {
    const [report,approvals]=await Promise.all([
      rpc("data_entry_get_report",{p_unit_id:unitId,p_month:month+"-01"}),
      rpc("data_entry_uniform_approvals",{p_unit_id:unitId,p_month:month+"-01"})
    ]);
    if (token!==state.epoch) return;
    state.report=report||{members:[],events:[]};
    // Inspection scores are NOT eServices entries. Only explicitly approved uniform reviews are.
    state.report.events=[
      ...(Array.isArray(report?.events)?report.events.filter(e=>e.kind!=="uniform"):[]),
      ...(Array.isArray(approvals)?approvals.filter(e=>e.kind==="uniform_approval"):[])
    ];
    $("reportPanel").classList.remove("hidden");$("accessMessage").classList.add("hidden");
    renderReport();
  } catch(err) {if(token===state.epoch){state.report=null;showFlash(errorMessage(err));$("reportBody").innerHTML="";}}
  finally{if(token===state.epoch) setBusy(false);}
}
const compactDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value||""));
  return match ? Number(match[2])+"/"+Number(match[3])+"/"+match[1].slice(2) : "—";
};
function makeRecord(record) {
  const posted = Boolean(record.is_posted);
  const headline = record.kind==="uniform_approval" ? "Approved" :
    record.kind==="feedback" ? (record.result||"Not recorded") : (record.score||"—");
  const subtitle = record.kind==="uniform_approval"
      ? (posted?"Entered in eServices":"Needs eServices Entry")+" · Approved "+compactDate(record.event_date)
      : record.kind==="feedback" ? (record.label||"Feedback")
      : [record.label,record.result].filter(Boolean).join(" · ");
  let pieces='<div class="record'+(posted?" posted":"")+'"><div class="record-line">'+
    '<span class="record-value">'+safe(headline)+'</span>'+
    '<span class="record-date">'+safe(compactDate(record.event_date))+'</span>';
  if(canMark()) {
    pieces+='<button type="button" class="record-action" data-action="post" data-type="'+safe(record.kind)+
      '" data-source="'+safe(record.source_id)+'" data-posted="'+(posted?"true":"false")+
      '" title="'+(posted?"Undo eServices entry":"Mark as entered in eServices")+
      '" aria-label="'+(posted?"Undo entered status":"Mark entered status")+
      ' for '+safe(record.kind)+' on '+safe(compactDate(record.event_date))+'">'+
      (posted?"✓ Entered":"Mark entered")+'</button>';
  } else {
    pieces+='<span class="record-result">'+(posted?"✓ Entered":"Pending")+'</span>';
  }
  pieces+='</div><div class="record-title">'+safe(subtitle)+'</div></div>';
  return pieces;
}
function reportMemberRows(filtered) {
  const month=$("month").value;
  const events=Array.isArray(state.report?.events)?state.report.events:[];
  const pendingOnly=$("pendingOnly").checked;
  const byCapid=new Map();
  for(const e of events) {
    if(monthKey(e.event_date)!==month) continue;
    const capid=String(e.capid||"").trim();
    if(!byCapid.has(capid)) byCapid.set(capid,[]);
    byCapid.get(capid).push(e);
  }
  const rows=[];
  for(const member of filtered) {
    const capid=String(member.capid||"").trim();
    const all=byCapid.get(capid)||[];
    // Default queue: show only the items still waiting for eServices entry.
    const visible=pendingOnly?all.filter(e=>!e.is_posted):all;
    if(!visible.length) continue; // Never show a roster-only row.
    const cell=kind=>{
      const records=visible.filter(e=>e.kind===kind);
      return records.length?records.map(makeRecord).join(""):'<span class="no-data">—</span>';
    };
    const name=[member.last_name,member.first_name].filter(Boolean).join(", ");
    rows.push('<tr><td class="capid">'+safe(capid)+'</td><td class="member-name">'+safe(name)+'</td>'+
      '<td>'+cell("feedback")+'</td><td>'+cell("drill")+'</td><td class="uniform-cell">'+
      cell("uniform_approval")+'</td></tr>');
  }
  return rows;
}
function renderReport() {
  if(!state.report) return;
  const month=$("month").value;
  const members=sortedMembers(Array.isArray(state.report.members)?state.report.members:[]);
  const events=Array.isArray(state.report.events)?state.report.events:[];
  const current=events.filter(e=>monthKey(e.event_date)===month);
  const pending=current.filter(e=>!e.is_posted);
  const entered=current.length-pending.length;
  const pendingMembers=new Set(pending.map(e=>String(e.capid))).size;
  const unit=selectedUnit();
  $("reportTitle").textContent=(unit?.charter_number||unit?.name||"Unit")+"  |  "+monthLabel(month);
  $("reportSubtitle").textContent=$("pendingOnly").checked
    ? "Pending eServices entries only — approvals from Uniform Review, feedback, and submitted drill tests."
    : "All reportable monthly entries (including those already entered). No raw uniform inspection history.";
  const metrics=[
    ["Members needing entry",pendingMembers],
    ["Pending entries",pending.length],
    ["Already entered",entered],
    ["Reportable entries",current.length]
  ];
  $("metrics").innerHTML=metrics.map(([label,value],i)=>
    '<div class="metric'+(i===1?" pending":"")+'"><span class="metric-label">'+safe(label)+
    ':</span><span class="metric-value">'+safe(value)+'</span></div>').join("");
  const q=$("search").value.trim().toLowerCase();
  const filtered=members.filter(m=>
    !q||[m.capid,m.first_name,m.last_name,(m.last_name||"")+", "+(m.first_name||"")]
      .some(value=>String(value||"").toLowerCase().includes(q)));
  const rows=reportMemberRows(filtered);
  $("reportBody").innerHTML=rows.length?rows.join("") :
    '<tr><td colspan="5" class="muted" style="text-align:center;padding:14px">'+
    ($("pendingOnly").checked?"No pending eServices entries for this selection.":"No reportable entries match this selection.")+
    '</td></tr>';
}

async function recordClick(event) {
  const button=event.target.closest('button[data-action="post"]');
  if(!button || state.loading || !state.user) return;
  const old=button.getAttribute("data-posted")==="true";
  const unit=$("unit").value, month=$("month").value;
  button.disabled=true;showFlash("");
  try {
    if(button.dataset.type==="uniform_approval"){
      await rpc("data_entry_set_uniform_posted",{
        p_unit_id:unit,p_feedback_id:button.dataset.source,p_is_posted:!old
      });
    }else{
      await rpc("data_entry_set_posted",{
        p_unit_id:unit,p_record_type:button.dataset.type,
        p_source_id:button.dataset.source,p_is_posted:!old
      });
    }
    if (unit===$("unit").value && month===$("month").value) await loadReport();
  } catch(err) {showFlash("Could not save eServices status: "+errorMessage(err));button.disabled=false;}
}
function csvField(value) {
  let content=String(value??"");
  // Prevent spreadsheet formula injection when user-controlled text is opened in Excel.
  if(/^[\s]*[=+\-@\t\r]/.test(content)) content="'"+content;
  return '"'+content.replace(/"/g,'""')+'"';
}
function exportCSV() {
  if(!state.report) return;
  const month=$("month").value;
  const events=Array.isArray(state.report.events)?state.report.events:[];
  const members=sortedMembers(state.report.members||[]);
  const pendingOnly=$("pendingOnly").checked;
  const header=["CAPID","Last name","First name","Feedback (Decision / Date)",
    "Drill (Test / Score / Date)","Uniform Approved (Review Date)",
    "Needs eServices entry","Entered records"];
  const rows=[header];
  for(const member of members){
    if($("search").value.trim()&&![
      member.capid,member.first_name,member.last_name,
      (member.last_name||"")+", "+(member.first_name||"")
    ].some(s=>String(s||"").toLowerCase().includes($("search").value.trim().toLowerCase())))continue;
    const entries=events.filter(e=>String(e.capid)===String(member.capid)&&monthKey(e.event_date)===month);
    const visible=pendingOnly?entries.filter(e=>!e.is_posted):entries;
    if(!visible.length)continue;
    const fmt=kind=>visible.filter(e=>e.kind===kind)
      .map(e=>[e.label,e.score,e.result,dateLabel(e.event_date),
        e.is_posted?"Entered":"Needs entry"].filter(Boolean).join(" · ")).join("; ");
    const approved=visible.filter(e=>e.kind==="uniform_approval")
      .map(e=>"Approved on "+dateLabel(e.event_date)+
        " · Inspection "+dateLabel(e.inspection_date)+
        " · "+(e.is_posted?"Entered":"Needs eServices entry")).join("; ");
    rows.push([member.capid,member.last_name,member.first_name,fmt("feedback"),fmt("drill"),
      approved,visible.filter(e=>!e.is_posted).length,visible.filter(e=>e.is_posted).length]);
  }
  const csv="\uFEFF"+rows.map(row=>row.map(csvField).join(",")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download="CAP_Data_Entry_"+String(selectedUnit()?.charter_number||"unit").replace(/[^a-zA-Z0-9_-]/g,"_")+
    "_"+month+".csv";
  document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function openPassword(required=false) {
  state.passwordRequired=Boolean(required);
  $("passwordHelp").textContent=required ?
    "Your account requires a new password before you can use the reports." :
    "Update your shared CAP Applications login password.";
  $("cancelPassword").classList.toggle("hidden",required);
  $("passwordError").classList.add("hidden");$("passwordForm").reset();
  $("passwordDialog").showModal();
}
async function savePassword(e) {
  e.preventDefault();
  showError("passwordError","");
  const a=$("newPassword").value,b=$("confirmPassword").value;
  if(a.length<8||a!==b){showError("passwordError","Passwords must match and be at least 8 characters.");return;}
  try {
    const {error}=await state.client.auth.updateUser({password:a});
    if(error) throw error;
    const {error:profileError}=await state.client.from("profiles").update({
      must_change_password:false,password_changed_at:new Date().toISOString()
    }).eq("id",state.user.id);
    if(profileError) throw profileError;
    state.passwordRequired=false;
    $("passwordDialog").close();
    if(state.units.length) await loadReport();
  }catch(err){showError("passwordError",errorMessage(err));}
}
async function openAdmin() {
  if(!state.isAdmin) return;
  state.adminOpen=!state.adminOpen;
  $("adminPanel").classList.toggle("hidden",!state.adminOpen);
  if(state.adminOpen) await loadGrants();
}
async function loadGrants() {
  showError("grantError","");
  const [users,grants,units]=await Promise.all([
    state.client.from("profiles").select("id,display_name,first_name,last_name,capid").order("display_name"),
    state.client.from("data_entry_access").select("user_id,unit_id,can_mark"),
    state.client.from("units").select("id,charter_number,name").order("charter_number")
  ]);
  if(users.error||grants.error||units.error){
    showError("grantError",errorMessage(users.error||grants.error||units.error));return;
  }
  state.profiles=users.data||[];
  state.grants=grants.data||[];
  const profileName=p=>p.display_name||
    ([p.last_name,p.first_name].filter(Boolean).join(", "))||p.capid||p.id.slice(0,8);
  $("grantUser").innerHTML=state.profiles.map(p=>
    '<option value="'+safe(p.id)+'">'+safe(profileName(p))+'</option>').join("");
  $("grantUnit").innerHTML=(units.data||[]).map(u=>
    '<option value="'+safe(u.id)+'">'+safe((u.charter_number||u.name)+" — "+(u.name||""))+"</option>").join("");
  const m=new Map(state.profiles.map(p=>[p.id,profileName(p)]));
  const um=new Map((units.data||[]).map(u=>[u.id,u.charter_number||u.name]));
  $("grantsBody").innerHTML=state.grants.length?state.grants.map(g=>
    '<tr><td>'+safe(m.get(g.user_id)||"Unknown user")+'</td><td>'+safe(um.get(g.unit_id)||"Unknown unit")+
    '</td><td>'+(g.can_mark?"View & mark":"View only")+'</td>'+
    '<td><button data-action="revoke" data-user="'+safe(g.user_id)+'" data-unit="'+safe(g.unit_id)+
    '" type="button" class="secondary">Revoke</button></td></tr>').join("") :
    '<tr><td colspan="4" class="muted">No dedicated access grants yet. Application administrators always have full access.</td></tr>';
}
async function saveGrant(e) {
  e.preventDefault();if(!state.isAdmin)return;showError("grantError","");
  const user_id=$("grantUser").value,unit_id=$("grantUnit").value;
  if(!user_id||!unit_id)return;
  const {error}=await state.client.from("data_entry_access").upsert({
    user_id,unit_id,can_mark:$("grantCanMark").checked,granted_by:state.user.id,
    granted_at:new Date().toISOString()
  },{onConflict:"user_id,unit_id"});
  if(error) showError("grantError",errorMessage(error));
  else await loadGrants();
}
async function revokeGrant(e) {
  const b=e.target.closest('button[data-action="revoke"]');
  if(!b||!state.isAdmin)return;
  if(!confirm("Revoke reporting access for this account and unit?"))return;
  const {error}=await state.client.from("data_entry_access").delete()
    .eq("user_id",b.dataset.user).eq("unit_id",b.dataset.unit);
  if(error)showError("grantError",errorMessage(error));
  else await loadGrants();
}
async function signOut() {
  await state.client.auth.signOut();
  state.user=null;state.report=null;state.units=[];state.isAdmin=false;state.epoch++;
  state.adminOpen=false;
  $("adminPanel").classList.add("hidden");showLogin();
}
async function init() {
  $("month").value=currentMonth();
  $("pendingOnly").checked=true;
  if(!window.supabase?.createClient){
    showError("loginError","The login library did not load. Check your internet connection and refresh.");return;
  }
  state.client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  $("loginForm").addEventListener("submit",signIn);
  $("logout").addEventListener("click",signOut);
  $("unit").addEventListener("change",loadReport);
  $("month").addEventListener("change",loadReport);
  $("search").addEventListener("input",renderReport);
  $("pendingOnly").addEventListener("change",renderReport);
  $("refresh").addEventListener("click",loadReport);
  $("reportBody").addEventListener("click",recordClick);
  $("csv").addEventListener("click",exportCSV);
  $("print").addEventListener("click",()=>window.print());
  $("adminToggle").addEventListener("click",openAdmin);
  $("closeAdmin").addEventListener("click",()=>{state.adminOpen=false;$("adminPanel").classList.add("hidden");});
  $("grantForm").addEventListener("submit",saveGrant);
  $("grantsBody").addEventListener("click",revokeGrant);
  $("passwordButton").addEventListener("click",()=>openPassword(false));
  $("cancelPassword").addEventListener("click",()=>$("passwordDialog").close());
  $("passwordForm").addEventListener("submit",savePassword);
  $("passwordDialog").addEventListener("cancel",e=>{if(state.passwordRequired)e.preventDefault();});
  state.client.auth.onAuthStateChange((event)=>{
    if(event==="SIGNED_OUT"&&state.user) {
      state.user=null;state.report=null;state.units=[];state.epoch++;showLogin();
    }
  });
  const {data,error}=await state.client.auth.getSession();
  if(!error&&data?.session) {
    try{await enterApp();}catch(err){showLogin();showError("loginError",errorMessage(err));}
  } else showLogin();
}
window.addEventListener("DOMContentLoaded",init);

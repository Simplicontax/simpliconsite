import type { Provider, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabase';

type Role = 'client' | 'team' | 'admin';
type TicketStatus = 'new' | 'open' | 'work_in_progress' | 'pending' | 'pending_for_review' | 'waiting_for_client' | 'completed' | 'waiting_on_client' | 'in_review' | 'ready_for_review' | 'complete';
type WorkspaceView = 'tickets' | 'documents' | 'users' | 'organizer';
type Profile = { id:string; email:string; fullName:string; phone:string; jobTitle:string; role:Role; active:boolean; frozenAt?:string|null; removedAt?:string|null };
type Activity = { id:string; authorId:string; author:string; authorInitials:string; text:string; time:string; createdAt:string; system:boolean };
type TicketDocument = { id:string; name:string; size:string; type:string; uploadedBy:string; uploadedById:string; createdAt?:string; storagePath?:string };
type Ticket = {
  id:string; number:string; title:string; country:string; year:string; status:TicketStatus; priority:string;
  assigneeId:string; assigneeName:string; requesterId:string; requesterName:string; updated:string; description:string;
  activities:Activity[]; documents:TicketDocument[];
};
type DbProfile = { id:string; email:string; full_name:string; phone:string|null; job_title:string|null; role:Role; active:boolean; frozen_at?:string|null; removed_at?:string|null };
type DbTicket = { id:string; ticket_number:string; requester_id:string; requester_email:string|null; requester_name:string|null; subject:string; description:string; country:string; tax_year:number; status:TicketStatus; priority:string; assigned_to:string|null; updated_at:string };
type DbComment = { id:string; ticket_id:string; author_id:string; body:string; is_system:boolean; created_at:string };
type DbDocument = { id:string; ticket_id:string; uploaded_by:string; storage_path:string; file_name:string; size_bytes:number; document_type:string|null; created_at:string };
type TaxOrganizer = { storagePath:string; fileName:string; mimeType:string; sizeBytes:number; updatedAt:string };
type DbOrganizer = { storage_path:string; file_name:string; mime_type:string; size_bytes:number; updated_at:string };
type PortalCache = { version:number; userId:string; savedAt:number; profile:Profile; tickets:Ticket[]; profiles:Profile[]; organizer:TaxOrganizer|null; selectedTicketId:string };


const TAX_ORGANIZER_BUCKET = 'tax-organizers';
const TAX_ORGANIZER_PATH = 'current/Simplicon-Tax-Organizer.xlsx';
const PORTAL_CACHE_VERSION = 2;
const PORTAL_CACHE_MAX_AGE = 30 * 60 * 1000;
const PORTAL_CACHE_PREFIX = 'simplicon.portal.workspace.';
const blockedExtensions = new Set(['bat','cmd','com','exe','msi','msp','scr','ps1','psm1','vbs','vbe','js','jse','jar','sh','bash','zsh','ksh','csh','apk','app','dmg','iso','reg','dll','sys','lnk','url','php','phtml','py','pyc','rb','pl','cgi','wasm','html','htm','svg','env','htaccess','docm','xlsm','pptm','mp4','mov','avi','mkv','webm','wmv','m4v','mpeg','mpg','3gp','flv','ogv']);
const blockedMimeTypes = new Set(['application/x-msdownload','application/x-dosexec','application/x-executable','application/x-sh','application/x-bat','application/java-archive','application/vnd.microsoft.portable-executable','text/html','image/svg+xml','application/wasm']);

let tickets:Ticket[] = [];
let currentProfile:Profile|null = null;
let teamMembers:Profile[] = [];
let profilesDirectory:Profile[] = [];
let activeUserDirectoryTab:'clients'|'team' = 'clients';
let pendingUserAction:{memberId:string;action:'freeze'|'unfreeze'|'remove'}|null = null;
let pendingDeleteDocumentId = '';
let selectedTicketId = '';
let activeFilter = 'all';
let authMode:'signin'|'signup' = 'signin';
let organizerGatePending = false;
let workspaceEntryInFlight = false;
let currentOrganizer:TaxOrganizer|null = null;
let accessCheckInFlight = false;
const readNotificationIds = new Set<string>();
let realtimeChannel: { unsubscribe: () => unknown }|null = null;
let realtimeRefreshTimer:number|undefined;
let ticketReplySyncTimer:number|undefined;
let ticketReplySyncInFlight=false;
let lastTicketReplySyncSignature='';

function portalCacheKey(userId:string):string { return `${PORTAL_CACHE_PREFIX}${userId}`; }
function clearWorkspaceCache(userId?:string):void {
  try{if(userId)sessionStorage.removeItem(portalCacheKey(userId));}
  catch{/* Storage can be unavailable in privacy modes. */}
}
function persistWorkspaceCache():void {
  if(!currentProfile)return;
  const payload:PortalCache={version:PORTAL_CACHE_VERSION,userId:currentProfile.id,savedAt:Date.now(),profile:currentProfile,tickets,profiles:profilesDirectory,organizer:currentOrganizer,selectedTicketId};
  try{sessionStorage.setItem(portalCacheKey(currentProfile.id),JSON.stringify(payload));}
  catch{/* Fresh network data remains the fallback. */}
}
function restoreWorkspaceCache(user:User):boolean {
  try{
    const raw=sessionStorage.getItem(portalCacheKey(user.id));if(!raw)return false;
    const cached=JSON.parse(raw) as Partial<PortalCache>;
    if(cached.version!==PORTAL_CACHE_VERSION||cached.userId!==user.id||!cached.profile||!Array.isArray(cached.tickets)||!Array.isArray(cached.profiles)||typeof cached.savedAt!=='number'||Date.now()-cached.savedAt>PORTAL_CACHE_MAX_AGE){clearWorkspaceCache(user.id);return false;}
    if(cached.profile.email.toLowerCase()!==(user.email??'').toLowerCase()||!cached.profile.active||cached.profile.removedAt){clearWorkspaceCache(user.id);return false;}
    currentProfile=cached.profile;tickets=cached.tickets;profilesDirectory=cached.profiles;teamMembers=profilesDirectory.filter((profile)=>profile.role==='team'&&profile.active&&!profile.removedAt);currentOrganizer=cached.organizer??null;selectedTicketId=cached.selectedTicketId??tickets[0]?.id??'';
    return true;
  }catch{clearWorkspaceCache(user.id);return false;}
}

const el = <T extends HTMLElement>(id:string):T => {
  const node=document.getElementById(id);
  if(!node) throw new Error(`Missing element: ${id}`);
  return node as T;
};
const ticketList=el<HTMLDivElement>('ticketList');
const ticketDetail=el<HTMLDivElement>('ticketDetail');
const ticketEmpty=el<HTMLDivElement>('ticketEmpty');
const activityList=el<HTMLDivElement>('activityList');
const documentList=el<HTMLDivElement>('documentList');
const fileInput=el<HTMLInputElement>('fileInput');
const documentType=el<HTMLSelectElement>('documentType');
const toast=el<HTMLDivElement>('toast');

function escapeHtml(value:string):string { const node=document.createElement('div'); node.textContent=value; return node.innerHTML; }
function initials(name:string):string { return name.split(' ').filter(Boolean).map((part)=>part[0]).join('').slice(0,2).toUpperCase(); }
function countryCode(country:string):string { return ({'United States':'US','United Kingdom':'UK','Canada':'CA','India':'IN'} as Record<string,string>)[country]??'GL'; }
function statusLabel(status:TicketStatus):string { return ({new:'New',open:'Open',work_in_progress:'Work in Progress',pending:'Pending',pending_for_review:'Pending for Review',waiting_for_client:'Waiting for Client',completed:'Completed',waiting_on_client:'Waiting for Client',in_review:'Work in Progress',ready_for_review:'Pending for Review',complete:'Completed'} as Record<TicketStatus,string>)[status]; }
function isCompleted(status:TicketStatus):boolean { return status==='completed'||status==='complete'; }
function workflowStatusValue(status:TicketStatus):TicketStatus { return ({waiting_on_client:'waiting_for_client',in_review:'work_in_progress',ready_for_review:'pending_for_review',complete:'completed'} as Partial<Record<TicketStatus,TicketStatus>>)[status]??status; }
function roleLabel(role:Role):string { return role==='admin'?'Administrator':role==='team'?'Team member':'Client'; }
function fileLabel(name:string):string { return (name.split('.').pop()??'FILE').toUpperCase().slice(0,4); }
function formatBytes(bytes:number):string { if(bytes<1024)return `${bytes} B`;if(bytes<1048576)return `${Math.round(bytes/1024)} KB`;return `${(bytes/1048576).toFixed(1)} MB`; }
function formatTime(value:string):string { return new Intl.DateTimeFormat('en',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)); }
function greetingForHour(hour:number):string { if(hour<12)return 'Good morning';if(hour<17)return 'Good afternoon';return 'Good evening'; }
function updateLocalGreeting():void { const node=document.getElementById('greetingText');if(node)node.textContent=greetingForHour(new Date().getHours()); }
async function verifyCurrentAccess():Promise<void> {
  if(!supabase||!currentProfile||accessCheckInFlight)return;accessCheckInFlight=true;
  try{const {data,error}=await supabase.from('profiles').select('active,removed_at').eq('id',currentProfile.id).single();if(error)return;if(!data.active||data.removed_at){clearWorkspaceCache(currentProfile.id);await supabase.auth.signOut({scope:'local'});currentProfile=null;finishBootstrap(true);showToast('Your workspace access has been disabled. Contact the administrator.',true);}}
  finally{accessCheckInFlight=false;}
}
function selectedTicket():Ticket|undefined { return tickets.find((ticket)=>ticket.id===selectedTicketId); }
function showToast(message:string,error=false):void { toast.textContent=message;toast.classList.toggle('error',error);toast.classList.add('show');window.setTimeout(()=>toast.classList.remove('show'),3400); }
async function notifyTicketParticipants(ticketId:string):Promise<boolean> {
  if(!supabase)return false;
  try{
    const {data:{session}}=await supabase.auth.getSession();if(!session)return false;
    const response=await fetch('/api/ticket-notification',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({ticketId})});
    const isJson=response.headers.get('content-type')?.includes('application/json');
    const payload=isJson?await response.json().catch(()=>null) as {error?:unknown;detail?:unknown}|null:null;
    if(!response.ok){console.error('Ticket email notification failed:',response.status,typeof payload?.error==='string'?payload.error:'Unknown notification error',typeof payload?.detail==='string'?payload.detail:'');return false;}
    if(!isJson){console.error('Ticket email notification failed: non-JSON response');return false;}
    return true;
  }catch(error){console.error('Ticket email notification failed:',error);return false;}
}
async function syncTicketEmailReplies(announce=false):Promise<boolean> {
  if(!supabase||currentProfile?.role!=='admin'||ticketReplySyncInFlight)return false;
  ticketReplySyncInFlight=true;
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){el<HTMLElement>('replySyncStatus').textContent='Sync paused: session expired. Please sign in again.';return false;}
    const controller=new AbortController();
    const timeoutId=window.setTimeout(()=>controller.abort(),30000);
    let response:Response;
    try{
      response=await fetch('/api/sync-ticket-replies',{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+session.access_token},signal:controller.signal});
    }catch(fetchError){
      el<HTMLElement>('replySyncStatus').textContent=fetchError instanceof Error&&fetchError.name==='AbortError'?'Mailbox check is taking longer than expected. Retrying…':'Sync error: '+(fetchError instanceof Error?fetchError.message:'Network error');
      return false;
    }finally{window.clearTimeout(timeoutId);}
    if(!response.ok){
      const errText=await response.text();
      console.error('Ticket reply sync failed:',response.status,errText);
      el<HTMLElement>('replySyncStatus').textContent='Mailbox sync failed ('+response.status+') — '+errText.slice(0,120);
      return false;
    }
    const result=await response.json() as {mailbox?:string;imported?:number;scanned?:number;skipped?:Record<string,number>};
      const signature=JSON.stringify(result);if(signature!==lastTicketReplySyncSignature){console.log('Ticket reply sync result:',result);lastTicketReplySyncSignature=signature;}
      const skip=result.skipped??{};
      const skipParts=Object.entries(skip).filter(([,n])=>n>0).map(([k,n])=>`${k}:${n}`).join(', ');
      const ts=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      el<HTMLElement>('replySyncStatus').textContent=
        `📬 ${result.mailbox??'?'} · scanned ${result.scanned??0} · imported ${result.imported??0}`+
        (skipParts?` · skipped (${skipParts})`:``) +
        ` · ${ts}`;
      if(result.imported){await refreshTicketData();if(announce)showToast(String(result.imported)+' email '+(result.imported===1?'reply was':'replies were')+' added to ticket chat.');}
      return true;
    }catch(error){console.error('Ticket reply sync failed:',error);el<HTMLElement>('replySyncStatus').textContent=`Sync error: ${error instanceof Error?error.message:'Unknown'}`;return false;}
    finally{ticketReplySyncInFlight=false;}
  }
  function startTicketReplySync():void {
    stopTicketReplySync();
    const bar=document.getElementById('replySyncBar');
    if(currentProfile?.role==='admin'&&bar)bar.classList.remove('hidden');
    const run=()=>{
      if(currentProfile?.role!=='admin'||document.visibilityState!=='visible')return;
      void syncTicketEmailReplies(false);
    };
    console.warn('Ticket reply polling started:',{role:currentProfile?.role??'none',intervalMs:35000});
    run();
    ticketReplySyncTimer=window.setInterval(run,35000);
  }

function stopTicketReplySync():void { if(ticketReplySyncTimer)window.clearInterval(ticketReplySyncTimer);ticketReplySyncTimer=undefined; }
function subscribeToTicketComments():void {
  realtimeChannel?.unsubscribe();realtimeChannel=null;if(!supabase||!currentProfile)return;
  realtimeChannel=supabase.channel('ticket-comments:'+currentProfile.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'ticket_comments'},()=>{
    if(realtimeRefreshTimer)window.clearTimeout(realtimeRefreshTimer);realtimeRefreshTimer=window.setTimeout(()=>void refreshTicketData(),120);
  }).subscribe();
}
async function refreshTicketData():Promise<void> {
  const previousTicketId=selectedTicketId;try{await loadSupabaseData();if(tickets.some((ticket)=>ticket.id===previousTicketId))selectedTicketId=previousTicketId;renderAll();}catch(error){console.error('Unable to refresh live ticket activity:',error);}
}
function setButtonLoading(button:HTMLButtonElement,busy:boolean,label='Working…'):void {
  if(busy){button.dataset.originalHtml=button.innerHTML;button.disabled=true;button.classList.add('is-loading');button.innerHTML=`<span class="round-spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`;return;}
  button.disabled=false;button.classList.remove('is-loading');if(button.dataset.originalHtml){button.innerHTML=button.dataset.originalHtml;delete button.dataset.originalHtml;}
}
function finishBootstrap(showAuth=false):void {
  document.body.classList.remove('app-initializing');el<HTMLElement>('appBootstrap').classList.add('hidden');
  if(showAuth){el<HTMLElement>('portalApp').classList.add('hidden');el<HTMLElement>('authShell').classList.remove('hidden');closeAccountMenu();}
}
function closeAccountMenu():void { const menu=document.getElementById('accountMenu');const button=document.getElementById('accountMenuButton');menu?.classList.add('hidden');button?.setAttribute('aria-expanded','false'); }
function showOrganizerGate():void {
  if(currentProfile?.role!=='client'||!organizerGatePending)return;organizerGatePending=false;window.setTimeout(()=>{const dialog=el<HTMLDialogElement>('organizerGateDialog');if(!dialog.open)dialog.showModal();},0);
}

function setAuthMode(mode:'signin'|'signup'):void {
  authMode=mode;
  el<HTMLElement>('authShell').dataset.authMode=mode;
  document.querySelectorAll<HTMLButtonElement>('[data-auth-mode]').forEach((button)=>button.classList.toggle('active',button.dataset.authMode===mode));
  const signinLink=el<HTMLAnchorElement>('authHeaderSignin');const signupLink=el<HTMLAnchorElement>('authHeaderSignup');
  signinLink.classList.toggle('active',mode==='signin');signupLink.classList.toggle('active',mode==='signup');
  signinLink.setAttribute('aria-current',mode==='signin'?'page':'false');signupLink.setAttribute('aria-current',mode==='signup'?'page':'false');
  document.querySelectorAll<HTMLElement>('.signup-field').forEach((field)=>field.classList.toggle('hidden',mode==='signin'));
  el<HTMLElement>('authTitle').textContent=mode==='signin'?'Sign in to your workspace':'Create your account';
  el<HTMLElement>('authSubtitle').textContent=mode==='signin'?'Use the email address connected to your account.':'Create your secure client workspace.';
  el<HTMLButtonElement>('authSubmit').innerHTML=mode==='signin'?'Sign in securely <span>→</span>':'Create secure account <span>→</span>';
  el<HTMLInputElement>('authName').required=mode==='signup';
  el<HTMLInputElement>('authPassword').autocomplete=mode==='signin'?'current-password':'new-password';
}

async function authenticate(event:SubmitEvent):Promise<void> {
  event.preventDefault();
  if(!supabase){showToast('The secure workspace is unavailable.',true);return;}
  const submitButton=el<HTMLButtonElement>('authSubmit');setButtonLoading(submitButton,true,authMode==='signin'?'Signing in…':'Creating account…');
  const email=el<HTMLInputElement>('authEmail').value.trim().toLowerCase();
  const password=el<HTMLInputElement>('authPassword').value;
  try {
    if(authMode==='signin'){
      const {data,error}=await supabase.auth.signInWithPassword({email,password});
      if(error||!data.user)throw error??new Error('Unable to sign in.');
      organizerGatePending=true;await enterAuthenticatedWorkspace(data.user);
    }else{
      const fullName=el<HTMLInputElement>('authName').value.trim();
      const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:fullName},emailRedirectTo:`${window.location.origin}/portal.html`}});
      if(error)throw error;
      if(data.session&&data.user){organizerGatePending=true;await enterAuthenticatedWorkspace(data.user);}
      else showToast('Check your email to confirm your client account.');
    }
  }catch(error){showToast(error instanceof Error?error.message:'Authentication failed.',true);}finally{setButtonLoading(submitButton,false);}
}

async function authenticateWithProvider(provider:Provider,button:HTMLButtonElement):Promise<void> {
  if(!supabase){showToast('The secure workspace is unavailable.',true);return;}
  const originalHtml=button.innerHTML;button.disabled=true;button.setAttribute('aria-busy','true');button.innerHTML='<span class="round-spinner" aria-hidden="true"></span>';
  try{
    const {error}=await supabase.auth.signInWithOAuth({provider,options:{redirectTo:window.location.origin+'/portal.html'}});
    if(error)throw error;
  }catch(error){showToast(error instanceof Error?error.message:'Unable to continue with '+provider+'.',true);button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML=originalHtml;}
}

async function enterAuthenticatedWorkspace(user:User):Promise<void> {
  if(!supabase||workspaceEntryInFlight)return;workspaceEntryInFlight=true;
  try{const {data,error}=await supabase.from('profiles').select('id,email,full_name,phone,job_title,role,active,frozen_at,removed_at').eq('id',user.id).single();
    if(error)throw error;
    if(!data){showToast('Your profile is not ready. Contact the administrator.',true);await supabase.auth.signOut();return;}
    const row=data as DbProfile;
    if(!row.active||row.removed_at){clearWorkspaceCache(user.id);showToast('This account is inactive. Contact the administrator.',true);await supabase.auth.signOut();return;}
    currentProfile={id:row.id,email:row.email,fullName:row.full_name,phone:row.phone??'',jobTitle:row.job_title??'',role:row.role,active:row.active,frozenAt:row.frozen_at,removedAt:row.removed_at};
    await loadSupabaseData();subscribeToTicketComments();showWorkspace();startTicketReplySync();
  }catch(error){const showingCached=!el<HTMLElement>('portalApp').classList.contains('hidden');if(!showingCached)finishBootstrap(true);showToast(showingCached?'Showing recently cached workspace data while reconnecting.':error instanceof Error?error.message:'Unable to load your workspace.',true);}finally{workspaceEntryInFlight=false;}
}

function showWorkspace():void {
  if(!currentProfile)return;
  loadReadNotifications();
  document.body.dataset.role=currentProfile.role;
  el<HTMLElement>('authShell').classList.add('hidden');
  el<HTMLElement>('portalApp').classList.remove('hidden');
  finishBootstrap();
  el<HTMLElement>('profileName').textContent=currentProfile.fullName;
  el<HTMLElement>('profileRole').textContent=`${roleLabel(currentProfile.role)} workspace`;
  el<HTMLElement>('greetingName').textContent=currentProfile.fullName.split(' ')[0];updateLocalGreeting();
  el<HTMLElement>('topbarProfileName').textContent=currentProfile.fullName;el<HTMLElement>('topbarProfileRole').textContent=roleLabel(currentProfile.role);el<HTMLElement>('accountMenuEmail').textContent=currentProfile.email;
  el<HTMLElement>('topbarRole').textContent=`${roleLabel(currentProfile.role)} access`;el<HTMLElement>('overviewRole').textContent=roleLabel(currentProfile.role);
  document.querySelectorAll<HTMLElement>('.sidebar-profile .avatar,#topbarAvatar').forEach((avatar)=>avatar.textContent=initials(currentProfile!.fullName));
  if(!tickets.some((ticket)=>ticket.id===selectedTicketId))selectedTicketId=tickets[0]?.id??'';
  renderAssigneeOptions();renderUserDirectory();renderAll();switchView('tickets');showOrganizerGate();
}

async function loadSupabaseData():Promise<void> {
  if(!supabase||!currentProfile)return;
  const [{data:ticketRows,error:ticketError},{data:profileRows,error:profileError},{data:organizerRow,error:organizerError}]=await Promise.all([
    supabase.from('tickets').select('*').order('updated_at',{ascending:false}),
    supabase.from('profiles').select('*'),
    supabase.from('tax_organizer_templates').select('storage_path,file_name,mime_type,size_bytes,updated_at').eq('id','current').maybeSingle(),
  ]);
  if(ticketError)throw ticketError;if(profileError)throw profileError;
  if(organizerError&&!['42P01','PGRST205'].includes(organizerError.code))throw organizerError;
  const organizer=organizerRow as DbOrganizer|null;currentOrganizer=organizer?{storagePath:organizer.storage_path,fileName:organizer.file_name,mimeType:organizer.mime_type,sizeBytes:organizer.size_bytes,updatedAt:organizer.updated_at}:null;
  const profiles:Profile[]=((profileRows??[]) as DbProfile[]).map((row)=>({id:row.id,email:row.email,fullName:row.full_name,phone:row.phone??'',jobTitle:row.job_title??'',role:row.role,active:row.active,frozenAt:row.frozen_at,removedAt:row.removed_at}));
  profilesDirectory=profiles;teamMembers=profiles.filter((profile)=>profile.role==='team'&&profile.active&&!profile.removedAt);
  const profileMap=new Map(profiles.map((profile)=>[profile.id,profile]));profileMap.set(currentProfile.id,currentProfile);
  const rows=(ticketRows??[]) as DbTicket[];
  const ticketIds=rows.map((row)=>row.id);
  const [{data:commentRows,error:commentError},{data:documentRows,error:documentError}]=ticketIds.length?await Promise.all([
    supabase.from('ticket_comments').select('*').in('ticket_id',ticketIds).order('created_at',{ascending:false}).order('id',{ascending:false}),
    supabase.from('ticket_documents').select('*').in('ticket_id',ticketIds).order('created_at',{ascending:false}),
  ]):[{data:[],error:null},{data:[],error:null}];
  if(commentError)throw commentError;if(documentError)throw documentError;
  const comments=(commentRows??[]) as DbComment[];const documents=(documentRows??[]) as DbDocument[];
  tickets=rows.map((row)=>({
    id:row.id,number:row.ticket_number,title:row.subject,country:row.country,year:String(row.tax_year),status:row.status,priority:row.priority,requesterId:row.requester_id,
    requesterName:row.requester_name??profileMap.get(row.requester_id)?.fullName??'Client',assigneeId:row.assigned_to??'',assigneeName:row.assigned_to?profileMap.get(row.assigned_to)?.fullName??'Assigned specialist':'Admin queue',updated:formatTime(row.updated_at),description:row.description,
    activities:comments.filter((comment)=>comment.ticket_id===row.id).map((comment)=>{const author=profileMap.get(comment.author_id);return{id:comment.id,authorId:comment.author_id,author:comment.is_system?'Simplicon':author?.fullName??'User',authorInitials:comment.is_system?'S':initials(author?.fullName??'User'),text:comment.body,time:formatTime(comment.created_at),createdAt:comment.created_at,system:comment.is_system};}),
    documents:documents.filter((document)=>document.ticket_id===row.id).map((document)=>({id:document.id,name:document.file_name,size:formatBytes(document.size_bytes),type:document.document_type??'Client upload',uploadedBy:profileMap.get(document.uploaded_by)?.fullName??'User',uploadedById:document.uploaded_by,createdAt:formatTime(document.created_at),storagePath:document.storage_path})),
  }));
  selectedTicketId=tickets[0]?.id??'';
  persistWorkspaceCache();
}

function renderAll():void { renderCounts();renderTickets();renderDetail();renderGlobalDocuments();renderNotifications();renderOrganizer(); }

function renderCounts():void {
  const active=tickets.filter((ticket)=>!isCompleted(ticket.status)).length;
  const complete=tickets.filter((ticket)=>isCompleted(ticket.status)).length;
  const documents=tickets.reduce((sum,ticket)=>sum+ticket.documents.length,0);
  el<HTMLElement>('ticketNavCount').textContent=String(tickets.length);el<HTMLElement>('documentNavCount').textContent=String(documents);
  el<HTMLElement>('overviewTotalCount').textContent=String(tickets.length);el<HTMLElement>('overviewActiveCount').textContent=String(active);el<HTMLElement>('overviewDocumentCount').textContent=String(documents);
  const filterButtons=document.querySelectorAll<HTMLButtonElement>('[data-filter]');
  [tickets.length,active,complete].forEach((count,index)=>{const badge=filterButtons[index]?.querySelector('span');if(badge)badge.textContent=String(count);});
}

function renderOrganizer():void {
  const available=Boolean(currentOrganizer);
  el<HTMLElement>('organizerFileName').textContent=currentOrganizer?.fileName??'Tax organizer not uploaded';
  el<HTMLElement>('organizerFileSize').textContent=currentOrganizer?formatBytes(currentOrganizer.sizeBytes):'—';
  el<HTMLElement>('organizerUpdatedLabel').textContent=currentOrganizer?`Updated ${formatTime(currentOrganizer.updatedAt)}`:'Organizer upload required';
  document.querySelectorAll<HTMLButtonElement>('[data-organizer-download]').forEach((button)=>{
    button.disabled=!available;
    button.title=available?'Download secure organizer':'The administrator has not uploaded the organizer yet';
  });
  const replaceButton=el<HTMLButtonElement>('replaceOrganizerButton');
  replaceButton.textContent=available?'Replace organizer':'Upload organizer';
}

async function downloadTaxOrganizer(button:HTMLButtonElement):Promise<void> {
  if(!currentOrganizer){showToast('The tax organizer has not been uploaded yet.',true);return;}
  if(!supabase){showToast('The secure file service is unavailable.',true);return;}
  setButtonLoading(button,true,'Preparing…');
  try{
    const {data,error}=await supabase.storage.from(TAX_ORGANIZER_BUCKET).createSignedUrl(currentOrganizer.storagePath,120,{download:currentOrganizer.fileName});
    if(error||!data?.signedUrl){showToast(error?.message??'Unable to prepare the organizer download.',true);return;}
    const link=document.createElement('a');link.href=data.signedUrl;link.rel='noopener noreferrer';link.click();
  }finally{setButtonLoading(button,false);}
}

async function replaceTaxOrganizer(file:File):Promise<void> {
  if(currentProfile?.role!=='admin'){showToast('Only the administrator can replace the tax organizer.',true);return;}
  if(!supabase){showToast('The secure workspace is unavailable.',true);return;}
  const extension=file.name.split('.').pop()?.toLowerCase();
  if(!extension||!['xlsx','xls'].includes(extension)){showToast('Upload an Excel .xlsx or .xls organizer.',true);return;}
  if(file.size>20*1024*1024){showToast('The organizer must be 20 MB or smaller.',true);return;}
  const button=el<HTMLButtonElement>('replaceOrganizerButton');setButtonLoading(button,true,'Replacing…');
  try{
    const mimeType=file.type||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const {error:uploadError}=await supabase.storage.from(TAX_ORGANIZER_BUCKET).upload(TAX_ORGANIZER_PATH,file,{upsert:true,contentType:mimeType,cacheControl:'0'});
    if(uploadError){showToast(uploadError.message,true);return;}
    const {data,error}=await supabase.from('tax_organizer_templates').upsert({id:'current',storage_path:TAX_ORGANIZER_PATH,file_name:file.name,mime_type:mimeType,size_bytes:file.size,uploaded_by:currentProfile.id,updated_at:new Date().toISOString()},{onConflict:'id'}).select('storage_path,file_name,mime_type,size_bytes,updated_at').single();
    if(error||!data){showToast(error?.message??'The organizer metadata could not be updated.',true);return;}
    const row=data as DbOrganizer;currentOrganizer={storagePath:row.storage_path,fileName:row.file_name,mimeType:row.mime_type,sizeBytes:row.size_bytes,updatedAt:row.updated_at};renderOrganizer();showToast('The current tax organizer has been replaced securely.');
  }finally{const input=el<HTMLInputElement>('organizerFileInput');input.value='';setButtonLoading(button,false);}
}
function renderTickets():void {
  const visible=tickets.filter((ticket)=>activeFilter==='active'?!isCompleted(ticket.status):activeFilter==='complete'?isCompleted(ticket.status):true);
  ticketList.innerHTML=visible.map((ticket)=>`<button class="ticket-item ${ticket.id===selectedTicketId?'active':''}" data-ticket-id="${ticket.id}"><span class="country-chip">${countryCode(ticket.country)}</span><span class="ticket-summary"><span class="ticket-summary-row"><small>${escapeHtml(ticket.number)}</small><b class="mini-priority ${ticket.priority.toLowerCase()}">${escapeHtml(ticket.priority)}</b></span><h3>${escapeHtml(ticket.title)}</h3><p><span class="status-dot ${isCompleted(ticket.status)?'complete':''}"></span>${statusLabel(ticket.status)} · ${ticket.year}</p></span><time class="ticket-time">${escapeHtml(ticket.updated)}</time></button>`).join('')||'<div class="empty-state"><h3>No requests in this queue</h3><p>Only tickets available to your role appear here.</p></div>';
  ticketList.querySelectorAll<HTMLButtonElement>('[data-ticket-id]').forEach((button)=>button.addEventListener('click',()=>{selectedTicketId=button.dataset.ticketId??'';renderTickets();renderDetail();}));
}

function canDeleteDocument(document:TicketDocument):boolean { return currentProfile?.role==='admin'||(currentProfile?.role==='client'&&document.uploadedById===currentProfile.id); }

function documentMarkup(document:TicketDocument):string {
  const actionable=Boolean(document.storagePath);
  const deleteAction=canDeleteDocument(document)?`<button class="document-action danger" data-delete-id="${document.id}">Delete</button>`:'';
  return `<article class="document-item"><span class="document-file-icon">${fileLabel(document.name)}</span><div><strong>${escapeHtml(document.name)}</strong><small>${escapeHtml(document.size)} · ${escapeHtml(document.uploadedBy)}${document.createdAt?` · ${escapeHtml(document.createdAt)}`:''}</small></div><span class="document-type-badge">${escapeHtml(document.type)}</span><div class="document-row-actions"><button class="document-action" data-download-id="${document.id}" ${actionable?'':'disabled'}>${actionable?'Download':'Preview'}</button>${deleteAction}</div></article>`;
}

function renderDetail():void {
  const ticket=selectedTicket();ticketEmpty.classList.toggle('hidden',Boolean(ticket));ticketDetail.classList.toggle('hidden',!ticket);if(!ticket)return;
  el<HTMLElement>('detailId').textContent=ticket.number;el<HTMLElement>('detailTitle').textContent=ticket.title;el<HTMLElement>('detailStatus').textContent=statusLabel(ticket.status);el<HTMLElement>('detailCountry').textContent=ticket.country;el<HTMLElement>('detailYear').textContent=ticket.year;el<HTMLElement>('detailAssignee').textContent=ticket.assigneeName||'Admin queue';el<HTMLElement>('detailRequester').textContent=ticket.requesterName;el<HTMLElement>('detailDescription').textContent=ticket.description;el<HTMLElement>('documentCount').textContent=String(ticket.documents.length);
  const priority=el<HTMLElement>('detailPriority');priority.textContent=ticket.priority;priority.className=`priority-badge ${ticket.priority.toLowerCase()}`;
  activityList.innerHTML=ticket.activities.map((activity)=>`<article class="activity-item"><span class="activity-icon ${activity.system?'system':''}">${activity.authorInitials}</span><div><p><strong>${escapeHtml(activity.author)}</strong> ${escapeHtml(activity.text)}</p><time>${escapeHtml(activity.time)}</time></div></article>`).join('')||'<div class="empty-state"><p>No activity yet.</p></div>';
  documentList.innerHTML=ticket.documents.map(documentMarkup).join('')||'<div class="empty-state"><h3>No documents yet</h3><p>Upload the first file below.</p></div>';
  documentList.querySelectorAll<HTMLButtonElement>('[data-download-id]').forEach((button)=>button.addEventListener('click',()=>void downloadDocument(button.dataset.downloadId??'',button)));
  documentList.querySelectorAll<HTMLButtonElement>('[data-delete-id]').forEach((button)=>button.addEventListener('click',()=>openDocumentDelete(button.dataset.deleteId??'')));
  el<HTMLSelectElement>('assigneeSelect').value=ticket.assigneeId;el<HTMLSelectElement>('statusSelect').value=workflowStatusValue(ticket.status);el<HTMLSelectElement>('prioritySelect').value=ticket.priority;
}

function renderAssigneeOptions():void {
  el<HTMLSelectElement>('assigneeSelect').innerHTML='<option value="">Choose a team member</option>'+teamMembers.map((member)=>`<option value="${member.id}">${escapeHtml(member.fullName)}</option>`).join('');
}

function renderUserDirectory():void {
  const clients=profilesDirectory.filter((profile)=>profile.role==='client'&&!profile.removedAt);
  const team=profilesDirectory.filter((profile)=>profile.role==='team'&&!profile.removedAt);
  el<HTMLElement>('clientDirectoryCount').textContent=String(clients.length);el<HTMLElement>('teamDirectoryCount').textContent=String(team.length);
  document.querySelectorAll<HTMLButtonElement>('[data-user-tab]').forEach((button)=>button.classList.toggle('active',button.dataset.userTab===activeUserDirectoryTab));
  const visible=activeUserDirectoryTab==='clients'?clients:team;
  el<HTMLElement>('userPageList').innerHTML=visible.map((profile)=>{
    const status=profile.active?'Active':profile.frozenAt?'Frozen':'Inactive';
    const actions=profile.role==='team'?`<div class="user-card-actions"><button data-user-action="${profile.active?'freeze':'unfreeze'}" data-user-id="${profile.id}">${profile.active?'Freeze':'Restore'}</button><button class="danger" data-user-action="remove" data-user-id="${profile.id}">Remove</button></div>`:'';
    return `<article class="user-directory-card"><span class="avatar">${initials(profile.fullName)}</span><div class="user-card-copy"><span>${profile.role==='client'?'Client account':escapeHtml(profile.jobTitle||'Team member')}</span><strong>${escapeHtml(profile.fullName)}</strong><small>${escapeHtml(profile.email)}</small><p>${escapeHtml(profile.phone||'No phone provided')}</p></div><b class="user-state ${status.toLowerCase()}">${status}</b>${actions}</article>`;
  }).join('')||`<div class="empty-state"><h3>No ${activeUserDirectoryTab==='clients'?'clients':'Team members'} yet</h3><p>${activeUserDirectoryTab==='clients'?'Client accounts will appear after registration.':'Invite the first specialist to create their account.'}</p></div>`;
  el<HTMLElement>('userPageList').querySelectorAll<HTMLButtonElement>('[data-user-action]').forEach((button)=>button.addEventListener('click',()=>openUserAction(button.dataset.userId??'',button.dataset.userAction as 'freeze'|'unfreeze'|'remove')));
}

function openUserAction(memberId:string,action:'freeze'|'unfreeze'|'remove'):void {
  const member=profilesDirectory.find((profile)=>profile.id===memberId&&profile.role==='team');if(!member)return;
  pendingUserAction={memberId,action};
  const copy={freeze:{title:`Freeze ${member.fullName}?`,message:'Their login will be blocked immediately. Existing ticket history remains unchanged.',confirm:'Freeze access'},unfreeze:{title:`Restore ${member.fullName}?`,message:'Their login will be restored and they can access assigned tickets again.',confirm:'Restore access'},remove:{title:`Remove ${member.fullName}?`,message:'Access will be permanently revoked and assigned tickets will return to the administrator queue. Historical activity remains attributed to this user.',confirm:'Remove member'}}[action];
  el<HTMLElement>('userActionTitle').textContent=copy.title;el<HTMLElement>('userActionMessage').textContent=copy.message;const confirm=el<HTMLButtonElement>('confirmUserAction');confirm.textContent=copy.confirm;confirm.classList.toggle('danger-button',action==='remove');el<HTMLDialogElement>('userActionDialog').showModal();
}

async function manageTeamMember():Promise<void> {
  if(!pendingUserAction||currentProfile?.role!=='admin')return;
  if(!supabase){showToast('The secure workspace is unavailable.',true);return;}
  const {memberId,action}=pendingUserAction;const member=profilesDirectory.find((profile)=>profile.id===memberId);if(!member)return;
  const button=el<HTMLButtonElement>('confirmUserAction');setButtonLoading(button,true,action==='remove'?'Removing…':'Updating…');
  try{
    const {data,error}=await supabase.functions.invoke('manage-team-member',{body:{targetUserId:memberId,action}});
    if(error){showToast(error.message,true);return;}
    const message=String((data as {message?:string})?.message??'Team access updated.');
    await loadSupabaseData();teamMembers=profilesDirectory.filter((profile)=>profile.role==='team'&&profile.active&&!profile.removedAt);renderAssigneeOptions();renderUserDirectory();renderAll();el<HTMLDialogElement>('userActionDialog').close();pendingUserAction=null;showToast(message);
  }finally{setButtonLoading(button,false);}
}

function renderGlobalDocuments():void {
  const query=el<HTMLInputElement>('documentSearch').value.trim().toLowerCase();
  const rows=tickets.flatMap((ticket)=>ticket.documents.map((document)=>({ticket,document}))).filter(({ticket,document})=>!query||`${ticket.number} ${ticket.title} ${ticket.requesterName} ${document.name} ${document.type}`.toLowerCase().includes(query));
  el<HTMLElement>('globalDocumentList').innerHTML=rows.map(({ticket,document})=>{const deleteAction=canDeleteDocument(document)?`<button class="danger" data-global-delete="${document.id}">Delete</button>`:'';return `<article class="global-document-row"><span class="document-file-icon">${fileLabel(document.name)}</span><div><strong>${escapeHtml(document.name)}</strong><small>${escapeHtml(ticket.number)} · ${escapeHtml(ticket.title)} · ${escapeHtml(document.uploadedBy)}</small></div><span class="document-type-badge">${escapeHtml(document.type)}</span><div class="global-document-actions"><button data-open-ticket="${ticket.id}">Open ticket</button><button data-global-download="${document.id}" ${document.storagePath?'':'disabled'}>${document.storagePath?'Download':'Preview'}</button>${deleteAction}</div></article>`;}).join('')||'<div class="empty-state"><h3>No documents found</h3><p>Upload a document to an authorized ticket or change your search.</p></div>';
  document.querySelectorAll<HTMLButtonElement>('[data-open-ticket]').forEach((button)=>button.addEventListener('click',()=>{selectedTicketId=button.dataset.openTicket??'';switchView('tickets');renderTickets();renderDetail();setDetailTab('documents');}));
  document.querySelectorAll<HTMLButtonElement>('[data-global-download]').forEach((button)=>button.addEventListener('click',()=>void downloadDocument(button.dataset.globalDownload??'',button)));
  document.querySelectorAll<HTMLButtonElement>('[data-global-delete]').forEach((button)=>button.addEventListener('click',()=>openDocumentDelete(button.dataset.globalDelete??'')));
}

function recentNotificationEntries():{ticket:Ticket;activity:Activity}[] { return tickets.flatMap((ticket)=>ticket.activities.filter((activity)=>activity.authorId!==currentProfile?.id).map((activity)=>({ticket,activity}))).sort((a,b)=>Date.parse(b.activity.createdAt)-Date.parse(a.activity.createdAt)||b.activity.id.localeCompare(a.activity.id)).slice(0,8); }
function notificationStorageKey():string { return `simplicon-read-notifications:${currentProfile?.id??'guest'}`; }
function loadReadNotifications():void {
  readNotificationIds.clear();
  try{const saved=JSON.parse(localStorage.getItem(notificationStorageKey())??'[]') as unknown;if(Array.isArray(saved))saved.filter((key):key is string=>typeof key==='string').forEach((key)=>readNotificationIds.add(key));}catch{localStorage.removeItem(notificationStorageKey());}
}

function renderNotifications():void {
  const updates=recentNotificationEntries();
  const unread=updates.filter(({ticket,activity})=>!readNotificationIds.has(`${ticket.id}:${activity.id}`));
  el<HTMLElement>('notificationCountLabel').textContent=`${unread.length} unread · ${updates.length} recent`;
  el<HTMLElement>('notificationSummary').textContent=unread.length?`${unread.length} update${unread.length===1?'':'s'} need your attention`:'You are all caught up';
  const markButton=el<HTMLButtonElement>('markAllReadButton');markButton.disabled=unread.length===0;markButton.textContent=unread.length?'Mark all as read':'All read';
  el<HTMLElement>('notificationList').innerHTML=updates.map(({ticket,activity})=>{const key=`${ticket.id}:${activity.id}`;return `<button class="${readNotificationIds.has(key)?'':'unread'}" data-notification-ticket="${ticket.id}" data-notification-key="${key}"><span class="activity-icon ${activity.system?'system':''}">${activity.authorInitials}</span><div><strong>${escapeHtml(ticket.number)} · ${escapeHtml(activity.author)}</strong><p>${escapeHtml(activity.text)}</p><small>${escapeHtml(activity.time)} · ${escapeHtml(ticket.country)}</small></div><span class="notification-status">${escapeHtml(statusLabel(ticket.status))}</span></button>`;}).join('')||'<div class="empty-state"><h3>No notifications yet</h3><p>Ticket updates and document activity will appear here.</p></div>';
  el<HTMLElement>('notificationDot').classList.toggle('hidden',unread.length===0);
  document.querySelectorAll<HTMLButtonElement>('[data-notification-ticket]').forEach((button)=>button.addEventListener('click',()=>{readNotificationIds.add(button.dataset.notificationKey??'');persistReadNotifications();selectedTicketId=button.dataset.notificationTicket??'';el<HTMLDialogElement>('notificationDialog').close();switchView('tickets');renderTickets();renderDetail();renderNotifications();}));
}

function persistReadNotifications():void { localStorage.setItem(notificationStorageKey(),JSON.stringify([...readNotificationIds])); }
function markAllNotificationsRead():void { recentNotificationEntries().forEach(({ticket,activity})=>readNotificationIds.add(`${ticket.id}:${activity.id}`));persistReadNotifications();renderNotifications(); }

function switchView(view:WorkspaceView):void {
  if(view==='users'&&currentProfile?.role!=='admin'){showToast('Only the administrator can manage users.',true);return;}
  document.querySelectorAll<HTMLElement>('.workspace-view').forEach((panel)=>panel.classList.toggle('hidden',panel.id!==`${view}View`));
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button)=>button.classList.toggle('active',button.dataset.view===view));
  if(view==='documents')renderGlobalDocuments();if(view==='users')renderUserDirectory();
  el<HTMLElement>('portalSidebar').classList.remove('open');
}

function setDetailTab(tab:'activity'|'documents'):void {
  const documents=tab==='documents';
  document.querySelectorAll<HTMLButtonElement>('[data-detail-tab]').forEach((button)=>button.classList.toggle('active',button.dataset.detailTab===tab));
  el<HTMLElement>('activityPanel').classList.toggle('hidden',documents);el<HTMLElement>('documentsPanel').classList.toggle('hidden',!documents);
}

function findDocument(id:string):TicketDocument|undefined { return tickets.flatMap((ticket)=>ticket.documents).find((document)=>document.id===id); }
function findDocumentContext(id:string):{ticket:Ticket;document:TicketDocument}|undefined { for(const ticket of tickets){const document=ticket.documents.find((item)=>item.id===id);if(document)return{ticket,document};}return undefined; }

async function downloadDocument(id:string,button?:HTMLButtonElement):Promise<void> {
  const document=findDocument(id);if(!document)return;
  if(!supabase||!document.storagePath){showToast('The secure document path is unavailable.',true);return;}
  if(button)setButtonLoading(button,true,'Preparing…');
  try{const {data,error}=await supabase.storage.from('ticket-documents').createSignedUrl(document.storagePath,120,{download:document.name});
    if(error||!data?.signedUrl){showToast(error?.message??'Unable to create a secure download link.',true);return;}
    const link=window.document.createElement('a');link.href=data.signedUrl;link.target='_blank';link.rel='noopener noreferrer';link.click();
  }finally{if(button)setButtonLoading(button,false);}
}

function openDocumentDelete(id:string):void {
  const context=findDocumentContext(id);if(!context||!canDeleteDocument(context.document)){showToast('You do not have permission to delete this document.',true);return;}
  pendingDeleteDocumentId=id;el<HTMLElement>('documentDeleteMessage').textContent=`${context.document.name} will be permanently deleted. This action cannot be undone.`;el<HTMLDialogElement>('documentDeleteDialog').showModal();
}

async function deleteDocument():Promise<void> {
  const context=findDocumentContext(pendingDeleteDocumentId);if(!context||!currentProfile||!canDeleteDocument(context.document)){showToast('You do not have permission to delete this document.',true);return;}
  if(!supabase){showToast('The secure workspace is unavailable.',true);return;}
  const {ticket,document}=context;const ticketId=ticket.id;const button=el<HTMLButtonElement>('confirmDocumentDelete');setButtonLoading(button,true,'Deleting…');
  try{
    if(!document.storagePath){showToast('The secure document path is unavailable.',true);return;}
    const {error:storageError}=await supabase.storage.from('ticket-documents').remove([document.storagePath]);if(storageError){showToast(storageError.message,true);return;}
    const {error:metadataError}=await supabase.from('ticket_documents').delete().eq('id',document.id);if(metadataError){showToast(metadataError.message,true);return;}
    const {error:commentError}=await supabase.from('ticket_comments').insert({ticket_id:ticketId,author_id:currentProfile.id,body:`Deleted document ${document.name}.`,is_system:false});if(commentError)console.warn('Document deletion activity could not be recorded',commentError);
    await loadSupabaseData();selectedTicketId=ticketId;const notified=await notifyTicketParticipants(ticketId);pendingDeleteDocumentId='';el<HTMLDialogElement>('documentDeleteDialog').close();renderAll();showToast(notified?'Document deleted permanently.':'Document deleted, but the email notification could not be sent.',!notified);
  }finally{setButtonLoading(button,false);}
}
function validateFile(file:File):string|null {
  const extension=file.name.split('.').pop()?.toLowerCase()??'';
  if(file.type.toLowerCase().startsWith('video/')||blockedMimeTypes.has(file.type.toLowerCase())||blockedExtensions.has(extension))return `${file.name} is blocked because video, executable, script, or active-content files are not accepted.`;
  if(file.size>50*1024*1024)return `${file.name} is larger than the 50 MB limit.`;
  return null;
}

async function handleFiles(files:FileList|File[]):Promise<void> {
  const ticket=selectedTicket();if(!ticket||!currentProfile){showToast('Select a ticket before uploading.',true);return;}
  if(!supabase){showToast('The secure workspace is unavailable.',true);return;}
  const list=Array.from(files);if(!list.length)return;
  if(currentProfile.role!=='client'&&!documentType.value){showToast('Choose a document type before uploading.',true);documentType.focus();return;}
  const invalid=list.map(validateFile).find(Boolean);if(invalid){showToast(invalid,true);fileInput.value='';return;}
  const progress=el<HTMLElement>('uploadProgress');const progressText=el<HTMLElement>('uploadProgressText');const browseButton=el<HTMLButtonElement>('browseButton');progress.classList.remove('hidden');progressText.textContent=`Uploading ${list.length} file${list.length===1?'':'s'} securely…`;browseButton.disabled=true;
  const type=currentProfile.role==='client'?'Client upload':documentType.value;const ticketId=ticket.id;
  try{for(const file of list){
    const storagePath=`${ticketId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'-')}`;
    const {error:uploadError}=await supabase.storage.from('ticket-documents').upload(storagePath,file,{upsert:false,contentType:file.type||'application/octet-stream'});
    if(uploadError){showToast(uploadError.message,true);return;}
    const {error}=await supabase.from('ticket_documents').insert({ticket_id:ticketId,uploaded_by:currentProfile.id,storage_path:storagePath,file_name:file.name,mime_type:file.type||'application/octet-stream',size_bytes:file.size,document_type:currentProfile.role==='client'?null:type});
    if(error){await supabase.storage.from('ticket-documents').remove([storagePath]);showToast(error.message,true);return;}
  }
  await loadSupabaseData();selectedTicketId=ticketId;const notified=await notifyTicketParticipants(ticketId);
  fileInput.value='';documentType.value='';renderAll();setDetailTab('documents');showToast(notified?`${list.length} document${list.length===1?'':'s'} added to ${ticket.number}.`:`Documents added, but the email notification could not be sent.`,!notified);}finally{progress.classList.add('hidden');browseButton.disabled=false;}
}

async function assignTicket():Promise<void> {
  if(currentProfile?.role!=='admin'){showToast('Only the administrator can assign requests.',true);return;}
  if(!supabase){showToast('The secure workspace is unavailable.',true);return;}
  const ticket=selectedTicket();const assigneeId=el<HTMLSelectElement>('assigneeSelect').value;const member=teamMembers.find((item)=>item.id===assigneeId);
  if(!ticket||!member){showToast('Choose a team member first.',true);return;}
  const ticketId=ticket.id;const ticketNumber=ticket.number;const button=el<HTMLButtonElement>('assignButton');setButtonLoading(button,true,'Assigning…');try{
    const {error}=await supabase.rpc('assign_ticket',{p_ticket_id:ticketId,p_assignee_id:member.id});if(error){showToast(error.message,true);return;}
    const notified=await notifyTicketParticipants(ticketId);await loadSupabaseData();selectedTicketId=ticketId;renderAll();showToast(notified?`${ticketNumber} assigned to ${member.fullName}.`:`Ticket assigned, but the email notification could not be sent.`,!notified);
  }finally{setButtonLoading(button,false);}
}

async function updateTicketWorkflow():Promise<void> {
  if(!currentProfile||currentProfile.role==='client'){showToast('Clients cannot change workflow status.',true);return;}
  if(!supabase){showToast('The secure workspace is unavailable.',true);return;}
  const ticket=selectedTicket();if(!ticket)return;
  const status=el<HTMLSelectElement>('statusSelect').value as TicketStatus;const priority=el<HTMLSelectElement>('prioritySelect').value;
  if(status===workflowStatusValue(ticket.status)&&priority===ticket.priority){showToast('No workflow changes to save.');return;}
  const ticketId=ticket.id;const ticketNumber=ticket.number;const button=el<HTMLButtonElement>('updateTicketButton');setButtonLoading(button,true,'Updating…');try{
    const {error}=await supabase.rpc('update_ticket_workflow',{p_ticket_id:ticketId,p_status:status,p_priority:priority});if(error){showToast(error.message,true);return;}
    const notified=await notifyTicketParticipants(ticketId);await loadSupabaseData();selectedTicketId=ticketId;renderAll();showToast(notified?`${ticketNumber} workflow updated.`:`Workflow updated, but the email notification could not be sent.`,!notified);
  }finally{setButtonLoading(button,false);}
}

async function addComment(event:SubmitEvent):Promise<void> {
  event.preventDefault();const ticket=selectedTicket();const input=el<HTMLTextAreaElement>('commentInput');const body=input.value.trim();if(!ticket||!currentProfile||!body)return;
  if(!supabase){showToast('The secure workspace is unavailable.',true);return;}
  const ticketId=ticket.id;const button=el<HTMLFormElement>('commentForm').querySelector<HTMLButtonElement>('button[type="submit"]')!;setButtonLoading(button,true,'Sending…');
  try{const {error}=await supabase.from('ticket_comments').insert({ticket_id:ticketId,author_id:currentProfile.id,body,is_system:false});if(error){showToast(error.message,true);return;}
    input.value='';const notified=await notifyTicketParticipants(ticketId);await loadSupabaseData();selectedTicketId=ticketId;renderAll();showToast(notified?'Comment added.':'Comment added, but the email notification could not be sent.',!notified);
  }finally{setButtonLoading(button,false);}
}

function openNewTicketDialog(manual=false):void {
  const dialog=el<HTMLDialogElement>('newTicketDialog');
  el<HTMLElement>('newTicketKicker').textContent=manual?'Admin ticket':'New request';el<HTMLElement>('newTicketDialogTitle').textContent=manual?'Create a customer ticket':'Create a ticket';
  el<HTMLFormElement>('newTicketForm').dataset.manual=String(manual);dialog.showModal();
}
async function createTicket(event:SubmitEvent):Promise<void> {
  event.preventDefault();if(!currentProfile||!['client','admin'].includes(currentProfile.role)){showToast('You do not have permission to create tickets.',true);return;}
  if(!supabase){showToast('The secure workspace is unavailable.',true);return;}
  const manual=el<HTMLFormElement>('newTicketForm').dataset.manual==='true';if(manual&&currentProfile.role!=='admin'){showToast('Only the administrator can create a customer ticket.',true);return;}
  const button=el<HTMLFormElement>('newTicketForm').querySelector<HTMLButtonElement>('button[type="submit"]')!;setButtonLoading(button,true,'Creating…');
  const subject=el<HTMLInputElement>('newTicketTitle').value.trim();const country=el<HTMLSelectElement>('newTicketCountry').value;const year=Number(el<HTMLSelectElement>('newTicketYear').value);const description=el<HTMLTextAreaElement>('newTicketDescription').value.trim();
  const customerEmail=(manual?el<HTMLInputElement>('manualTicketEmail').value:currentProfile.email).trim().toLowerCase();const customerName=(manual?el<HTMLInputElement>('manualTicketName').value:currentProfile.fullName).trim();
  if(!customerName||!customerEmail){showToast('Enter the customer name and email.',true);setButtonLoading(button,false);return;}
  try{
    const existingCustomer=manual?profilesDirectory.find((profile)=>profile.role==='client'&&profile.email.toLowerCase()===customerEmail):undefined;
    const {data,error}=await supabase.from('tickets').insert({requester_id:existingCustomer?.id??currentProfile.id,requester_email:customerEmail,requester_name:customerName,subject,country,tax_year:year,description,status:'new',priority:'Normal'}).select('id').single();
    if(error){showToast(error.message,true);return;}await loadSupabaseData();selectedTicketId=String(data.id);
    const notified=await notifyTicketParticipants(selectedTicketId);
    el<HTMLDialogElement>('newTicketDialog').close();el<HTMLFormElement>('newTicketForm').reset();renderAll();showToast(notified?(manual?'Customer ticket created and the administrator was notified.':'Request created and routed to the administrator.'):'Ticket created, but the email notification could not be sent.',!notified);
  }finally{setButtonLoading(button,false);}
}
async function inviteTeamMember(event:SubmitEvent):Promise<void> {
  event.preventDefault();if(currentProfile?.role!=='admin'){showToast('Only the administrator can add team members.',true);return;}
  if(!supabase){showToast('The secure workspace is unavailable.',true);return;}
  const button=el<HTMLFormElement>('teamInviteForm').querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const payload={fullName:el<HTMLInputElement>('teamFullName').value.trim(),email:el<HTMLInputElement>('teamEmail').value.trim().toLowerCase(),phone:el<HTMLInputElement>('teamPhone').value.trim(),jobTitle:el<HTMLInputElement>('teamJobTitle').value.trim(),redirectTo:`${window.location.origin}/portal.html`};
  if(teamMembers.some((member)=>member.email.toLowerCase()===payload.email)){showToast('A team member already uses this email.',true);return;}
  setButtonLoading(button,true,'Sending…');try{
    const {data,error}=await supabase.functions.invoke('invite-team-member',{body:payload});if(error){showToast(error.message,true);return;}
    showToast(String((data as {message?:string})?.message??'Invitation sent.'));await loadSupabaseData();el<HTMLFormElement>('teamInviteForm').reset();el<HTMLDialogElement>('teamDialog').close();renderAssigneeOptions();renderUserDirectory();
  }finally{setButtonLoading(button,false);}
}

function openProfile():void {
  if(!currentProfile)return;el<HTMLInputElement>('profileFullName').value=currentProfile.fullName;el<HTMLInputElement>('profileEmail').value=currentProfile.email;el<HTMLInputElement>('profilePhone').value=currentProfile.phone;el<HTMLInputElement>('profileRoleField').value=roleLabel(currentProfile.role);el<HTMLDialogElement>('profileDialog').showModal();
}

async function saveProfile(event:SubmitEvent):Promise<void> {
  event.preventDefault();if(!currentProfile)return;if(!supabase){showToast('The secure workspace is unavailable.',true);return;}const fullName=el<HTMLInputElement>('profileFullName').value.trim();const phone=el<HTMLInputElement>('profilePhone').value.trim();
  const button=el<HTMLFormElement>('profileForm').querySelector<HTMLButtonElement>('button[type="submit"]')!;setButtonLoading(button,true,'Saving…');try{
    const {error}=await supabase.from('profiles').update({full_name:fullName,phone}).eq('id',currentProfile.id);if(error){showToast(error.message,true);return;}
    currentProfile.fullName=fullName;currentProfile.phone=phone;el<HTMLDialogElement>('profileDialog').close();showWorkspace();showToast('Profile updated.');
  }finally{setButtonLoading(button,false);}
}

async function updatePassword(event:SubmitEvent):Promise<void> {
  event.preventDefault();if(!supabase)return;const password=el<HTMLInputElement>('resetPassword').value;const confirm=el<HTMLInputElement>('resetPasswordConfirm').value;if(password!==confirm){showToast('Passwords do not match.',true);return;}
  const button=el<HTMLFormElement>('resetPasswordForm').querySelector<HTMLButtonElement>('button[type="submit"]')!;setButtonLoading(button,true,'Updating…');try{const {error}=await supabase.auth.updateUser({password});if(error){showToast(error.message,true);return;}el<HTMLDialogElement>('resetPasswordDialog').close();showToast('Password updated successfully.');}finally{setButtonLoading(button,false);}
}

function wireEvents():void {
  const authMenu=el<HTMLButtonElement>('authMenuToggle');const authNav=el<HTMLElement>('authSiteNav');
  authMenu.addEventListener('click',()=>{const open=authNav.classList.toggle('open');authMenu.setAttribute('aria-expanded',String(open));});authNav.querySelectorAll('a').forEach((link)=>link.addEventListener('click',()=>{authNav.classList.remove('open');authMenu.setAttribute('aria-expanded','false');}));
  document.querySelectorAll<HTMLButtonElement>('[data-auth-mode]').forEach((button)=>button.addEventListener('click',()=>setAuthMode(button.dataset.authMode as 'signin'|'signup')));el<HTMLFormElement>('authForm').addEventListener('submit',(event)=>void authenticate(event));
  document.querySelectorAll<HTMLButtonElement>('[data-auth-provider]').forEach((button)=>button.addEventListener('click',()=>void authenticateWithProvider(button.dataset.authProvider as Provider,button)));
  el<HTMLButtonElement>('forgotPassword').addEventListener('click',async()=>{if(!supabase){showToast('The secure workspace is unavailable.',true);return;}const email=el<HTMLInputElement>('authEmail').value.trim();if(!email){showToast('Enter your email address first.',true);return;}const button=el<HTMLButtonElement>('forgotPassword');setButtonLoading(button,true,'Sending reset link…');try{const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/portal.html`});showToast(error?error.message:'Password reset email sent.',Boolean(error));}finally{setButtonLoading(button,false);}});
  const signOut=async(button:HTMLButtonElement)=>{setButtonLoading(button,true,'Signing out…');try{if(!supabase)throw new Error('The secure workspace is unavailable.');const userId=currentProfile?.id;const {error}=await supabase.auth.signOut();if(error)throw error;clearWorkspaceCache(userId);currentProfile=null;stopTicketReplySync();realtimeChannel?.unsubscribe();realtimeChannel=null;finishBootstrap(true);showToast('You have signed out securely.');}catch(error){showToast(error instanceof Error?error.message:'Unable to sign out.',true);}finally{setButtonLoading(button,false);}};
  ['signOutButton','sidebarSignOutButton'].forEach((id)=>el<HTMLButtonElement>(id).addEventListener('click',()=>void signOut(el<HTMLButtonElement>(id))));
  const accountMenuButton=el<HTMLButtonElement>('accountMenuButton');const accountMenu=el<HTMLElement>('accountMenu');accountMenuButton.addEventListener('click',(event)=>{event.stopPropagation();const hidden=accountMenu.classList.toggle('hidden');accountMenuButton.setAttribute('aria-expanded',String(!hidden));});accountMenu.addEventListener('click',(event)=>event.stopPropagation());document.addEventListener('click',closeAccountMenu);document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeAccountMenu();});
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button)=>button.addEventListener('click',()=>switchView(button.dataset.view as WorkspaceView)));
  document.querySelectorAll<HTMLButtonElement>('[data-user-tab]').forEach((button)=>button.addEventListener('click',()=>{activeUserDirectoryTab=button.dataset.userTab as 'clients'|'team';renderUserDirectory();}));
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button)=>button.addEventListener('click',()=>{activeFilter=button.dataset.filter??'all';document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((item)=>item.classList.toggle('active',item===button));renderTickets();}));
  document.querySelectorAll<HTMLButtonElement>('[data-detail-tab]').forEach((button)=>button.addEventListener('click',()=>setDetailTab(button.dataset.detailTab as 'activity'|'documents')));
  el<HTMLButtonElement>('browseButton').addEventListener('click',()=>fileInput.click());fileInput.addEventListener('change',()=>void handleFiles(fileInput.files??[]));const zone=el<HTMLElement>('uploadZone');['dragenter','dragover'].forEach((name)=>zone.addEventListener(name,(event)=>{event.preventDefault();zone.classList.add('dragging');}));['dragleave','drop'].forEach((name)=>zone.addEventListener(name,(event)=>{event.preventDefault();zone.classList.remove('dragging');}));zone.addEventListener('drop',(event)=>void handleFiles((event as DragEvent).dataTransfer?.files??[]));
  el<HTMLButtonElement>('assignButton').addEventListener('click',()=>void assignTicket());el<HTMLButtonElement>('updateTicketButton').addEventListener('click',()=>void updateTicketWorkflow());el<HTMLFormElement>('commentForm').addEventListener('submit',(event)=>void addComment(event));
  el<HTMLButtonElement>('newTicketButton').addEventListener('click',()=>openNewTicketDialog());el<HTMLButtonElement>('newManualTicketButton').addEventListener('click',()=>openNewTicketDialog(true));el<HTMLFormElement>('newTicketForm').addEventListener('submit',(event)=>void createTicket(event));
  const teamDialog=el<HTMLDialogElement>('teamDialog');el<HTMLButtonElement>('inviteTeamButton').addEventListener('click',()=>teamDialog.showModal());el<HTMLFormElement>('teamInviteForm').addEventListener('submit',(event)=>void inviteTeamMember(event));
  const userActionDialog=el<HTMLDialogElement>('userActionDialog');el<HTMLButtonElement>('cancelUserAction').addEventListener('click',()=>{pendingUserAction=null;userActionDialog.close();});el<HTMLButtonElement>('confirmUserAction').addEventListener('click',()=>void manageTeamMember());
  const documentDeleteDialog=el<HTMLDialogElement>('documentDeleteDialog');el<HTMLButtonElement>('cancelDocumentDelete').addEventListener('click',()=>{pendingDeleteDocumentId='';documentDeleteDialog.close();});el<HTMLButtonElement>('confirmDocumentDelete').addEventListener('click',()=>void deleteDocument());
  ['profileButton','accountProfileButton'].forEach((id)=>el<HTMLButtonElement>(id).addEventListener('click',()=>{closeAccountMenu();openProfile();}));el<HTMLButtonElement>('accountSecurityButton').addEventListener('click',()=>{closeAccountMenu();el<HTMLDialogElement>('resetPasswordDialog').showModal();});el<HTMLFormElement>('profileForm').addEventListener('submit',(event)=>void saveProfile(event));
  const notifications=el<HTMLDialogElement>('notificationDialog');el<HTMLButtonElement>('notificationsButton').addEventListener('click',()=>{renderNotifications();notifications.showModal();});el<HTMLButtonElement>('closeNotifications').addEventListener('click',()=>notifications.close());el<HTMLButtonElement>('markAllReadButton').addEventListener('click',markAllNotificationsRead);document.querySelectorAll<HTMLButtonElement>('[data-view-shortcut]').forEach((button)=>button.addEventListener('click',()=>{notifications.close();switchView(button.dataset.viewShortcut as WorkspaceView);}));
  el<HTMLInputElement>('documentSearch').addEventListener('input',renderGlobalDocuments);el<HTMLButtonElement>('organizerOpenTicket').addEventListener('click',()=>{const active=tickets.find((ticket)=>!isCompleted(ticket.status))??tickets[0];if(!active){showToast('No ticket is available for upload.',true);return;}selectedTicketId=active.id;switchView('tickets');renderTickets();renderDetail();setDetailTab('documents');});
  document.querySelectorAll<HTMLButtonElement>('[data-organizer-download]').forEach((button)=>button.addEventListener('click',()=>void downloadTaxOrganizer(button)));
  const organizerFileInput=el<HTMLInputElement>('organizerFileInput');el<HTMLButtonElement>('replaceOrganizerButton').addEventListener('click',()=>organizerFileInput.click());organizerFileInput.addEventListener('change',()=>{const file=organizerFileInput.files?.[0];if(file)void replaceTaxOrganizer(file);});
  const organizerGate=el<HTMLDialogElement>('organizerGateDialog');organizerGate.addEventListener('cancel',(event)=>event.preventDefault());el<HTMLButtonElement>('continueToWorkspaceButton').addEventListener('click',()=>organizerGate.close());el<HTMLButtonElement>('gateDownloadOrganizer').addEventListener('click',()=>{el<HTMLButtonElement>('continueToWorkspaceButton').innerHTML='Continue to workspace <span>→</span>';});
  el<HTMLFormElement>('resetPasswordForm').addEventListener('submit',(event)=>void updatePassword(event));el<HTMLButtonElement>('mobileMenu').addEventListener('click',()=>el<HTMLElement>('portalSidebar').classList.toggle('open'));
  el<HTMLButtonElement>('replySyncNow').addEventListener('click',()=>void syncTicketEmailReplies(true));
}

async function initialize():Promise<void> {
  wireEvents();startTicketReplySync();updateLocalGreeting();window.setInterval(updateLocalGreeting,60000);window.setInterval(()=>void verifyCurrentAccess(),60000);window.addEventListener('focus',()=>{void verifyCurrentAccess();void syncTicketEmailReplies(false);});window.addEventListener('pageshow',()=>startTicketReplySync());document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void syncTicketEmailReplies(false);});const requestedMode=new URLSearchParams(window.location.search).get('mode');setAuthMode(requestedMode==='signup'?'signup':'signin');
  if(!isSupabaseConfigured){el<HTMLElement>('authConfig').classList.remove('hidden');finishBootstrap(true);return;}
  try{const {data,error}=await supabase!.auth.getSession();if(error)throw error;if(data.session?.user){if(restoreWorkspaceCache(data.session.user)){showWorkspace();subscribeToTicketComments();startTicketReplySync();}await enterAuthenticatedWorkspace(data.session.user);}else finishBootstrap(true);}catch(error){finishBootstrap(true);showToast(error instanceof Error?error.message:'Unable to restore your session.',true);}
  supabase!.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY'){finishBootstrap(true);window.setTimeout(()=>el<HTMLDialogElement>('resetPasswordDialog').showModal(),0);return;}
    if(event==='SIGNED_IN'&&session?.user&&!currentProfile){organizerGatePending=true;window.setTimeout(()=>void enterAuthenticatedWorkspace(session.user),0);}
    if(event==='SIGNED_OUT'){clearWorkspaceCache(currentProfile?.id);currentProfile=null;stopTicketReplySync();realtimeChannel?.unsubscribe();realtimeChannel=null;finishBootstrap(true);}
  });
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void initialize();},{once:true});
else void initialize();

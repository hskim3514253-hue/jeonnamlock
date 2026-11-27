import {pushEnvironment} from './push-environment.js';
import {mountAnalytics} from './admin-analytics.js';
import {inquirySummary,inquiryFields} from './quote-view.js';
import {renderTalk,keepFresh} from './talk-view.js';
(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  let selected=null, offset=0, pushState=null, pushRegistration=null, currentPushId=null;
  let activeTab='inbox', stopTalk=null, talkLink='';
  const analytics=mountAnalytics({root:el('analytics-panel'),api});
  const date=value=>new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(new Date(value));
  const text=(tag,value,className)=>{const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;};
  async function api(path,method='GET',data) {
    const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'요청을 처리할 수 없습니다.');return result;
  }
  function error(err,target='admin-error'){el(target).textContent=err.message||String(err);}
  function productCard(product) {
    const card=text('div','','inquiry-product');
    if(product.image && /^[a-z0-9-]+\.(png|jpg|webp)$/.test(product.image)){const img=document.createElement('img');img.src='/'+product.image;img.alt=product.name;img.width=76;img.height=76;card.append(img);}
    const copy=text('div','');copy.append(text('small','고객이 선택한 제품'),text('strong',product.name),text('small',`${product.brand} · ${product.id}`));card.append(copy);return card;
  }
  async function load(reset=true){
    if(reset){offset=0;el('inquiries').replaceChildren();}el('admin-error').textContent='';
    const result=await api(`/api/admin/quotes?offset=${offset}`);
    for(const row of result.inquiries){
      const button=document.createElement('button');button.className='inquiry-row';
      const summary=inquirySummary(row);
      const identity=document.createElement('div');identity.append(text('strong',summary.identity),text('small',row.phone));
      const info=document.createElement('div');info.append(text('span',row.service),text('small',summary.location));
      const when=document.createElement('div');when.append(text('span',date(row.submitted_at)),text('small',`사진 ${row.photo_count}장 · ${row.receipt}`));
      if(row.selected_product)info.prepend(productCard(row.selected_product));
      const chips=text('span','','row-chips');chips.append(text('span',row.status==='new'?'새 문의':'상담 중',`status-chip ${row.status}`));if(row.unread_messages>0)chips.append(text('span',`새 메시지 ${row.unread_messages}`,'talk-badge'));
      button.append(identity,info,when,chips);
      button.addEventListener('click',()=>openDetail(row.id,row.unread_messages>0?'talk':'info').catch(error));el('inquiries').append(button);
    }
    offset+=result.inquiries.length;el('load-more').hidden=!result.hasMore;el('inbox-count').textContent=`표시된 문의 ${offset}건`;
    if(!offset){const empty=text('div','','empty-state');empty.append(text('strong','아직 접수된 문의가 없습니다.'),text('p','고객이 문의를 접수하면 이곳에서 확인할 수 있습니다.'));el('inquiries').append(empty);}
  }
  async function loadTalk(){
    if(!selected)return;const result=await api(`/api/admin/quotes/${selected.id}/talk`);talkLink=result.link;
    renderTalk(el('talk-messages'),result.messages,'owner','아직 대화가 없습니다. 먼저 메시지를 보내고, 아래 버튼으로 손님에게 채팅 주소를 알려주세요.');
    const invite=`전남열쇠입니다. 문의하신 내용에 답변드렸습니다. 아래 주소에서 확인하고 답장하실 수 있어요.\n${talkLink}`;
    el('talk-sms').href=`sms:${selected.phone}?&body=${encodeURIComponent(invite)}`;el('talk-unread').hidden=true;
  }
  function showDetailTab(tab){
    const talk=tab==='talk';el('detail-content').hidden=talk;el('talk-panel').hidden=!talk;el('detail-tab-info').setAttribute('aria-pressed',String(!talk));el('detail-tab-talk').setAttribute('aria-pressed',String(talk));
    stopTalk?.();stopTalk=null;el('talk-copied').textContent='';
    if(talk){el('talk-messages').dataset.seen='';stopTalk=keepFresh(()=>loadTalk().catch(err=>{error(err,'detail-error');throw err;}));}
  }
  async function openDetail(id,tab='info'){
    const result=await api(`/api/admin/quotes/${id}`);selected=result.inquiry;const record=selected, target=el('detail-content');target.replaceChildren();el('detail-error').textContent='';
    target.append(text('span',record.receipt,'eyebrow'),text('h2',inquirySummary(record).title),text('p',date(record.submitted_at),'detail-meta'));
    if(record.selected_product)target.append(productCard(record.selected_product));
    const list=document.createElement('dl');list.className='detail-grid';
    for(const [label,value] of inquiryFields(record)){
      list.append(text('dt',label));const dd=text('dd',value);if(label==='전화번호'){const a=text('a',value);a.href=`tel:${value}`;dd.replaceChildren(a);}list.append(dd);
    }target.append(list);
    for(const kind of ['door','product']){target.append(text('h3',kind==='door'?'설치할 문 사진':'원하는 도어락 사진'));const section=document.createElement('div');section.className='detail-photos';const files=result.photos.filter(photo=>photo.kind===kind);for(const photo of files){const link=document.createElement('a');link.href=photo.url;link.target='_blank';link.rel='noopener';const img=document.createElement('img');img.src=photo.url;img.alt=kind==='door'?'설치할 문':'원하는 도어락';link.append(img,text('span','사진 크게 보기 ↗'));section.append(link);}if(!files.length)section.append(text('p','첨부 사진 없음'));target.append(section);}
    el('mark-consulting').disabled=record.status==='consulting';el('mark-consulting').textContent=record.status==='consulting'?'상담 중':'상담 중으로 변경';
    const unread=Number(record.unread_messages)||0;el('talk-unread').hidden=!unread;el('talk-unread').textContent=unread?`새 메시지 ${unread}`:'';el('talk-messages').replaceChildren();el('talk-messages').dataset.count='';el('talk-input').value='';
    showDetailTab(tab);el('detail-dialog').showModal();
  }
  function confirmAction(title,message){return new Promise(resolve=>{el('confirm-title').textContent=title;el('confirm-message').textContent=message;const modal=el('confirm-dialog');const finish=value=>{modal.close();resolve(value);};el('confirm-yes').onclick=()=>finish(true);el('confirm-no').onclick=()=>finish(false);modal.oncancel=()=>resolve(false);modal.showModal();});}
  const pushContext=()=>pushEnvironment({userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints,standalone:navigator.standalone,displayStandalone:window.matchMedia('(display-mode: standalone)').matches,secure:window.isSecureContext,hasServiceWorker:'serviceWorker' in navigator,hasPushManager:'PushManager' in window,hasNotification:'Notification' in window,permission:'Notification' in window?Notification.permission:'default'});
  const decodeKey=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),x=>x.charCodeAt(0));
  const endpointId=async endpoint=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint))),x=>x.toString(16).padStart(2,'0')).join('');
  function pushResultMessage(status,httpStatus,errorCode){
    if(status==='accepted')return '알림 서비스가 발송 요청을 접수했습니다. 휴대폰 알림창에서 도착 여부를 확인해주세요.';
    if(status==='expired')return '이 기기의 알림 연결이 만료되었습니다. 해당 휴대폰에서 무료 알림 켜기를 눌러 다시 연결해주세요.';
    const reference=errorCode?` (${errorCode}${httpStatus?` · ${httpStatus}`:''})`:'';
    return `서버에서 알림을 보내지 못했습니다${reference}. 휴대폰의 알림 허용 설정을 껐다 켤 필요는 없습니다.`;
  }
  async function sendPushTest(id,button){
    button.disabled=true;el('push-feedback').textContent='시험 알림을 보내고 있습니다…';
    try{const result=await api('/api/admin/push/test','POST',{id});el('push-feedback').textContent=pushResultMessage(result.status,result.httpStatus,result.errorCode);}catch(err){error(err,'push-feedback');}
    finally{await loadPush().catch(error);button.disabled=false;}
  }
  async function loadPush(){
    pushState=await api('/api/admin/push');currentPushId=null;
    const context=pushContext();let registrationFailed=false;
    if(context.supported&&!context.needsHomeScreen){try{pushRegistration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});const subscription=await pushRegistration.pushManager.getSubscription();if(subscription){const id=await endpointId(subscription.endpoint);if(pushState.devices.some(device=>device.id===id&&device.enabled))currentPushId=id;}}catch{registrationFailed=true;}}
    const title=context.needsHomeScreen?'홈 화면에 추가한 뒤 다시 열어주세요.':!context.supported?(context.appleMobile?'아이폰의 iOS 버전과 실행 방법을 확인해주세요.':'이 브라우저에서는 알림을 지원하지 않습니다.'):!pushState.configured?'알림 서비스를 준비하고 있습니다.':registrationFailed?'알림을 준비하지 못했습니다.':context.blocked?'이 기기의 알림이 차단되어 있습니다.':currentPushId?'이 기기의 알림이 켜져 있습니다.':'이 기기의 알림을 켜주세요.';
    const help=context.needsHomeScreen?'Safari의 공유 메뉴에서 홈 화면에 추가한 뒤, 새로 생긴 전남열쇠 아이콘으로 열어주세요.':!context.supported?(context.appleMobile?'iOS 16.4 이상이 필요합니다. 최신 iOS로 업데이트하고 홈 화면의 전남열쇠 아이콘으로 실행해주세요.':'아이폰은 Safari에서 홈 화면에 추가하고, 안드로이드는 Chrome에서 열어주세요.'):registrationFailed?'인터넷 연결을 확인하고 새로고침해주세요.':context.blocked?(context.appleMobile?'아이폰 설정 > 알림 > 전남열쇠 견적 관리에서 알림 허용을 켠 뒤 이 화면을 새로고침해주세요. 홈 화면에 추가할 때 바꾼 이름으로 표시될 수 있습니다.':'브라우저의 사이트 설정에서 알림을 허용한 뒤 새로고침해주세요.'):`${pushState.devices.filter(device=>device.enabled).length}개 기기 연결 · 건당 발송 요금 없음`;
    el('push-status').replaceChildren(text('strong',title),text('p',help),text('div',`발송 요청 완료 ${pushState.counts.accepted||0} · 대기 ${pushState.counts.pending||0} · 재시도 필요 ${pushState.counts.failed||0}`));
    pushState.devices.forEach((device,index)=>{
      const item=text('div','','push-device');item.append(text('strong',device.id===currentPushId?'현재 기기':`연결된 기기 ${index+1}`));
      item.append(text('p',device.last_status?`${date(device.last_at)} · ${pushResultMessage(device.last_status,device.last_http_status,device.last_error)}`:'아직 수신 시험을 하지 않았습니다.'));
      if(device.enabled&&device.id!==currentPushId){const button=text('button',`연결된 기기 ${index+1}에 시험 알림 보내기`,'button secondary');button.type='button';button.disabled=!pushState.configured;button.onclick=()=>sendPushTest(device.id,button);item.append(button);}
      el('push-status').append(item);
    });
    el('enable-push').disabled=!context.canEnable||!pushState.configured||registrationFailed||Boolean(currentPushId);el('enable-push').textContent=currentPushId?'알림 사용 중':context.needsHomeScreen?'홈 화면에서 열면 알림을 켤 수 있어요':context.appleMobile?'이 아이폰에서 무료 알림 켜기':'이 기기에서 무료 알림 켜기';
    el('test-push').disabled=!currentPushId||!context.canEnable;el('disable-push').hidden=!currentPushId;el('retry-push').disabled=!pushState.configured||!((pushState.counts.pending||0)+(pushState.counts.failed||0));
  }
  async function init(){
    try{const session=await api('/api/session');const gate=el('auth-gate');gate.replaceChildren();if(!session.isAdmin){gate.hidden=false;el('dashboard').hidden=true;el('inquiries').replaceChildren();analytics.reset();}
      if(!session.user){gate.append(text('h2','사장님 계정으로 로그인해주세요.'),text('p','접수 내용과 사진은 허용된 관리자만 확인할 수 있습니다.'));const a=text('a','관리자 로그인','button');a.href=session.signInUrl;a.target='_top';gate.append(a);return;}
      if(!session.isAdmin){gate.append(text('h2',session.adminConfigured?'관리 권한이 없는 계정입니다.':'관리자 계정을 연결하고 있습니다.'),text('p','홈페이지 소유자의 계정으로 접속해주세요.'));if(!session.adminConfigured){gate.append(text('p',`로그인 계정: ${session.user.email||'로그인 계정'}`),text('p',`계정 연결 ID: ${session.user.id}`));}return;}
      gate.hidden=true;el('dashboard').hidden=false;showTab(location.hash==='#analytics'?'analytics':location.hash==='#notifications'?'push':'inbox');await Promise.all([load().catch(error),loadPush().catch(error)]);
    }catch(err){error(err);el('dashboard').hidden=true;analytics.reset();el('auth-gate').hidden=false;el('auth-gate').replaceChildren(text('h2','접수함을 불러오지 못했습니다.'),text('p','잠시 후 새로고침해주세요.'));}
  }
  el('refresh').onclick=async()=>{await init();if(!el('dashboard').hidden&&activeTab==='analytics')await analytics.refresh();};el('load-more').onclick=()=>load(false).catch(error);el('close-detail').onclick=()=>el('detail-dialog').close();
  el('detail-dialog').addEventListener('close',()=>{stopTalk?.();stopTalk=null;if(!el('dashboard').hidden)load().catch(error);});
  el('detail-tab-info').onclick=()=>showDetailTab('info');el('detail-tab-talk').onclick=()=>showDetailTab('talk');
  el('talk-form').addEventListener('submit',async event=>{event.preventDefault();const body=el('talk-input').value.trim();if(!body)return;el('talk-send').disabled=true;el('detail-error').textContent='';try{await api(`/api/admin/quotes/${selected.id}/talk`,'POST',{body});el('talk-input').value='';el('talk-messages').dataset.seen='';await loadTalk();el('mark-consulting').disabled=true;el('mark-consulting').textContent='상담 중';}catch(err){error(err,'detail-error');}finally{el('talk-send').disabled=false;el('talk-input').focus();}});
  el('talk-copy').onclick=async()=>{try{await navigator.clipboard.writeText(talkLink);el('talk-copied').textContent='채팅 주소를 복사했습니다. 문자나 카카오톡에 붙여 넣어 손님에게 보내주세요.';}catch{el('talk-copied').textContent=talkLink;}};
  // New inquiries and new messages show up without pressing refresh.
  setInterval(()=>{if(!document.hidden&&!el('dashboard').hidden&&activeTab==='inbox'&&!el('detail-dialog').open&&!el('confirm-dialog').open&&offset<=50)load().catch(()=>{});},30000);
  el('mark-consulting').onclick=async()=>{try{await api(`/api/admin/quotes/${selected.id}`,'PATCH',{status:'consulting'});el('detail-dialog').close();await load();}catch(err){error(err,'detail-error');}};
  el('delete-inquiry').onclick=async()=>{if(!await confirmAction('상담 완료 · 정보 삭제',`${selected.receipt} 문의의 고객 정보와 사진을 영구 삭제합니다. 삭제 후 복구할 수 없습니다. 상담이 끝났거나 고객이 삭제를 요청한 경우 진행해주세요.`))return;try{await api(`/api/admin/quotes/${selected.id}`,'DELETE',{confirm:selected.receipt});el('detail-dialog').close();await load();await loadPush();}catch(err){error(err,'detail-error');}};
  function showTab(tab){activeTab=tab;for(const key of ['inbox','push','analytics']){el(`${key}-panel`).hidden=key!==tab;el(`tab-${key}`).setAttribute('aria-pressed',String(key===tab));}el('admin-screen-title').textContent=tab==='analytics'?'사이트 방문 통계':tab==='push'?'무료 알림 설정':'견적 접수함';el('admin-screen-description').textContent=tab==='analytics'?'시간별 방문 흐름과 하루 조회 수를 확인하세요.':tab==='push'?'새로운 견적이 들어오면 휴대폰으로 확인하세요.':'고객 정보와 사진을 확인하고 상담을 이어가세요.';el('admin-screen-label').textContent=tab==='analytics'?'SITE ANALYTICS':tab==='push'?'FREE WEB PUSH':'CONSULTATION INBOX';if(tab==='analytics')void analytics.open();}
  for(const tab of ['inbox','push','analytics'])el(`tab-${tab}`).onclick=()=>{const hash=tab==='push'?'#notifications':tab==='analytics'?'#analytics':'#inbox';history.replaceState(null,'',hash);showTab(tab);};
  window.addEventListener('hashchange',()=>{if(!el('dashboard').hidden)showTab(location.hash==='#analytics'?'analytics':location.hash==='#notifications'?'push':'inbox');});
  el('enable-push').onclick=async()=>{
    el('enable-push').disabled=true;el('push-feedback').textContent='';
    try{
      if(!pushContext().canEnable)throw new Error('아래 기기별 안내를 확인한 뒤 알림을 켜주세요.');
      // Permission must be requested directly from this user gesture, especially on mobile.
      const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('알림 허용을 선택해야 휴대폰 알림을 받을 수 있습니다.');
      let readyTimeout;const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{readyTimeout=setTimeout(()=>reject(new Error('알림 준비 시간이 초과됐습니다. 새로고침 후 다시 시도해주세요.')),15000);})]).finally(()=>clearTimeout(readyTimeout));
      let subscription=await registration.pushManager.getSubscription();
      if(subscription){const id=await endpointId(subscription.endpoint);const known=pushState.devices.find(device=>device.id===id);const key=subscription.options.applicationServerKey;if((known&&!known.enabled)||(key&&Array.from(new Uint8Array(key)).join(',')!==Array.from(decodeKey(pushState.publicKey)).join(','))){await subscription.unsubscribe();subscription=null;}}
      if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(pushState.publicKey)});
      await api('/api/admin/push','PUT',{endpoint:subscription.endpoint});
      el('push-feedback').textContent='알림을 켰습니다. 아래 수신 시험 버튼으로 휴대폰에 알림이 도착하는지 확인해주세요.';
    }catch(err){error(err,'push-feedback');}finally{await loadPush().catch(error);}
  };
  el('test-push').onclick=()=>sendPushTest(currentPushId,el('test-push'));
  el('disable-push').onclick=async()=>{try{const subscription=await pushRegistration.pushManager.getSubscription();if(subscription){await api('/api/admin/push','DELETE',{endpoint:subscription.endpoint});await subscription.unsubscribe();}el('push-feedback').textContent='이 기기의 알림을 껐습니다.';await loadPush();}catch(err){error(err,'push-feedback');}};
  el('retry-push').onclick=async()=>{el('retry-push').disabled=true;try{await api('/api/admin/push/retry','POST',{});el('push-feedback').textContent='대기·실패 알림을 다시 요청했습니다.';await loadPush();}catch(err){error(err,'push-feedback');}};
  init();
})();

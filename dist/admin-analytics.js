const koreanDay = ms => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
const number = n => new Intl.NumberFormat('ko-KR').format(n);
const stamp = ms => new Intl.DateTimeFormat('ko-KR', {dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(ms);
export function analyticsModel(data) {
  const before = data.status === 'before_collection';
  const maximum = Math.max(1, ...data.hours.map(h => h.pageviews));
  const peak = Math.max(...data.hours.filter(h => !h.pending).map(h => h.visitors), 0);
  const start = koreanDay(data.collectionStartedAt), oldest = koreanDay(data.asOf - 89 * 86400000);
  return {
    dailyVisitors: before ? '—' : number(data.daily.visitors), dailyPageviews: before ? '—' : number(data.daily.pageviews),
    peak: before ? '수집 전' : peak ? data.hours.filter(h => !h.pending && h.visitors === peak).map(h => `${h.hour}시`).join(' · ') : '아직 방문 없음',
    minDate: start > oldest ? start : oldest, maxDate: koreanDay(data.asOf),
    hours: data.hours.map(h => ({...h,visitors:before?'수집 전':h.pending?'집계 전':number(h.visitors),pageviews:before?'수집 전':h.pending?'집계 전':number(h.pageviews),height:h.pending||before?0:h.pageviews/maximum*100,visitorHeight:h.pending||before?0:h.visitors/maximum*100}))
  };
}

export function mountAnalytics({root, api}) {
  let currentDate, requestedDate, loaded = false, version = 0;
  const find = id => root.querySelector(`#${id}`);
  const make = (tag, text, className) => {const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  root.innerHTML = `<div class="analytics-heading"><div><span class="analytics-eyebrow">SITE ANALYTICS</span><h2>우리 가게를 찾은 발걸음</h2><p>하루의 흐름을 시간별로 확인하세요.</p></div><span class="analytics-zone">한국 시간 기준 · KST</span></div>
    <div class="analytics-toolbar"><div class="analytics-date"><button type="button" id="analytics-prev" aria-label="이전 날짜">←</button><label class="sr-only" for="analytics-date">통계 날짜</label><input type="date" id="analytics-date"><button type="button" id="analytics-next" aria-label="다음 날짜">→</button></div><button type="button" id="analytics-today">오늘</button><button type="button" id="analytics-refresh">새로고침 ↻</button></div>
    <p id="analytics-status" role="status" aria-live="polite"></p><div id="analytics-error" role="alert" hidden></div>
    <div id="analytics-results" hidden><div class="analytics-cards"><div class="analytics-card"><span>하루 방문자</span><strong id="analytics-visitors"></strong><small>선택한 날짜의 중복을 뺀 브라우저 수</small></div><div class="analytics-card"><span>페이지 조회</span><strong id="analytics-pageviews"></strong><small>새로고침과 다시 열린 화면 포함</small></div><div class="analytics-card"><span>가장 많이 찾아온 시간</span><strong id="analytics-peak" class="analytics-peak"></strong><small>시간별 방문자 수 기준</small></div></div>
    <section class="analytics-chart-card" aria-labelledby="analytics-chart-title"><div class="analytics-chart-heading"><div><h3 id="analytics-chart-title">시간대별 방문</h3><p>00시부터 23시까지, 한눈에</p></div><div class="analytics-legend"><span>● 방문자</span><span>● 조회</span></div></div><div id="analytics-chart" class="analytics-chart" aria-hidden="true"></div><p id="analytics-chart-note"></p>
    <details class="analytics-table-details"><summary>시간별 수치를 표로 보기</summary><div class="analytics-table-scroll" tabindex="0" role="region" aria-label="시간별 방문 통계 표"><table><caption class="sr-only">선택한 날짜의 시간별 방문자와 페이지 조회</caption><thead><tr><th scope="col">시간</th><th scope="col">방문자</th><th scope="col">페이지 조회</th></tr></thead><tbody id="analytics-rows"></tbody></table></div></details></section>
    <div class="analytics-notes"><strong>숫자는 이렇게 읽어주세요.</strong><p>방문자는 브라우저를 기준으로 추정합니다. 같은 브라우저의 당일 재방문은 하루 방문자에서 한 번만 세며, 시간별 방문자는 각 시간마다 따로 셉니다. 시간별 방문자를 더한 값은 하루 방문자와 다를 수 있습니다.</p><p>쿠키 차단·삭제, 다른 기기나 브라우저, 여러 탭의 첫 방문으로 오차가 생길 수 있습니다. 로그인한 관리자와 식별 가능한 봇은 제외하며, 광고 클릭 수를 뜻하지 않습니다.</p><p id="analytics-start"></p></div></div>`;
  const controls = ['analytics-date','analytics-prev','analytics-next','analytics-today','analytics-refresh'];
  function busy(value) {root.setAttribute('aria-busy',String(value));controls.forEach(id=>find(id).disabled=value);}
  function limits(model) {const input=find('analytics-date');input.min=model.minDate;input.max=model.maxDate;find('analytics-prev').disabled=currentDate<=model.minDate;find('analytics-next').disabled=currentDate>=model.maxDate;}
  function render(data) {
    const model=analyticsModel(data);currentDate=data.date;find('analytics-date').value=data.date;
    find('analytics-visitors').textContent=model.dailyVisitors;find('analytics-pageviews').textContent=model.dailyPageviews;find('analytics-peak').textContent=model.peak;
    const chart=find('analytics-chart'),rows=find('analytics-rows');chart.replaceChildren();rows.replaceChildren();
    for(const h of model.hours){
      const column=make('div',undefined,`analytics-hour${h.pending?' pending':''}`),bars=make('div',undefined,'analytics-bars');
      const visit=make('span',undefined,'analytics-bar visitors'),views=make('span',undefined,'analytics-bar views');visit.style.height=`${h.visitorHeight}%`;views.style.height=`${h.height}%`;bars.append(visit,views);column.append(bars,make('span',String(h.hour).padStart(2,'0'),'analytics-hour-label'));column.title=`${h.hour}시 · 방문자 ${h.visitors} · 조회 ${h.pageviews}`;chart.append(column);
      const row=make('tr');const hour=make('th',`${String(h.hour).padStart(2,'0')}:00–${String(h.hour).padStart(2,'0')}:59`);hour.scope='row';row.append(hour,make('td',h.visitors),make('td',h.pageviews));rows.append(row);
    }
    find('analytics-chart-note').textContent=data.status==='before_collection'?'방문 통계 수집을 시작하기 전 날짜입니다.':data.daily.pageviews===0?'이 날짜에는 아직 수집된 방문이 없습니다.':'미래 시간은 집계 전으로 표시합니다. 정확한 수치는 아래 표에서 확인하세요.';
    find('analytics-status').textContent=`${stamp(data.asOf)} 확인 · 자동 갱신되지 않으므로 새로고침으로 확인하세요.`;
    find('analytics-start').textContent=`수집 시작: ${stamp(data.collectionStartedAt)} · 최근 90일의 기록을 보관합니다. 적용 이전 방문 기록은 제공하지 않습니다.`;
    find('analytics-results').hidden=false;busy(false);limits(model);
  }
  async function fetchDate(date) {
    requestedDate=date;
    const requestVersion=++version;busy(true);find('analytics-results').hidden=true;find('analytics-error').hidden=true;find('analytics-status').textContent='방문 통계를 불러오고 있습니다…';
    try {const data=await api('/api/admin/analytics'+(date?'?date='+encodeURIComponent(date):''));if(requestVersion!==version)return;render(data);loaded=true;}
    catch(error){if(requestVersion!==version)return;find('analytics-error').textContent=`통계를 불러오지 못했습니다. ${error.message||'잠시 후 다시 시도해주세요.'}`;find('analytics-error').hidden=false;find('analytics-status').textContent='새로고침을 눌러 다시 확인해주세요.';busy(false);}
  }
  const shift=days=>{if(currentDate)void fetchDate(new Date(Date.parse(currentDate+'T00:00:00Z')+days*86400000).toISOString().slice(0,10));};
  find('analytics-prev').onclick=()=>shift(-1);find('analytics-next').onclick=()=>shift(1);
  find('analytics-date').onchange=event=>{if(event.target.value)void fetchDate(event.target.value);};
  find('analytics-today').onclick=()=>fetchDate();find('analytics-refresh').onclick=()=>fetchDate(requestedDate);
  return {open:()=>loaded?Promise.resolve():fetchDate(requestedDate),refresh:()=>fetchDate(requestedDate),reset(){version++;loaded=false;currentDate=undefined;requestedDate=undefined;find('analytics-results').hidden=true;find('analytics-visitors').textContent='';find('analytics-pageviews').textContent='';find('analytics-peak').textContent='';find('analytics-chart').replaceChildren();find('analytics-rows').replaceChildren();find('analytics-start').textContent='';find('analytics-status').textContent='';find('analytics-error').hidden=true;find('analytics-date').value='';busy(false);}};
}

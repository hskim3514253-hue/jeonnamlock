import {readFile,writeFile} from 'node:fs/promises';
const filename=new URL('../dist/index.html',import.meta.url);
let html=await readFile(filename,'utf8');
const start=html.indexOf('<fieldset class="form-step" data-step="2"');
const end=html.indexOf('</fieldset>',start)+11;
if(start<0||end<11)throw new Error('Contact step missing');
html=html.slice(0,start)+`<fieldset class="form-step" data-step="2" hidden><legend class="sr-only">고객 정보</legend>
<div class="summary-box" id="quote-summary"></div>
<div class="two-fields"><div class="field"><label for="customer-name">성함 <span class="required">*</span></label><input id="customer-name" name="customerName" autocomplete="name" maxlength="30" placeholder="성함을 입력해주세요" required></div><div class="field"><label for="customer-phone">전화번호 <span class="required">*</span></label><input id="customer-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="15" placeholder="010-0000-0000" required></div></div>
<div class="field"><label for="address">고객 주소 <span class="required">*</span></label><input id="address" name="address" autocomplete="address-line1" maxlength="150" placeholder="도로명 또는 지번 주소를 입력해주세요" required><p class="address-hint">실제로 도어락을 설치할 곳의 주소를 적어주세요.</p></div>
<div class="field"><label for="address-detail">상세 주소 <span class="optional">선택</span></label><input id="address-detail" name="addressDetail" autocomplete="address-line2" maxlength="100" placeholder="아파트 동·호수, 건물명, 층수 등"></div>
<div class="honeypot" aria-hidden="true"><label for="website">홈페이지</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
<label class="consent-label"><input id="privacy-consent" name="consent" type="checkbox" required><span>견적 상담을 위한 개인정보 수집·이용에 동의합니다. <strong>(필수)</strong></span></label>
<details class="privacy-details"><summary>수집·이용 안내 보기</summary><p>수집 항목: 성함, 전화번호, 고객 주소, 선택 입력한 상세 주소·문의 내용·첨부 사진.<br>이용 목적: 견적 안내, 고객 상담 및 설치 일정 조율.<br>보유 기간: 상담 완료 또는 삭제 요청 시까지. 상담 완료 처리 시 개인정보와 사진을 삭제합니다.<br>동의를 거부할 수 있으며, 이 경우 온라인 문의 접수가 제한됩니다. 전화 상담은 이용할 수 있습니다.</p><a href="/privacy.html" target="_blank" rel="noopener">개인정보 처리 안내 자세히 보기 ↗</a></details>
</fieldset>`+html.slice(end);
html=html.replace('<span class="preview-tag">체험용</span>','<span class="preview-tag">온라인 접수</span>')
.replace('<li><span>3</span>연락처</li>','<li><span>3</span>고객 정보</li>')
.replace('<p id="form-error"','<p id="upload-progress" class="upload-progress" role="status" aria-live="polite"></p><p id="form-error"')
.replace('홈페이지 프로토타입 · 온라인 문의는 체험용입니다. 실제 상담은 전화로 문의해주세요.','<a href="/privacy.html">개인정보 처리 안내</a> · <a href="/admin">사장님 관리</a> · 긴급 문의는 전화로 연락해주세요.')
.replace('PREVIEW COMPLETE','REQUEST RECEIVED')
.replace('견적 문의 체험을<br>완료했어요.','견적 문의가<br>접수되었습니다.')
.replace('실제 문의는 전송되지 않았습니다.<br>입력한 정보와 사진은 이 화면에서만 확인할 수 있어요.','전남열쇠에서 문의 내용을 확인한 뒤<br>남겨주신 전화번호로 연락드리겠습니다.<br><strong id="receipt-number"></strong>')
.replace('실제 상담 전화하기','긴급 상담 전화하기')
.replace('처음부터 다시 체험하기','새 문의 작성하기');
await writeFile(filename,html);

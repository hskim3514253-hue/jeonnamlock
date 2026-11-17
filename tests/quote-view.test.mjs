import test from 'node:test';
import assert from 'node:assert/strict';
import {inquirySummary,inquiryFields} from '../dist/quote-view.js';
test('anonymous simple quotes have useful titles and no empty name or address fields',()=>{
  const record={district:'광주 북구 용봉동',phone:'01000000000',customer_name:'',address:'',address_detail:'',space:'',service:'도어락 견적 문의',details:'',consent_version:'2026-10-20-v2'};
  assert.deepEqual(inquirySummary(record),{identity:'사진 견적 문의',title:'광주 북구 용봉동 견적 문의',location:'광주 북구 용봉동'});
  assert.deepEqual(inquiryFields(record),[['설치 동네','광주 북구 용봉동'],['전화번호','01000000000'],['원하는 제품','상담 후 결정']]);
});
test('existing inquiries preserve their name, address, space and free-text details',()=>{
  const record={district:'광주 북구',phone:'01000000000',customer_name:'테스트',address:'테스트로 1',address_detail:'2층',space:'상가 / 사무실',service:'도어락 교체',details:'기존 상담 요청',consent_version:'2026-09-28-v1'};
  assert.equal(inquirySummary(record).title,'테스트님의 견적 문의');assert.equal(inquirySummary(record).location,'광주 북구 · 테스트로 1 2층');
  assert.deepEqual(inquiryFields(record),[['설치 동네','광주 북구'],['전화번호','01000000000'],['서비스','도어락 교체'],['설치 공간','상가 / 사무실'],['기존 접수 주소','테스트로 1 2층'],['문의 내용','기존 상담 요청']]);
});
test('business inquiry shows its service and industry in the existing inbox',()=>{
  const record={district:'광주 북구',service:'업체 · 다량 설치 견적',space:'인테리어',phone:'01000000000',consent_version:'2026-10-27-v3',details:'업체명: 테스트\n예상 수량: 18개'};
  assert.equal(inquirySummary(record).identity,'업체 · 다량 설치 견적');
  assert.ok(inquiryFields(record).some(([label,value])=>label==='업종'&&value==='인테리어'));
  assert.ok(inquiryFields(record).some(([label,value])=>label==='문의 내용'&&value.includes('18개')));
});

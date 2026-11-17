// Display both simplified quotes and earlier, more detailed inquiries without losing history.
export function inquirySummary(record) {
  const address=[record.address,record.address_detail].filter(Boolean).join(' ');
  return {
    identity:record.customer_name || (['우리 집 도어락 상담','고장 · 교체 상담','업체 · 다량 설치 견적'].includes(record.service) ? record.service : '사진 견적 문의'),
    title:record.customer_name ? `${record.customer_name}님의 견적 문의` : `${record.district} 견적 문의`,
    location:[record.district,address].filter(Boolean).join(' · ')
  };
}
export function inquiryFields(record) {
  const fields=[['설치 동네',record.district],['전화번호',record.phone]];
  if(record.service && record.service!=='도어락 견적 문의')fields.push(['서비스',record.service]);
  if(record.space)fields.push([record.consent_version==='2026-10-27-v3'?'업종':'설치 공간',record.space]);
  const address=[record.address,record.address_detail].filter(Boolean).join(' ');
  if(address)fields.push(['기존 접수 주소',address]);
  fields.push(record.consent_version==='2026-10-20-v2'?['원하는 제품',record.details||'상담 후 결정']:['문의 내용',record.details||'별도 문의 내용 없음']);
  return fields;
}

// Price data the price chat answers from. Amounts are KRW and include installation.
// PRICE_TABLE mirrors the "설치 가격" table on the homepage: it applies to the designated
// models only, so for any other model it is a reference, not a quote.
export const PRICE_TABLE = [
  { key: 'deadbolt', label: '현관정', price: 60000 },
  { key: 'auxiliary', label: '보조키 도어락', price: 120000 },
  { key: 'lever', label: '손잡이형 주키 도어락', price: 150000 },
  { key: 'pushpull', label: '푸시풀 도어락', price: 220000 },
  { key: 'pushpull-fingerprint', label: '푸시풀 지문 도어락', price: 250000 }
];
export const DRILLING_FEE = 10000;
// Model-specific prices set by the owner, keyed by catalog product id, e.g. { k100: 350000 }.
// A product that is not listed here has no confirmed price and is never quoted one.
export const PRODUCT_PRICES = {};

export const SHOP_PHONE = '010-9284-5963';
const won = amount => `${amount.toLocaleString('ko-KR')}원`;

export function priceGroup(product) {
  const type = product.type || '';
  if (/푸시풀/.test(type)) return PRICE_TABLE[product.fingerprint ? 4 : 3];
  if (product.category === 'auxiliary') return PRICE_TABLE[1];
  if (product.category === 'main' && /손잡이|주키/.test(type)) return PRICE_TABLE[2];
  return null;
}

// The answer used when no AI is configured or the AI call fails. Never invents a number.
export function priceAnswer(product) {
  const confirmed = Object.hasOwn(PRODUCT_PRICES, product.id) ? PRODUCT_PRICES[product.id] : null;
  if (Number.isInteger(confirmed) && confirmed > 0) {
    return `${product.name}의 설치비 포함 가격은 ${won(confirmed)}입니다. 타공이 필요하면 ${won(DRILLING_FEE)}이 추가됩니다. 문 상태와 현장 조건에 따라 달라질 수 있어 최종 금액은 상담 후 확정됩니다.`;
  }
  const group = priceGroup(product);
  if (group) {
    return `${product.name}은 아직 모델별 가격이 등록되어 있지 않습니다. 같은 종류인 ${group.label}의 지정 제품은 설치비 포함 ${won(group.price)}이고, 타공이 필요하면 ${won(DRILLING_FEE)}이 추가됩니다. 이 모델은 제품에 따라 금액이 달라 별도 견적으로 안내합니다. 전화 ${SHOP_PHONE}로 문의하시면 바로 확인해드립니다.`;
  }
  return `${product.name}은 문 종류와 설치 조건에 따라 금액이 달라 개별 견적으로 안내합니다. 전화 ${SHOP_PHONE}로 문의하시거나 홈페이지의 상담 문의를 남겨주세요.`;
}

export function chatSystemPrompt(product) {
  const confirmed = Object.hasOwn(PRODUCT_PRICES, product.id) ? PRODUCT_PRICES[product.id] : null;
  const group = priceGroup(product);
  return [
    '당신은 광주의 도어락 설치·교체 업체 "전남열쇠" 홈페이지의 가격 안내 도우미입니다. 고객이 제품 카드의 가격문의 버튼을 눌러 이 대화를 시작했습니다.',
    '',
    '# 지금 고객이 보고 있는 제품',
    `- 제품명: ${product.name} (${product.brand})`,
    `- 종류: ${product.type}`,
    `- 이 모델의 확정 가격: ${Number.isInteger(confirmed) && confirmed > 0 ? `설치비 포함 ${won(confirmed)}` : '등록되지 않음'}`,
    `- 같은 종류의 지정 제품 가격: ${group ? `${group.label} 설치비 포함 ${won(group.price)}` : '해당 없음 (개별 견적)'}`,
    '',
    '# 가격 자료 (설치비 포함, 지정 제품에만 적용)',
    ...PRICE_TABLE.map(row => `- ${row.label}: ${won(row.price)}`),
    `- 타공이 필요하면 ${won(DRILLING_FEE)} 추가`,
    '',
    '# 업체 정보',
    `- 전화: ${SHOP_PHONE} (24시간 · 연중무휴)`,
    '- 주소: 광주 북구 첨단연신로 284 18층 1814호',
    '- 홈페이지의 "상담 문의"에 동네와 연락처를 남기면 연락드립니다.',
    '',
    '# 답하는 방법',
    '- 금액은 위 자료에 적힌 숫자만 말합니다. 자료에 없는 금액, 할인, 제품 원가, 출장비는 추측하거나 계산해서 만들어내지 않습니다. 고객이 틀린 가격을 말하면 자료 기준으로 바로잡습니다.',
    '- 이 모델의 확정 가격이 등록되어 있으면 그 금액을 먼저 답합니다.',
    '- 등록되지 않았으면 그 사실을 먼저 말하고, 같은 종류 지정 제품 가격을 참고용으로 알려준 뒤, 이 모델은 별도 견적이라고 안내합니다. 지정 제품 가격을 이 모델의 가격인 것처럼 말하지 않습니다.',
    '- 최종 금액은 문 상태와 현장 확인 후 확정된다는 점을 알립니다. 재고, 방문 가능 시간, 설치 가능 여부는 확답하지 않고 전화로 확인하도록 안내합니다.',
    '- 잠긴 문을 여는 방법이나 도어락을 해제·우회하는 방법은 설명하지 않고, 전화 상담으로 안내합니다.',
    '- 고객의 이름, 전화번호, 주소를 묻지 않습니다. 고객이 적더라도 저장되지 않으니 연락은 전화나 상담 문의를 이용하도록 안내합니다.',
    '- 도어락과 무관한 요청에는 가격·제품 안내만 도울 수 있다고 짧게 답합니다.',
    '- 존댓말로 2~4문장, 꾸밈 없는 일반 문장으로 답합니다. 목록, 제목, 굵은 글씨, 이모지는 쓰지 않습니다. 채팅창은 일반 글자만 표시합니다.'
  ].join('\n');
}

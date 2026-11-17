// Product facts are independently summarized. Rehost media only with documented permission.
import {bestinKocomProducts} from './catalog-bestin-kocom.mjs';
import {fullBrandProducts} from './catalog-full-brands.mjs';
import {lockproProducts} from './catalog-lockpro.mjs';
import {catalogPhotos} from './catalog-photos.mjs';
import {keynewsProducts,keynewsListedIds} from './catalog-keynews.mjs';
const aqaraProducts = [
  {
    id: 'k100', name: '아카라 K100', brand: 'Aqara', model: 'KL-D01D', type: '푸시풀형',
    tagline: '가볍게 밀고 당기는, 스마트한 현관.',
    description: '손잡이에 있는 지문 센서로 인증한 뒤 밀거나 당겨 문을 여는 푸시풀 도어락입니다. 지문과 비밀번호부터 Apple 홈키까지, 생활에 맞는 출입 방법을 선택할 수 있습니다.',
    tags: ['지문 인식', 'Apple 홈키', '푸시풀'],
    images: [],
    features: [
      {title:'손잡이에서 바로 지문 인식',text:'손잡이에 손을 대고 인증한 뒤 자연스럽게 밀거나 당겨 출입할 수 있습니다.'},
      {title:'익숙한 방식으로 문 열기',text:'지문, 비밀번호, NFC 태그와 Apple 홈키를 지원합니다. 홈키는 호환되는 Apple 기기와 설정이 필요합니다.'},
      {title:'스마트홈과 연결',text:'Aqara Home과 Apple Home 등 스마트홈 환경에 연동할 수 있습니다. 원격 제어와 자동화에 필요한 허브·기기 구성은 상담 시 확인해드립니다.'}
    ],
    specs: [['모델명','KL-D01D'],['형태','푸시풀형 주키 도어락'],['제품 크기','91 × 386 × 68 mm'],['전원','AA 배터리 8개'],['비상 전원','9V DC 외부 전원'],['무선 통신','Bluetooth 5.0 · Zigbee 3.0'],['제조사 설치 기준','두께 40~50 mm 방화문']],
    installation:'문 두께뿐 아니라 기존 타공 위치와 문틀 간격도 확인해야 합니다. 문 전체와 기존 도어락 사진을 보내주시면 설치 가능 여부를 안내합니다.',
    source:'https://catalogue.aqara.kr/products/doorlock-k100'
  },
  {
    id: 'l100', name: '아카라 L100', brand: 'Aqara', model: 'KL-D02D', type: '손잡이형',
    tagline: '익숙한 손잡이에 더한 스마트한 편리함.',
    description: '손잡이형 디자인에 지문 인식과 스마트홈 연결 기능을 담은 도어락입니다. 다양한 출입 방식과 앱의 출입 기록 확인 기능으로 우리 집 현관을 관리할 수 있습니다.',
    tags: ['지문 인식', 'Apple 홈키', '손잡이형'],
    images: [],
    features: [
      {title:'손잡이에 더한 지문 인식',text:'손잡이의 지문 센서를 이용해 간편하게 인증합니다. 비밀번호와 NFC 태그 등 다른 출입 방법도 사용할 수 있습니다.'},
      {title:'Apple 홈키 지원',text:'호환되는 iPhone이나 Apple Watch의 홈키를 이용할 수 있습니다. 사용 기기와 설정 조건은 상담 시 함께 확인합니다.'},
      {title:'앱으로 출입 기록 확인',text:'Aqara Home 앱 연결 후 출입 기록을 확인할 수 있습니다. 원격 제어와 스마트홈 자동화는 지원 허브·네트워크 등 별도 구성이 필요할 수 있습니다.'}
    ],
    specs: [['모델명','KL-D02D'],['형태','손잡이형 주키 도어락'],['제품 크기','78 × 264 × 80 mm'],['전원','AA 배터리 6개'],['비상 전원','USB Type-C · DC 5V'],['무선 통신','Bluetooth 5.0 · Zigbee 3.0'],['제조사 설치 기준','40~50 mm 방화문 · 전용 부품 사용 시 최대 65 mm']],
    installation:'문 두께와 기존 손잡이·타공 상태에 따라 필요한 부품과 작업이 달라집니다. 추가 타공 여부와 최종 설치 비용은 문 사진을 확인한 뒤 안내합니다.',
    source:'https://catalogue.aqara.kr/products/doorlock-l100'
  }
];
export const videos=[
  {id:'vKfQLjVWjpo',title:'K100 공식 광고',label:'AQARA · TVC',description:'아카라 라이프가 공개한 K100 TV 광고입니다.',channel:'아카라 라이프',source:'https://docs.aqaralife.kr/ko/articles/제품-소개-dabf18fd',products:['k100']},
  {id:'HHQPZkHHNW8',title:'L100 공식 사용 안내',label:'AQARA · GUIDE',description:'L100 도어락과 허브를 연결하는 제조사 안내 영상입니다.',channel:'아카라 라이프',source:'https://www.youtube.com/@aqaralife',products:['l100']}
];
export const products=[...aqaraProducts.map(p=>({...p,brand:'아카라',brandLatin:'Aqara',brandKey:'aqara',category:'main',aliases:['Aqara','아카라라이프'],images:[],mediaPermission:'official-link',verifiedAt:'2026-10-22',featured:true,sourceLabel:'아카라 공식 제품 사진·정보'})),...bestinKocomProducts,...fullBrandProducts,...lockproProducts,...keynewsProducts].map(p=>catalogPhotos[p.id]?{...p,...catalogPhotos[p.id]}:p)
  // Owner's rule (2026-11-17): show only models the supplier keynews.co.kr sells, plus Aqara. The full
  // manufacturer inventories stay in their modules; remove this filter to bring them back.
  .filter(p=>p.brandKey==='aqara'||p.id.startsWith('keynews-')||keynewsListedIds.includes(p.id));

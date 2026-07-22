# 체크리스트: 인스타 카드뉴스 자동 생성기

## Phase 1: MVP
### 스캐폴딩
- [x] Next.js 16 + TS + Tailwind 프로젝트 생성
- [x] openai / html-to-image / jszip 설치
- [x] Pretendard 폰트 로드 (layout.tsx)
- [x] 앱 테마 토큰 (globals.css)

### 데이터 · API
- [x] 슬라이드 타입 정의 (slide-types.ts)
- [x] OpenAI 카피 프롬프트 (openai.ts) — 구조/글자수 제약
- [x] 카피 생성 API (generate-copy/route.ts)

### 렌더링
- [x] Slide 레이어 컴포넌트 (Slide.tsx + module.css)
- [x] 배경 3종 (ink/cream/accent)
- [x] 표지/본문/CTA 3종 레이아웃

### UI
- [x] 주제 입력 + 예시 칩
- [x] 키컬러 선택
- [x] 실시간 미리보기 그리드
- [x] 문구 편집 (제목/설명/라벨/핸들)
- [x] 순서 이동 / 삭제 / 슬라이드 추가
- [x] 배경 전환 셀렉트

### 내보내기
- [x] 슬라이드별 PNG 다운로드
- [x] 전체 ZIP 일괄 다운로드
- [x] 폰트 로딩 대기 후 캡처

## 검증
- [ ] `npx tsc --noEmit` 타입 통과
- [ ] `npm run build` 통과
- [ ] `.env.local`에 OPENAI_API_KEY 입력 후 실제 생성 테스트
- [ ] PNG 한글 선명도 확인
- [ ] 3팀 검수 (품질/테스트/기획)

## Phase 2 (예정)
- [ ] Remotion 영상 자동화
- [ ] 캡컷 draft 파일 생성 (옵션)
- [ ] 배경 AI 이미지/스톡 옵션
- [ ] 템플릿 다종화

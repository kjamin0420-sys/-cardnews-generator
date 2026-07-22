# 계획서: 인스타 카드뉴스 자동 생성기 (CardCraft)

## 목표
주제 한 줄만 입력하면 AI가 슬라이드 문구를 다 짜고, 레이어 방식으로 렌더링해
1080×1080 PNG로 다운로드하는 웹앱.

## 전체 흐름
1. 주제 입력 ("퇴근 후 저녁 루틴") → 폼
2. 카피팀(gpt-4o-mini) → 표지/팁N장/CTA 구성 + 슬라이드별 문구 JSON → `/api/generate-copy`
3. 템플릿 엔진(React `Slide` 컴포넌트) → 문구를 레이어(배경+텍스트+장식)에 주입
4. 브라우저 실시간 미리보기 → 문구·색·순서·슬라이드 수 편집
5. 내보내기(html-to-image + JSZip) → 슬라이드별 PNG + 전체 ZIP

## 기술 결정
- Next.js 16 + TS + Tailwind 4 (미리보기 UX, DetailCraft 노하우 재활용)
- OpenAI gpt-4o-mini (카피 생성)
- 렌더링: 클라이언트 html-to-image (서버 인프라 없이 즉시 PNG)
- 폰트: Pretendard (진짜 텍스트 레이어 → 한글 안 깨짐)
- 템플릿 1종으로 시작 (ink/cream/accent 교차)
- Auth/DB 없음 (MVP)

## 변경 파일 목록
- `app/layout.tsx` — Pretendard 로드, 메타
- `app/globals.css` — 앱 테마 토큰
- `app/page.tsx` — 입력 + 미리보기 + 편집 (메인)
- `app/api/generate-copy/route.ts` — 주제 → 슬라이드 JSON
- `lib/openai.ts` — OpenAI 클라이언트 + 카피 프롬프트
- `lib/slide-types.ts` — 슬라이드 데이터 타입 + toDeck
- `lib/export.ts` — html-to-image PNG + JSZip
- `components/Slide.tsx` + `Slide.module.css` — 1080 레이어 렌더링
- `.env.local` — OPENAI_API_KEY

## 완료 기준
- [ ] 주제 입력 → 5~7장 문구 자동 생성
- [ ] 미리보기에서 문구/색/순서 편집 가능
- [ ] 슬라이드별 1080×1080 PNG + ZIP 일괄 다운로드
- [ ] 한글 텍스트 100% 선명
- [ ] `npm run dev` 로컬 구동 확인

## Phase 2 (예정)
- Remotion으로 카드뉴스 → 릴스 영상 자동화 (전환·모션·자막·BGM)
- (옵션) 캡컷 draft 파일 생성 → 손편집 핸드오프
- 배경 레이어에 AI 이미지/무료 스톡 옵션
- 템플릿 다종화 (미니멀·볼드·매거진)

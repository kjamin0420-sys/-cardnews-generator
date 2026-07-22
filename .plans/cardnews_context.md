# 맥락 노트: 인스타 카드뉴스 자동 생성기

## 결정 기록

### 레이어 렌더링 방식 (AI 이미지 통짜 금지)
- 결정: 배경/텍스트/장식을 HTML/CSS 레이어로 쌓아 렌더 → html-to-image로 PNG 캡처
- 이유: AI 이미지 모델(gpt-image 등)은 한글 텍스트를 픽셀로 뭉갠다. 진짜 폰트
  레이어를 쓰면 한글이 100% 선명. 사용자가 데모에서 직접 확인함.
- 참조: 세션 초반 아티팩트 데모(cardnews-demo.html), DetailCraft 메모리의
  "AI 이미지 한글 텍스트 렌더링 한계"

### 클라이언트 렌더링 (서버 Playwright 아님)
- 결정: MVP는 브라우저 html-to-image로 캡처
- 이유: 서버 렌더 인프라 없이 즉시 다운로드. 미리보기와 동일 결과.
- 향후: 정밀도/폰트 이슈 생기면 서버 Playwright 스크린샷으로 업그레이드

### 미리보기 축소 방식
- 결정: 슬라이드 노드는 항상 1080px(scale=1), 부모 wrapper에 transform:scale 적용
- 이유: html-to-image는 캡처 노드가 1080px여야 정확. transform을 노드 자신이 아닌
  부모에 걸어야 캡처 시 1080 유지됨.
- 참조: `app/page.tsx` 미리보기 뷰포트, `components/Slide.tsx` scale prop

### 캡컷 대신 Remotion (Phase 2)
- 결정: 영상 자동화는 Remotion으로. 캡컷은 공식 API 없음.
- 이유: 캡컷은 프로그래밍 조작 불가(비공식 draft 파일은 취약). Remotion은
  React 기반이라 슬라이드 컴포넌트를 그대로 영상화 가능.

## 관련 코드 위치
- 카피 프롬프트/글자수 제약: `lib/openai.ts` SYSTEM
- 슬라이드→배경 매핑(표지 ink/cta accent/본문 교차): `lib/slide-types.ts` toDeck
- 레이어 렌더링: `components/Slide.tsx`
- PNG/ZIP 캡처: `lib/export.ts`
- 편집·미리보기 UI: `app/page.tsx`

# CardCraft — 인스타 카드뉴스 자동 생성기

주제 한 줄만 입력하면 AI가 슬라이드 문구를 짜고, **레이어 렌더링**으로
1080×1080 PNG 카드뉴스를 만들어줍니다. (AI가 글자를 "그리는" 게 아니라
진짜 폰트 텍스트를 배경 위에 얹어 캡처 → 한글이 깨지지 않습니다.)

## 실행

```bash
# 1) OpenAI 키 입력
#    .env.local 의 OPENAI_API_KEY= 뒤에 본인 키 입력
#    (DetailCraft 의 web/.env.local 값 재사용 가능)

# 2) 개발 서버
npm run dev
# → http://localhost:3000
```

## 사용법
1. 주제 입력 (예: "퇴근 후 저녁 루틴") → **카드뉴스 생성**
2. AI가 표지 → 팁 N장 → 저장유도(CTA) 슬라이드를 자동 구성
3. 각 슬라이드의 문구·키컬러·배경·순서를 직접 편집
4. 슬라이드별 PNG(⬇) 또는 **전체 다운로드(ZIP)**

## 구조
| 파일 | 역할 |
|------|------|
| `app/page.tsx` | 입력 + 미리보기 + 편집 UI |
| `app/api/generate-copy/route.ts` | 주제 → 슬라이드 JSON |
| `lib/openai.ts` | 카피 프롬프트 (gpt-4o-mini) |
| `lib/slide-types.ts` | 슬라이드 데이터 모델 |
| `components/Slide.tsx` | 1080 레이어 렌더링 |
| `lib/export.ts` | html-to-image PNG + JSZip |

## 로드맵
- **Phase 1 (완료)**: 카드뉴스 이미지 생성 MVP
- **Phase 2 (예정)**: Remotion 영상 자동화(릴스), 배경 AI이미지/스톡 옵션, 템플릿 다종화

자세한 계획은 `.plans/` 참고.

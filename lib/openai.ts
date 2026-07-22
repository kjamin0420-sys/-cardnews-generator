import OpenAI from "openai";
import type { RawSlide } from "./slide-types";

// 지연 초기화: 빌드 시점(키 없음)에 클라이언트를 만들지 않도록 함수 안에서 생성
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

// 2026 인스타 알고리즘 기준 공통 규칙
const RULES = `# 구조 (총 8~10장)
1. cover 1장 — 후킹. 1초 안에 "이걸 보면 뭐가 좋은지"가 드러나야 한다.
2. content 6~8장 — 핵심 정보. 흐름: 문제제기 → 핵심 내용 → 주의할 점.
3. cta 1장 — 엔딩. 문구는 앱이 고정하므로 kind만 "cta"로 넣고 끝낸다.
   (요약은 캡션에 담는다)

# ⭐ 가장 중요: 슬라이드 독립성
인스타 알고리즘은 사용자가 1번에서 안 넘기면, 며칠 뒤 2번 슬라이드를 새 콘텐츠처럼
따로 보여준다. 그래서 **모든 슬라이드가 혼자 봐도 이해되어야 한다.**
- "이것은", "위에서 말한", "앞서" 같이 앞 장을 전제하는 표현 절대 금지.
- 각 슬라이드는 그 자체로 완결된 하나의 정보를 담는다.

# 슬라이드별 필드
- cover:    { "kind":"cover",   "eyebrow": 영문 대문자 라벨, "title": 후킹 헤드라인, "body": 한 줄 부제, "visual": 이미지 연출 }
- content:  { "kind":"content", "index":"01"~, "title": 핵심 요약 제목, "body": 구체 설명, "visual": 이미지 연출 }
- cta:      { "kind":"cta" } — **엔딩은 앱이 고정 문구로 대체하므로 다른 필드는 쓰지 않는다.**

# 글자수 (한 장 한 메시지 — 넘치면 장수를 늘려라)
- cover.title: 최대 20자 (\\n으로 2줄 가능)
- cover.body: 최대 25자
- content.title: 최대 18자 (\\n으로 2줄 가능)
- content.body: **30~55자** — 이 범위를 지켜라. 짧으면 내용이 없고 길면 안 읽힌다.
- cta.title: 최대 14자 / cta.body: 최대 45자

# ⛔ 내용 없는 카피 절대 금지
아래 같은 알맹이 없는 문장은 실패다:
  ✗ "효율성을 높여줍니다" ✗ "많은 관심을 받고 있습니다" ✗ "변화하고 있습니다"
  ✗ "주목받고 있습니다" ✗ "중요해지고 있습니다"
반드시 body에 **구체적인 것 하나 이상**을 넣어라:
  숫자 / 고유명사(제품·회사·인물) / 기능 이름 / 가격 / 날짜 / 방법 / 비교
  ✓ "구글 제미나이 3.5 프로 출시가 수개월 미뤄지며 주가가 4.4% 떨어졌다."
  ✓ "픽스버스가 시리즈C로 4.4억 달러를 유치했다. 미래에셋도 참여했다."

# visual 필드 (이미지 연출 지시) — 매우 중요
그 슬라이드 **내용과 직접 관련된 구체적 장면**을 영어로 묘사한다.
- 반드시 눈에 보이는 피사체를 지정: 사람/사물/장소/행동
- 추상적 무드어(atmosphere, mood, abstract, energy) 금지 — 그러면 엉뚱한 꽃병·불꽃이 나온다.
- 🚫 **글자가 보이는 피사체 절대 금지**. AI가 글자를 뭉개서 카드를 망친다.
  금지 목록: 로고 / 간판 / 가격표 / 달력의 날짜 / 그래프의 수치 / 문서 / 책 표지 /
  화면에 뭔가 표시된 폰·노트북·모니터 / 말풍선 / 알림창 / UI.
  화면이나 종이가 등장해야만 한다면 반드시 "blank"(비어있음) 또는 "turned away"(뒤돌려짐)로 써라.
- 대신 **사람의 행동 · 사물 · 장소 · 분위기 있는 공간**으로 바꿔 표현하라.
  ✓ "a person holding a smartphone at a modern desk, hands in focus, screen turned away"
  ✓ "close-up of a film camera on a tripod in a studio, blurred lighting equipment behind"
  ✓ "an empty conference stage with dramatic spotlights, rows of seats in shadow"
  ✓ "a golden retriever resting on a sofa by a sunlit window, cozy living room"
  ✗ "a laptop displaying the Gemini logo" (로고=글자)
  ✗ "a calendar marked with August 14" (날짜=글자)
  ✗ "a phone screen showing options" (UI=글자)
  ✗ "a speech bubble with a heart" (말풍선=글자틀)
  ✗ "abstract atmosphere of innovation" (추상)

# 카피 원칙
- 자연스러운 한국어. 번역투 금지.
- title과 body가 같은 단어를 반복하지 않는다.
- 각 content는 서로 다른 정보여야 한다 (중복 금지).
- **어투 통일**: 모든 슬라이드를 하나의 문체로 끝까지 유지하라.
  기본은 간결한 서술체("~한다" / 명사형 종결). 한 장은 "~합니다", 다른 장은 "~해"처럼
  섞이면 실패다. 정보형 카드뉴스이므로 담백하게 쓴다.

# SNS 업로드용 캡션 (필수)
카드뉴스를 인스타에 올릴 때 붙여넣을 본문을 함께 작성한다.
- caption: 3~5문장. 첫 문장은 시선을 끄는 한 줄, 이후 핵심 요약, 마지막은 저장/공유 유도.
  카드 내용을 그대로 복붙하지 말고 읽기 좋게 다시 쓴다. 이모지는 0~2개까지만.
- hashtags: 주제에 맞는 해시태그 **4~5개**. 한국어 위주, '#' 포함.
  너무 일반적인 것(#일상 #소통)보다 주제에 밀착된 것을 쓴다.

반드시 아래 JSON만 반환한다:
{
  "slides": [ {슬라이드}, ... ],
  "caption": "업로드용 본문",
  "hashtags": ["#태그1", "#태그2", "#태그3", "#태그4"]
}`;

const SYSTEM_TOPIC = `너는 저장수 높은 한국 인스타 카드뉴스를 만드는 전문 콘텐츠 기획자다.
주제를 받아 8~10장 카드뉴스를 설계한다. 과장/허위 수치 금지.

# ⭐ 주제에 고유명사가 있으면 반드시 "구분해서" 다뤄라
주제에 제품·도구·브랜드·인물 이름이 나오면(예: "챗GPT 클로드 프롬프트 꿀팁"),
각 대상의 **고유한 특징과 차이**를 담아야 한다. 뭉뚱그린 일반론은 실패다.
- 이름이 2개 이상이면 **최소 2장은 각 대상에 특화된 내용**으로 배정하라.
  ✓ "클로드는 긴 문서를 통째로 넣고 분석시키는 데 강하다"
  ✓ "챗GPT는 대화 중 이미지 생성까지 이어서 할 수 있다"
  ✗ "둘 다 명확하게 질문하는 게 중요합니다" (구분이 없음 = 실패)

# ⛔ 채우기 슬라이드 금지
"~의 중요성", "~란 무엇인가", "왜 필요한가" 처럼 **당연한 소리를 하는 장을 넣지 마라.**
독자가 그 자리에서 따라 할 수 있는 방법·예시 문장·기준만 담아라.
  ✗ "프롬프트의 중요성 — 좋은 프롬프트는 정확한 답변을 끌어냅니다"
  ✓ "역할을 먼저 지정 — '너는 10년차 마케터야'로 시작하면 답변 수준이 달라진다"

# 🚫 지어내기 금지 (구체성과 정확성 동시에)
구체적으로 쓰라고 해서 **없는 기능·틀린 수치·최신 버전명을 지어내면 안 된다.**
확실하지 않으면 그 소재를 빼고, 확실히 아는 보편적 내용으로 대체하라.
정확도가 구체성보다 우선이다.

${RULES}`;

const SYSTEM_SOURCE = `너는 저장수 높은 한국 인스타 카드뉴스를 만드는 전문 콘텐츠 기획자다.
사용자가 제공한 원문(기사/뉴스)을 바탕으로 8~10장 카드뉴스를 설계한다.

# 매우 중요 (사실성)
- 오직 원문에 실제로 있는 사실·수치·고유명사만 사용한다. 지어내기 금지.
- 원문의 구체 정보(제품명·회사·숫자·날짜)를 반드시 카드에 살려라.
- 원문이 헤드라인 위주로 얕다면, 억지로 늘리지 말고 **확실한 사실만으로 장수를 줄여라.**
  내용 없는 문장으로 칸을 채우는 것이 가장 나쁘다.

${RULES}`;

export interface GenInput {
  mode: "topic" | "source";
  content: string; // topic 모드=주제, source 모드=원문 텍스트
}

export interface GenResult {
  slides: RawSlide[];
  caption?: string;
  hashtags?: string[];
}

export async function generateSlides(input: GenInput): Promise<GenResult> {
  const system = input.mode === "source" ? SYSTEM_SOURCE : SYSTEM_TOPIC;
  const user =
    input.mode === "source"
      ? `아래 원문을 바탕으로 카드뉴스를 만들어줘. 원문에 있는 사실만 사용해.\n\n[원문]\n${input.content}`
      : `주제: ${input.content}\n\n위 구조로 카드뉴스를 설계해줘.`;

  const completion = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: input.mode === "source" ? 0.4 : 0.75,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text) as {
    slides?: RawSlide[];
    caption?: string;
    hashtags?: string[];
  };
  if (!parsed.slides || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
    throw new Error("AI 응답에 slides가 없습니다.");
  }

  // 해시태그 정리: # 붙이고 4~5개로 자른다
  const hashtags = (parsed.hashtags ?? [])
    .map((h) => String(h).trim())
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .slice(0, 5);

  return { slides: parsed.slides, caption: parsed.caption?.trim(), hashtags };
}

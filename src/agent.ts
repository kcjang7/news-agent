import { query } from "@anthropic-ai/claude-agent-sdk";
import nodemailer from "nodemailer";

// KST 기준 오늘 날짜
const TODAY = new Date().toLocaleDateString("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const PROMPT = `
오늘은 ${TODAY} (한국시간 기준)입니다. 다음 작업을 순서대로 수행하세요.

## 1단계: CNN 뉴스 검색
WebSearch 도구로 다음 쿼리를 사용해 검색:
- "site:cnn.com ${TODAY}"
- 가십/연예 제외, 정치·국제·경제·과학 위주
- 상위 5개 기사 URL 선정

## 2단계: 조선일보 뉴스 검색
WebSearch 도구로 다음 쿼리를 사용해 검색:
- "site:chosun.com 오늘"
- 정치·경제·사회·국제 위주
- 상위 5개 기사 URL 선정

## 3단계: 본문 확인 및 요약
각 기사를 WebFetch로 가져와 본문을 확인한 뒤, 한국어로 3~4줄 요약.
**중요: 원문 표현을 그대로 가져오지 말고, 반드시 본인의 표현으로 재구성하세요.**

## 4단계: 최종 출력
아래 HTML 형식으로만 출력하세요. 다른 설명/주석/마크다운 코드블록 없이 HTML만.

<div style="font-family: -apple-system, sans-serif; max-width: 680px; margin: 0 auto;">
  <h2 style="border-bottom: 2px solid #333; padding-bottom: 8px;">
    📰 ${TODAY} 데일리 뉴스 브리핑
  </h2>

  <h3 style="color: #cc0000;">🌍 CNN Top 5</h3>
  <ol>
    <li style="margin-bottom: 16px;">
      <a href="기사URL" style="color: #0066cc; text-decoration: none;">
        <strong>기사 제목</strong>
      </a>
      <p style="margin: 6px 0; color: #444; line-height: 1.5;">
        요약 내용 3-4줄
      </p>
    </li>
    <!-- 5개 반복 -->
  </ol>

  <h3 style="color: #003a70;">🇰🇷 조선일보 Top 5</h3>
  <ol>
    <li style="margin-bottom: 16px;">
      <a href="기사URL" style="color: #0066cc; text-decoration: none;">
        <strong>기사 제목</strong>
      </a>
      <p style="margin: 6px 0; color: #444; line-height: 1.5;">
        요약 내용 3-4줄
      </p>
    </li>
    <!-- 5개 반복 -->
  </ol>

  <hr style="margin-top: 24px; border: none; border-top: 1px solid #ddd;">
  <p style="color: #888; font-size: 12px;">
    🤖 Claude Agent SDK로 자동 생성됨
  </p>
</div>
`;

async function generateBriefing(): Promise<string> {
  console.log("🔍 뉴스 검색 및 요약 시작...");

  let htmlOutput = "";

  const result = query({
    prompt: PROMPT,
    options: {
      allowedTools: ["WebSearch", "WebFetch"],
      permissionMode: "bypassPermissions",
      model: "claude-sonnet-4-5",
      maxTurns: 30, // 검색+fetch 10번 이상 돌 수 있게
    },
  });

  for await (const message of result) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          htmlOutput += block.text;
        }
      }
    }
  }

  // HTML만 추출 (가끔 앞뒤로 부연설명이 붙는 경우 대비)
  const match = htmlOutput.match(/<div[\s\S]*<\/div>/);
  return match ? match[0] : htmlOutput;
}

async function sendEmail(html: string) {
  console.log("📧 메일 발송 준비 중...");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"News Agent" <${process.env.GMAIL_USER}>`,
    to: process.env.RECIPIENT_EMAIL,
    subject: `📰 데일리 뉴스 브리핑 - ${TODAY}`,
    html,
  });

  console.log(`✅ 메일 발송 완료: ${process.env.RECIPIENT_EMAIL}`);
}

async function main() {
  try {
    const html = await generateBriefing();

    if (!html || html.length < 100) {
      throw new Error("브리핑 생성 실패: 출력이 비어있거나 너무 짧음");
    }

    await sendEmail(html);
  } catch (err) {
    console.error("❌ 오류:", err);
    process.exit(1);
  }
}

main();
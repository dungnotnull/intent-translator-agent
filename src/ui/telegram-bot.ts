import { Bot, InlineKeyboard } from "grammy";
import type { ChatResponse } from "../types/index.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

let bot: Bot | null = null;

export function getTelegramBot(): Bot {
  if (!bot) {
    if (!BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN not configured in .env");
    }
    bot = new Bot(BOT_TOKEN);
    setupHandlers(bot);
  }
  return bot;
}

function setupHandlers(bot: Bot): void {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "👋 Xin chào! Tôi là trợ lý ảo của trường.\n\n" +
        "Bạn có thể hỏi tôi về:\n" +
        "• Học phí & tài chính\n" +
        "• Đăng ký / hủy môn học\n" +
        "• Lịch học & thời khóa biểu\n" +
        "• Bảng điểm & GPA\n" +
        "• Quy chế học vụ\n" +
        "• Giấy tờ & thủ tục hành chính\n\n" +
        "Cứ nói chuyện tự nhiên như nhắn tin với bạn bè nhé!",
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "📚 Các lệnh:\n" +
        "/start — Bắt đầu\n" +
        "/help — Trợ giúp\n" +
        "/cancel — Hủy yêu cầu hiện tại\n\n" +
        "Hoặc bạn có thể nói tự nhiên, ví dụ:\n" +
        "• \"học phí kỳ này bao nhiêu\"\n" +
        "• \"tôi muốn đăng ký môn lập trình web\"",
    );
  });

  bot.command("cancel", async (ctx) => {
    await ctx.reply("Đã hủy yêu cầu hiện tại. Bạn cần giúp gì thêm không?", {
      reply_markup: new InlineKeyboard().text("🔄 Bắt đầu lại", "restart"),
    });
  });

  bot.callbackQuery("restart", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Bạn cần giúp gì ạ?");
  });

  bot.on("message:text", async (ctx) => {
    const message = ctx.message.text;
    const sessionId = `tg-${ctx.chat.id}`;

    const typingInterval = setInterval(() => {
      ctx.api.sendChatAction(ctx.chat.id, "typing").catch(() => {});
    }, 4000);

    try {
      const res = await fetch(`http://localhost:3000/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          message,
          domain: "university",
        }),
      });

      clearInterval(typingInterval);

      if (!res.ok) {
        await ctx.reply("Có lỗi xảy ra. Vui lòng thử lại sau.");
        return;
      }

      const data = (await res.json()) as ChatResponse;
      const text = data.response;
      const intent = data.intent;

      if (
        intent &&
        ["REGISTER_COURSE_NEW", "CANCEL_COURSE_REGISTRATION", "REQUEST_DOCUMENT_ENROLLMENT"].includes(intent)
      ) {
        const keyboard = new InlineKeyboard()
          .text("✅ Xác nhận", `confirm:${sessionId}`)
          .text("❌ Hủy", `cancel:${sessionId}`);
        await ctx.reply(text, { reply_markup: keyboard });
      } else {
        await ctx.reply(text);
      }
    } catch {
      clearInterval(typingInterval);
      await ctx.reply("Không thể kết nối đến máy chủ. Vui lòng thử lại sau.");
    }
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    if (data.startsWith("confirm:")) {
      const sessionId = data.split(":")[1]!;
      const res = await fetch(`http://localhost:3000/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          message: "đồng ý",
          domain: "university",
        }),
      });

      if (res.ok) {
        const result = (await res.json()) as ChatResponse;
        await ctx.reply(result.response);
      }
    } else if (data.startsWith("cancel:")) {
      const sessionId = data.split(":")[1]!;
      const res = await fetch(`http://localhost:3000/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          message: "hủy",
          domain: "university",
        }),
      });

      if (res.ok) {
        const result = (await res.json()) as ChatResponse;
        await ctx.reply(result.response);
      }
    }
  });
}

export async function startTelegramBot(): Promise<void> {
  if (!BOT_TOKEN) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN not set — bot not started");
    return;
  }

  const bot = getTelegramBot();

  try {
    await bot.api.setMyCommands([
      { command: "start", description: "Bắt đầu" },
      { command: "help", description: "Trợ giúp" },
      { command: "cancel", description: "Hủy yêu cầu" },
    ]);

    bot.start({
      onStart: () => console.log("[telegram] Bot started"),
      drop_pending_updates: true,
    });
    console.log("[telegram] Bot polling started");
  } catch (err) {
    console.error(`[telegram] Failed to start bot: ${(err as Error).message}`);
  }
}

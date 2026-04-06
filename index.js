require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ✅ /start command
bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || "User";
  bot.sendMessage(msg.chat.id,
    `👋 *Hello ${name}!*\n\n` +
    `🤖 *Welcome to LoveBloom APK Bot*\n\n` +
    `━━━━━━━━━━━━━━━\n` +
    `📌 *Commands:*\n` +
    `• /start — Bot info\n` +
    `• /link — APK download link\n` +
    `• /status — Bot status\n\n` +
    `📤 *APK Upload:*\n` +
    `Bas .apk file send karo!\n` +
    `━━━━━━━━━━━━━━━\n` +
    `⚠️ Sirf .apk files accepted`,
    { parse_mode: "Markdown" }
  );
});

// ✅ /link command
bot.onText(/\/link/, (msg) => {
  const repo = process.env.REPO;
  const link = `https://raw.githubusercontent.com/${repo}/main/LoveBloom.apk`;
  bot.sendMessage(msg.chat.id,
    `📥 *LoveBloom APK Download Link:*\n\n` +
    `🔗 ${link}`,
    { parse_mode: "Markdown" }
  );
});

// ✅ /status command
bot.onText(/\/status/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `✅ *Bot is Online!*\n\n` +
    `📦 Repo: \`${process.env.REPO}\`\n` +
    `🟢 Status: Running`,
    { parse_mode: "Markdown" }
  );
});

// ✅ APK Upload handler
bot.on("document", async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.document.file_name.toLowerCase().endsWith(".apk")) {
    return bot.sendMessage(chatId, "❌ Sirf .apk file bhejo!");
  }

  const fileSizeMB = msg.document.file_size / (1024 * 1024);
  if (fileSizeMB > 100) {
    return bot.sendMessage(chatId, `❌ File bahut badi hai! (${fileSizeMB.toFixed(1)}MB)\n⚠️ Max limit: 100MB`);
  }

  const progressMsg = await bot.sendMessage(chatId, "⏳ *Uploading to GitHub... please wait*", { parse_mode: "Markdown" });

  try {
    // Step 1: Telegram se file download
    const file = await bot.getFile(msg.document.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error("Telegram se file download nahi hui");
    const buffer = await response.buffer();

    // Step 2: GitHub pe check karo file exist karti hai?
    const repo = process.env.REPO;
    const token = process.env.GITHUB_TOKEN;
    const fileName = "LoveBloom.apk";

    let sha = null;
    const checkFile = await fetch(
      `https://api.github.com/repos/${repo}/contents/${fileName}`,
      { headers: { Authorization: `Bearer ${token}`, "User-Agent": "apk-bot" } }
    );

    if (checkFile.ok) {
      const data = await checkFile.json();
      sha = data.sha;
    } else if (checkFile.status !== 404) {
      const err = await checkFile.json();
      throw new Error(`GitHub check failed: ${err.message}`);
    }

    // Step 3: Upload to GitHub
    const upload = await fetch(
      `https://api.github.com/repos/${repo}/contents/${fileName}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "apk-bot"
        },
        body: JSON.stringify({
          message: `🚀 Update LoveBloom APK - ${new Date().toLocaleString("en-IN")}`,
          content: buffer.toString("base64"),
          ...(sha && { sha })
        })
      }
    );

    if (upload.ok) {
      const link = `https://raw.githubusercontent.com/${repo}/main/${fileName}`;
      await bot.editMessageText(
        `✅ *APK Uploaded Successfully!*\n\n` +
        `📦 File: \`${fileName}\`\n` +
        `📏 Size: ${fileSizeMB.toFixed(2)} MB\n\n` +
        `🔗 *Download Link:*\n${link}`,
        { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: "Markdown" }
      );
    } else {
      const errData = await upload.json();
      throw new Error(errData.message || "Unknown error");
    }

  } catch (err) {
    await bot.editMessageText(
      `❌ *Upload Failed!*\n\n🔍 Reason: ${err.message}`,
      { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: "Markdown" }
    );
    console.error("Error:", err);
  }
});

console.log("🤖 LoveBloom APK Bot is running...");

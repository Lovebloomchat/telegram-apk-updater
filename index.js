require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const REPO = process.env.REPO;
const TOKEN = process.env.GITHUB_TOKEN;
const FILE_NAME = "LoveBloom.apk";
const TAG = "lovebloom"; // Tumhara existing tag — kabhi change nahi hoga

// Helper: Get existing release by tag
async function getRelease() {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases/tags/${TAG}`,
    { headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": "apk-bot" } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Release fetch failed");
  return await res.json();
}

// Helper: Delete old asset if exists
async function deleteOldAsset(releaseId) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases/${releaseId}/assets`,
    { headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": "apk-bot" } }
  );
  if (!res.ok) return;
  const assets = await res.json();
  const old = assets.find(a => a.name === FILE_NAME);
  if (old) {
    await fetch(
      `https://api.github.com/repos/${REPO}/releases/assets/${old.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": "apk-bot" }
      }
    );
  }
}

// Helper: Upload APK asset to release
async function uploadAsset(uploadUrl, buffer) {
  const url = uploadUrl.replace("{?name,label}", "");
  const res = await fetch(`${url}?name=${FILE_NAME}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/vnd.android.package-archive",
      "User-Agent": "apk-bot"
    },
    body: buffer
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Asset upload failed: ${err.message}`);
  }
}

// Main: Update existing release (purana APK replace karo)
async function updateRelease(buffer, fileSizeMB) {
  const release = await getRelease();

  if (!release) {
    throw new Error(`Release "${TAG}" nahi mila! Pehle GitHub pe manually banao.`);
  }

  // Purana APK delete karo
  await deleteOldAsset(release.id);

  // Release description update karo
  await fetch(
    `https://api.github.com/repos/${REPO}/releases/${release.id}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "apk-bot"
      },
      body: JSON.stringify({
        body: `📦 APK updated on ${new Date().toLocaleString("en-IN")}\n📏 Size: ${fileSizeMB.toFixed(2)} MB`
      })
    }
  );

  // Naya APK upload karo
  await uploadAsset(release.upload_url, buffer);
}

// ✅ /start
bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || "User";
  bot.sendMessage(msg.chat.id,
    `👋 *Hello ${name}!*\n\n` +
    `🤖 *LoveBloom APK Bot*\n\n` +
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

// ✅ /link — Tumhara permanent link
bot.onText(/\/link/, (msg) => {
  const link = `https://github.com/${REPO}/releases/download/${TAG}/${FILE_NAME}`;
  bot.sendMessage(msg.chat.id,
    `📥 *LoveBloom APK Download Link:*\n\n` +
    `🔗 ${link}\n\n` +
    `✅ Yeh link permanent hai — kabhi change nahi hoga!`,
    { parse_mode: "Markdown" }
  );
});

// ✅ /status
bot.onText(/\/status/, async (msg) => {
  try {
    const release = await getRelease();
    const info = release
      ? `🏷️ Tag: \`${TAG}\`\n📅 Last Update: ${new Date(release.published_at).toLocaleString("en-IN")}`
      : `⚠️ Release "${TAG}" nahi mila!`;

    bot.sendMessage(msg.chat.id,
      `✅ *Bot is Online!*\n\n` +
      `📦 Repo: \`${REPO}\`\n` +
      `${info}\n` +
      `🟢 Status: Running`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `✅ Bot Online\n❌ Status fetch failed: ${err.message}`);
  }
});

// ✅ APK Upload Handler
bot.on("document", async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.document.file_name.toLowerCase().endsWith(".apk")) {
    return bot.sendMessage(chatId, "❌ Sirf .apk file bhejo!");
  }

  const fileSizeMB = msg.document.file_size / (1024 * 1024);
  if (fileSizeMB > 100) {
    return bot.sendMessage(chatId,
      `❌ File bahut badi hai! (${fileSizeMB.toFixed(1)}MB)\n⚠️ Max limit: 100MB`
    );
  }

  const progressMsg = await bot.sendMessage(chatId,
    "⏳ *APK update ho raha hai... please wait*",
    { parse_mode: "Markdown" }
  );

  try {
    // Telegram se file download
    const file = await bot.getFile(msg.document.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error("Telegram se file download nahi hui");
    const buffer = await response.buffer();

    // GitHub release me APK replace karo
    await updateRelease(buffer, fileSizeMB);

    const link = `https://github.com/${REPO}/releases/download/${TAG}/${FILE_NAME}`;

    await bot.editMessageText(
      `✅ *APK Successfully Updated!*\n\n` +
      `📏 Size: ${fileSizeMB.toFixed(2)} MB\n\n` +
      `🔗 *Download Link:*\n${link}\n\n` +
      `✅ Link same hai — dobara share karne ki zarurat nahi!`,
      { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: "Markdown" }
    );

  } catch (err) {
    await bot.editMessageText(
      `❌ *Upload Failed!*\n\n🔍 Reason: ${err.message}`,
      { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: "Markdown" }
    );
    console.error("Error:", err);
  }
});

console.log("🤖 LoveBloom APK Bot is running...");

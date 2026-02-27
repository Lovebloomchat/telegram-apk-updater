require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

bot.on("document", async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.document.file_name.toLowerCase().endsWith(".apk")) {
    return bot.sendMessage(chatId, "Send APK file only");
  }

  try {
    const file = await bot.getFile(msg.document.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

    const response = await fetch(fileUrl);
    const buffer = await response.buffer();

    const repo = process.env.REPO;
    const token = process.env.GITHUB_TOKEN;
    const fileName = "LoveBloom.apk"; // fixed name

    let sha = null;
    const checkFile = await fetch(
      `https://api.github.com/repos/${repo}/contents/${fileName}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (checkFile.ok) {
      const data = await checkFile.json();
      sha = data.sha;
    }

    const upload = await fetch(
      `https://api.github.com/repos/${repo}/contents/${fileName}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: "Update LoveBloom APK",
          content: buffer.toString("base64"),
          sha: sha || undefined
        })
      }
    );

    if (upload.ok) {
      bot.sendMessage(chatId, "Apk Uploaded Successfully ✅️");
    } else {
      bot.sendMessage(chatId, "Upload Failed ❌");
    }

  } catch (err) {
    bot.sendMessage(chatId, "Error ❌");
  }
});

import { SlashCommandBuilder } from "discord.js";

export const SLASH_COMMAND_DEFINITIONS = [
  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("このチャンネルのAIコンテキストをクリアします"),

  new SlashCommandBuilder()
    .setName("tone")
    .setDescription("AIの応答トーンを管理します")
    .addSubcommand(sub => sub.setName("show").setDescription("現在のトーンを表示します"))
    .addSubcommand(sub => sub.setName("reset").setDescription("デフォルトにリセットします"))
    .addSubcommand(sub =>
      sub.setName("preset").setDescription("プリセットに切り替えます")
        .addStringOption(opt =>
          opt.setName("name").setDescription("プリセット名").setRequired(true)
            .addChoices(
              { name: "デフォルト", value: "default" },
              { name: "カジュアル", value: "casual" },
              { name: "フォーマル", value: "formal" },
              { name: "おもしろ", value: "funny" },
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("custom").setDescription("カスタムトーンを設定します")
        .addStringOption(opt =>
          opt.setName("text").setDescription("プロンプトテキスト").setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName("calendar")
    .setDescription("カレンダーモードを管理します")
    .addSubcommand(sub => sub.setName("on").setDescription("カレンダーモードを開始します"))
    .addSubcommand(sub => sub.setName("off").setDescription("カレンダーモードを終了します"))
    .addSubcommand(sub => sub.setName("status").setDescription("現在の状態を表示します"))
    .addSubcommand(sub =>
      sub.setName("default").setDescription("デフォルトカレンダーを設定します")
        .addStringOption(opt => opt.setName("name").setDescription("カレンダー名").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("default-global").setDescription("全チャンネル共通のデフォルトカレンダーを設定します")
        .addStringOption(opt => opt.setName("name").setDescription("カレンダー名").setRequired(true))
    )
    .addSubcommand(sub => sub.setName("clear-default").setDescription("デフォルト設定をクリアします")),

  new SlashCommandBuilder()
    .setName("channel")
    .setDescription("常時応答モードを管理します")
    .addSubcommand(sub => sub.setName("on").setDescription("常時応答モードを開始します"))
    .addSubcommand(sub => sub.setName("off").setDescription("常時応答モードを終了します"))
    .addSubcommand(sub => sub.setName("status").setDescription("現在の状態を表示します")),

].map(cmd => cmd.toJSON());

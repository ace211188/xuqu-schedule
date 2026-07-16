// 個性化問候：分時段、分性別、個人專屬，每次登入隨機不同

const FEMALE = new Set(["美君", "恩妤", "蓁芸"]);
export function genderOf(name: string): "f" | "m" {
  return FEMALE.has(name) ? "f" : "m";
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 依時段的招呼開頭（多變化）
function timeHi(name: string, d: Date): string {
  const h = d.getHours();
  const n = `${name}老師`;
  if (h >= 5 && h < 11)
    return pick([
      `早安 ☀️ ${n}`,
      `早安呀 🌅 ${n}`,
      `早～ ${n}，新的一天開始囉`,
      `Morning 🐣 ${n}`,
      `${n}早安，今天也要加油 ✨`,
    ]);
  if (h >= 11 && h < 14)
    return pick([
      `午安 🍱 ${n}`,
      `中午好 ☀️ ${n}`,
      `${n}午安，吃飽了嗎`,
      `午安午安 🍜 ${n}`,
    ]);
  if (h >= 14 && h < 18)
    return pick([
      `下午好 ☕ ${n}`,
      `午後愉快 🍰 ${n}`,
      `${n}下午好，來杯咖啡吧`,
      `Hi ${n}，下午時光 🌤️`,
    ]);
  if (h >= 18 && h < 22)
    return pick([
      `晚安 🌙 ${n}`,
      `晚上好 ✨ ${n}`,
      `${n}辛苦了一天 🌆`,
      `Evening 🌃 ${n}`,
    ]);
  return pick([
    `夜深了 🌌 ${n}`,
    `這麼晚還在忙？${n}辛苦了 🌙`,
    `${n}，夜貓子你好 🦉`,
    `深夜好 ⭐ ${n}`,
  ]);
}

// 通用鼓勵/關心（男女皆適用）
const SUB_GENERAL = [
  "花一分鐘把排課填一填吧～",
  "今天也謝謝你為孩子們付出 💛",
  "排課填好，這個月就順順的囉！",
  "有你在，教室特別有溫度 🎵",
  "慢慢填不急，填錯隨時能改 🙂",
  "順手更新一下時間吧，超快的！",
  "你的用心，孩子們都感受得到 ✨",
  "喝口水、深呼吸，再來排課吧～",
];
// 偏女性口吻（溫柔可愛）
const SUB_F = [
  "今天也美美的一天呀 🌸",
  "辛苦了，記得對自己溫柔一點 💕",
  "老師今天氣色一定很好 ☺️",
  "填完排課，去吃個甜點犒賞自己吧 🍮",
  "你總是這麼細心，真的很棒 🌷",
];
// 偏男性口吻（爽朗）
const SUB_M = [
  "帥氣的老師，來排個課吧 😎",
  "今天狀態一定很讚 💪",
  "三兩下就搞定，衝吧！🔥",
  "辛苦啦兄弟，喝杯咖啡再戰 ☕",
  "穩穩的，交給你最放心 👍",
];
// 個人專屬（每位老師客製）
const PERSONAL: Record<string, string[]> = {
  美君: ["美君老師的長笛聲最療癒了 🎶", "又是被美君老師照亮的一天 🌟"],
  恩妤: ["恩妤老師的鋼琴總是那麼溫暖 🎹", "恩妤老師，today is your day ✨"],
  蓁芸: ["蓁芸老師的小提琴超迷人 🎻", "有蓁芸老師在，音準都乖乖的 😄"],
  奕寬: ["奕寬老師的鋼琴魂燃起來 🎹🔥", "奕寬老師今天也很罩 👑"],
  宇群: ["宇群老師的鼓點超帶勁 🥁", "宇群老師一敲，全場都嗨了 🤟"],
  孟凱: ["孟凱老師今天也超有型 😎", "孟凱老師出手，穩！🎸"],
};

const WARM_LINES = [
  "你的每一堂課，都是孩子音樂路上的光 ✨",
  "謝謝你把時間交給序曲 💛",
  "音樂讓世界更美好，而你正在創造它 🎵",
  "每個音符背後，都是你的用心 🎼",
  "序曲有你，真好 🌟",
];

export function greetingFor(name: string, d = new Date()) {
  const gender = genderOf(name);
  const pool = [
    ...SUB_GENERAL,
    ...(gender === "f" ? SUB_F : SUB_M),
    ...(PERSONAL[name] ?? []),
  ];
  return { hi: timeHi(name, d), sub: pick(pool), line: pick(WARM_LINES) };
}

// 依填寫進度給鼓勵語
export function progressCheer(count: number) {
  if (count === 0) return "點一格開始吧！";
  if (count < 6) return "好的開始 👍";
  if (count < 16) return "進行中，加油～";
  if (count < 30) return "快完成囉！💪";
  return "太棒了，排得好滿！🎉";
}

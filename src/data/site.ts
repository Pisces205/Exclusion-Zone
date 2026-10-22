/**
 * 全站可调参数与恒星数据。
 * 想改名字 / slogan / 导航 / 恒星，都只改这个文件即可。
 */

export const site = {
  name: "深空禁区",
  nameLatin: "Exclusion Zone",
  eyebrow: "宇宙主题个人网站",
  slogan: "充满褶皱的宇宙里，不只有空大的风",
  hint: "移动鼠标探索宇宙",
  footer: "© 2026 · 第四方向观测站 · 伊卡洛斯站",
  coordinates: "RA 05h 35m · DEC −05° 27′",
};

/**
 * 「联系」页的联系方式。
 * 邮箱和微信都没有站内能直接跳转的协议（mailto 会甩出一个邮件客户端，等于把访客带离站点），
 * 两者都是点图标就地展开账号 + 复制：不跳转，也不换页。
 */
export interface ContactChannel {
  /** 入口下方的名字 */
  label: string;
  /** 展开面板上的小标签，同时用作可访问名里的宾语（展开微信号 / 展开邮箱地址） */
  tag: string;
  /** 账号本体 */
  handle: string;
}

export const contact = {
  /** 身份行，对应参考图里 Web & Mobile Developer 的位置 */
  role: "Vibe Coding",
  /** 引号里的一句自述 */
  quote: "不过是褶皱宇宙里，一颗自己发光的脉冲星。",
  /** 唯一带外链的入口：GitHub 有地址，就是正常跳转 */
  github: { label: "GitHub", handle: "Pisces205", href: "https://github.com/Pisces205" },
  email: { label: "邮箱", tag: "邮箱地址", handle: "2057162675@qq.com" } satisfies ContactChannel,
  wechat: { label: "微信", tag: "微信号", handle: "hq666ovo" } satisfies ContactChannel,
};

/** 就地展开的两个入口，顺序与页面上的排列一致 */
export const contactChannels = { email: contact.email, wechat: contact.wechat } as const;
export type ContactChannelId = keyof typeof contactChannels;

export type StarKind = "blueGiant" | "redGiant" | "sun" | "neutronStar" | "binary";

export interface StarDef {
  /** 唯一 id */ id: string;
  /** 天体学名，出现在悬停字幕里 */ name: string;
  /** 学名下方的小字 */ nameEn: string;
  /** 这块恒星代表的板块名 */ section: string;
  /** 板块英文 */ sectionEn: string;
  /** 一句话描述，字幕里淡淡的一行 */ tagline: string;
  kind: StarKind;
  /** 主色（光晕 / 粒子 / 过渡色） */ color: string;
  /** 核心色 */ core: string;
  /** 该板块页面的背景色（黑洞吞掉它之后过渡到的颜色） */ pageBg: string;
  /** 基准半径（按 1440px 视口宽度等比缩放） */ radius: number;
  /** 归一化坐标 0..1（相对视口宽高） */ x: number;
  y: number;
  /** 呼吸脉动周期（秒）与幅度 */ pulsePeriod: number;
  pulseAmount: number;
  /** 活跃半径系数：距离 < radius*lure 时开始吸积 */ lure: number;
}

export const stars: StarDef[] = [
  {
    id: "blue-giant",
    name: "蓝巨星",
    nameEn: "BLUE GIANT · 织女一",
    section: "音乐",
    sectionEn: "MUSIC",
    tagline: "来自月背的琴声",
    kind: "blueGiant",
    color: "#8fb6ff",
    core: "#eef4ff",
    pageBg: "#05060c",
    radius: 30,
    x: 0.78,
    y: 0.22,
    pulsePeriod: 5.4,
    pulseAmount: 0.06,
    lure: 7,
  },
  {
    id: "red-giant",
    name: "红巨星",
    nameEn: "RED GIANT · 参宿四",
    section: "作品",
    sectionEn: "WORKS",
    tagline: "光融在黑色的雨里，这是短暂的彩虹",
    kind: "redGiant",
    color: "#ff7a4d",
    core: "#ffd9b8",
    pageBg: "#0c0503",
    radius: 46,
    x: 0.87,
    y: 0.6,
    pulsePeriod: 7.8,
    pulseAmount: 0.09,
    lure: 6,
  },
  {
    id: "sun",
    name: "黄矮星",
    nameEn: "G-TYPE STAR · 太阳",
    section: "文字",
    sectionEn: "WRITING",
    tagline: "把想象写进诗歌，留文字记录思想",
    kind: "sun",
    color: "#ffce7d",
    core: "#fff6e2",
    pageBg: "#0b0803",
    radius: 22,
    x: 0.48,
    y: 0.75,
    pulsePeriod: 9.2,
    pulseAmount: 0.05,
    lure: 7,
  },
  {
    id: "neutron-star",
    name: "中子星",
    nameEn: "NEUTRON STAR · PULSAR",
    section: "联系",
    sectionEn: "CONTACT",
    tagline: "完全的自主、完全的中心",
    kind: "neutronStar",
    color: "#bfe6ff",
    core: "#ffffff",
    pageBg: "#04070b",
    radius: 9,
    /* 悬停字幕横向正对星心、挂在星的正上 / 正下，字幕框宽 216px；星太靠左时会压到首页大标题，
       所以中子星从 0.275 挪到了 0.37：1440 宽下字幕的 tagline 行离大标题右缘只剩 1.7px，
       1280 / 1152 / 1024 宽仍会擦到那一行 5.7 / 11.7 / 17.7px（那时大标题已淡到 25%），
       834 / 768 宽因为上下错开反而干净。再往右挪也救不了窄屏——390 宽下字幕比标题列还宽 */
    x: 0.37,
    y: 0.155,
    pulsePeriod: 3.1,
    pulseAmount: 0.14,
    lure: 12,
  },
  {
    id: "binary",
    name: "双星系统",
    nameEn: "BINARY SYSTEM · 天秤",
    /* 天秤的板块名是「生活」（红巨星是「作品」）：点进去共用 WorksPage 那张翻卡页，
       但读的是自己的 lifeWorks 列表（见 src/data/works.ts），与作品页那 7 张互不影响 */
    section: "生活",
    sectionEn: "LIFE",
    tagline: "不是存在引力就能诞生链接",
    kind: "binary",
    color: "#d7c2ff",
    core: "#f4edff",
    pageBg: "#07050d",
    radius: 15,
    x: 0.62,
    y: 0.1,
    pulsePeriod: 6.6,
    pulseAmount: 0.08,
    lure: 9,
  },
];

/* 底部导航：作品由红巨星承载。双星系统不在导航里——点星进入的是「生活」，读 lifeWorks（13 张），
   与作品页的列表互不影响。 */
export const nav = [
  { label: "作品", en: "WORKS", starId: "red-giant" },
  { label: "音乐", en: "MUSIC", starId: "blue-giant" },
  { label: "文字", en: "WRITING", starId: "sun" },
  { label: "联系", en: "CONTACT", starId: "neutron-star" },
];

/* 「音乐」板块终局的三张卡片已升级为真实专辑展示：数据在 src/data/albums.json（scripts/album.mjs 维护） */

/* ------------------------------------------------------------------ */
/* 背景音乐：主页随机播放 globalTracks，进入「音乐」板块切换 blueGiantTrack */
/* 文件放在 public/Music/ 下，file 字段是相对 Music/ 的路径（保留原文件名） */

export interface Track {
  /** 中文/主标题，胶囊里滚动展示 */ title: string;
  /** 英文副题 */ titleEn: string;
  /** 艺术家 */ artist: string;
  /** 相对 public/Music/ 的文件路径（本地曲目） */ file?: string;
  /** 网络直链（网易云播放走这条，优先级高于 file；跨域故走独立 audio 通道） */ url?: string;
  /** 网易云歌曲 id；队列条目可以先不带 url，播放时按它现取直链 */
  songId?: number;
  /** 队列内稳定标识：同一首歌在歌单里可以出现多次，不能用歌曲 id 当 key */
  uid?: string;
}

/** 主页 ambient 曲池：随机挑一首播放 */
export const globalTracks: Track[] = [
  { title: "向晚的丘甸", titleEn: "FIELDS AFTER DUSK", artist: "HOYO-MiX", file: "HOYO-MiX - 向晚的丘甸 Fields After Dusk.mp3" },
  { title: "地上的仰望", titleEn: "WE CHOOSE THE MOON", artist: "HOYO-MiX", file: "HOYO-MiX - 地上的仰望 We Choose the Moon.mp3" },
  { title: "失色的流岚", titleEn: "TARNISHED STORM", artist: "HOYO-MiX", file: "HOYO-MiX - 失色的流岚 Tarnished Storm.mp3" },
  { title: "望月者的心愿", titleEn: "NIN-KIGGIA'S MESSAGE", artist: "HOYO-MiX", file: "HOYO-MiX - 望月者的心愿 Nin-Kiggia‘s Message.mp3" },
  { title: "游步欣愉", titleEn: "GLADSOME RAMBLE", artist: "HOYO-MiX", file: "HOYO-MiX - 游步欣愉 Gladsome Ramble.mp3" },
  { title: "滨海拂风", titleEn: "WHIRLING OUT AND OVER", artist: "HOYO-MiX", file: "HOYO-MiX - 滨海拂风 Whirling Out and Over.mp3" },
  { title: "须臾的舒闲", titleEn: "TRANSIENT TRANQUILITY", artist: "HOYO-MiX", file: "HOYO-MiX - 须臾的舒闲 Transient Tranquility.mp3" },
];

/** 「音乐」板块专属：进页淡入、离开淡出并恢复 ambient */
export const blueGiantTrack: Track = {
  title: "视界中的嗓音",
  titleEn: "THE GREAT GIG IN THE SKY",
  artist: "PINK FLOYD",
  file: "蓝巨星/Pink Floyd - The Great Gig in the Sky.mp3",
};

/** 音乐全局参数：默认音量 / 频谱条数 */
export const audioConfig = {
  volume: 0.3,
  bars: 44,
};

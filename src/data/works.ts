/**
 * 作品页 / 生活页的数据源：一条**平铺**的卡片列表，页面直接在上面左右翻。
 *
 * 两个入口各有一份列表——`works` 给「作品」（红巨星），`lifeWorks` 给「生活」（双星 / 天秤）——
 * 互不影响：加新卡 = 在对应数组末尾（"就在下面"）补一条；翻卡顺序就是数组顺序，不用改组件。
 * 早先这里还分「卡包封面 → 卡包内部」两层，用户觉得封面那一层不如原来直接翻好看，已撤掉。
 *
 * 一张卡：图片或视频共用同一套堆叠卡片与右侧文案。
 */
export interface WorkItem {
  id: string;
  /** 卡片大字标题：作品名 / 片段名 */
  title: string;
  /** 卡片小字英文副题 */
  titleEn: string;
  kind: "image" | "video";
  /** 相对 public/ 的路径，渲染时按路径段编码 */
  src: string;
  /** 视频封面；没有时浏览器会自己抓首帧 */
  poster?: string;
  date?: string;
  /** 技术性附注，显示在故事下面那行等宽小字里 */
  meta?: string;
  story: string;
  /** 可选站外链接，例如《深空行者》的在线游玩地址；带了的卡片会在右侧多出一个按钮 */
  href?: string;
  hrefLabel?: string;
}

/**
 * 《深空行者》的在线游玩入口。挂在这个作品的每一张卡上——翻到哪一张都能直接进游戏，
 * 和以前整包共用一个链接时的手感一致。别的作品想要自己的链接，就在自己的卡片上写。
 */
const SPACETRAVELER_GAME = {
  href: "https://pisces205.github.io/SpaceTraveler/",
  hrefLabel: "在线游玩",
};

/** 顺序：入口 → 四段实机影像 → 两张设计原画收尾（原画与对应演示分开，靠 story 互相指认） */
const spaceTravelerItems: WorkItem[] = [
  {
    id: "spacetraveler-launch",
    title: "启程",
    titleEn: "LAUNCH",
    kind: "image",
    src: "作品/cover-spacetraveler.webp",
    date: "2026-10-21",
    meta: "游戏入口 · 在线游玩",
    story: "深空行者 · 从这里启程。四段实机影像与两张设计原画收在后六张。",
    ...SPACETRAVELER_GAME,
  },
  {
    id: "spacetraveler-boss-1",
    title: "Boss · 其一",
    titleEn: "BOSS I",
    kind: "video",
    src: "作品/SpaceTraveler/Boss1.mp4",
    poster: "作品/SpaceTraveler/Boss1.webp",
    date: "2026-10-21",
    meta: "30s · 游戏实录 · 静音",
    story: "深空行者 · 第一场 Boss 战实机记录。",
    ...SPACETRAVELER_GAME,
  },
  {
    id: "spacetraveler-boss-2",
    title: "Boss · 其二",
    titleEn: "BOSS II",
    kind: "video",
    src: "作品/SpaceTraveler/Boss2.mp4",
    poster: "作品/SpaceTraveler/Boss2.webp",
    date: "2026-10-21",
    meta: "25s · 游戏实录 · 静音",
    story: "深空行者 · 第二场 Boss 战实机记录。",
    ...SPACETRAVELER_GAME,
  },
  {
    id: "spacetraveler-boss-3",
    title: "Boss · 其三",
    titleEn: "BOSS III",
    kind: "video",
    src: "作品/SpaceTraveler/Boss3.mp4",
    poster: "作品/SpaceTraveler/Boss3.webp",
    date: "2026-10-21",
    meta: "40s · 游戏实录 · 静音",
    story: "深空行者 · 第三场 Boss 战实机记录。",
    ...SPACETRAVELER_GAME,
  },
  {
    id: "spacetraveler-explosion",
    title: "爆炸粒子",
    titleEn: "PARTICLE BURST",
    kind: "video",
    src: "作品/SpaceTraveler/爆炸粒子.mp4",
    poster: "作品/SpaceTraveler/爆炸粒子.webp",
    date: "2026-10-21",
    meta: "21s · 游戏实录 · 静音",
    story: "深空行者 · 爆炸粒子演出实机记录。",
    ...SPACETRAVELER_GAME,
  },
  {
    id: "spacetraveler-boss-1-art",
    title: "原画 · 其一",
    titleEn: "CONCEPT ART I",
    kind: "image",
    src: "作品/SpaceTraveler/Boss1原画.webp",
    date: "2026-10-21",
    meta: "BOSS I · 设计原画",
    story: "深空行者 · 第一场 Boss「时空吞噬者」的设计原画，对应前面第一段实机演示。",
    ...SPACETRAVELER_GAME,
  },
  {
    id: "spacetraveler-boss-2-art",
    title: "原画 · 其二",
    titleEn: "CONCEPT ART II",
    kind: "image",
    src: "作品/SpaceTraveler/Boss2原画.webp",
    date: "2026-10-21",
    meta: "BOSS II · 设计原画",
    story: "深空行者 · 第二场 Boss 的设计原画，对应前面第二段实机演示。",
    ...SPACETRAVELER_GAME,
  },
];

/**
 * 「作品」列表：目前只有《深空行者》一组，共 7 张卡。
 *
 * 原先的「旅途影像」（PHOTO / VIDEO，来自 src/data/gallery.ts）已从站点撤下，
 * 图片与封面移到了 backup/，不参与构建（/backup/ 与 /影像/ 都在 .gitignore 里，新克隆里两份都没有）。要恢复的话：
 *   1) 把 backup/影像/ 挪回**仓库根**的 影像/（build-gallery.mjs 的 SRC_DIR 读的是这里，不是 public/影像/）
 *   2) 在下面把 galleryItems 映射成 WorkItem 追加进来，字段名 place/placeEn/file → title/titleEn/src
 * 生成脚本 scripts/build-gallery.mjs（扫描根目录 影像/）与 scripts/build-covers.mjs 都还在。
 */
export const works: WorkItem[] = [...spaceTravelerItems];

/**
 * 「生活」列表：13 张卡，素材在 `public/生活/`（10 张照片 + 3 段视频）。
 *
 * 顺序按「校园 → 猫 → 短视频 → 比赛 → 游戏 → 证」排，想换顺序直接调数组，
 * 翻卡顺序就是数组顺序。三段视频没给封面图（`poster` 省略），卡片会自己抓首帧；
 * 播放静音是 `CardFace` 里 `<video muted loop playsInline>` 统一保证的，
 * 而且只有翻到最上面那张才播、滑走就暂停，不需要在这里写任何开关。
 *
 * 三段视频原本是手机/微信导出的 **HEVC（H.265，`hvc1`）**——浏览器不自带 HEVC 解码器，
 * 只有拿到硬件/系统解码支持时才出画面，缺解码的环境会「时间轴在走、画面全空、控制台不报错」，
 * 看起来就是一张空的玻璃卡。已统一转成 **H.264（`avc1`，High，720p，`+faststart`）**，
 * 全平台可播；转码后的文件就是现在这三段，HEVC 原件在 `backup/生活-原始/`（该目录在 .gitignore 里）。
 * 以后再加视频，导出时选「H.264 / 兼容性最佳」，别选 HEVC。
 *
 * 下面的标题 / 一句话是照文件名起的**草稿**，想改成自己的说法直接改 `title` / `story`。
 */
export const lifeWorks: WorkItem[] = [
  {
    id: "life-campus-dusk",
    title: "晚霞",
    titleEn: "DUSK",
    kind: "image",
    src: "生活/学校晚霞.jpg",
    meta: "照片 · 校园 · 黄昏",
    story: "学校里那天傍晚的晚霞。",
  },
  {
    id: "life-willows",
    title: "杨柳与绿水",
    titleEn: "WILLOWS",
    kind: "image",
    src: "生活/学校杨柳绿水.jpg",
    meta: "照片 · 校园",
    story: "学校的杨柳，和水里的绿。",
  },
  {
    id: "life-west-lake",
    title: "西湖",
    titleEn: "WEST LAKE",
    kind: "image",
    src: "生活/西湖.jpg",
    meta: "照片 · 湖",
    story: "西湖边的一帧。",
  },
  {
    id: "life-lonely-sky",
    title: "孤独感天空",
    titleEn: "EMPTY SKY",
    kind: "image",
    src: "生活/孤独感天空.jpg",
    meta: "照片 · 天空",
    story: "抬头的时候，天就是这样的。",
  },
  {
    id: "life-kitten",
    title: "小猫",
    titleEn: "KITTEN",
    kind: "image",
    src: "生活/小猫.jpg",
    meta: "照片 · 猫",
    story: "家里的小猫。",
  },
  {
    id: "life-kitten-2",
    title: "小猫 · 其二",
    titleEn: "KITTEN II",
    kind: "image",
    src: "生活/小猫2.jpg",
    meta: "照片 · 猫",
    story: "同一只，换了张脸。",
  },
  {
    id: "life-bird",
    title: "养的小鸟",
    titleEn: "PET BIRD",
    kind: "video",
    src: "生活/养的小鸟.mp4",
    meta: "5s · 视频 · 静音",
    story: "养的小鸟。",
  },
  {
    id: "life-photography",
    title: "摄影",
    titleEn: "VIDEOGRAPHY",
    kind: "video",
    src: "生活/摄影.mp4",
    meta: "13s · 视频 · 静音",
    story: "一段摄影记录。",
  },
  {
    id: "life-pingpong",
    title: "乒乓校赛",
    titleEn: "PING-PONG",
    kind: "image",
    src: "生活/嘉兴大学乒乓校赛第一.jpg",
    meta: "照片 · 比赛",
    story: "嘉兴大学的乒乓球校赛。",
  },
  {
    id: "life-honor-of-kings",
    title: "孙权与卢雅娜",
    titleEn: "HONOR OF KINGS",
    kind: "image",
    src: "生活/王者孙权，卢雅娜国标.jpg",
    meta: "照片 · 游戏 · 国标",
    story: "王者荣耀：孙权和卢雅娜的国标。",
  },
  {
    id: "life-wukill",
    title: "逆风五杀",
    titleEn: "PENTA KILL",
    kind: "video",
    src: "生活/孙权逆风五杀.mp4",
    meta: "20s · 视频 · 静音",
    story: "逆风局里，孙权的五杀。",
  },
  {
    id: "life-drone-license",
    title: "无人机证",
    titleEn: "DRONE LICENSE",
    kind: "image",
    src: "生活/无人机证.jpg",
    meta: "照片 · 证书",
    story: "无人机驾驶证。",
  },
  {
    id: "life-prompt-cert",
    title: "Prompt 证",
    titleEn: "PROMPT CERT",
    kind: "image",
    src: "生活/prompt证.jpg",
    meta: "照片 · 证书",
    story: "Prompt 方向的一张证书。",
  },
];
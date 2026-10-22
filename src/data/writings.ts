/**
 * 「文字」板块收录的文档作品。
 * PDF 原件放在 public/文字/，构建时原样复制到站点根目录的 文字/ 下。
 */
export interface Writing {
  id: string;
  /** 卡片右上角的序号 */
  index: string;
  title: string;
  titleEn: string;
  /** 文档类型，显示在卡片顶部 */
  category: string;
  description: string;
  /** 相对 public/文字/ 的文件名 */
  file: string;
  pages: number;
  /** 展示用文件大小，与磁盘上的原件保持一致 */
  size: string;
  /** 该文档的强调色，用于分类、页数与链接 */
  accent: string;
}

export const writings: Writing[] = [
  {
    id: "spacetraveler-gdd",
    index: "01",
    title: "深空行者 · 游戏策划案",
    titleEn: "SPACETRAVELER · GAME DESIGN DOCUMENT",
    category: "DESIGN DOCUMENT",
    description: "《深空行者》的完整游戏策划案，记录这款网页小游戏从概念到可玩版本的设计过程。",
    file: "spacetraveler-gdd.pdf",
    pages: 17,
    size: "1.2 MB",
    accent: "#ffce7d",
  },
  {
    id: "genshin-dungeon-teardown",
    index: "02",
    title: "原神 · 副本系统拆解",
    titleEn: "GENSHIN IMPACT · DUNGEON TEARDOWN",
    category: "SYSTEM TEARDOWN",
    description: "以《原神》副本系统为对象，拆解关卡结构、奖励设计与重复游玩动力。",
    file: "genshin-dungeon-teardown.pdf",
    pages: 15,
    size: "1.2 MB",
    accent: "#cbb9ff",
  },
  {
    id: "honor-of-kings-review",
    index: "03",
    title: "王者荣耀 · 评测与隐藏机制",
    titleEn: "HONOR OF KINGS · REVIEW & HIDDEN MECHANICS",
    category: "GAME REVIEW",
    description: "《王者荣耀》的完整评测，以及那些不写在教学里的隐藏机制拆解。",
    file: "honor-of-kings-review.pdf",
    pages: 9,
    size: "746 KB",
    accent: "#ffad7d",
  },
];

export const writingPageCount = writings.reduce((sum, writing) => sum + writing.pages, 0);

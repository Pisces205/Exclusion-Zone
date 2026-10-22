/**
 * 板块背景注册表：star.id → 场景。App 只在命中时渲染 SceneSectionPage，
 * 未命中（以及 WebGL 不可用）继续走静态 SectionPage。
 */

import { YellowDwarfScene } from "./yellowdwarf";
import { NeutronStarScene } from "./neutronstar";
import { BinaryScene } from "./binary";

export interface SceneStats {
  /** 帧时指数滑动平均（ms） */
  frameEMA: number;
  /** 当前自适应分辨率档位下标 */
  scaleIdx: number;
  /** 累计绘制帧数 */
  frames: number;
}

export interface SectionScene {
  readonly supported: boolean;
  /** DEV 调试 / 自检用：渲染统计 */
  readonly stats?: SceneStats;
  destroy(): void;
  /** 无头截图 / reduced-motion 时手动出一帧 */
  debugDraw?(t?: number): void;
}

export interface SectionSceneOptions {
  reducedMotion?: boolean;
}

type SceneCreator = (canvas: HTMLCanvasElement, opts: SectionSceneOptions) => SectionScene;

const SCENES: Record<string, SceneCreator> = {
  sun: (canvas, opts) => new YellowDwarfScene(canvas, opts),
  "neutron-star": (canvas, opts) => new NeutronStarScene(canvas, opts),
  binary: (canvas, opts) => new BinaryScene(canvas, opts),
};

export function hasSectionScene(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(SCENES, id);
}

export function createSectionScene(
  id: string,
  canvas: HTMLCanvasElement,
  opts: SectionSceneOptions = {}
): SectionScene | null {
  const make = SCENES[id];
  return make ? make(canvas, opts) : null;
}

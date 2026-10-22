# 深空禁区 · Exclusion Zone · Interactive Black Hole Universe

> 一个把整个个人网站做成可交互黑洞的尝试：移动鼠标，你将成为一个大质量黑洞。

**在线地址：** <https://rainburst.cc>

![首页 · 一片被鼠标压弯的宇宙](./docs/screenshot-hero.png)

---

## 这是什么

这不是一份普通的作品集，而是一片你亲手操控的宇宙。

- 你的鼠标就是一个**大质量黑洞**。划过屏幕时，它会实时弯曲背景的星空点阵、把引力透镜的光晕拖到身后、沿途吸积漂浮的彗星与尘埃。
- 宇宙里悬着**五颗恒星**，通往四个板块——蓝巨星（音乐）、红巨星（作品）、黄矮星（文字）、中子星（联系），外加标注为**生活**的双星系统「天秤」。把黑洞拖到某颗星附近，会触发挥视界吞噬动画，随后跳转进对应板块页。悬停恒星会浮出字幕：名称、板块、一句话与「点击进入」，**横向正对星心**——星落在视口下半时（黄矮星「文字」0.75、红巨星「作品」0.6）字幕翻到星的**正上方**，其余三颗（中子星、蓝巨星、双星）挂在**正下方**，字幕离星心 46px。翻上去这一步正是「文字」那个老毛病的解法：恒星落得低时字幕不再贴着浏览器底边，「点击进入」不会再被吃掉（实测八种视口下字幕四边都完整）。中子星因此从屏幕左侧挪到了 0.37——1440 宽下字幕的 tagline 行离首页大标题右缘只剩 1.7px，1280 / 1152 / 1024 宽仍会擦到那一行 5.7 / 11.7 / 17.7px，834 与 768 宽反倒干净（大标题在竖直方向错开了）；窄屏（≤640）字幕宽 216px，必然跨过左侧标题列，只是那时大标题已经淡到 25%，文字不算互相打架。
- 其中**「音乐」板块**走的是一个完全独立设计的黑洞电影页：滚动进度驱动相机从远景一路推进到卡冈图雅特写，看着一颗蓝巨星的大气被潮汐力一层层撕碎、汇入吸积盘。
- **「作品」板块**是一条**平铺的卡片序列**：《深空行者》的封面、四段静音实机录像、两张 Boss 原画，左右拖动（或方向键 / 卡片两侧的箭头）直接翻，右侧同时换文案与外链。加新作品就在 [`src/data/works.ts`](./src/data/works.ts) 的 `works` 数组末尾补一条，顺序即翻卡顺序。
- **「生活」板块**（双星系统入口）用的是同一套翻卡页，但读的是自己的 `lifeWorks` 列表——目前 13 张卡（10 张照片 + 3 段视频，素材在 [`public/生活/`](./public/生活/)，视频一律静音、翻到顶那张才播）。两个入口的列表互不影响。三段视频原先是手机/微信导出的 **HEVC（H.265）**——浏览器不自带 HEVC 解码器，缺硬件解码的环境会「时间轴在走、画面全空、且不报错」，已于 2026-10-22 统一转成 **H.264（`avc1`，720p，`+faststart`，共 8.3MB）**，全平台可播；HEVC 原件留在 `backup/生活-原始/`（该目录不入库）。
- **「文字」板块**收录三份 PDF 文档（游戏策划案、副本系统拆解、评测），以卡片索引展示；点击后在站内阅读器打开，桌面端用浏览器自带的 PDF 阅读器，触屏设备交给系统阅读器。
- **「联系」板块**同时是联系页：身份行、星体色的细横线、一句自述，下面三个圆形入口——GitHub 正常跳转，邮箱与微信都是**就地展开**（不跳转、不甩出邮件客户端），展开后可一键复制账号。

![蓝巨星板块 · 滚动推进到卡冈图雅特写](./docs/screenshot-bluegiant.png)

---

## 技术亮点

- **零依赖黑洞着色器** — [`src/universe/blackhole.ts`](./src/universe/blackhole.ts) 用原生 WebGL2 + GLSL，逐像素积分史瓦西测地线，引力透镜、光子环、吸积盘湍流、多普勒集束都是真实模拟出来的。没有引 three.js，因此包含全部 WebGL 场景与作品页的单文件产物约 **473 KB**（gzip 148 KB）。

- **黑洞引擎参数化** — 盘面色温、终局机位、潮汐流颜色这些全部从 [`src/data/site.ts`](./src/data/site.ts) 的恒星数据派生。引擎只服务「音乐」的黑洞电影页；「作品」红巨星入口的背景由 [`redgiant.ts`](./src/universe/redgiant.ts) 的恒星表面着色器单独负责。

- **每个板块都有自己的天体** — 「文字」是右缘过曝的暖金日冕，「联系」是灯塔脉冲星；同一套场景注册表还给「生活」的双星入口提供绕质心的双星与质量转移丝，分别见 [`yellowdwarf.ts`](./src/universe/yellowdwarf.ts)、[`neutronstar.ts`](./src/universe/neutronstar.ts)、[`binary.ts`](./src/universe/binary.ts)。三支场景共用 [`glbase.ts`](./src/universe/glbase.ts) 的分辨率自适应、可见性暂停与 reduced-motion 静帧，但画面语言互不复用；WebGL2 不可用时自动回退到纯 CSS 背景。

- **零依赖 PDF 阅读器** — 「文字」不把文档转成图片，也不接第三方阅读服务：卡片只保存标题与元数据，点开时才挂载同源 `<iframe>` 加载 [`public/文字/`](./public/文字/) 下的 PDF；桌面用浏览器原生阅读器，触屏设备直接在新窗口交给系统。Esc 关闭、焦点归还和背景滚动锁都在同一个组件里处理。

- **音乐接口与站点同源** — 「音乐」的专辑播放不再依赖另行部署的服务器：[`server/ncm.ts`](./server/ncm.ts) 只代理站内用到的 12 个网易云接口，线上由 [`functions/api/[[path]].ts`](./functions/api/%5B%5Bpath%5D%5D.ts)（Cloudflare Pages Function）挂在 `rainburst.cc/api`，本地由 Vite 中间件提供同一份 handler；没有 CORS、没有额外域名，`npm run dev` 就能扫码登录。

- **CPU 参考实现做测试** — [`selftest/bh-shader.mjs`](./selftest/bh-shader.mjs) 是那段 GLSL 逐行移植出来的零依赖 JavaScript 版本，配套 7 个自检脚本，直接 `node` 就能跑，**不需要浏览器**，用来做无回归出图和采样质量分析。

- **全站文案集中可调** — 想改名字、slogan、板块名、卡片文案，或者换 GitHub / 邮箱 / 微信号，只动 [`src/data/site.ts`](./src/data/site.ts) 一个文件即可。

---

## 快速开始

```bash
# 1. 安装依赖（需要 Node ≥ 20）
npm install

# 2. 本地开发，热更新
npm run dev            # 打开 http://localhost:5173
#    或者在 Windows 上直接双击 启动网站.bat

# 3. 构建单文件成品
npm run build          # 产物 dist/index.html，双击即可离线打开
npm run preview        # 本地预览构建产物
```

### 浏览器要求

样式使用 Tailwind 4 的 CSS 级联层与 `color-mix()`，画面需要 WebGL2：请使用 **Chrome / Edge 111+、Safari 16.4+、Firefox 113+**。

如果 Chrome 里只看到左上角一小块星空、标题变成默认粗体、底部导航变成灰色按钮，通常不是站点本身的问题，而是浏览器还在运行旧进程（Chrome 自动更新只替换磁盘文件，重启后才生效）。在地址栏访问 `chrome://restart` 并回车（会自动恢复标签页），或完全退出 Chrome 后重新打开即可。旧浏览器会看到一条提示，不会静默地呈现一个坏掉的页面。

---

## 自检脚本（可选）

先把 TypeScript 引擎转译成可被 `node` 直接 import 的 ESM，再逐个跑自检：

```bash
npx esbuild src/universe/engine.ts src/universe/blackhole.ts src/data/site.ts \
  --format=esm --outdir=dist-selftest
npx esbuild src/universe/sections.ts src/universe/glsl.ts \
  --bundle --format=esm --outdir=dist-selftest
npx esbuild server/ncm.ts \
  --bundle --format=esm --outfile=dist-selftest/ncm.js

node selftest/harness.mjs         # 宇宙引擎：图层绘制、状态栈配平、彗尾脱轨检测
node selftest/comet-physics.mjs   # 彗星引力偏折的物理不变量
node selftest/test-blackhole.mjs  # 黑洞场景架构与卡片数据完整性
node selftest/test-scenes.mjs     # 黄矮星 / 中子星 / 双星：着色器组装、相位 wrap、静帧与销毁
node selftest/test-ncm-proxy.mjs  # /api 代理：路由、字段归一、二维码、Set-Cookie（mock 上游，不联网）
node selftest/alias-check.mjs     # 着色器锯齿 / 摩尔纹量化
```

跑图工具（离线渲染黑洞各个滚动进度，看构图用）：

```bash
node selftest/render-blackhole.mjs 0,0.5,1 320   # 输出 selftest/bh-p<NN>.png
```

---

## 目录结构

```
src/
├─ App.tsx                 # 板块路由：blue-giant 黑洞页 / red-giant 作品页、binary 生活页 / sun 文字页 / neutron-star 联系页 / 其余场景页
├─ components/
│  ├─ CosmosView.tsx       # 首页宇宙视图（Canvas 2D 引擎挂载）
│  ├─ BlueGiantPage.tsx    # 「音乐」黑洞电影页（滚动编排 + 覆盖层 UI）
│  ├─ WorksPage.tsx        # 「作品」/「生活」翻卡页（红巨星 / 双星两种背景，各读一份卡片列表）
│  ├─ WritingContent.tsx   # 「文字」文档卡片 + 站内 PDF 阅读器
│  ├─ AboutContent.tsx     # 「联系」联系我 / 关于我（圆形入口 + 邮箱、微信就地展开复制）
│  ├─ SceneSectionPage.tsx # 黄矮星 / 中子星的实时 WebGL 背景页（可注入专属内容层）
│  ├─ SectionContent.tsx   # 板块页公共文字层（标题、tagline、占位卡、footer）
│  └─ SectionPage.tsx      # 纯 CSS 静态板块页（WebGL 不可用时的兜底，可注入专属内容层）
├─ universe/
│  ├─ engine.ts            # Canvas 2D 宇宙引擎（点阵、恒星、吞噬动画）
│  ├─ blackhole.ts         # WebGL2 黑洞渲染（测地线光线步进着色器）
│  ├─ redgiant.ts          # 红巨星恒星表面与日冕着色器
│  ├─ glbase.ts            # 新场景共用的 WebGL2 外壳（自适应分辨率 / 暂停 / 静帧）
│  ├─ glsl.ts              # 共用 GLSL 片段与 shader 组装器
│  ├─ sections.ts          # 板块场景注册表（star.id → 场景）
│  ├─ yellowdwarf.ts       # 「文字」暖金日冕
│  ├─ neutronstar.ts       # 「联系」灯塔脉冲星
│  └─ binary.ts            # 「生活」双星与质量转移丝
├─ data/
│  ├─ site.ts              # 全站可调文案、联系方式与恒星参数
│  ├─ gallery.ts           # 已撤下的「旅途影像」照片 / 视频清单（仍在，供 build-gallery.mjs 复用）
│  ├─ works.ts             # 翻卡页数据：works（作品 / 红巨星）与 lifeWorks（生活 / 双星，13 张）两份独立列表
│  └─ writings.ts          # 「文字」三份 PDF 的标题、页数、大小与文案
└─ utils/
   ├─ assetURL.ts          # 把 public/ 下的中文路径按路径段编码
   └─ color.ts             # #rrggbb + alpha → #rrggbbaa（板块页遮罩与星体色高亮共用）
functions/
└─ api/[[path]].ts         # Cloudflare Pages Function：/api/* 交给同源代理
server/
├─ ncm.ts                  # 网易云代理实现（线上 Function 与本地中间件共用）
└─ vite-plugin-ncm.ts      # 本地 dev / preview 把 /api 挂进 Vite
selftest/                  # CPU 着色器参考实现 + 零依赖自检脚本
```

「文字」的 PDF 原件放在 [`public/文字/`](./public/文字/)，构建时原样复制到 `dist/文字/`；新增文档只需把文件放进去，并在 [`src/data/writings.ts`](./src/data/writings.ts) 补一条标题、页数与文案。

---

## 部署

GitHub 推送到 `main` → Cloudflare Pages 自动构建（Build command `npm run build`，输出目录 `dist`）→ 自定义域名 <https://rainburst.cc>。

## 专辑播放（网易云）

「音乐」板块的专辑播放页走访客**本人网易云账号扫码登录**后播放，本站不保存任何账号，也不托管音频文件。

接口是站点自带的**同源代理**，不需要再单独买服务器、配域名或处理 CORS：

| 环境 | 入口 | 实现 |
| --- | --- | --- |
| 线上 | `https://rainburst.cc/api/*` | `functions/api/[[path]].ts`（Cloudflare Pages Function） |
| 本地 | `http://localhost:5173/api/*` | `server/vite-plugin-ncm.ts`（Vite 中间件） |
| 共用逻辑 | — | `server/ncm.ts`，只代理站内用到的 12 个网易云接口 |

cookie 由访客浏览器自己保存（`localStorage`），同源代理下每次请求放在 `x-ncm-cookie` 请求头里（自部署 NCMAPI 时回退为 query 参数），由代理转成 `Cookie` 头；代理不落盘、不记录，也不会出现在 URL / 访问日志里。来自 `Set-Cookie` 的登录态只在 `803` 时回传给浏览器。

登录后，「音乐」终局的「历史列表」会变成**你自己的网易云歌单**：点封面切换歌单、预览前 3 首，点任意一首直接进播放页并载入整张歌单（最多 1000 首）；退出登录后恢复为本地归档墙。歌单接口复用同一个代理：`/api/user/playlist`（列表）与 `/api/playlist/track/all`（曲目）。

### 上线

1. 把 `functions/`、`server/`、`src/netease/config.ts` 等改动提交并 push 到 `main`；
2. Cloudflare Pages 构建时会把 `functions/` 一起发布（**项目必须由 Git 构建**；Direct Upload 不会带 Functions）；
3. 打开 <https://rainburst.cc/api/login/qr/key>，返回 `{"code":200,"unikey":"…"}` 就说明接口已上线；
4. 进入「音乐」→ 打开专辑 → 扫码登录，登录成功后会自动续播。

> 若第 3 步返回 404/500：检查 Pages 项目是否还开着 Functions、`functions/api/[[path]].ts` 是否已提交；也可以在 Cloudflare 控制台用 `wrangler pages deployment tail` 看函数日志。
>
> 扫码 key 有较紧的 IP 限流：短时间内反复打开登录框可能拿到 `code: 406`「操作频繁」，弹窗会如实提示并给出「重试」，等一两分钟即可。代理不缓存、不共享 unikey——每个访客拿自己的 key，避免扫码串号。
>
> 部署后也可以验证新增的歌单路由：`curl -s 'https://rainburst.cc/api/user/playlist?uid=1'` 未登录应返回 `{"code":301,...}`，返回 404 说明这次提交没有带上 `server/ncm.ts` 的新路由。

### 本地

```bash
npm run dev      # /api 由 Vite 中间件提供，扫码登录直接可用
npm run preview  # 预览构建产物时同样带 /api
```

离线双击 `dist/index.html`（`file://`）时没有同源后端，登录弹窗会提示「播放服务还没部署」，这是预期行为。

### 换用自部署的 API

如果不想用 Pages Functions，仍可指向任意 [NeteaseCloudMusicApiEnhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) 实例：

```ts
// src/netease/config.ts
export const NCM_BASE = "https://ncm.example.com";
```

或临时在浏览器控制台覆盖（不重新构建）：

```js
localStorage.setItem("rainburst.ncm-base", "https://ncm.example.com");
```

### 灌入 / 换听专辑

```bash
# 本地：先 npm run dev，再另开一个终端
NCM_API=http://localhost:5173/api npm run album -- "梁博 精气神" --ncm
# 线上已部署后也可以直接用
NCM_API=https://rainburst.cc/api npm run album -- "声音玩具 劳动之余" --ncm --pin
# 查看各专辑接入状态
npm run album -- --checklist
```

一句话专辑介绍在 `src/data/albums.json` 的 `intro` 字段手改，重跑脚本会保留。

> 说明：音频链接由网易云 CDN 直发、约 20 分钟过期，播放器会在过期时自动重新取链；直链走独立 audio 通道（跨域音频若接进 WebAudio 频谱图会被浏览器静音），所以播放专辑时底部音乐胶囊的频谱会呈低位，属正常。

---

## 版权

© 2026 深空禁区 · 保留所有权利。

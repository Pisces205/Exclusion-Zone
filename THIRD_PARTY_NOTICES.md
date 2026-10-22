# 第三方代码声明 · Third-Party Notices

本站原创部分的版权归 **© 2026 深空禁区** 所有（保留所有权利，见 `README.md` 的「版权」段）。
下列第三方代码按各自的许可随本仓库源码一起分发。

---

## `src/utils/liquidGlass.ts` — 移植自 shuding/liquid-glass

`src/utils/liquidGlass.ts` 是从 <https://github.com/shuding/liquid-glass> 的核心算法移植而来，
上游项目以 **MIT License** 发布。按 MIT 的要求（"The above copyright notice and this permission
notice shall be included in all copies or substantial portions of the Software."），在此保留其
版权声明与许可全文：

```
MIT License

Copyright (c) 2025 Shu Ding

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## npm 依赖

运行时依赖（`react`、`react-dom`、`clsx`、`tailwind-merge`、`qrcode-generator`）与构建期依赖
（`vite`、`typescript`、`tailwindcss` 等）均为各自作者的作品，以各自的许可发布，**不随本仓库源码分发**，
而是由 `npm install` 按 `package-lock.json` 从 npm 拉取；其许可声明在各包的 `node_modules/<包名>/LICENSE` 中。
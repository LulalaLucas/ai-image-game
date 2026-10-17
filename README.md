# 真实，还是 AI？

北京大学计算机学院 1024 文化节的中文单图辨别游戏。每次展示一张图片，点击“真实照片”或“AI 生成”，答后揭晓真假与对错。每轮随机抽取 6 题，固定 3 张 AI 图和 3 张真实照片，顺序随机且不重复。

## 本地运行

```bash
npm start
```

打开 http://127.0.0.1:4173/ 。不要直接双击 index.html，浏览器会限制 JSON 读取。运行服务期间终端需保持打开。

完整项目压缩包包含图片；从 GitHub 克隆源码后，请先下载图片资源包并在项目根目录解压：

```bash
gh release download question-bank-20261017 --repo LulalaLucas/ai-image-game --pattern question-images.zip
unzip -q question-images.zip
```

也可在仓库的 Releases 页面下载同名资源包。

- 点击图片可放大，支持 100%–300% 缩放，Esc 关闭。
- 按 R / 左方向键 / 1 判断真实；按 A / 右方向键 / 2 判断 AI。
- 答后点击“下一题”，最后查看正确率与整轮答案。
- 每题仅能提交一次；图片加载失败时锁定判断，可点击图片重试。
- 点击“重新开始”或“换一组图片”，优先抽取本次游玩中尚未出现的图片；题库充足时，新一轮不重复上一轮图片。
- 答后只显示真假结果与对错，成绩页展示本轮判断回顾。

## 已导入题库

2026-10-17 从两个站点的公开资源导入并下载到 `assets/questions/`：

| 来源 | 题目数 | 真实 | AI |
|---|---:|---:|---:|
| Real or Not Quiz | 998 | 330 | 668 |
| SpotfAIke | 128 | 66 | 62 |
| 合计 | 1,126 | 396 | 730 |

来源：

- https://www.realornotquiz.com/assets/json/images.json
- https://www.spotfaike.com/data/images.json

已排除 19 条局部 AI 修改、21 条未来发布、9 条生成日期矛盾记录；按文件 SHA-256 去除 1 张重复图。Real or Not 中 32 张图的目录写作 stable_diffusion3、文件名包含 SDXL，模型留空；GAN 目录没有精确生成模型，也留空。所有真假标签来自站方的判题逻辑或清单，未逐张独立鉴定。

`data/provenance.json` 保存原始图片 URL、SHA-256、标签依据、模型依据、排除项和下载结果。未复制站方的长篇解释或提示词。

图片已经保存在本地，并上传到 GitHub Release 资源包；部署时会自动下载，游戏运行不依赖原站图片地址。公开可访问不代表已取得再发布授权；对外发布时需核实逐图使用条件。真实图片中有原来源的条目保留作者、原图和许可链接，仅保存在维护数据中。

## 题库格式（版本 2）

每张图片是一道题：

```json
{
  "version": 2,
  "demo": false,
  "questions": [
    {
      "id": "q001",
      "src": "assets/questions/q001/ai.jpg",
      "label": "ai",
      "model": "有来源依据的生成模型，可省略",
      "source": {
        "site": "题目来源",
        "url": "https://example.com/",
        "originalUrl": "https://example.com/photo",
        "author": "摄影作者（真实照片）"
      },
      "enabled": true
    }
  ]
}
```

`id` 和图片路径不得重复；`label` 只能为 `real` 或 `ai`。`src` 是网站根目录下的相对路径。`model`、`source` 可省略，未知模型不要猜测。`enabled: false` 暂停抽取该题。旧的三图 `realImages/aiImage` 结构不再使用。

## 题库编辑器

本地运行后打开 http://127.0.0.1:4173/tools/ 。点击“加载当前题库”即可分页查看、搜索、编辑模型、标签、来源及启用状态；导出时保留已有来源字段。替换 `data/questions.json` 后运行检查。

手工录题也可在 `assets/questions/` 下每题建一个目录，放入一张 `real.jpg` 或 `ai.jpg`；可选放入 `model.txt`。支持 jpg、jpeg、png、webp、avif。编辑器导入整个 questions 目录后导出配置；图片文件需自行放到对应路径。

## 重新导入公开题库

需要 Python 3 和 curl：

```bash
python3 scripts/import-public-bank.py --as-of 2026-10-17
```

该脚本读取上述两个公开清单、下载图片、检查图片文件签名、排除未来/日期矛盾/局部生成/重复记录，最后写入 `data/questions.json` 和 `data/provenance.json`。它会替换整套题库；如已有手工编辑，请先备份配置。已下载图片会复用。任何下载失败时保留当前题库，不生成缺图配置。

## 检查与构建

```bash
npm run check
npm test
npm run build
```

`dist/` 是静态网站成品。游戏、题库及图片均包含在内；维护编辑器和导入脚本不进入部署成品。GitHub Actions 在推送到 main 后下载固定版本的题库图片，检查、构建并部署。所有页面资源使用相对路径，兼容 GitHub Pages 项目路径。构建时为页面脚本、导入模块和样式添加内容版本号，避免更新后继续使用浏览器缓存的旧版。

在线游戏：https://lulalalucas.github.io/ai-image-game/ 。推送到 main 后由 GitHub Actions 自动部署；玩家刷新页面即可体验新版本。

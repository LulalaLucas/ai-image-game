# 哪张是 AI？

中文图片辨识小游戏。纯静态网站、全中文、无需安装第三方依赖，可部署到 GitHub Pages。

## 在线使用与共享题库

- 游戏地址：[打开游戏](https://lulalalucas.github.io/ai-image-game/)。
- 源码仓库：[ai-image-game](https://github.com/LulalaLucas/ai-image-game)。
- 玩家在任意电脑或手机的浏览器中打开游戏链接即可。无需安装软件、登录账号或上传题库。
- 所有玩家都读取网站上的 data/questions.json 及配套图片。不同设备独立抽题、独立计分。
- 维护者只需在自己的电脑更新题库并推送到 main 分支。部署成功后，其他设备重新打开或刷新页面，即可读取更新后的题库。
- 在编辑器中导出配置只会生成本地文件；需要把配置与图片提交并发布后，才会更新共享题库。
- 网站部署在 GitHub Pages 上，维护者的电脑无需保持开机。需要网络连接来加载网站和图片。

## 本地试玩

安装 Node.js 后，在项目文件夹打开终端：

```bash
npm start
```

打开 http://127.0.0.1:4173 。保持终端运行；关闭服务按 Ctrl+C。不要直接双击 index.html，浏览器会限制本地 JSON 读取。

游戏每轮从启用题目中随机抽取最多 8 题，不重复；题目顺序和每题三张图片的位置都重新随机。重置清空当前成绩。题库不足 8 题时展示实际题数。每题仅能计分一次。

点击图片打开大图，支持 100%–300% 缩放、左右切换和 Esc 关闭。点击图片下方的 A、B、C 选项提交；也可按数字键 1/2/3。选项下方仅显示 A、B、C 字母和选择标记。答对显示对号动画，并以绿色边框突出所选的 AI 图片；答错显示错号动画，并以深红色边框突出真正的 AI 图片。AI 图片下方展示生成模型。支持系统“减少动态效果”偏好。

## 最方便的录题方法

1. 在 assets/questions 下为每道题建立文件夹，如 q001、q002。
2. 每个文件夹放三张同主题的图片，命名为 real-1.jpg、real-2.jpg、ai.jpg。扩展名也可以是 jpeg、png、webp、avif；每个角色只能有一个文件。
3. 可选添加 model.txt，写入 AI 图片的实际生成模型名称；也可在编辑器里填写。
4. 运行 npm start，打开 http://127.0.0.1:4173/tools/ 。点击“导入图片文件夹”，选择整个 questions 文件夹。编辑器支持导入已有配置、编辑模型、启停题目、移除和手动添加。
5. 导出 questions.json，替换 data/questions.json。编辑器会关闭演示模式，并阻止将原演示素材直接导出为正式题库。
6. 执行 npm run check 检查图片是否存在，然后在本地确认效果。
7. 在项目目录运行以下命令，发布给所有玩家：

```bash
git add assets/questions data/questions.json
git commit -m "Update question bank"
git push origin main
```

在仓库 Actions 页面确认自动部署成功。其他电脑无需更新任何本地文件，只需刷新游戏链接。新增题目只上传新增的图片及完整 questions.json；已发布的旧图片不需要重复上传。

目录示例：

```text
assets/questions/
  q001/
    real-1.jpg
    real-2.jpg
    ai.jpg
    model.txt
  q002/
    real-1.png
    real-2.jpg
    ai.webp
    model.txt
```

文件夹导入生成的图片路径始终为 assets/questions/题号/文件名。请把实际图片放到此目录。编辑器只读取本地文件并导出配置，不会自动复制、上传或修改磁盘文件。

## 手动配置接口

只需编辑 data/questions.json。无需 theme、explanation 或答案字母；程序根据 aiImage 自动识别正确答案。

```json
{
  "demo": false,
  "questions": [
    {
      "id": "q001",
      "realImages": [
        "assets/questions/q001/real-1.jpg",
        "assets/questions/q001/real-2.jpg"
      ],
      "aiImage": {
        "src": "assets/questions/q001/ai.jpg",
        "model": "实际生成模型名称及版本"
      },
      "enabled": true
    }
  ]
}
```

id 必须唯一；真实图片恰好两张；三张图片路径不同。路径相对于网站根目录，使用正斜杠，不要写电脑绝对路径。model 必填。enabled 可省略，默认启用；false 表示暂不抽取。demo 为 true 时显示测试素材提示，正式题库设为 false。

页面显示图片时保持完整比例，不裁切；建议同题图片尽量使用相同长宽比、分辨率和相近压缩质量，以免图片尺寸或质量成为答案提示。

## 部署到 GitHub Pages

项目已包含 .github/workflows/pages.yml，提交到 main 分支后会自动检查题库、测试逻辑、生成 dist 并发布。网站全部使用相对路径，支持 https://用户名.github.io/仓库名/ 以及 https://用户名.github.io/ 。

1. 在 GitHub 创建公开仓库，例如 ai-image-game。
2. 将本项目所有文件（包含隐藏的 .github 文件夹）提交到仓库的 main 分支。
3. 打开仓库 Settings → Pages → Build and deployment → Source，选择 GitHub Actions。
4. 在 Actions 页面等待“部署小游戏到 GitHub Pages”完成。首次启用 Pages 后，若此前流程失败，可选择 Re-run all jobs。
5. 在 Settings → Pages 查看游戏地址，分享该地址即可。后续改题库并提交，自动更新网站。

如用命令行，先自行完成登录：

```bash
gh auth login --hostname github.com --git-protocol https --web
```

浏览器登录完成后再创建仓库、推送和启用 Pages。参考 [GitHub Pages 官方部署说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。无需在代码中放访问令牌。

## 检查与打包

```bash
npm run check
npm test
npm run build
```

dist 是可直接上传到其他静态托管服务的成品。scripts 和 tools 是本地维护工具，不进入部署成品。

## 演示素材

当前内置 12 道占位题，使用 16 张 Unsplash 测试图片。图片组合只用于体验交互，配置中的“AI 图片”和“生成模型”均为模拟，不代表实际 AI 生成。正式使用前请替换题库。图片下载地址记录在 assets/demo/sources.json。

成绩仅保存在本轮页面内。静态题库中的答案可由浏览器开发工具查看，不适合用于有防作弊要求的正式考试。

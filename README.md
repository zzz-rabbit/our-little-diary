# 我们的小日记 · 云端双人日记

一个温馨风格的双人日记网站：两个人各自账号登录，写日记、加图片、互相评论，内容实时同步。手机、电脑、平板、任意网络都能打开。

- **线上网址**：https://zzz-rabbit.github.io/our-little-diary/
- **技术栈**：纯前端 HTML/CSS/JS + Supabase（云数据库/登录/存储）+ GitHub Pages（免费静态托管）
- **费用**：完全免费，无需实名、无需绑卡

## 项目结构

| 文件 | 作用 |
|------|------|
| `index.html` | 页面结构（登录页、日记列表、写日记/详情/改密码弹窗） |
| `styles.css` | 温馨风格主样式（暖色系、圆角卡片、响应式） |
| `cloud.css` | 云端版附加样式（登录页、换行按钮、账号栏） |
| `app.js` | 全部逻辑：登录认证、日记增删改、评论、图片压缩上传、实时同步 |

## 后端配置（Supabase）

配置写死在 `app.js` 顶部：

```
SUPABASE_URL = https://egsymbchpllgsrjcrxas.supabase.co
SUPABASE_KEY = sb_publishable_...  (publishable key，可公开)
```

数据库只有一张表 `public.diaries`，建表 SQL 见工作区 `couple-diary/setup.sql`。表结构：

- `id, author_id, author_name, author_avatar`
- `title, content, mood, weather, is_private`
- `images` (jsonb，图片 base64 数组), `comments` (jsonb)
- `created_at, updated_at`

账号（两个，共用同一个日记本空间，但登录各自独立）：
- `xiaonuan@diary.local` / `xiaoyang@diary.local`（密码见交付给用户的使用说明，不写入公开仓库）

## 如何修改并重新上线

1. 直接编辑上面的源文件（改样式改 `styles.css`/`cloud.css`，改功能改 `app.js`，改结构改 `index.html`）。
2. 把改动后的文件推送到本仓库 `main` 分支。GitHub Pages 会自动重新部署，约 30 秒后生效。
3. 沟通时把需求告诉助手即可，助手会负责改代码 + 推送 + 验证。

> 注意：本仓库为公开仓库（GitHub Pages 免费托管要求），**不要把 secret key、账号密码等敏感信息写进仓库**。

## 已实现功能

- 双人账号登录（邮箱+密码，登录页有一键登录快捷按钮）
- 日记增删改、心情/天气标签、私密日记开关
- 图片上传（最多 6 张，自动压缩后转 base64 存云端）
- 评论互动、正文换行按钮
- Supabase Realtime + 6 秒轮询兜底的双人实时同步
- 修改密码（在页面右上角账号栏）

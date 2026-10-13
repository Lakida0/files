# 一些文件

一个存放零星文件的静态站点，提供在线预览与直接下载。

* 通过 [Cloudflare Pages](https://pages.cloudflare.com/) 提供 CDN 并绑定自定义域名
* 由于 Cloudflare 的限制，单个文件大小均不超过 25 MB
* 高清视频播放均通过 HLS（Apple HTTP Live Streaming）技术实现
* 播放器使用 [hls.js](https://github.com/video-dev/hls.js) **1.7.3**，曾经使用 [video.js](https://videojs.com/)

## 目录结构

```
.
├── index.html                  # 首页文件索引
├── favicon.ico
├── assets/                     # 全站共用的样式与脚本
│   ├── site.css                # 设计系统：卡片式布局、明暗主题自适应
│   ├── site.js                 # 目录列表渲染器：搜索、排序、文件类型图标、音频播放
│   ├── hls.min.js              # hls.js 1.7.3（视频播放器）
│   └── hls.min.js.map
├── music/                      # 音乐（MP3 / FLAC），支持在线试听与下载
├── nbs/                        # NBS 音符文件
├── 小体积编程大赛优秀作品/      # 体积竞赛作品压缩包
├── WebGL_Demo/                 # FMS_Cat 的 WebGL Demo
│   ├── condition/  type/  until/
│   └── domain.html  shift.html
├── Crab_Rave/                  # 视频 + HLS 分片
├── 梦想季/  小王子季/  学习资料/  # 视频 + HLS 分片
└── HTML5音频频谱.html          # HTML5 Audio API 频谱可视化
```

## 音乐播放与时长

`music/` 页面通过 `audio: true` 开启内嵌播放器。时长由 `assets/site.js` 直接从文件头解析，
只发一个 128 KB 的 Range 请求，不会为了读时长而下载整首音乐：

* **FLAC**：读取 `STREAMINFO` 块的采样率与总采样数（精确）。
* **MP3**：读取首帧内的 `Xing` / `Info` 头。只有帧数时用帧数 × 每帧采样数换算；
  只有字节数时按平均码率折算到整个文件；都没有时按探测窗口内的平均码率外推。
* **ID3v2 封面**：部分文件的内嵌封面会让 ID3 标签超过 128 KB，此时会自动再发一次
  Range 请求，从标签结束处读取（例如 `Rick Astley - Never Gonna Give You Up.mp3`
  的标签有 527 KB）。

如果服务器不支持 Range 请求，或解析失败，则不显示时长并交由浏览器自行上报，播放不受影响。

## 维护

新增文件后，在对应目录的 `index.html` 里给 `DirectoryListing.init({ items: [...] })`
数组加一行即可：

```js
{ name: '示例.mp3', size: 1234567, mtime: 1700000000, badge: '低音' }
```

| 字段 | 含义 |
| --- | --- |
| `name` | 显示名称，同时作为相对链接（会自动做 URL 编码） |
| `href` | 可选，覆盖链接地址；`http(s)://` 开头视为外链 |
| `dir` | `true` 表示目录，会追加 `/` 并使用文件夹图标 |
| `size` | 字节数，自动格式化为 kB / MB |
| `mtime` | Unix 秒级时间戳，自动格式化为本地时间 |
| `kind` | 可选，强制指定类型：`audio` `video` `image` `html` `code` `archive` `doc` `data` |
| `badge` | 可选，卡片上显示的短标签 |

`DirectoryListing.init()` 的可用选项：

| 选项 | 含义 |
| --- | --- |
| `base` | 本页相对自身目录的路径，根目录为 `''` |
| `items` | 条目数组，见上表 |
| `title` | 设置 `document.title`，并填入空的 `#page-title` |
| `audio` | `true` 时给每个音频卡片加上内嵌播放器（music 页面使用） |

## 更新 hls.js

播放器脚本**只从本站 `assets/` 目录加载**，不依赖任何第三方 CDN，因此 CDN 不可达时也不会影响播放。

```bash
# 查看最新版本
npm view hls.js version

# 下载对应版本的两个文件到 assets/
curl -o assets/hls.min.js     https://cdn.jsdelivr.net/npm/hls.js@<版本>/dist/hls.min.js
curl -o assets/hls.min.js.map https://cdn.jsdelivr.net/npm/hls.js@<版本>/dist/hls.min.js.map

# Crab_Rave/ 下还留有一份历史副本，一并同步以免误用旧版
cp assets/hls.min.js assets/hls.min.js.map Crab_Rave/
```

只需替换这两个文件即可，页面无需改动（页面只引用路径，不含版本号）。

> 升级后如需强制刷新缓存的 `hls.min.js`，给 `<script>` 与 `<link rel="preload">` 的地址加上版本查询串，
> 例如 `../assets/hls.min.js?v=1.7.3`，否则 `_headers` 里的一年期缓存会继续使用旧文件。

# License

* 继承上游依赖许可，本项目使用 [Apache 2.0 License](https://github.com/Lakida0/files/blob/main/LICENSE)

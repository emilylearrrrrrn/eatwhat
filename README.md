# 今天做啥

一个本地使用的 iPhone 网页 App，用来记录做过的菜，并生成近一周菜单。

## 在线发布

这是纯静态 PWA，不需要服务器。可以把整个 `cookbook-pwa` 文件夹上传到
Cloudflare Pages、Netlify、Vercel、GitHub Pages 等静态托管平台。

发布后，用 iPhone Safari 打开 HTTPS 链接，再选择“添加到主屏幕”。

用户添加的菜名、照片、食材、评分、备注、菜单都保存在手机浏览器本地；
托管平台只保存 App 外壳文件。

## 图片来源

首页横幅使用 Wikimedia Commons 图片
`Flour+Water Pasta Shop pasta overhead.jpg`，请在正式公开发布时按原图页面要求保留署名信息。

## 在 Windows 上预览

在这个文件夹运行：

```powershell
py -m http.server 4173
```

然后在电脑浏览器打开：

```text
http://127.0.0.1:4173/
```

## 在 iPhone 上使用

1. 让 iPhone 和 Windows 电脑连到同一个 Wi-Fi。
2. 查看 Windows 的局域网 IP。
3. 在 iPhone Safari 打开：

```text
http://你的电脑IP:4173/
```

4. 在 Safari 分享菜单里选择“添加到主屏幕”。

数据会保存在 iPhone 本地浏览器里。建议偶尔在设置里导出完整备份。

导出的 JSON 备份包含菜品文字、评分、菜单和照片。照片保存在每道菜的
`photo` 字段中，格式是 `data:image/jpeg;base64,...`，所以不会看到单独的
JPG 文件夹。

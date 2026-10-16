# zashboard

<p align="center">
  <img src="./readme/pc.png" height="300">
  <img src="./readme/mobile.png" height="300">
</p>

## **Requirement**

Browser support

- Chrome 111 (released March 2023)
- Firefox 128 (released July 2024)
- Safari 16.4 (released March 2023)
- Not supported on iOS 16.4 jailbroken version.

## **Online**

You can access the online zashboard at the following link:

- [Online zashboard](http://zashboard.7777717.xyz)

## **Download**

You can download the zashboard files here:

- [Releases](https://github.com/rainac1/zashboard/releases)

> All builds include sing-box native API support.

## Tips

1. The connection table can be dragged with the left mouse button, and right-clicking can copy cell content.
2. Right-clicking on a node / node group card will perform a speedtest for the node / node group.
3. The proxy group sorting is based on the node order in the GLOBAL group. In Mihomo, it follows the configuration file order, while in sing-box, route.final is placed first, with the rest following the configuration file order. If you need custom ordering, you can specify the order by overriding the GLOBAL group.
4. The dashboard supports PWA (Progressive Web App), which can provide a native app-like experience on mobile devices through "Add to Home Screen".
5. The dashboard's upgrade button and auto-upgrade functionality require proper configuration of the core's UI download path ([mihomo](https://wiki.metacubex.one/config/general/#_9) | [sing-box](https://sing-box.sagernet.org/configuration/experimental/clash-api/#external_ui_download_url)), otherwise clicking update may result in updating to the core's default panel.

## 提示

1. 连接表格可被鼠标左键拖动，右键可复制单元格内容。
2. 右键点击节点/节点组卡片可对节点/节点组进行测速。
3. 面板的节点组排序是根据GLOBAL组中的节点顺序排序的，在Mihomo中会是按配置文件的顺序，在sing-box中会把route.final放到第一位，其余按照配置文件顺序，如果你需要自定义顺序，可通过覆盖GLOBAL组指定顺序
4. 面板支持PWA（Progressive Web App），可以在移动设备上通过"添加到主屏幕"获得类原生app的体验
5. 面板的更新按钮和自动更新功能需要正确的配置核心的ui下载路径 ([mihomo](https://wiki.metacubex.one/config/general/#_9) | [sing-box](https://sing-box.sagernet.org/configuration/experimental/clash-api/#external_ui_download_url)), 否则可能会在点击更新后更新为核心默认面板

## URL params format

#### basic example

http://host:port/#/setup?hostname=ipordomain&port=9090&secret=123456

1. **`protocol`**
   - Determines the protocol, `http` or `https`.
   - Default: current page protocol
   - The legacy `http` / `https` flag params (e.g. `?http=1`) are still supported for backward compatibility, but `protocol` takes precedence when both are present.

2. **`hostname`**
   - The Clash API's IP or domain.

3. **`port`**
   - The Clash API port.

4. **`secondaryPath`**
   - Optional path appended to the base URL.
   - Default: An empty string.

5. **`secret`**
   - Password for authentication.

6. **`disableUpgradeCore`**
   - Set '1' to hide upgrade core button

7. **`disableTunMode`**
   - Set '1' to hide tun switch

8. **`type`**
   - Selects the backend API: `clash` (Clash REST/WS), `dae` (dae native API) or `singbox` (sing-box native).
   - Default: `clash`

#### Automatic backend connection

When no backends have been saved and `hostname` is not specified in the URL query, zashboard tries to connect to the Clash API at the page's origin (the same protocol, hostname, and port). This applies to pages served over HTTP or HTTPS. The `protocol` and `port` URL parameters do not change this address. URL parameters such as `secret`, `label`, `type`, `disableUpgradeCore`, and `disableTunMode` also apply to the detected backend.

For example, with this mihomo configuration on remote server `192.168.1.1`:

```yaml
external-ui: ui
external-ui-url: https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages.zip
external-controller: 0.0.0.0:9090
secret: ''
```

Opening `http://192.168.1.1:9090/ui` automatically connects to `http://192.168.1.1:9090` and saves the backend if the API probe succeeds. If mihomo requires authentication, pass its secret using `http://192.168.1.1:9090/ui?secret=your-secret`.

`http://127.0.0.1:9090` with an empty secret is probed at the same time as a fallback, and the same-origin backend takes priority. If a candidate rejects the secret, the form keeps that address so you only need to enter the secret. If no candidate responds, the form shows `http://127.0.0.1:9090` for manual configuration. Editing or submitting the form during detection cancels automatic connection.

Saved backends and explicit URL backend parameters retain their existing behavior. Automatic same-origin detection does not override them.

### I code not only for fun, but even more for money. If you really want to donate, send USDC on Polygon to `0xf51f0c7142e5771cf8fc7c3c498b0819b4239c21` to help the author buy a McDonald's 😊

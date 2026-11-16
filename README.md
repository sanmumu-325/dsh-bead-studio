# DSH Bead Studio / 拼豆工作台

[GitHub](https://github.com/sanmumu-325/dsh-bead-studio) · [Issues](https://github.com/sanmumu-325/dsh-bead-studio/issues) · MIT

**Version: 0.5.2-beta.1 — Beta release.** A bead-pattern workbench for DeepSeek Harness (DSH), with deterministic local conversion, editable vector charts, a persistent artwork library, and optional AI image assistance.

## 中文

### 安装与兼容

在 DSH 的插件管理中安装 npm 包 **`@sanmumu/dsh-bead-studio@beta`**，然后打开侧栏「拼豆工作台」。可向 DSH 助手请求安装该精确包标识，或由插件管理的安装入口填写该标识。安装会影响当前 profile 的会话，请先保存工作。

- 仅验证过 **DSH 0.2.1-rc.2**。声明的兼容范围为 `>=0.2.1-rc.2 <0.3.0`，不代表已逐版本验证。
- 需要 DSH Web UI、工具、存储域以及 AI 模式相关的主机会话、附件与凭据服务。此包不是独立网站，也不捆绑 React。
- **不要与旧 `@local/dsh-bead-studio` 同时启用。** 两者保留相同的工具名、路由、Slot 和数据域。迁移前备份导出的工程，先禁用旧包再启用新包；不要直接改旧安装目录或删除存储数据。禁用／卸载插件不等于删除作品。
- Beta 功能与不同供应商兼容性仍需用户验证。安装版本请使用 `@beta`，不要假设 npm 的默认标签就是 Beta。

### 本地功能

- 上传 PNG/JPEG/WebP（≤12 MiB、≤2000 万像素），按比例转换为最多 128×128 格、2–32 色的拼豆图纸；支持透明留空及白底。
- 使用通用颜色 ID 与 HEX，不声称对应任何品牌实物色卡。
- SVG 矢量画布支持分板、网格、坐标、色号、颜色高亮、拖动与缩放。
- 查看模式拖动平移；编辑模式画笔、橡皮、吸色及整笔即时预览。中键或空格＋左键平移，Ctrl/⌘＋滚轮缩放；画布焦点内 Ctrl/⌘＋Z 撤销、加 Shift 重做。
- 作品库支持新建、重命名、复制、自动保存、回收站与明确确认后的永久删除；保存使用 revision 检查，防止静默覆盖另一窗口的修改。
- 导出 PNG、SVG、CSV、工程 JSON 与分板 PDF。工程保存图纸，不保存上传原图、未提交笔划或撤销历史。

普通图纸转换使用固定本地算法，不调用模型、不向第三方上传原图。AI 是独立可选步骤，默认不会自动执行。

### 可选 AI 原稿助手（Beta）

AI 可能改变长相、花纹与细节，**不是忠实抠图**。每次生成前需要明确同意；成功后先比较原图与候选，再确认采用。采用只替换上传源，仍需点击普通「生成」创建图纸。失败、取消或超时不会自动重试或自动换模型／引擎。取消不保证远端尚未计费或已经停止。额度与真实价格未知时明确显示未知。

**Codex 订阅模式**：必须明确选择一个可用 DSH 对话。参考图与生成结果将保存在所选对话及 DSH 附件存储中，参考图交给 Codex 图像服务并消耗订阅额度。工具入口可用不保证登录、会话权限或额度可用；实际调用仍可能被拒绝。

**自定义 API 模式**：支持公网 HTTPS 的 OpenAI 风格 multipart `images/edits`，基础地址需包含供应商要求的 `/v1`，插件仅追加 `/images/edits`。不保证所有“兼容”供应商支持相同模型、参考图或参数；真实供应商编辑能力与账号额度尚未全面验证。

- 密钥交给 DSH 主机凭据存储。**默认本机后端为受文件权限保护的明文文件，不是加密保险箱；同 OS 用户进程可能读取。建议使用专用限额密钥。** 不要把密钥放进基础地址、模型名、备注、工程或聊天。
- 改地址必须重填密钥；同址留空才保留已有密钥。配置采用不透明 revision，多窗口修改后需要刷新并重新确认。
- 「检查配置格式」不联网、不检查登录或额度。「连接并读取模型」仅在点击后带认证请求 `GET <baseUrl>/models`，不上传图片、不生成图片、不证明图像编辑能力。
- 模型列表保留准确 ID，候选筛选仅按名称，可切换全部或手填。选择只改草稿，不自动保存或切换实际模型。
- 只允许公网 HTTPS，不支持 HTTP、localhost、内网/保留地址或自动跳转，不使用系统代理环境变量。**FakeIP/DNS 返回保留地址时也会拒绝**；请使用可解析为真实公网地址的环境，不要绕过地址检查。
- 自定义 API 界面模式不使用 Codex 或聊天会话，候选在工作台/Host 内存暂存，工程不存原图；供应商留存政策由其决定。若通过助手工具明确要求附图，结果按 DSH 附件规则进入调用会话。

### 开发与验证

从仓库根目录执行（需要支持当前 DSH 的现代 Node.js）：

```sh
npm ci --ignore-scripts
npm run build
npm test
```

测试使用 mock/内存服务，不需要真实 API Key，也不进行收费图像生成。部分 PDF 测试会生成 `test-output/`，该目录不提交或发布。可重复执行构建；`client.js`、`core-v2.js` 和 `host-v4.js` 为生成文件。GitHub 提供完整构建源与测试，npm `files` 白名单只分发预构建运行文件；不要期待从已安装 npm 运行包执行源码构建或完整测试。

界面文案、配置安全检查和离线测试不等于真实供应商端到端验收。提交问题时请去除密钥、图片、聊天记录和个人路径。

## English

### Install

Install **`@sanmumu/dsh-bead-studio@beta`** through DSH plugin management, then open **Bead Studio** in the sidebar. You can ask the DSH assistant to install that exact npm spec. This is a DSH plugin, not a standalone website.

Only **DSH 0.2.1-rc.2** has been verified; the declared range `>=0.2.1-rc.2 <0.3.0` is not a claim of testing every release. The client uses DSH's React and host services. **Do not enable this package together with the old `@local/dsh-bead-studio` package**: tool names, routes, slots and data domains intentionally remain compatible. Back up exported projects before switching, disable the old plugin first, and do not rename or delete the old installation/storage in place.

### Features and privacy

Deterministic local image conversion, vector previews, board partitions, brush/eraser/color picking, live stroke previews, undo/redo, color merging, an autosaving artwork library and recycle bin, plus PNG/SVG/CSV/JSON/PDF exports. Colors are generic IDs/HEX, not branded bead color guarantees. Ordinary conversion does not invoke an image model or send the source to a third party. Projects store patterns, not source photos or undo history.

AI assistance is optional **Beta**, requires explicit consent, can alter appearance/markings, and is not a faithful cutout. Compare and explicitly adopt a candidate before generating a new pattern. Requests may consume quota; actual pricing can be unknown. Failure, cancellation and timeout never automatically retry or switch providers. Cancellation cannot guarantee a refund or stop a remote request already running.

- **Codex:** choose a DSH conversation explicitly. Reference images and results are retained in that conversation/attachment storage and the reference is sent to the Codex image service using subscription quota. Tool availability does not guarantee login, permission or quota.
- **Custom API:** public HTTPS OpenAI-style multipart `images/edits` only. Include `/v1` in the base URL when the provider requires it; the plugin appends `/images/edits`. Compatibility with every vendor/model/parameter is **not verified or guaranteed**.
- Keys use DSH host credentials. **The default local backend stores plaintext files protected by file permissions, not an encrypted vault.** Prefer a dedicated spending-limited key. Address changes require a fresh key; never put a key into URLs, model IDs, notes, projects or chat.
- Offline format checks do not test connectivity, login or quota. Model discovery is an explicit authenticated `GET /models`, does not upload an image, and does not verify editing support. Exact model IDs remain editable; nothing is auto-selected or auto-saved.
- Private/reserved addresses, localhost, HTTP and redirects are rejected; system proxy environment variables are not used. **FakeIP/DNS responses pointing to reserved ranges are rejected too.** Use a DNS/network setup resolving real public addresses, rather than bypassing validation.
- Custom UI results are temporary workbench/host memory and are not written into chat; the provider's retention policy still applies. Explicit assistant requests to attach results follow DSH conversation attachment storage rules.

### Development

From a clean repository checkout: `npm ci --ignore-scripts`, `npm run build`, then `npm test`. Tests use mocks and do not require credentials or paid image generation. Generated PDF fixtures stay in the ignored `test-output/` directory. GitHub contains source/tests; npm contains prebuilt runtime files. Rebuild generated outputs before preparing a release. Report bugs without secrets, private photos, conversation records or personal filesystem paths.

## License

MIT, copyright (c) 2026 sanmumu-325. See [LICENSE](./LICENSE). Runtime dependency `zod` is installed through npm and retains its own license; no vendored Python test dependencies or third-party image assets are included.

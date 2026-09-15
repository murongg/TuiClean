# X 网页接口验证

版本：0.1.0。日期：2026-09-15。

后续范围调整：拦截记录页的本地／X 批量拉黑入口及任务进度界面已移除。下文保留当时的接口实现验证证据；共享接口执行器继续用于帖文提示条上的单条 X 拉黑。

## 当前实现

- 单条和批量 X 拉黑统一通过后台任务通道执行，旧的 DOM 菜单与主页状态检查模块已移除。
- 仅带有工作标记的 X 页面安装 MAIN-world 请求采集器；普通浏览页不拦截请求。
- 只捕获同源 TweetDetail 请求的必要请求头和查询模板。Authorization 与 CSRF 等信息停留在工作页闭包内存，不返回扩展后台、不写持久存储或备份。
- 接口读取原帖并核对帖文 ID、作者和数字用户 ID，再调用网页的 blocks/create.json。请求只发往当前 X / Twitter 源。
- 身份匹配且明确返回拉黑状态，或读取复核确认后才报告成功；HTTP 200、错误 JSON、其他账号的结果不被混为成功。
- 同时只运行一个 X 任务，账号操作间隔至少两秒。限流暂停并保留冷却时间，未知 POST 结果不自动重试。
- 取消、调用页断开、工作页慢启动、网络超时和后退缓存恢复均有对应处理。

## 后台连接诊断更新

用户提供的 Chrome 错误为 `Could not establish connection. Receiving end does not exist.`，说明当前连接未找到接收端。该错误发生在扩展任务连接阶段；不能据此判断 X 登录或拉黑接口失败。

本地生产后台可以同步注册接收器。实际 Chrome 安装副本受系统访问保护，尚不能确认是后台文件未更新、旧页面上下文，还是后台注册／启动失败。

- 客户端等待后台协议握手后才发送名单；未握手超时或协议不匹配时不提交。
- 在断开回调内读取 Chrome `runtime.lastError`，区分未找到后台与执行途中断线，并给出完整覆盖实际加载目录的提示。
- 重复握手不会重复提交；执行途中断线不会自动重连或重发。
- 保留来源校验、全局串行任务、限流间隔、取消和原有数据存储行为。

## 证据

- `npm run verify`：29 个文件、281 项测试通过，类型检查和 Chrome 生产构建通过。
- `node work/api/background.mjs`：执行生产后台 bundle，验证同步注册、设置页握手、一项合成任务及工作页关闭；不访问真实 X。
- 客户端与后台通过异步模拟 Port 完成消息往返；另有测试验证原生适配器在断开回调内读取临时错误。
- `node work/api/smoke.mjs`：直接执行打包后的 MAIN 脚本，使用合成请求验证采集、作者 ID 解析、一次 POST、重复请求抑制及普通页面隔离。
- 新的捕获、接口执行器、后台任务、客户端与工作页测试替代旧菜单测试。所有样本、身份和凭证均为合成数据。
- Chrome Manifest 包含 storage、scripting 和限定 X 主机权限；MAIN 脚本在 document_start 加载，普通过滤脚本仍处于隔离环境。

## 验证边界

未读取用户实际 Cookie 或请求头，也未对真实账号发送 API 拉黑请求。X 网页内部接口可能随服务端更新变化，当前会话的真实可用性需安装后先用单条操作验证。不能把合成测试通过视为真实 X 写入已验证。

## 更新

Chrome 当前加载的是独立的 UnpackedExtensions 副本，项目构建不会自动更新该副本。覆盖实际加载目录、重新加载并确认新增权限后，刷新 X 并重新打开拦截记录页。当前工具无法写入系统保护的 Chrome 加载目录，交付目录提供了可复制的完整构建。

## 参考

- [Chrome Port 与 runtime.lastError](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-Port)
- [Chrome MAIN-world 与内容脚本](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Blue Blocker 的网页请求实现](https://github.com/kheina-com/Blue-Blocker/blob/main/src/shared.ts)（用于核对接口形式，本项目未复制其实现代码）

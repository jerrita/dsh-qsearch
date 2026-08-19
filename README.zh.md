# dsh-qsearch

给 DeepSeek Harness（`ctx.web`）用 **Gemini / OpenAI / Grok 原生网页搜索**。

内置 `web_search` 工具不变。插件挂载期间用 fiber effect 把 `ctx.web.search` 接到 `qsearch`；fiber 卸掉后官方提供方（`deepseek-official`）自动回来。bundle patch 不改 `web.searchProvider`，卸载没有组合层残留。搜索是一次独立的原生 API 调用，不走 `ctx.llm`，也不从模型散文里刮 URL。

## 为什么要改写 baseURL

Models 页的路由通常是 **OpenAI 兼容**（`…/v1` 或 `…/v1beta/openai`），方便对话。原生搜索是另一套接口：

| 协议 | 对话 base（常见） | 搜索请求 |
|---|---|---|
| Gemini | `…/v1` 或 `…/v1beta/openai` | `POST {base}/v1beta/models/{model}:generateContent` + `google_search` |
| OpenAI | `…/v1` | `POST {base}/responses` + `web_search` |
| Grok | `…/v1` | `POST {base}/chat/completions` + `search_parameters` |

凭据复用所选 `llm-pi-ai` 路由：读该路由的 `apiKeyEnv`，没有则按 Models 页规则用 `<ROUTE>_API_KEY`。

## 安装

```sh
dsh plugin --profile web add /absolute/path/to/dsh-qsearch
```

bundle patch 只插入本插件：

```yaml
- insert:
    - id: qsearch
      name: dsh-qsearch
```

卸掉 bundle 就去掉这一行。官方 `web` 选择不变，搜索回到 DeepSeek，不用再改 patch。

## 设置

**设置 → QSearch**（左侧独立一栏）

- **搜索协议**：`auto` 或 Gemini / OpenAI / Grok 原生。与对话用的 LLM `api` 无关。
- **已配置路由**：Models 页已启用的 provider。密钥和对话 `baseURL` 都读这条。
- **搜索模型**：必填。该路由上的模型 id，用于辅助搜索请求。
- 预览会显示改写后的原生搜索 URL。

`auto` 按搜索模型 id 推断协议（`gemini*` / `gpt*` / `grok*` 等），不探测密钥。

## 开发

```sh
npm install
npm test
npm run build
```

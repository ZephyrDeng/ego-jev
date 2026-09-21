# ego-jev 多平台宣传手册（一手来源）

调研日期：2026-09-21。证据等级：`已核实` = 已打开官方页面或仓库文件；`推断` = 由官方规则推出、未在该页逐字写出；`未知` = 未能抓到一手规则，不据此建议动作。

## 1. 一句话结论

先把仓库变成可被搜、可被装、可被试的 skill 发行物：补 GitHub Social Preview（1280×640 raster）、把 About Website 指到 listing、用 `gh skill publish --dry-run` 对齐 Agent Skills 规范、做一段可复现的循环录像；安装面已经通 `npx skills add ZephyrDeng/ego-jev` 与 `gh skill install ZephyrDeng/ego-jev`，下一步是 Claude 社区 marketplace 提交、ego Discord 的 skill sharing、Show HN / Product Hunt 用「能当场跑」的角度，以及 V2EX `/go/create` 与 OSCHINA 投递软件。

## 2. 产品与现状盘点

### 产品（仓库文件，已核实）

ego-jev 是给 [ego lite](https://lite.ego.app/) 的 agent skill：用 Jev（[TypeSafe System One](https://docs.typesafe.ai/introduction)）做逐步 DOM 决策，约 0.4 s / 步，替代整轮 LLM。[README.md](../README.md) 安装命令已写：

```bash
npx skills add ZephyrDeng/ego-jev
gh skill install ZephyrDeng/ego-jev
```

`skills/ego-jev/SKILL.md` frontmatter：`name: ego-jev`、`description`、`license: MIT`、`metadata.version: "0.2.1"`（见该文件 YAML）。循环实现：`skills/ego-jev/scripts/jev-loop.mjs`。离线自测（无 key）：`cd skills/ego-jev && ego-browser nodejs < scripts/selftest.mjs`（[README.md](../README.md) § Use）。许可证全文：[LICENSE](../LICENSE)（MIT，Copyright 2026 ZephyrDeng）。

### 已有渠道（已核实）

| 项 | 现状 | 证据 |
| --- | --- | --- |
| 公开 GitHub | https://github.com/ZephyrDeng/ego-jev | 仓库页 |
| About 描述 | `Jev (TypeSafe System One) inner loop for ego-browser — one ~0.4s typed decision per DOM step instead of an LLM turn. Agent skill for ego lite.` | 仓库 About |
| Topics | `agent-skills` `ai-agents` `browser-automation` `claude-skills` `codex-skills` `skill-md` | 仓库 Topics |
| stars / forks / watchers | 0 / 0 / 0 | 仓库侧栏 |
| Releases | `v0.2.1`（Latest，2026-09-21）、`v0.2.0` | [Releases](https://github.com/ZephyrDeng/ego-jev/releases) |
| skills.sh 列表 | 1 skill、1 total install、First Seen Today | [skills.sh/ZephyrDeng/ego-jev](https://www.skills.sh/ZephyrDeng/ego-jev) 与 [skill 页](https://www.skills.sh/zephyrdeng/ego-jev/ego-jev) |
| README badge | `https://skills.sh/b/ZephyrDeng/ego-jev` | [README.md](../README.md) 徽章 |
| MIT | 是 | [LICENSE](../LICENSE) |
| Issues 标签 | 仓库有 Issues 入口 | 仓库 HTML |
| SKILL.md 路径 | `skills/ego-jev/SKILL.md`，符合 `skills/*/SKILL.md` | 仓库树；[gh skill install](https://cli.github.com/manual/gh_skill_install) |

### 缺口（已核实）

| 项 | 现状 | 官方对照 |
| --- | --- | --- |
| Social Preview | 自动图 `opengraph.githubassets.com/...`，`og:image` 1200×600 | GitHub：未上传前用头像+基本信息；建议 PNG/JPG/GIF &lt; 1 MB，至少 640×320，最佳 1280×640（[Social media preview](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)） |
| About Website | 仓库 HTML 未出现独立 Website URL | README 已链 [lite.ego.app](https://lite.ego.app/)；About 字段未设 |
| Discussions | `/discussions` → 404 | 需在 Settings → Features 打开（[Discussions Quickstart](https://docs.github.com/en/discussions/quickstart)） |
| GitHub Sponsors / FUNDING.yml | `github.com/sponsors/ZephyrDeng` 302 到个人页；仓库无 Sponsor 按钮 | [Displaying a sponsor button](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository) |
| CONTRIBUTING / CoC | 仓库无这些文件 | GitHub 建议 README + license + 贡献指南 + CoC（[About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)） |
| Claude plugin 包装 | 无 `.claude-plugin/marketplace.json` / `plugin.json` | 社区 marketplace 要插件目录（[Create plugins](https://code.claude.com/docs/en/plugins)） |
| Cursor plugin 包装 | 无 `plugin.json` / `.cursor-plugin/` | Cursor 不单独 import GitHub skill，要 plugin + marketplace（[Agent Skills](https://cursor.com/docs/context/skills) § Installing skills from a repository） |
| Codex plugin | 无 root `plugin.json` / `agents/openai.yaml` | 对外分发优先 plugin（[Build skills](https://learn.chatgpt.com/codex/build-skills)） |
| npm 包 | 无 `package.json` | npm 是 JS 包注册表，不是 skill 目录（[npm publish](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages)） |
| skills.sh.json | 无 | 仅多 skill 分组用；单 skill 可省略（[Customize repo pages](https://www.skills.sh/docs/customize)） |
| 演示录像 | `docs/` 仅 `banner.svg` | 兄弟项目 jev-ultrafast 有 `docs/demo.gif` / `demo.mp4`（[jev-ultrafast README](https://github.com/browser-use/jev-ultrafast)） |
| Release notes | v0.2.1 正文几乎只有 changelog 链接 | `gh skill publish` 会引导打 tag + 自动 notes（[gh skill publish](https://cli.github.com/manual/gh_skill_publish)） |

`docs/banner.svg` 存在。GitHub Social Preview 接受 PNG、JPG 或 GIF（[Social media preview](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)），需从 SVG 导出 raster 再上传。

---

## 3. 按渠道分组的宣传手册

统一小节：适合吗 / 官方要求 / 现在缺什么 / 建议动作 / 来源。

### 3.1 Skill / 插件注册与安装通道

#### skills.sh（Vercel Labs 排行榜 + CLI）

- **适合吗**：适合。仓库已上榜，路径 `ZephyrDeng/ego-jev`，skill slug `ego-jev`。
- **官方要求**：GitHub 上放 skill 定义 + README；用户 `npx skills add <owner/repo>` 后，匿名 telemetry 自动进排行榜，无需申请（[FAQ: How do I get my skill listed](https://www.skills.sh/docs/faq)）。`SKILL.md` 需要 `name` + `description`（[vercel-labs/skills README](https://github.com/vercel-labs/skills) § Creating Skills）。徽章：`https://skills.sh/b/owner/repo`（[skills.sh docs](https://www.skills.sh/docs)）。
- **现在缺什么**：已有 listing、badge、1 install。无 `skills.sh.json`（单 skill 不强制）。Skill 详情页安装命令是 `npx skills add https://github.com/zephyrdeng/ego-jev --skill ego-jev`（[skill 页](https://www.skills.sh/zephyrdeng/ego-jev/ego-jev)）。
- **建议动作**：保持 README 安装命令。排行榜靠 CLI 匿名 telemetry（[FAQ](https://www.skills.sh/docs/faq)）；`DISABLE_TELEMETRY=1` 关闭该采集（[CLI](https://www.skills.sh/docs/cli)）。可选 pack：登录 Vercel 建 unlisted pack（[Packs](https://www.skills.sh/docs/packs)）。`GET /api/v1/skills/curated` 是「the makers teaching you how to use their product」的 first-party 集合（[API](https://www.skills.sh/docs/api)）；ego-jev 走 telemetry 排行榜，不走 curated。
- **来源**：[skills.sh/docs](https://www.skills.sh/docs)、[FAQ](https://www.skills.sh/docs/faq)、[CLI](https://www.skills.sh/docs/cli)、[listing](https://www.skills.sh/ZephyrDeng/ego-jev)。

**安装命令（已核实）**

```bash
npx skills add ZephyrDeng/ego-jev
# listing 页等价写法
npx skills add https://github.com/zephyrdeng/ego-jev --skill ego-jev
```

#### GitHub CLI `gh skill`（preview）

- **适合吗**：适合。目录已是 `skills/ego-jev/SKILL.md`。Topics 已含 `agent-skills`（`gh skill publish` 会引导加这个 topic，[gh skill publish](https://cli.github.com/manual/gh_skill_publish)）。
- **官方要求**：发现约定 `skills/*/SKILL.md` 等（[gh skill install](https://cli.github.com/manual/gh_skill_install)）。规范：[agentskills.io/specification](https://agentskills.io/specification)（`name` 小写+连字符、≤64；`description` ≤1024；`name` 必须等于父目录名）。发布：`gh skill publish` 校验后打 GitHub Release，semver 推荐。搜索：`gh skill search` 用 Code Search 扫公开 `SKILL.md`（[gh skill search](https://cli.github.com/manual/gh_skill_search)）。
- **现在缺什么**：未在本机跑 `--dry-run`（`gh` token 当前无效）。Release notes 过薄。可选 `compatibility` 字段未写。
- **建议动作**：`gh skill publish --dry-run`；补 `compatibility`（ego lite + ego-browser + `TYPESAFE_API_KEY` 或 `AI_GATEWAY_API_KEY`）；下个版本用 publish 生成 notes。
- **来源**：[gh skill](https://cli.github.com/manual/gh_skill)、[install](https://cli.github.com/manual/gh_skill_install)、[publish](https://cli.github.com/manual/gh_skill_publish)、[Changelog 2026-04-16](https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/)、[Agent Skills spec](https://agentskills.io/specification)。

```bash
gh skill install ZephyrDeng/ego-jev
gh skill search ego-jev
gh skill publish --dry-run
```

#### Claude Code plugins / marketplace

- **适合吗**：适合做分发。当前仓库是独立 skill 目录，Claude 社区 marketplace 收的是 plugin。
- **官方要求**：独立 skill 可放进 agent 的 skills 目录；对外共享要 plugin + marketplace（[Create plugins](https://code.claude.com/docs/en/plugins)）。官方 marketplace `claude-plugins-official` 由 Anthropic 策展，无申请通道。社区 marketplace：表单 [claude.ai/.../plugins/new](https://claude.ai/admin-settings/directory/submissions/plugins/new) 或 [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit)；本地 `claude plugin validate ./your-plugin`；通过后 pin SHA 到 [anthropics/claude-plugins-community](https://github.com/anthropics/claude-plugins-community)，夜间同步（[Create plugins § Submit](https://code.claude.com/docs/en/plugins)）。也可自建 `.claude-plugin/marketplace.json`，用户 `/plugin marketplace add ZephyrDeng/ego-jev`（[plugin-marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)）。
- **现在缺什么**：无 `plugin.json`、无 marketplace 清单。TypeSafe 官方 skill 走 `claude plugin marketplace add typesafe-ai/skills`（[TypeSafe agent skill](https://docs.typesafe.ai/agent-skill)）——这是 TypeSafe 自己的 marketplace，不是 ego-jev 的。
- **建议动作**：在仓库加最小 plugin 包装（`skills/ego-jev/` 已符合 plugin skill 布局），`claude plugin validate`，再提交 community marketplace。同时 README 保留 `npx skills add` / `gh skill install`。
- **来源**：[plugins](https://code.claude.com/docs/en/plugins)、[discover-plugins](https://code.claude.com/docs/en/discover-plugins)、[plugin-marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)。

```text
/plugin marketplace add anthropics/claude-plugins-community
/plugin install <name>@claude-community
```

（社区目录里出现之后才有第二条。）

#### Cursor

- **适合吗**：skill 格式兼容；公开 Cursor Marketplace 是策展，不保证收第三方。
- **官方要求**：技能目录 `.agents/skills/` 等 + `SKILL.md`（`name`/`description` 必填，name 匹配文件夹，[Cursor Skills](https://cursor.com/docs/context/skills)）。从 GitHub 拉 skill：打成 plugin，仓库要有 `.cursor-plugin/marketplace.json`，在 Customize → From GitHub Repository 导入，或走 team marketplace。公开列表：提交 [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)；「Every plugin is manually reviewed」「we work with a small group of trusted partners」（[Marketplace security](https://cursor.com/help/security-and-privacy/marketplace-security)）。Team 内 Publish 仅 Teams/Enterprise（[Plugins](https://cursor.com/docs/plugins)）。
- **现在缺什么**：无 Cursor plugin manifest。公开 marketplace 收录 = 未知（需提交后等审核）。
- **建议动作**：用户侧继续 `npx skills add ZephyrDeng/ego-jev -a cursor`（[vercel-labs/skills](https://github.com/vercel-labs/skills) 支持 `--agent cursor`）。要进官方 Marketplace：按 [plugin-template](https://github.com/cursor/plugin-template) 包装后提交 publish 页。
- **来源**：[cursor.com/docs/context/skills](https://cursor.com/docs/context/skills)、[cursor.com/docs/plugins](https://cursor.com/docs/plugins)、[marketplace-security](https://cursor.com/help/security-and-privacy/marketplace-security)。

#### Codex / OpenAI skills & plugins

- **适合吗**：本地 skill 兼容；公共目录要走 OpenAI plugin 提交。
- **官方要求**：本地：`SKILL.md` 的 `name`+`description`；Codex 扫 `.agents/skills` 等（[Build skills](https://learn.chatgpt.com/codex/build-skills)）。本地安装别人的仓库：`$skill-installer`，「prompt the installer to download skills from other repositories」。对外分发：打成 plugin，提交 [platform.openai.com/plugins](https://platform.openai.com/plugins)（需 Apps Management write、开发者身份验证、listing 字段、5 正 3 负测试用例等，[Submit plugins](https://developers.openai.com/plugins/deploy/submission)）。批准后开发者自己点发布，进入 ChatGPT/Codex 共用 Plugins Directory。
- **现在缺什么**：无 `plugin.json`、无 `agents/openai.yaml`、未走提交门户。
- **建议动作**：短期 README 写 `npx skills add ZephyrDeng/ego-jev -a codex` 与 `$skill-installer` 指向本仓库。公共目录是重投入，排在 Claude 社区 marketplace 之后。
- **来源**：[learn.chatgpt.com/codex/build-skills](https://learn.chatgpt.com/codex/build-skills)、[skills-and-plugins](https://learn.chatgpt.com/codex/skills-and-plugins)、[Submit plugins](https://developers.openai.com/plugins/deploy/submission)。

#### GitHub Copilot

- **适合吗**：适合作为 `gh skill` 的默认 host。
- **官方要求**：Copilot 读 `.github/skills`、`.claude/skills`、`.agents/skills` 与 `~/.copilot/skills`；可用 `gh skill` 从 GitHub 仓库安装；GitHub 指向 [`github/awesome-copilot`](https://github.com/github/awesome-copilot) 作为社区集合（[About agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)）。
- **现在缺什么**：未向 `awesome-copilot` 提交（需读该仓库自己的 CONTRIBUTING，本次未展开）。
- **建议动作**：安装命令已覆盖。向 `awesome-copilot` 开 PR 前先读该仓库 CONTRIBUTING（本次未展开）。GitHub Explore collections 的贡献指南拒绝 self promotion（[explore CONTRIBUTING](https://github.com/github/explore/blob/main/CONTRIBUTING.md)），与 awesome-copilot 是不同仓库。
- **来源**：[About agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)、[gh skill install](https://cli.github.com/manual/gh_skill_install)。

#### npm

- **适合吗**：npm 是 JS 包注册表。仓库无 `package.json`，循环以 GitHub skill 目录分发。
- **官方要求**：`npm init` + `npm publish` 发到 registry（[Creating unscoped public packages](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages)）。Claude marketplace 的 plugin `source` 可以是 npm（[plugin-marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)），那是插件分发方式，不是「npm skills catalog」。
- **现在缺什么**：无 `package.json`。循环是 dependency-free Node 脚本（[README.md](../README.md)）。
- **建议动作**：继续用 `npx skills add`（npx 执行的是 `skills` CLI，[vercel-labs/skills](https://github.com/vercel-labs/skills)）。
- **来源**：npm 文档；[skills CLI](https://www.skills.sh/docs/cli)。

---

### 3.2 GitHub 可发现性

#### Topics / About / README

- **适合吗**：适合，且是最低成本通道。
- **官方要求**：topic 小写、数字、连字符，≤50 字符，最多 20 个；帮助别人按用途/领域找到项目（[Classifying with topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)）。搜索：`topic:agent-skills`、`in:description`、`in:readme`、`in:topics`（[Searching for repositories](https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories)）。README 应说明做什么、为何有用、如何开始、何处求助、谁维护（[About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)）。
- **现在缺什么**：Topics 已有 6 个（含 `agent-skills`）。描述已写。README 缺「Where to get help」与维护者段落。About Website 空。可补 topic：`typesafe` `browser-use` `ego`（官方允许任意 topic，[topics 文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)）。
- **建议动作**：About Website 设为 `https://skills.sh/ZephyrDeng/ego-jev` 或 `https://lite.ego.app/`。README 加 Issues / Discussions 入口。Topics 保持 `agent-skills`。
- **来源**：上列 GitHub Docs；仓库 About。

#### Social Preview

- **官方要求**：PNG/JPG/GIF，&lt; 1 MB；至少 640×320，最佳 1280×640；支持透明 PNG，不确定时用实底（[Social media preview](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)）。
- **现在缺什么**：自动 OG 图 1200×600。`docs/banner.svg` 不是允许的上传格式。
- **建议动作**：把 banner 导出 1280×640 PNG，Settings → Social preview 上传。X 卡片会跟 `twitter:image` 走同一张图（仓库 HTML `twitter:card=summary_large_image`）。
- **来源**：GitHub Docs；仓库 HTML meta。

#### Releases

- **官方要求**：基于 git tag；可自动生成 notes；zip/tarball 自动附带（[About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)）。`gh skill publish` 把 Release 当作 skill 版本源；无 skill 名时 install 先解析 latest tagged release（[gh skill install](https://cli.github.com/manual/gh_skill_install)）。
- **现在缺什么**：tag 已有；notes 几乎空。
- **建议动作**：下个版本用 `gh skill publish --tag vX.Y.Z`，让 notes 写出 SKILL.md / loop 变更。
- **来源**：上列。

#### Discussions / Sponsors / explore

- **Discussions**：适合公告与 Q&A；Issues 跟代码缺陷分开（[About repositories](https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories) § collaboration；[Discussions Quickstart](https://docs.github.com/en/discussions/quickstart)）。当前 404。打开后发 welcome 帖。
- **Sponsors**：要先有 Sponsors profile（支持地区列表见 [About GitHub Sponsors](https://docs.github.com/en/sponsors/getting-started-with-github-sponsors/about-github-sponsors)），再 `.github/FUNDING.yml`。当前无 listing。非阻塞。
- **github/explore collections**：官方贡献指南写明「Avoid conflicts of interest… If it is self promotion, it's unlikely to be accepted」（[explore CONTRIBUTING](https://github.com/github/explore/blob/main/CONTRIBUTING.md)）。不为此开 PR。
- **来源**：上列 GitHub Docs。

---

### 3.3 开发者发布平台（官方发帖规则）

#### Hacker News — Show HN

- **适合吗**：适合，前提是别人能试。
- **官方要求**：标题以 `Show HN` 开头；必须是你做过、人能 run / hold 的东西；blog、signup 页、newsletter、list 不能当 Show HN（[showhn.html](https://news.ycombinator.com/showhn.html)）。降低试用门槛，尽量无注册。禁止请朋友 upvote/comment（同页 + [FAQ](https://news.ycombinator.com/newsfaq.html) “Can I ask people to upvote”）。站点不作主要推广工具（[newsguidelines.html](https://news.ycombinator.com/newsguidelines.html)）。dang 的展示提示：手写正文、禁止 LLM 生成或润色 HN 文本；写来历与差异；去掉营销腔；用户名不要用公司/产品名（[item 22336638](https://news.ycombinator.com/item?id=22336638)，2026-03-28 仍有效）。
- **现在缺什么**：真实循环需要 ego lite + TypeSafe/Gateway key。无 key 的 `selftest.mjs` 可跑。无公开 demo 录像。
- **建议动作**：正文链 GitHub + 安装两行命令 + selftest；说明 TypeSafe 控制台有无卡 $5 credit（[reference.md](../skills/ego-jev/reference.md) 写了 console.typesafe.ai/settings/billing）。录像补上后再发。
- **一句话角度**：`Show HN: 0.4s typed DOM decisions inside ego lite (Jev inner loop, no screenshots)`。
- **来源**：[showhn.html](https://news.ycombinator.com/showhn.html)、[newsguidelines.html](https://news.ycombinator.com/newsguidelines.html)、[newsfaq.html](https://news.ycombinator.com/newsfaq.html)、[dang tips](https://news.ycombinator.com/item?id=22336638)。

#### Reddit

- **适合吗**：站点级允许参与社区并遵守各 sub 规则；**本次未能抓到** r/LocalLLaMA、r/ClaudeAI、r/programming、r/opensource、r/webdev 的版规（reddit.com 返回 block），按任务要求不推荐具体 sub。
- **官方要求（全站）**：Rule 2 — 遵守社区规则；真实参与；禁止 spam 与干扰（含内容操纵）（[Reddit Rules](https://redditinc.com/policies/reddit-rules)）。
- **现在缺什么**：各目标 sub 的 self-promo 细则 = **未知**。
- **建议动作**：打开目标 sub 的 `/about/rules` 再决定。全站 Rule 2 要求真实参与、禁止 spam。
- **一句话角度**：暂不发；规则页读完再写。
- **来源**：[redditinc.com/policies/reddit-rules](https://redditinc.com/policies/reddit-rules)。未能抓取：各 sub `/about/rules`。

#### Product Hunt

- **适合吗**：适合（可用的新产品；skill 是可安装产品）。
- **官方要求**：个人账号，禁止公司号（[How PH works](https://www.producthunt.com/launch/how-product-hunt-works)）。新号须完成 onboarding 才能 Post（[How to post](https://help.producthunt.com/en/articles/479557-how-to-post-a-product)）；Launch Guide 另写「at least a week」才获得 contribute a product 权限（[Sharing your launch](https://www.producthunt.com/launch/sharing-your-launch)）。禁止买 hunter、买流量、直接要 upvote、upvote 抽奖（[Community Guidelines](https://help.producthunt.com/en/articles/3615694-community-guidelines)；[How PH works](https://www.producthunt.com/launch/how-product-hunt-works)；[Sharing your launch](https://www.producthunt.com/launch/sharing-your-launch)）。资产：Thumbnail 方形，推荐 240×240，GIF &lt; 3 MB；Gallery ≥2 张，推荐 1270×760；Description 在 Help 文写 260 字符、Launch Guide 写 max 500 字符（两处数字不一致，提交时以表单计数为准）；Tagline max 60；Name 纯产品名；First comment 建议 maker 自己写（[Preparing for launch](https://www.producthunt.com/launch/preparing-for-launch)）。时间：无约束时 12:01 AM PT，首页 24h 周期（同页）。可提前 schedule 最多 1 个月。
- **现在缺什么**：无 240×240 thumb、无 ≥2 张 1270×760 图、无 demo 视频/Arcade、无 PH 账号与 first comment 草稿。
- **建议动作**：资产齐了再 schedule。Preparing 写 primary URL 可以是 landing，也可以是 App Store 或 GitHub repo（[Preparing](https://www.producthunt.com/launch/preparing-for-launch)）。Pricing 选 free。First comment 写安装命令、依赖（ego lite + key）、0.4s/步，并链 [jev-ultrafast](https://github.com/browser-use/jev-ultrafast)。
- **一句话角度**：`ego-jev — 0.4s typed click/fill/select loop for ego lite, powered by TypeSafe Jev`。
- **来源**：上列 Product Hunt Help / Launch Guide。

#### Dev.to

- **适合吗**：适合发技术文（循环如何工作）。
- **官方要求**：Users must make a good-faith effort to share content that is on-topic, of high-quality, and is not designed primarily for the purposes of promotion or creating backlinks；Posts must contain substantial content — they may not merely reference an external link（[Terms §11 Content Policy](https://dev.to/terms)）。CoC：引用要标注；AI 辅助须披露（[Code of Conduct](https://dev.to/code-of-conduct)）。
- **现在缺什么**：无文章。
- **建议动作**：写「如何在 ego-browser 里用 System One 做逐步 DOM 决策」，正文自洽，文末链仓库。
- **一句话角度**：实现笔记，附带开源 skill。
- **来源**：[dev.to/terms](https://dev.to/terms)、[dev.to/code-of-conduct](https://dev.to/code-of-conduct)。

#### Hashnode

- **适合吗**：适合技术博文。
- **官方要求**：平台为开发者分享技术；链文档/仓库被鼓励。禁止「primarily for self-promotion without contributing」（[Code of Conduct](https://hashnode.com/code-of-conduct) §2 Spam）。文章须原创或标明来源；禁止 clickbait。
- **现在缺什么**：无博客。
- **建议动作**：与 Dev.to 同源技术文，发自己的 Hashnode 域。
- **一句话角度**：同 Dev.to。
- **来源**：[hashnode.com/code-of-conduct](https://hashnode.com/code-of-conduct)。

#### Lobsters

- **适合吗**：窄。计算向、能改进读者下一个程序。自我推广 &lt; 1/4 的 stories+comments。新用户 70 天内不能用 `show`/`ask` 等 tag，且不能提交未见过的域名（[About](https://lobste.rs/about)）。
- **官方要求**：邀请制；self-promo 上限 1/4；topicality 偏 computing（同页）。
- **现在缺什么**：未知作者是否有邀请、账号年龄。
- **建议动作**：有资格后再投 `show`，链 GitHub，正文技术向。无号不强求。
- **一句话角度**：`Show: Jev inner loop as an ego-browser skill`。
- **来源**：[lobste.rs/about](https://lobste.rs/about)。

#### X / Twitter

- **适合吗**：无官方「launch guide」。可核实：仓库 OG 图会进 `twitter:image`；ego 官方 X 为 [@ego_agent](https://x.com/ego_agent)（[ego-lite README](https://github.com/citrolabs/ego-lite)）；TypeSafe 为 [@typesafeai](https://x.com/typesafeai)（[typesafe.ai](https://typesafe.ai)）。作者 X 账号 = **未知**（GitHub Sponsors/profile 未展示独立 listing）。
- **建议动作**：发帖链 GitHub，依赖 Social Preview。不编增长hack。
- **来源**：仓库 HTML meta；ego / TypeSafe 站点。

---

### 3.4 相邻一手生态（只做对方主动邀请的动作）

#### TypeSafe

- **官方表面**：[docs.typesafe.ai](https://docs.typesafe.ai/introduction)、[console.typesafe.ai](https://console.typesafe.ai)、[typesafe.ai](https://typesafe.ai)（LinkedIn、X、`hello@typesafe.ai`）。文档有 [Agent skill](https://docs.typesafe.ai/agent-skill)（安装 `typesafe-ai/skills`），有 [Demos](https://docs.typesafe.ai/demos.md) 与 cookbooks。站点 FAQ 有 “How do I get started or ask a question?”（首页列出，折叠正文本次未展开）。**无 Discord 链在官网**（已核实站点页）。
- **对方邀请了什么**：站点放了 `hello@typesafe.ai` 与 X。FAQ 标题含 “How do I get started or ask a question?”（折叠正文本次未展开 = **推断** 可邮件提问）。官方 agent skill 讲 TypeSafe API 用法。文档索引无 related-projects / showcase 投稿页（[llms.txt](https://docs.typesafe.ai/llms.txt)）。
- **建议动作**：向 `hello@typesafe.ai` 或 @typesafeai 说明：ego-jev 是 Jev 在 ego-browser 上的逐步 inner loop，仓库 MIT。
- **来源**：[typesafe.ai](https://typesafe.ai)、[docs.typesafe.ai/llms.txt](https://docs.typesafe.ai/llms.txt)、[agent-skill](https://docs.typesafe.ai/agent-skill)。

#### ego lite

- **官方表面**：[lite.ego.app](https://lite.ego.app/)、[Docs](https://lite.ego.app/document/en/docs/quick-start)、[Changelog](https://lite.ego.app/changelog)、[GitHub citrolabs/ego-lite](https://github.com/citrolabs/ego-lite)、Discord `https://discord.gg/5eGZVvHbTq`、Discussions、X @ego_agent。Quick start 文末：「Whether you want to share a tip or need a hand, come join our Discord」。README Community：Discord =「questions, setup help, and **skill sharing**」（[ego-lite README](https://github.com/citrolabs/ego-lite)）。
- **CONTRIBUTING**：只收 **ego-browser JS SDK / Skill** 的 PR（[CONTRIBUTING.md](https://github.com/citrolabs/ego-lite/blob/main/CONTRIBUTING.md)）。没有 related-projects 栏。
- **建议动作**：在官方 Discord 按「skill sharing」介绍 ego-jev（依赖已安装的 `ego-browser` skill）。Discussions 发 idea 帖。不要向 ego README 塞 related 链接，除非他们开口。
- **来源**：上列 ego 页面。

#### browser-use / jev-ultrafast

- **官方表面**：[jev-ultrafast README](https://github.com/browser-use/jev-ultrafast) 链 Browser Use、Browser Harness、TypeSafe fan-out。Cloud waitlist。无 CONTRIBUTING.md（路径 404）。无「related ports」邀请。
- **建议动作**：不向该 README 提 PR。可在自己 README 保持 sibling 链接（已有）。若在 Browser Use Discord/论坛发帖，先找到**他们站点上的社区入口**——本次未在 jev-ultrafast README 看到 Discord 链。
- **来源**：jev-ultrafast README；CONTRIBUTING 404。

---

### 3.5 中文 / 双语开发者平台

#### V2EX

- **适合吗**：适合。官方欢迎独立开发者把新作发到 **分享创造** `/go/create`（[节点帮助](https://www.v2ex.com/help/node)）。厂商营销发 **推广** `/go/promotions`，乱发会被挪节点，多次忽略影响账号（同页；[About](https://www.v2ex.com/about) 另有：禁止 AI 生成内容发到站上、尊重原创、禁止全文转载他人文章等）。
- **节点**：`/go/create`（文案：欢迎独立开发者发布新作，获取第一批用户和反馈）。
- **建议动作**：手写中文帖（About 禁止 AI 生成内容）；讲循环、延迟、安装命令；链 GitHub。不要发到推广节点。
- **一句话角度**：把 Jev 逐步决策接到 ego lite 真浏览器里的开源 skill。
- **来源**：[v2ex.com/help/node](https://www.v2ex.com/help/node)、[v2ex.com/about](https://www.v2ex.com/about)、[go/create](https://www.v2ex.com/go/create)。

#### 掘金

- **适合吗**：官方小册《如何使用掘金社区》存在，目录含「五、发布广告内容」（[小册章节](https://juejin.cn/book/6844733795329900551/section/6844733795380232200)）。**本次抓取只返回壳页，广告正文未能完整展开** → 广告细则 = **未知**。
- **建议动作**：发完整技术文（循环、代码、测量），GitHub 作为引用。读完小册广告节再决定是否带下载/加群 CTA。
- **来源**：小册 URL（已核实存在）；正文抓取失败。

#### 即刻

- **适合吗**：**未知**。未能抓到即刻官方社区规范/创作者政策，只有用户帖。
- **建议动作**：不发推广。
- **来源**：无一手规则页。

#### 知乎

- **适合吗**：**未知**。未能打开现行《知乎社区规范》正文页，无法核实开源项目自荐与外链边界。
- **建议动作**：打开站内「社区规范」后再决定。规范未核实前不把知乎当发行通道。
- **来源**：规范全文未抓到。

#### 小红书

- **适合吗**：弱。社区是生活经验分享，不是软件目录。
- **官方要求**：只分享基于真实经历的原创；赞助/推广须披露；禁止 clickbait（[EN Community Guidelines](https://www.xiaohongshu.com/en/community_guidelines)）。中文《小红书社区规范》URL [xiaohongshu.com/crown/community/rules](https://www.xiaohongshu.com/crown/community/rules) 本次抓取几乎无正文。
- **建议动作**：非优先。若发，按英文指南：真实使用经历、赞助/推广须披露。
- **来源**：英文指南已核实；中文规范页抓取失败。

#### 开源中国 OSCHINA

- **适合吗**：适合。官方运营指南第一步就是投递开源软件入库，明确「宣传推广自己的开源项目」（[运营源计划](https://www.oschina.net/help-center/oschina-guides/how-to-play-in-osc.html)；[投递指南](https://www.oschina.net/question/2918182_2266982)）。
- **官方要求**：软件必须开源且未收录；介绍含功能、特性、使用方法、代码示例；有界面需截图；正文不要 QQ 群/二维码；名称建议英文且唯一；审核约 1 个工作日。先添加软件，再投「软件更新资讯」（须已收录）。介绍从开发者特性/架构写，不要纯产品腔。
- **建议动作**：投递软件（MIT、GitHub、ego-jev）；通过后再投 v0.2.1 更新资讯（中文变更、下载/安装、出处链 Release）。
- **来源**：上列 OSCHINA 官方帖/帮助中心。

---

### 3.6 平台实际要求的 Demo / 资产

| 资产 | 数字 | 来源 |
| --- | --- | --- |
| GitHub Social Preview | PNG/JPG/GIF，&lt; 1 MB；≥ 640×320；最佳 **1280×640** | [GitHub Docs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview) |
| 当前 OG | 自动图 **1200×600** | 仓库 `og:image:width/height` |
| Product Hunt thumbnail | 方形，推荐 **240×240**；GIF &lt; **3 MB** | [How to post](https://help.producthunt.com/en/articles/479557-how-to-post-a-product)、[Preparing](https://www.producthunt.com/launch/preparing-for-launch) |
| Product Hunt gallery | ≥ **2** 张，推荐 **1270×760** | 同上 |
| Product Hunt tagline | max **60** 字符 | [Preparing](https://www.producthunt.com/launch/preparing-for-launch) |
| Product Hunt description | Help 文写 260 字符；Launch Guide 写 max 500 — **两处不一致，提交时以表单计数为准** | [How to post](https://help.producthunt.com/en/articles/479557-how-to-post-a-product)、[Preparing](https://www.producthunt.com/launch/preparing-for-launch) |
| Product Hunt video | 仅 YouTube 完整 URL，非 private | 同上 |
| HN Show HN | 能试；少注册墙；手写非 LLM | [showhn.html](https://news.ycombinator.com/showhn.html)、[dang](https://news.ycombinator.com/item?id=22336638) |
| skills.sh listing | 由 telemetry 生成：name、installs、SKILL.md、security audits | [skill 页](https://www.skills.sh/zephyrdeng/ego-jev/ego-jev)；[FAQ](https://www.skills.sh/docs/faq) |
| Agent Skills 元数据 | `name` ≤64、`description` ≤1024 | [agentskills.io](https://agentskills.io/specification) |
| OpenAI plugin 提交 | logo、长短描述、隐私/条款 URL、5 正 3 负测试 | [Submit plugins](https://developers.openai.com/plugins/deploy/submission) |

兄弟项目可参考的演示形态：jev-ultrafast 的 1× `docs/demo.gif` / `demo.mp4`（[README](https://github.com/browser-use/jev-ultrafast)）。ego-jev 应对齐：一段「snapshot → 编号 → Jev 选 op+target → ego 点击」的屏录。

---

## 4. 建议执行顺序（投入产出，8 步）

1. **GitHub 发行物打磨（小时级）**：1280×640 Social Preview；About Website；`gh skill publish --dry-run`；Release notes；README 加求助入口。证据：GitHub Docs + gh skill publish。
2. **可试用 demo（半天级）**：录循环；保留 `selftest.mjs` 作为无 key 路径。证据：Show HN「make it easy to try」；PH gallery。
3. **Claude 社区 marketplace（半天包装 + 等审）**：最小 `plugin.json` + validate + 提交表单。证据：code.claude.com plugins。
4. **ego Discord skill sharing（一帖）**：官方 README 邀请 skill sharing。证据：citrolabs/ego-lite README Community。
5. **V2EX `/go/create` 手写帖**：官方欢迎独立开发者新作。证据：v2ex.com/help/node。
6. **OSCHINA 投递软件**：官方运营第一步。证据：oschina help-center。
7. **Show HN**：资产与试用路径就绪后；手写；不拉票。证据：showhn.html、dang tips。
8. **Product Hunt**：个人号满一周、图/first comment 齐、12:01 PT schedule。证据：Launch Guide。Dev.to/Hashnode 技术文可与 5–7 并行。

TypeSafe 邮件/`@typesafeai` 可插在第 4 步旁边。Cursor/OpenAI 公开目录放在 8 之后（策展+重表单）。

---

## 5. 刻意不要做的事（仅官方禁止）

| 不要 | 规则 |
| --- | --- |
| 在 HN 要 upvote / comment / 请亲友灌评论 | [FAQ](https://news.ycombinator.com/newsfaq.html)、[showhn.html](https://news.ycombinator.com/showhn.html)、[dang](https://news.ycombinator.com/item?id=22336638) |
| 用 LLM 生成或润色 HN 正文 | [dang 2026-03-28](https://news.ycombinator.com/item?id=22336638) |
| 把 landing / 未可试用的东西标 Show HN | [showhn.html](https://news.ycombinator.com/showhn.html) |
| Product Hunt 要 upvote、买 hunter、公司号、upvote 抽奖 | [Community Guidelines](https://help.producthunt.com/en/articles/3615694-community-guidelines)、[How PH works](https://www.producthunt.com/launch/how-product-hunt-works)、[Sharing](https://www.producthunt.com/launch/sharing-your-launch) |
| 未读 sub 规则就在 Reddit 发自荐 | 全站 Rule 2 要求遵守各社区规则（[Reddit Rules](https://redditinc.com/policies/reddit-rules)）；目标 sub 规则本次未知 |
| 向 github/explore collection 做自我推销 PR | [explore CONTRIBUTING](https://github.com/github/explore/blob/main/CONTRIBUTING.md) 「Avoid conflicts of interest… self promotion」 |
| 把 V2EX 营销帖发在非推广节点 | [help/node](https://www.v2ex.com/help/node) 多次忽略影响账号 |
| 向 V2EX 发 AI 生成内容 | [About](https://www.v2ex.com/about) |
| OSCHINA 软件介绍里放 QQ 群/二维码 | [投递指南](https://www.oschina.net/question/2918182_2266982) |
| Dev.to 发主要为了外链的空帖 | [Terms §11](https://dev.to/terms) |
| Hashnode 纯自推、无贡献 | [CoC](https://hashnode.com/code-of-conduct) |
| 向 jev-ultrafast / ego README 塞 related 链接 | 对方未设 related-projects 投稿口（已核实 README/CONTRIBUTING） |

---

## 6. 渠道总表

| 渠道 | 动作 | 官方入口 | 优先级 | 证据 |
| --- | --- | --- | --- | --- |
| GitHub Social Preview / About / README | 上传 1280×640；填 Website；补求助段 | [Social preview](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview) | P0 | GitHub Docs；仓库 OG 为自动图 |
| `gh skill publish --dry-run` | 校验规范 + 下次 Release notes | [gh skill publish](https://cli.github.com/manual/gh_skill_publish) | P0 | CLI manual |
| skills.sh | 已上榜；靠真实 `npx skills add` | [skills.sh/ZephyrDeng/ego-jev](https://www.skills.sh/ZephyrDeng/ego-jev) | 已完成/维持 | FAQ 自动 listing |
| Demo 录像 + selftest | 屏录循环；README 置顶无 key 路径 | Show HN / PH 资产规则 | P0 | showhn.html；PH gallery |
| Claude community marketplace | 包装 plugin → validate → 提交 | [Submit](https://code.claude.com/docs/en/plugins#submit-your-plugin-to-the-community-marketplace) | P1 | code.claude.com |
| ego Discord | skill sharing 帖 | [discord.gg/5eGZVvHbTq](https://discord.gg/5eGZVvHbTq) | P1 | ego README / docs |
| TypeSafe | 邮件或 X 告知移植 | hello@typesafe.ai、[@typesafeai](https://x.com/typesafeai) | P1 | typesafe.ai |
| V2EX 分享创造 | 手写开源分享帖 | [v2ex.com/go/create](https://www.v2ex.com/go/create) | P1 | help/node |
| OSCHINA 投递软件 | 入库 + 更新资讯 | [运营指南](https://www.oschina.net/help-center/oschina-guides/how-to-play-in-osc.html) | P1 | OSC 官方 |
| Show HN | 可试用后提交 | [submit](https://news.ycombinator.com/submit) + `Show HN` | P2 | showhn.html |
| Product Hunt | 个人号 + 图 + first comment | [producthunt.com/launch](https://www.producthunt.com/launch) | P2 | Launch Guide |
| Dev.to / Hashnode | 技术实现文 | [dev.to/terms](https://dev.to/terms)、[hashnode CoC](https://hashnode.com/code-of-conduct) | P2 | 各 ToS/CoC |
| Cursor Marketplace | plugin 后走 publish | [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) | P3 | 策展、trusted partners |
| OpenAI Plugins Directory | 提交门户 | [platform.openai.com/plugins](https://platform.openai.com/plugins) | P3 | 重表单 |
| GitHub Discussions | Settings 打开 | [Discussions Quickstart](https://docs.github.com/en/discussions/quickstart) | P2 | 当前 404 |
| GitHub Sponsors | 可选 | [Sponsors](https://docs.github.com/en/sponsors/getting-started-with-github-sponsors/about-github-sponsors) | P3 | 无 listing |
| npm 包 | 不做 | [npm publish](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages) | — | 非 skill 目录 |
| Reddit 具名 sub | 读版规前不发 | 各 `/about/rules` | 阻塞 | **未知**（抓取被拦） |
| 掘金 | 技术文，先读广告节 | [小册](https://juejin.cn/book/6844733795329900551/section/6844733795380232200) | P2 | 广告正文未完整抓取 |
| 知乎 | 先读社区规范 | 规范页未打开 | 阻塞 | **未知** |
| 即刻 | 无官方规则页 | — | — | **未知** |
| 小红书 | 非优先 | [EN guidelines](https://www.xiaohongshu.com/en/community_guidelines) | P3 | 生活分享向 |
| Lobsters | 有邀请且过新用户期再投 | [lobste.rs/about](https://lobste.rs/about) | P3 | 邀请制 + 1/4 self-promo |
| github/explore | 不做自荐 collection | [CONTRIBUTING](https://github.com/github/explore/blob/main/CONTRIBUTING.md) | 禁止 | self promotion 不受理 |
| jev-ultrafast README PR | 不做 | 无邀请 | — | 无 related 栏 |

---

## 7. 来源列表

### 产品与仓库

- [README.md](../README.md)、[skills/ego-jev/SKILL.md](../skills/ego-jev/SKILL.md)、[reference.md](../skills/ego-jev/reference.md)、[LICENSE](../LICENSE)
- https://github.com/ZephyrDeng/ego-jev
- https://github.com/ZephyrDeng/ego-jev/releases
- https://www.skills.sh/ZephyrDeng/ego-jev
- https://www.skills.sh/zephyrdeng/ego-jev/ego-jev

### Skill 规范与安装

- https://agentskills.io/specification
- https://www.skills.sh/docs
- https://www.skills.sh/docs/faq
- https://www.skills.sh/docs/cli
- https://www.skills.sh/docs/customize
- https://www.skills.sh/docs/packs
- https://www.skills.sh/docs/api
- https://github.com/vercel-labs/skills
- https://cli.github.com/manual/gh_skill
- https://cli.github.com/manual/gh_skill_install
- https://cli.github.com/manual/gh_skill_publish
- https://cli.github.com/manual/gh_skill_search
- https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/
- https://code.claude.com/docs/en/plugins
- https://code.claude.com/docs/en/plugin-marketplaces
- https://code.claude.com/docs/en/discover-plugins
- https://cursor.com/docs/context/skills
- https://cursor.com/docs/plugins
- https://cursor.com/help/security-and-privacy/marketplace-security
- https://learn.chatgpt.com/codex/build-skills
- https://learn.chatgpt.com/codex/skills-and-plugins
- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/plugins/deploy/submission
- https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
- https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages

### GitHub 可发现性

- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes
- https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
- https://docs.github.com/en/discussions/quickstart
- https://docs.github.com/en/sponsors/getting-started-with-github-sponsors/about-github-sponsors
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository
- https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories
- https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories
- https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors
- https://github.com/github/explore/blob/main/CONTRIBUTING.md

### 发布平台

- https://news.ycombinator.com/showhn.html
- https://news.ycombinator.com/newsguidelines.html
- https://news.ycombinator.com/newsfaq.html
- https://news.ycombinator.com/item?id=22336638
- https://redditinc.com/policies/reddit-rules
- https://www.producthunt.com/launch
- https://www.producthunt.com/launch/how-product-hunt-works
- https://www.producthunt.com/launch/preparing-for-launch
- https://www.producthunt.com/launch/sharing-your-launch
- https://help.producthunt.com/en/articles/479557-how-to-post-a-product
- https://help.producthunt.com/en/articles/3615694-community-guidelines
- https://dev.to/terms
- https://dev.to/code-of-conduct
- https://hashnode.com/code-of-conduct
- https://lobste.rs/about

### 相邻生态

- https://docs.typesafe.ai/introduction
- https://docs.typesafe.ai/agent-skill
- https://docs.typesafe.ai/llms.txt
- https://typesafe.ai
- https://lite.ego.app/
- https://lite.ego.app/document/en/docs/quick-start
- https://lite.ego.app/changelog
- https://github.com/citrolabs/ego-lite
- https://github.com/citrolabs/ego-lite/blob/main/CONTRIBUTING.md
- https://github.com/browser-use/jev-ultrafast

### 中文平台

- https://www.v2ex.com/about
- https://www.v2ex.com/help/node
- https://www.v2ex.com/go/create
- https://www.v2ex.com/go/promotions
- https://juejin.cn/book/6844733795329900551/section/6844733795380232200 （小册入口；广告节正文未完整抓取）
- https://www.oschina.net/help-center/oschina-guides/how-to-play-in-osc.html
- https://www.oschina.net/question/2918182_2266982
- https://www.xiaohongshu.com/en/community_guidelines
- https://www.xiaohongshu.com/crown/community/rules （中文规范 URL；本次几乎无正文）

### 未能抓取（未知，未当作事实）

- Reddit 目标 sub `/about/rules`（r/LocalLLaMA、r/ClaudeAI、r/programming、r/opensource、r/webdev）— 网络拦截
- 即刻官方社区规范
- 知乎现行《社区规范》全文
- 掘金「发布广告内容」小册正文
- 小红书中文《社区规范》正文
- TypeSafe FAQ「How do I get started or ask a question?」折叠答案
- 作者是否已有 HN/PH/Lobsters/X 账号
- Cursor / OpenAI 公开目录是否会收 ego-jev（提交前未知）

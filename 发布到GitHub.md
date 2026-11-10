# 发布到 GitHub（仓库已在本地建好，只差认证）

> **已完成（2026-11-10）**：SSH 公钥已授权，仓库已推送到
> https://github.com/codeforbuddy/exam-analyzer（main，22 个文件）。
> 本文件保留给以后新建仓库时参考。

本地仓库：`C:\Users\Administrator\Documents\deepseek-harness\default-workspace\exam-analyzer-repo`
已完成：`git init -b main`、`.gitignore`、`LICENSE`(MIT)、`README.md`、首次提交 `3df460b`。
远端已设：`origin = git@github.com:codeforbuddy/exam-analyzer.git`

> 你的通用密码**不能**用来推代码：GitHub 自 2021 年起已禁用密码做 Git 认证，
> 网页登录还要求 2FA。所以要二选一：**SSH 密钥** 或 **Personal Access Token**。

---

## 方案 A：SSH 密钥（推荐，一次性配置）

### A1. 把公钥加到 GitHub

公钥（本机 `~/.ssh/id_ed25519_github.pub`）：

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMdVZgNSQtE0UDKqqmQzdogIkh5LHSoQ7DoWSd/Q2bFG codeforbuddy@HX03100
```

1. 打开 https://github.com/settings/keys → **New SSH key**
2. Title 随便填（如 `Windows-HX03100`），Key type 选 `Authentication Key`，粘贴上面那一整行
3. 点 **Add SSH key**

### A2. 建空仓库

打开 https://github.com/new

- Repository name：`exam-analyzer`
- 公开 / 私有随你
- **不要**勾选 “Add a README file” / .gitignore / license（本地已有）
- 点 **Create repository**

### A3. 告诉我一声，或者自己跑

跟我说「公钥加好了、仓库建好了」，我这边执行：

```powershell
cd C:\Users\Administrator\Documents\deepseek-harness\default-workspace\exam-analyzer-repo
git push -u origin main
```

也可以自己双击运行同目录下的 `push-to-github.ps1`。

---

## 方案 B：Personal Access Token（不想配 SSH 时）

1. 打开 https://github.com/settings/tokens?type=beta → **Generate new token**
2. 只给这个仓库 `Contents: Read and write` 权限，有效期设 7 天即可
3. 生成后复制 `github_pat_...`
4. 用它建仓 + 推送（把 `<TOKEN>` 换成你的 token）：

```powershell
# 建仓库（GitHub API）
$h = @{ Authorization = "Bearer <TOKEN>"; Accept = "application/vnd.github+json" }
$body = @{ name = 'exam-analyzer'; private = $false } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://api.github.com/user/repos' -Headers $h -Body $body -ContentType 'application/json'

# 推送
cd C:\Users\Administrator\Documents\deepseek-harness\default-workspace\exam-analyzer-repo
git push -u origin main
```

> 用 token 时远端地址改成 HTTPS：
> `git remote set-url origin https://github.com/codeforbuddy/exam-analyzer.git`
> 推送时用户名填 `codeforbuddy`，密码填 **token**。

---

## 安全提醒（重要）

你刚才在对话里贴了账号密码。请**立刻**做两件事：

1. 打开 https://github.com/settings/security 改密码；
2. 开启 2FA（Two-factor authentication）。

这段对话记录、以及本机的会话日志里都可能留有那串密码，改掉之后它就作废了。
以后再让我推代码，用 SSH 密钥或临时 token 就行，不要给账号密码。

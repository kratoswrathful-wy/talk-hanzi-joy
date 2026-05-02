# Welcome to your Lovable project

協作與 AI 助理的行為規範（含 CAT 單一來源、文件索引）見根目錄 [`AGENTS.md`](AGENTS.md)。

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## 開發者 / 交接

- **[AGENTS.md](AGENTS.md)** — AI／新協作者捷徑（含 **CAT：`cat-tool` → `sync:cat` → `public/cat`**）  
- **[docs/HANDOFF.md](docs/HANDOFF.md)** — 架構重點、設定載入、已知問題與必留修正  
- **[docs/CODEMAP.md](docs/CODEMAP.md)** — 功能與檔案對照  

本地建置（Windows PowerShell 建議分行執行，避免 `&&` 解析問題）：

```sh
npm i
npm run dev
# 驗證正式建置
npm run build
```

### CAT 內嵌編譯器（`/cat`）— 單一來源

Vanilla **CAT 靜態資產**請**只改 [`cat-tool/`](cat-tool/)**，不要只長期手改 `public/cat/`（會被覆寫）。

| 時機 | 做法 |
|------|------|
| 改完 `cat-tool` 後 | 專案根執行 **`npm run sync:cat`**，並**一併提交** `cat-tool` 與 `public/cat` |
| 正式建置 | `prebuild` 已掛 `sync:cat`，`npm run build` 前會自動同步 |

**風險**：`sync:cat` 會整夾刪除再複製到 `public/cat`；只改 `public/cat` 而未併入 `cat-tool` 的內容，下次 sync 即消失。速覽：[`AGENTS.md`](AGENTS.md)、[`cat-tool/README.md`](cat-tool/README.md)。

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

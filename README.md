# ドライバー業務管理Webアプリ

Google Apps Script、Google Sheets、AppSheet、Firebase、Supabase、Google Cloudに依存しない、Next.js + PostgreSQL + Prisma構成のMVPです。

## 技術構成

- Frontend: Next.js App Router / React / TypeScript
- Backend: Next.js Route Handlers
- DB: PostgreSQL
- ORM: Prisma
- Auth: 独自セッション、HTTP only cookie
- Notify: Discord Webhook
- Runtime: Docker Compose対応

## セットアップ

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

アクセス:

- ドライバー: http://localhost:3000/login
- 管理者: http://localhost:3000/admin/login

初期ログイン:

- 管理者: `admin` / `password`
- ドライバー: `高野` / `1234`
- ドライバー: `佐藤` / `1234`

## 実装済みMVP

- ドライバー/管理者ログイン、ログアウト
- HTTP only cookieセッション管理
- 営業日7時切り替え
- ドライバーマイページ
- 管理者ダッシュボード
- 出勤、退勤、送迎開始、現地到着、女性降車、現地待機、事務所待機
- 送りメール確認、迎えメール確認
- メール確認は`affects_status = false`で現在ステータス変更なし
- 退勤日報と精算見込み、精算保存
- 管理者代理操作
- 管理者ログ修正
- 管理者ドライバー追加/設定変更
- Discord Embed通知

## 環境変数

Discord通知を有効化する場合は`.env`に実Webhook URLを設定してください。未設定またはサンプルURLの場合、ログ保存は成功し、Discord送信だけ未送信扱いになります。

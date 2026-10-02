# GitHub Pages / Railway

ソースの保存先は [greenplus/yamanoprime](https://github.com/greenplus/yamanoprime) です。以下の順でRailway APIとGitHub Pagesを設定します。

## 公開先と確認状況（2026-10-02）

- サイト：[YamanoPrime](https://greenplus.github.io/yamanoprime/)
- API：`https://yamanoprime-production.up.railway.app`
- Railwayの公開ドメインはTarget Port `8080`。アプリはRailwayの `PORT` を使います。手動で固定する場合も `PORT` とTarget Portを一致させます。
- GitHub PagesのSourceはGitHub Actions、下表のRepository Variablesは設定済みです。
- 公開処理成功、ヘルスチェック `ok:true, authAvailable:true`、公開一覧取得、Pages originからのCORS、トップページとログイン画面の表示を確認しました。
- 実アカウントでのログイン・投稿・プレイ、および実Postgresで複数APIプロセスを動かした同時回答は未確認です。

## 設定する順序

1. Railwayの [factoring-esportsプロジェクト](https://railway.com/project/8e962f51-3773-43c1-8b65-4ef811f017e0) の `production` を開きます。既存サービスは `fortunate-gratitude`（認証API）、`primeqk_4cards`、`Postgres` です。
   - `Add` → `GitHub Repository` で `yamanoprime` が見つからない場合、`Configure GitHub App` でRailwayのアクセス対象に `greenplus/yamanoprime` を追加して保存します。Railwayへ戻り `Refresh` します。2026-10-02の確認時点では、検索結果にこのリポジトリが表示されていませんでした。
2. GitHubリポジトリ `greenplus/yamanoprime` の `main` を使う新しいサービスを追加します。Root Directoryはリポジトリのルートです。ビルド・起動コマンドの上書きは不要です。
3. 下表の環境変数を設定してデプロイします。DB接続情報はRailway内で設定します。
4. Railwayのサービス設定で公開用ドメインを生成し、`https://…/api/health` を確認します。このHTTPS originが `VITE_API_URL` です。
5. [GitHub Pages設定](https://github.com/greenplus/yamanoprime/settings/pages) でSourceを `GitHub Actions` にします。
6. [ActionsのRepository Variables](https://github.com/greenplus/yamanoprime/settings/variables/actions) に下表の2項目を追加します。
7. [Actions](https://github.com/greenplus/yamanoprime/actions/workflows/pages.yml) で `Run workflow` を実行します。

Pagesの公開先は `https://greenplus.github.io/yamanoprime/` です。APIのURLが未設定の間もCIでテスト・ビルドを実行し、Pagesへの公開はスキップします。

## Railway API

既存共通アカウントのPostgresへ接続できるプロジェクトに、新しいYamanoPrimeサービスを作成します。既存ゲームサービスの起動コマンドや環境変数は変更しません。

ビルダーをルートの `Dockerfile`、ヘルスチェックを `/api/health`、再起動を失敗時に設定します。`railway.json` を使わない環境では同じ値を管理画面に設定します。

| 環境変数 | 値 |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}`（同プロジェクトの既存Postgresを参照） |
| `AUTH_DATABASE_URL` | 共通アカウントDB。上と同じなら省略可 |
| `ALLOWED_ORIGINS` | `https://greenplus.github.io`（`/yamanoprime/` は付けない） |
| `PORT` | Railway提供値を使用 |
| `TRUST_PROXY` | Railwayで `1`。直接公開の場合は設定しない |

`LOCAL_DATABASE` は本番に設定できません。Dockerイメージでは `NODE_ENV=production`、`PYTHON_BIN=python3` を設定済みです。

同じRailwayプロジェクト内のPostgresを使う場合、`DATABASE_URL` は対象DBサービスの変数参照で設定します。`AUTH_DATABASE_URL` は同じDBなら不要です。新しいサービスは `yamano_prime` スキーマにクイズを保存し、共通認証テーブルは読み取ります。

本番ではローカルプレビューのサンプル4件を自動登録しません。公開直後の一覧は空で、共通アカウントから作成・公開したクイズが表示されます。

認証接続は `factoring_esports.players(id,name,login_id)` と `factoring_esports.sessions(player_id,token_hash,expires_at)` にSELECT権限が必要です。認証接続プールはDB設定で読み取り専用です。トークンは既存APIが発行する64桁の16進文字列を受け取り、SHA-256で照合します。パスワードをYamanoPrimeのAPIへ送信しません。

## GitHub Pages

リポジトリを作成してソースを保存し、PagesのSourceをGitHub Actionsに設定します。

Repository Variables：

| 名前 | 値 |
| --- | --- |
| `VITE_API_URL` | `https://yamanoprime-production.up.railway.app`（末尾 `/api` は付けない） |
| `VITE_AUTH_API_URL` | `https://fortunate-gratitude-production-768e.up.railway.app` |

公開URLだけをフロントに渡します。DB接続文字列をGitHub Variablesやフロントの環境変数に渡してはいけません。

`main`へのpushまたは手動実行で `.github/workflows/pages.yml` がテスト・ビルドします。上記2つのRepository Variablesが設定されている場合に設定検証と公開も実行します。相対アセットURLと `#/set/...` 等のハッシュルートにより、リポジトリのサブパスと再読み込みに対応します。

共通認証APIのCORSは、2026-10-02に `https://greenplus.github.io` を許可するOPTIONS応答（204）を確認済みです。このoriginを使う場合、認証APIへのCORS追加設定は不要です。

## 公開後の確認

1. `/api/health` が `ok:true, authAvailable:true`。
2. 共通アカウントでログインし、下書き→公開→匿名プレイまで通る。
3. 回答送信の再試行、匿名リロード復元、結果表示。
4. 実際のPostgresと複数APIプロセスで同時回答しても二重計上されない。
5. Pagesの直接URL・スマートフォン・認証CORSを確認。

ローカルのPGliteとテスト用共通アカウントテーブルでは自動検証済みです。本番で確認できた範囲は冒頭に記載しています。保存データのバックアップはPostgres側で設定します。v1はセッション詳細を自動削除しません。

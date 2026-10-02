# YamanoPrime

素数大富豪の手札を使い切る合法手を見つける、投稿型クイズサイト。

## ローカルで動かす

Node.js 22.13以降、Python 3.10以降、pnpm 11が必要です。

すぐにローカル版を開く場合は `pnpm install --frozen-lockfile` の後に `pnpm preview:local` を実行します。APIと画面をまとめて起動し、`.runtime/database` に進捗を保存します。

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm dev:api
```

別のターミナルで：

```powershell
pnpm dev
```

[http://127.0.0.1:5176](http://127.0.0.1:5176) を開きます。ローカルDBには4つのサンプルクイズが入り、匿名で遊べます。共通アカウントの作問・高評価・履歴を利用する環境では、`.env`の `LOCAL_DATABASE` を外し、既存PostgreSQLへの `DATABASE_URL` / `AUTH_DATABASE_URL` を設定してください。既存の認証テーブルは読み取りだけです。

## 実装した機能

- 既存オンラインの素数・合成数判定、カード部品を再利用。想定解以外の合法手も正解。
- 57、1729、合成数の物理札消費、詰み申告・反証・新バージョンへの修正。
- 匿名／ログインセッション、途中復元、スキップ、順次／一覧、シャッフル、手動終了。
- 1問ずつモードでは、1周後にスキップした問題へ順に戻ります。再スキップは末尾へ回り、再読み込み後も順番を保持します。
- 最終回答の一意性、再送時の重複防止、得点と統計のトランザクション。
- 正誤・得点は回答POSTの確定応答から表示し、追加のSession GETを待ちません。終了時は結果一覧を取得します。
- 一括入力、行ごとの検証、重複警告、素数探索インポート、5000問上限。
- バージョン管理、下書き／限定公開／公開、検索、タグ、高評価、履歴、作者統計。ログイン中は「お気に入りのみ」で、自分が高評価した公開クイズに絞れます。ほかの検索条件や並び替えと併用できます。
- GitHub Pages用ビルド・ワークフローとRailway用Dockerfile。

## 確定ルールと入力

A〜K各4枚まで、Xなし。1とAは同じ物理札。T/J/Q/Kは10/11/12/13。

| 入力 | 内容 |
| --- | --- |
| `1117` | 素数の一例 |
| `9=3^2` | 9・3・2の3枚を使う合成数出し |
| `57,113` | 57の後に113 |
| `8521,57` | `57,8521` に正規化 |
| `57,57` | 57を2回 |
| `1729` | 素数のみ／両方で許可する特殊出し |

「合成数のみ」では、57が許可されていても最後は素因数付きの合成数出しが必要です。57だけ・1729の特殊出しでは上がれません。数として57または1729であっても、合法な素因数付き合成数出しは合成数として扱います。

素数探索形式を選ぶと `2k51, [3,*,11,*,6,4,7]` → `2K51=3*J*647`。角括弧内の各数は物理札のランクです。57は自動追加しません。

## 検証

```powershell
pnpm test
pnpm build
pnpm benchmark
pnpm test:browser
```

ブラウザテストはChromeとPlaywrightを使用し、ローカル検証用APIを3004番、Viteを5177番で起動します。通常のプレビューと別のポート・一時DBを使います。WindowsのCodex同梱Playwrightを参照するため、別環境では `tests/browser.test.mjs` のランタイム指定を合わせてください。CIではルール・HTTP/DBテストとビルドを実行します。

- [既存資産調査](docs/asset-audit.md)
- [実装指示書](docs/spec-v1.md)
- [確定した追加条件](docs/decisions.md)
- [公開手順](DEPLOY.md)
- [APIと保存方式](docs/architecture.md)
- [ローカル性能計測](reports/performance.json)
- [ブラウザ検証記録](reports/browser.json)
- [答え合わせの待ち時間調査](reports/answer-latency.md)

## 既存ルールとの同期

```powershell
python scripts/sync_rules.py --source C:/Users/takum/Documents/primeqk_online --check
```

`--check`なしで生成ファイルを更新します。`server/vendor` と `src/vendor/game-ui.mjs` を直接変更しないでください。元ファイルと関数のSHA-256を記録しています。再同期後にテストを実行します。

素数判定は既存ゲームと同じです。64ビット以上の整数は確率的検査であり、数学的な素数証明を生成する機能ではありません。

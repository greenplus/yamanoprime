# 保存方式とAPI

## ルールの境界

`server/domain.py` が表記・A〜Kの物理割り当て・全消費・回答モードを扱い、素数と合成数式は抽出した既存オンラインの関数に渡す。生成ファイルは `scripts/sync_rules.py` で管理する。Nodeから常駐Pythonプロセスへ1件ずつJSONを渡す。キューは12件まで、60秒の打ち切り時は回答を確定しない。

## トランザクション

PostgresではSession行を `SELECT ... FOR UPDATE` でロックする。Session×Problem主キーとSession×request IDのunique制約も併用する。回答、Session概要、問題統計、初回答のplay count、反証を一括commitする。同じrequest IDと同じ内容なら既存の結果を返し、内容の異なる再送や別IDでの再回答は409。

PGliteでは1接続のためクエリを直列化し、同じSQLスキーマとトランザクションをテストする。これは実Postgresでの複数プロセス検証の代替ではない。

Versionは不変。タイトル等はQuiz Set、プレイと回答統計はVersion内のProblemへ紐づく。反証は元のProblemと合法な操作列を保存する。新Versionでは統計を0から始める。以前のVersionの反証も、現行条件で再検証して修正へ利用できる。

## セッション認証と非公開情報

匿名セッションはランダム32バイトの秘密値を生成し、DBにはハッシュだけ保存する。ブラウザはlocalStorageへ保持し、`X-Session-Token` で送る。URLに秘密値を含めない。ログインSessionはそのアカウントのBearerでも復元できる。

プレイ用レスポンスは、手札、ID、出題位置、自分の確定済み得点だけ。想定解・詰み指定・問題統計は含めない。結果APIはENDEDを検証する。作者APIはauthor IDをサーバー認証結果と照合する。

## ページングと保持

一覧・結果・作者統計は通常50件、API上限100件。シャッフルしたID列はSessionへ固定保存する。回答は1問1行。v1では匿名の回答履歴も自動削除しない。将来削除する場合も、終了状態と一問一答の保証・反証を維持する必要がある。

## 主なAPI

| 操作 | エンドポイント |
| --- | --- |
| 新着・高評価・プレイ数、フィルタ | `GET /api/sets` |
| セット詳細・メタデータ更新 | `GET/PATCH /api/sets/:id` |
| 下書き作成 | `POST /api/sets` |
| 一括検証 | `POST /api/import-preview` |
| 新Version | `POST /api/sets/:id/versions` |
| 作者統計／編集ソース | `GET /api/sets/:id/author`, `/source` |
| 詰みの修正 | `POST /api/sets/:id/corrections` |
| Session開始 | `POST /api/sessions` |
| 復元・問題取得 | `GET /api/sessions/:id` |
| 最終回答 | `POST /api/sessions/:id/attempts` |
| 手動終了 | `POST /api/sessions/:id/end` |
| 終了後の答え合わせ | `GET /api/sessions/:id/results` |
| 高評価・解除 | `POST /api/sets/:id/like` |
| 本人／投稿／履歴 | `GET /api/me`, `/api/my/sets`, `/api/my/history` |

最終回答のbodyは `problem_id`, `request_id`, `kind: move|dead` と、move時の `solution`。ログインは既存APIの `POST /api/auth` に `action:login`, `loginId`, `password` を送り、そのAPIのトークンを再利用する。

## 負荷と防御

HTTP bodyは2MiBまで、1行512文字、通常＋詰みで5000行まで、タグ5個。SQLはパラメータ化する。一般操作360回/分、セッション作成20回/分、インポート12回/分を接続元ごとに制限する。制限はプロセス内であり、本番で複数レプリカを増やす場合は入口側で共有レート制限を追加する。

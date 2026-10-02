# 既存資産調査（2026-10-02）

## 参照元

- `../../primeqk_online/github/primeqk_online_server/main.py`: `is_prime`, `build_int_from_cards`, `map_joker_values_in_cards`, `parse_and_eval_composite`。合成数は表示札と材料札を別々に消費する。指数は右結合、全指数2以上。演算子なしは拒否する。
- 同ディレクトリの `rules.py`: A〜K、X、標準ルールの定義。
- `primeqk_online/client-common/app.js`: `cardButton`, `compositeSyntaxError`、手札→見せ札→材料札の操作。WebSocketの部屋・対戦状態に密結合しているためアプリ全体の直接読み込みはしない。
- `4枚出しコレクター/server/database.mjs`, `server/app.mjs`: PostgreSQL、PGliteによるローカルDB、共通アカウントのBearer認証。
- `4枚出しコレクター/src/main.mjs`, `vite.config.mjs`, `DEPLOY.md`: 認証API、Vite、相対アセットURL、ハッシュルーティング、GitHub Pages / Railway。

## 採用方針

既存ゲームの純粋な判定関数を、抽出スクリプトで本文を変更せず取り込む。元の巨大な `main.py` を読み込むと、部屋、CPU、WebSocket、統計DBの起動も必要になるため。生成ファイルには元ファイルのSHA-256と抽出対象を記録し、同期時に差分を検証する。既存ゲームのファイルは変更しない。

Node APIから常駐Pythonワーカーを呼び、同じ素数・合成数判定を使う。独自コードの責任は表記の解析、物理札の割り当て、セット条件、57操作列、全消費確認に限定する。

UIは既存カード部品と合成数の構文確認を取り込み、クイズ用の状態管理につなぐ。スマートフォンの専用キーとPC物理キーの双方で、実際の手札から札を選ぶ。

## 保存と認証

`yamano_prime` スキーマを使う。`factoring_esports.players` / `factoring_esports.sessions` は認証専用の読み取り接続で参照する。ユーザーやパスワードを新設しない。

1最終回答1行とし、Session×Problemの主キーとSession行ロックで一問一答を保証する。結果・統計・play count・反証を同じトランザクションで確定する。5000行は通常のDB範囲内で、正しさを優先する。v1は回答履歴を保持し、削除運用は別途追加できる構造にする。

## 公開構成

Vite + GitHub Pages（ハッシュルート）、Node + Python + PostgreSQLをRailwayで動かす。実際の本番URL・GitHubリポジトリは未設定。ローカル検証と本番稼働を区別する。

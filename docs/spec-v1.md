# YamanoPrime v1 実装指示書

## 0. この文書の目的

新規Webサービス **YamanoPrime** を実装する。

YamanoPrimeは、

> 「ある条件に当てはまる素数大富豪の一手上がり問題を、できるだけ多く解く」

ことを目的とした投稿型クイズサイトである。

発想としては「山手線ゲーム」「JetPunk」に近いが、単なる文字列列挙ではなく、**素数大富豪のカード操作そのものを回答UIとして使う**ことが最大の特徴である。

この文書ではv1の仕様を定める。

---

# 1. 最初に行うこと：既存資産の調査

実装を始める前に、読み取り可能な既存の

- 素数大富豪オンライン
- 素数大富豪＋
- 共通アカウント
- GitHub Pages / Railwayデプロイ構成

を調査すること。

特に以下は新規実装する前に既存資産を確認する。

- カードUI
- 手札→見せ札の操作
- 「出す」の操作
- 0〜9 / T / J / Q / K を中心とした専用入力UI
- PC物理キーボード操作
- 素数判定
- 素数出し合法性判定
- 合成数出し合法性判定
- 合成数の素因数入力UI
- `*`, `^` 等の入力処理
- 57処理
- カード多重集合の表現
- 共通アカウント認証
- DBのユーザー識別方法
- フロントとAPIの接続方法
- GitHub Pages上のルーティング
- Railwayバックエンド構成

**YamanoPrime用にゲームルールを別実装して二重管理することは避ける。**

ただし、v1のために既存プロジェクト全体を大規模リファクタリングすることも避ける。

再利用方法は、

1. 既存共通モジュールをそのまま利用
2. 小さな共通ライブラリとして安全に切り出す
3. 依存関係が強すぎる場合のみ最小限複製

の順に検討する。

既存ゲーム側をYamanoPrime都合で破壊的変更しない。

---

# 2. v1の基本思想

YamanoPrimeでは「正解文字列のリスト」を持つのではない。

各問題は**カードの多重集合**であり、

> その手札を、セットのルール内で合法に使い切れる一手を1通り示せれば正解

とする。

したがって、作者が登録した想定解とは異なる合法手でも正解である。

これは設計上かなり重要なので、回答判定を

`submitted_answer == registered_answer`

のような比較で実装してはならない。

必ず既存ゲームの合法性判定ロジックで判定する。

---

# 3. v1でやらないこと

以下は原則v1の対象外。

- 制限時間
- 解答速度ランキング
- ユーザー間スコアランキング
- 問題の自動生成
- 全合法解の事前列挙
- 合成数を含む詰みの完全証明
- 高度な全文検索
- 説明文検索
- 機械学習等による推薦
- 複雑なプロフィール機能

特に**詰み証明を重くしないこと**。

通常問題は合法解が1つあれば簡単に検証できるが、詰みは「合法解が存在しないこと」の証明になるため、同じ方法で扱わない。

---

# 4. 主要な概念

YamanoPrimeでは概念を以下に分ける。

## Quiz Set

ユーザーが投稿するクイズそのもの。

例：

- 4枚出し全937問
- 絵札を含む5枚出し
- 57を利用する一手上がり
- 合成数出し練習

## Quiz Version

そのクイズの問題内容・回答条件の固定されたバージョン。

## Problem

1つのカード多重集合。

## Session

1回のプレイ。

同じユーザーが同じセットをもう一度遊べば別Session。

## Final Attempt

その問題に対する最終回答。

以下のどちらか。

- 最終的な「出す」
- 「詰み」宣言

57の中間操作はFinal Attemptではない。

---

# 5. Quiz Setの設定

セットには最低限以下を持たせる。

- title
- description
- author
- tags
- visibility
- current version
- default ordering

公開画面では少なくとも以下を表示する。

- タイトル
- 作者
- 説明
- タグ
- 問題数
- 素数 / 合成数条件
- 57可否
- 詰み問題を含むか
- プレイ回数
- 高評価数

「詰みあり」はプレイ前にも明示する。

ただし、**どの問題が詰みなのかは絶対にクライアントへ事前公開しない。**

---

# 6. Answer Mode

セット単位で以下の3種類から選択する。

### PRIME_ONLY

合法な素数出しだけを正解とする。

### COMPOSITE_ONLY

既存の素数大富豪＋における**合法な合成数出し**だけを正解とする。

「完成した整数が数学的に合成数である」だけでは不足。

既存ゲームの合成数出しルールを満たす必要がある。

### BOTH

素数出し・合成数出しのどちらでもよい。

Answer Modeはセット内で統一し、個別問題ごとには変更しない。

---

# 7. 通常問題の作り方

通常問題では、作者に「手札そのもの」を入力させるのではなく、**合法な一手上がりの一例**を入力させる。

例として作者がある合法手を登録したら、

1. サーバーがその合法性を検証
2. 使用されたカードを抽出
3. カード多重集合を生成
4. それをProblemとして保存
5. 作者の入力をexample solutionとして非公開保存

する。

これにより、

- 問題に少なくとも1つ解が存在する
- 作者の入力ミスを公開前に発見できる
- プレイヤーには別解も許可できる

という構造になる。

---

# 8. Problemの一意性

同じQuiz Versionの中に、同じカード多重集合を複数回登録してはならない。

たとえば異なる想定解A/Bが同じ手札を生成した場合も、問題としては同一。

インポート時に重複を検出し、

- 最初のものだけ採用
- 重複警告を表示

など、作者が原因を把握できる動作にする。

通常問題と詰み問題で同じ多重集合が登録された場合は矛盾なので公開不可。

内部的にはカード多重集合から**canonical hand key**を生成し、一意性判定に使う。

canonical化ルールは既存ゲームのカードrank定義を参照して決定する。

---

# 9. 57の扱い

セット単位で57使用可否を設定する。

使用可能な場合は任意回数使える。

通常の素数大富豪に可能な限り近い操作にする。

例：

1. 手札から5と7を見せ札へ出す
2. 「出す」
3. 57として認識
4. 5・7を手札から除外
5. 残った手札で続行

複数組の57も可能。

57は通常、**中間操作**でありFinal Attemptではない。

そのため最終回答確定前なら57操作をリセット可能にする。

ただし57を出した時点で手札が0枚になれば、その57によって上がったものとして正解判定する。

例：

- `57`
- `5577`

なども条件を満たせば上がり。

---

# 10. 回答操作の基本

JetPunkのような「文字列入力が完成した瞬間に正答判定」は採用しない。

既存素数大富豪と同様に、

1. 手札からカードを選ぶ
2. 見せ札を並べる
3. 必要なら合成数設定を行う
4. 「出す」を押す
5. 判定

とする。

手札に存在しないカードを並べる等の不正操作はUI側で可能な限り防ぐ。

ただし**サーバー側でも必ず再検証する。**

フロントの判定結果を信頼しない。

---

# 11. 一問一答制

各問題に対するFinal Attemptは原則1回だけ。

これは素数候補を総当たりする攻略を防ぐため。

通常問題で誤答した場合：

- 得点0
- その問題は終了
- 同一Sessionでは再挑戦不可

通常問題を「詰み」と宣言した場合も同様。

- 得点0
- その問題は終了
- 後から訂正不可

57だけは中間操作なのでこの制限の対象外。

サーバー側でも、

> 1 Session × 1 ProblemにつきFinal Attemptは最大1件

を保証する。

ブラウザ操作だけで制限してはならない。

---

# 12. 合成数出しUI

既存の素数大富豪＋のUIを優先して利用する。

### PRIME_ONLY

合成数出し機能は無効。

### COMPOSITE_ONLY / BOTH

通常状態では素因数入力欄を常時表示しない。

カードを見せ札へ並べた後、

**「合成数出し」**

を押したときに初めて既存の素因数入力UIを開く。

PCについては既存実装と整合を取り、

- `*`
- `^`

等の物理キー入力を利用可能にする。

---

# 13. 詰み問題

詰み問題では作者が**カード多重集合そのもの**を登録する。

通常問題とは入力方式が違う。

v1では、

> この手札には合法な上がりが存在しない

ことをサーバーで完全証明しない。

特に合成数出しまで含めると探索が重くなり得るため。

したがって内部的には「証明済み詰み」ではなく、

**CLAIMED_DEAD**

のような意味で扱うのが望ましい。

UI上では単に「詰み」と表示してよい。

---

# 14. 詰み問題への回答

作者が詰みとして登録した問題について：

### プレイヤーが「詰み」を選択

+1点。

### プレイヤーが不正な上がりを提出

-1点。

### プレイヤーが本当に合法な上がりを提出

+1点。

これは作者の詰み指定が間違っていたことの証明になる。

サーバーはその合法手を保存し、

**この問題をdisputed / 要修正状態にする。**

作者ダッシュボードから確認できるようにする。

---

# 15. 詰み誤登録の修正

作者が発見された合法手を確認し、

> 詰み問題 → 通常問題

へ変更できるようにする。

この変更は正解条件を変えるため、**新しいQuiz Versionを作成する。**

過去Sessionの得点や統計を遡って書き換えてはならない。

旧Versionでは当時の判定結果を保持する。

新Versionでは合法手をexample solutionとして通常問題にできる。

---

# 16. スコア規則

各問題の得点は以下。

| 問題 | 回答 | 得点 |
|---|---|---:|
| 通常 | 合法な上がり | +1 |
| 通常 | 不正解の上がり | 0 |
| 通常 | 詰み宣言 | 0 |
| 詰み登録 | 詰み宣言 | +1 |
| 詰み登録 | 不正な上がり | -1 |
| 詰み登録 | 実際には合法な上がり | +1 |

時間による加点・減点はない。

最終Scoreは各問題の得点合計。

負の得点になることも許容する。

結果画面ではScoreだけでなく、

- 正解数
- 誤答数
- 詰み回答数
- 未回答数
- 全問題数

も表示する。

---

# 17. 出題モード

Session中に以下を切り替えられる。

## Sequential

1問ずつ表示。

スキップ可能。

スキップはFinal Attemptではない。

後から戻れる。

## List

問題一覧から任意の問題を選択できる。

入力を完成しただけでは判定せず、「出す」が必要。

モードを切り替えても、

- 回答済み
- 未回答
- スキップ状態
- Score

はそのまま保持する。

---

# 18. 問題順

問題には作者による登録順を保持する。

作者はセットのデフォルト順を以下から選べる。

### AUTHOR_ORDER

作者の登録順。

### HAND_LEXICOGRAPHIC

カード多重集合の辞書順。

詰み問題を後からまとめて追加した場合でも、辞書順を選べば自然に混ぜられることを意図する。

辞書順はブラウザの文字列locale比較ではなく、**ゲーム上のrank順に基づくcanonical hand key**で決定する。

回答者はさらに**シャッフル**を選択できる。

シャッフル時もSession復元時に順番が変化しないよう、必要ならSessionにshuffle seedを保存する。

---

# 19. Session終了

以下の場合にSession終了。

### 自動終了

全問題がFinalizedされた場合。

### 手動終了

プレイヤーが「終了」を選択した場合。

手動終了したSessionは確定済みとして扱い、そのSessionを後から再開して未回答問題を解くことはしない。

再度解きたい場合は新しいSessionを作成する。

スキップしたまま終了した問題は未回答。

---

# 20. 結果画面

終了後に最低限以下を表示する。

- Score
- 正解数
- 誤答数
- 未回答数
- 全問題数
- 問題ごとの自分の結果
- 問題ごとの正答率
- 作者の想定解

通常問題で未正解だった場合には、作者が登録したexample solutionを表示する。

詰み登録問題では「詰み」を作者回答として表示する。

disputedな旧Versionの詰み問題については、

> 作者は詰みとして登録したが、合法手が発見されている

ことを表示できる設計が望ましい。

5000問セットでも破綻しないよう、結果一覧は必要に応じてvirtualize / paginate / lazy loadする。

---

# 21. 作問用一括入力

大量の問題を改行区切りでコピー＆ペーストできることを必須とする。

基本：

> 1行 = 1問題

通常問題は**合法手の一例**を1行に記述。

57を含む複数段階手は、カンマ区切り等の簡易記法を採用する。

概念例：

`57,113`

= 57を出してから113で上がる。

具体的な標準記法は、実装時に既存ゲームの表記と外部ツール形式を調査して確定する。

---

# 22. 詰み問題の一括追加

詰み問題は通常問題と性質が違うため、作成画面では、

- 通常問題用一括入力
- 詰み手札用一括入力

を分けてもよい。

詰み手札は合法手ではなくカード多重集合を直接入力する。

詰み問題を後から大量追加する利用方法を想定する。

追加後に、

- 作者順
- 多重集合辞書順

を選択可能にする。

---

# 23. 「素数探索」インポート

有名外部ツール「素数探索」の出力をYamanoPrimeへ取り込めるようにする。

ユーザーからCodexに、

- 素数出力フォーマット
- 合成数出力フォーマット

の実例を提示する。

その実例を確認してから変換ロジックを実装する。

構造は、

> 外部形式 → importer → YamanoPrime標準記法 → 通常parser

とする。

外部ツール独自記法をYamanoPrimeのコアロジックに直接混ぜない。

将来別形式を追加しやすくする。

---

# 24. インポート時の検証

公開前に少なくとも以下を確認する。

### 通常問題

- parse可能か
- 使用カードが有効か
- 57使用条件を満たすか
- Answer Modeと一致するか
- 合法な一手上がりか
- 重複していないか

不正な行については、

- 行番号
- 元入力
- エラー理由

を作者に返す。

5000行のうち1行だけ失敗しても原因を探せるUIにする。

### 詰み問題

- 手札表記としてparse可能か
- 重複していないか
- 通常問題と衝突していないか

詰み証明自体は要求しない。

---

# 25. 問題数上限

1 Quiz Versionにつき最大 **5000問**。

4枚出し全937問程度を余裕を持って扱えること。

5000はAPI側でも検証する。

フロント側だけの制限にしない。

---

# 26. 問題データの内部表現

表示文字列だけを保存する設計にはしない。

少なくとも内部では、

- canonical hand
- canonical hand key
- problem kind
- author order index
- example solution（通常のみ）

を構造化して持つ。

example solutionも可能なら生文字列だけでなく、

> action sequence

としてparse済みの構造を保存する。

概念例：

- 57 action
- 57 action
- prime final action

あるいは

- composite final action + factors

など。

具体的なDTOは既存ゲームのmove表現を優先して合わせる。

---

# 27. プレイ中にクライアントへ送ってはいけない情報

これは重要。

Session開始時にクライアントへ、

- example solution
- problem kindがCLAIMED_DEADかどうか
- 答えに直結する内部判定情報

を送らない。

セット全体として

> 詰みあり

であることは表示してよい。

しかしどれが詰みか分かるJSONをブラウザへ送ればゲームにならない。

プレイ用APIレスポンスには基本的に、

- problem id
- hand
- order情報

だけを含める。

解答公開はSession終了後の結果APIから行う。

---

# 28. Final Attemptのサーバー判定

Final Attemptはサーバーがauthoritativeに判定する。

通常問題の場合：

1. Sessionが有効か
2. そのProblemがSession対象か
3. 未回答か
4. action sequenceをparse
5. 57を順に適用
6. 残り手札を確認
7. 最終手の合法性を既存ルールで判定
8. Answer Mode確認
9. 全カード消費確認
10. Score決定
11. 回答済みにする
12. 問題統計更新

を**1つの整合した処理**として扱う。

同一HTTP requestの再送で二重加算されないようidempotentにする。

---

# 29. 57のサーバー処理

UIでは57を出した時点で残り手札を減らしてよい。

ただしサーバー側のFinal Attemptでは、クライアントの「残り手札」を信用せず、

**元の問題手札＋提出されたaction sequenceから再計算する。**

57を何回使ったかもサーバーで検証する。

Final Attempt前の57リセットは基本的にクライアント状態として扱える。

ただし57だけで手札が0になった場合は、その「出す」がFinal Attemptとなる。

---

# 30. Play Count

クイズページを開いただけではPlay Countを増やさない。

Session中で**初めてFinal Attemptを行った時点**で、そのSessionを1 playとして数える。

57の中間操作だけでは増やさない。

1 Sessionにつき最大1回だけ増加。

リトライ等で二重加算しないよう、

`counted_as_play`

相当の状態をサーバー側で持つ。

匿名ユーザーの再プレイも、新Sessionなら別play。

---

# 31. 問題別統計

問題ごとに最低限以下を集計する。

- attempt_count
- correct_count
- wrong_count
- dead_choice_count
- legal_move_count
- invalid_move_count

必要ならclaimed dead向けに、

- counterexample_count

も持つ。

## attempt_count

Final Attemptを行ったSession数。

単なる表示、スキップ、57途中操作は含まない。

## correct rate

`correct_count / attempt_count`

とする。

## 詰み選択率

`dead_choice_count / attempt_count`

とする。

これは詰み問題で特に重要。

通常問題についても、

> どの程度詰みだと誤認されたか

を見る情報になるので保持可能。

---

# 32. 統計表示

プレイ前には問題別正答率を表示しない。

ヒントになってしまうため。

Session終了後は表示可能。

作者管理画面ではいつでも確認可能。

作者には少なくとも、

- 各問題の正答率
- Attempt数
- 詰み選択率
- disputed problem

を確認できるようにする。

---

# 33. Play Session履歴

ログインユーザーについてSession単位の履歴を保存する。

最低限：

- quiz_set_id
- quiz_version_id
- played_at
- score
- correct_count
- wrong_count
- unanswered_count
- attempted_count
- total_problem_count

を保持。

「どのVersionを遊んだか」は必須。

---

# 34. 問題単位のSession履歴

問題単位回答を長期間すべてDBへ保存するかは、既存DB構成と想定規模を調べて決定する。

ただし以下は必須。

1. 同一Sessionで同じ問題に再回答できない
2. Session中は回答状態を復元できる
3. 問題別統計を正しく更新できる
4. disputed dead問題の合法手証拠を保存できる

実装候補は、

- 1 Final Attempt = 1 row
- Session progressをJSON等で圧縮
- 匿名Session回答詳細を一定期間後削除し集計だけ残す

など。

Codexは既存DBを確認し、**5000問Sessionが存在し得ることを踏まえて選択すること。**

行数削減だけを理由に、サーバー側一問一答保証を失ってはならない。

---

# 35. Anonymous Session

ログインなしでプレイ可能。

匿名でもページリロードで進捗を失わないようにする。

localStorage等に、

- session identifier
- 表示モード
- shuffle seed
- UI上の途中状態

を保存する。

Final Attempt結果そのものについてはサーバー状態を正とする。

localStorageを書き換えることで再回答できてはいけない。

---

# 36. ログインSessionの途中保存

既存アカウント・DBの構成上容易であれば、ログインユーザーは別端末等でも途中Sessionを復元できるようにする。

ただしv1必須条件ではない。

少なくとも同一ブラウザでのリロード復元は実現する。

---

# 37. 高評価

高評価には共通アカウントログインが必要。

さらに、そのユーザーがそのQuiz Setで**最低1問Final Attempt済み**であることを要求する。

1アカウントにつき1 Quiz Set 1票。

高評価解除可能。

DBではunique制約等で二重投票を防ぐ。

高評価はVersionではなく論理的なQuiz Setに紐づける。

---

# 38. ユーザーランキング

v1では作らない。

時間制限がないため、単純なScore rankingは実質的に満点者一覧になり、YamanoPrimeの中心機能ではない。

トップページのランキング対象は**クイズセット側**。

---

# 39. トップページ

最低限以下を用意する。

- 新着
- 高評価
- よく遊ばれている

各カードには例えば、

- タイトル
- 作者
- 問題数
- Answer Mode
- 57あり/なし
- 詰みあり/なし
- tags
- play count
- likes

を簡潔に表示する。

---

# 40. 検索・絞り込み

高度な全文検索は不要。

最低限：

### テキスト

- title
- author

### Tag

- tags

### 問題性質

チェックやselect等で、

- PRIME_ONLY
- COMPOSITE_ONLY
- BOTH
- 57あり
- 57なし
- 詰みあり
- 詰みなし

を絞り込めるようにする。

問題数による簡単な絞り込みも低コストなら有力。

description全文検索は不要。

---

# 41. Tags

自由タグ方式。

v1では1セット最大5個程度。

保存時に、

- 前後空白除去
- 空タグ禁止
- 重複除去

程度は行う。

将来、既存タグ候補のautocompleteを追加できる設計にする。

---

# 42. 作者ページ

共通アカウントのユーザーに対して、

> その作者が公開しているYamanoPrime Quiz Set一覧

を表示する。

YamanoPrime専用の大規模プロフィールシステムは不要。

---

# 43. Visibility

可能であれば以下の3段階。

### DRAFT

作者のみ。

### UNLISTED

URLを知っている人はログインなしでもプレイ可能。

通常一覧・検索には出さない。

### PUBLIC

一覧・検索に表示。

技術的コストが特別高くなければv1で3種類とも実装する。

---

# 44. Versioning

論理的Quiz Setと内容Versionを分離する。

## 新Versionが必要

以下のようにゲーム内容・正解条件が変わる変更。

- 問題追加
- 問題削除
- 問題差し替え
- 詰み→通常修正
- Answer Mode変更
- 57可否変更

## 同Versionで変更可

- title
- description
- tags
- visibility
- default ordering

等のメタデータ。

過去Sessionは必ず当時のQuiz Versionに固定する。

後から現行Versionが変更されても過去Scoreは変化させない。

---

# 45. Versionと統計の関係

問題別統計は**Version単位**で扱う。

異なる問題内容の統計を混ぜない。

一方、

- Quiz Setの累計Play Count
- like count

についてはQuiz Set単位の値として表示してよい。

必要なら作者画面で、

- 全Version累計
- Version別

の双方を確認できる設計にする。

---

# 46. 既存Versionでプレイ中に新Versionが公開された場合

Session開始時にQuiz Versionを固定する。

プレイ途中に作者が新Versionを公開しても、そのSessionは旧Versionのまま続行する。

途中で問題構成を差し替えない。

---

# 47. 共通アカウント

プレイはログイン不要。

以下はログイン必須。

- Quiz Set作成
- 編集
- 公開
- 高評価
- 自分のプレイ履歴表示

既存の「自作ゲーム共通アカウント」を再利用する。

YamanoPrime専用のユーザーDB・パスワード管理を新設しない。

認証token / cookie / CORS等の具体方式は既存実装を調査して合わせる。

---

# 48. 想定データモデル

既存DBに合わせて変更してよいが、概念的には以下の分離を維持する。

## quiz_sets

- id
- author_id
- title
- description
- visibility
- default_order
- current_version_id
- created_at
- updated_at

## quiz_versions

- id
- quiz_set_id
- version_number
- answer_mode
- allow_57
- problem_count
- created_at

## quiz_problems

- id
- quiz_version_id
- author_order
- canonical_hand
- canonical_hand_key
- problem_kind
- example_solution nullable
- disputed state

`(quiz_version_id, canonical_hand_key)` はunique。

## quiz_sessions

- id
- quiz_set_id
- quiz_version_id
- account_id nullable
- status
- score
- counts
- started_at
- first_attempt_at
- ended_at
- counted_as_play
- shuffle情報

## session problem state / attempts

保存方法はDB調査後に決めるが、Final Attemptの一意性を保証する。

## problem_stats

問題・Version単位の集計。

## likes

- account_id
- quiz_set_id

unique。

## dead_problem_disputes

必要なら、

- problem_id
- verified legal solution
- first discovered at

等を保持する。

---

# 49. API設計の責任分界

既存APIスタイルを優先する。

概念的に必要なのは以下。

### Browse

- Quiz Set一覧
- 検索
- Quiz Set詳細
- 作者一覧

### Authoring

- Draft作成
- import preview
- validation
- version publish
- metadata edit
- disputed problems取得

### Playing

- Session作成
- Session復元
- Final Attempt送信
- Session終了
- Result取得

### User

- like / unlike
- play history

1つ1つのURL名は既存バックエンド流儀に合わせる。

---

# 50. Final Attempt APIの原子性

Final Attempt処理では、

- 問題を回答済みにする
- Session score更新
- Session summary更新
- Problem stats更新
- 初回答ならplay count更新
- claimed deadへの合法手ならdispute登録

が複数回実行されないようにする。

transaction / unique constraint / idempotency等を利用する。

ネットワーク再送でScoreが2倍になってはいけない。

---

# 51. セキュリティ・不正対策

競技ランキングはないので過剰なanti-cheatは不要。

ただし最低限：

- 回答判定はサーバー
- author IDをクライアント任せにしない
- Quiz編集権限確認
- Final Attempt一回制限をサーバー保証
- likes unique
- API入力サイズ制限
- 5000問制限
- 投稿文字列長制限
- 基本rate limit
- malformed composite expression対策

を行う。

匿名Sessionによる異常な大量アクセスで統計を簡単に破壊できない程度の防御を行う。

---

# 52. UI方針

YamanoPrime独自UIを一からデザインするより、

**既存素数大富豪のカード操作感を再利用することを優先する。**

特にプレイ画面は、

> 「クイズサイトの中に簡略版素数大富豪盤面がある」

ような感覚を目指す。

スマートフォンでは専用キーボードを使いやすくする。

PCでは物理キーボード入力を利用可能にする。

詳細なレイアウト・アニメーションは既存資産を調査しながらCodex側で詰める。

---

# 53. 5000問対応

5000問を上限にする以上、

> 5000枚の複雑なDOMを常時生成

するような実装は避ける。

List modeやResult画面では、

- virtualization
- pagination
- lazy rendering

等を必要に応じて使用する。

APIも、作者のexample solutionをプレイ開始時に全件送るような無駄を避ける。

937問規模は普通に快適に操作できることを目標にする。

---

# 54. GitHub Pages / Railway

現在の自作ゲーム群と同様、

- frontend: GitHub Pages
- backend: Railway

を基本構成とする。

既存プロジェクトのbuild/deploy方法を調査して合わせる。

新しいフレームワーク・インフラを導入する明確な理由がない限り、既存構成を踏襲する。

特に確認するもの：

- frontend base path
- SPA routing
- API base URL
- CORS
- environment variables
- auth origin
- Railway DB
- production / development切替

---

# 55. 実装時にまず作る最小Vertical Slice

最初から全機能を横に作らず、

1. 1つの固定Quiz Set
2. Session開始
3. 1問表示
4. 既存カードUIで回答
5. サーバー合法性判定
6. +1 / 0判定
7. 次問題
8. 終了

までを先に通す。

その後、

- 57
- 合成数
- 詰み
- 一括投稿
- アカウント
- 統計
- 公開一覧

を段階的に載せる。

既存ゲーム資産流用の失敗を早期に発見するため。

---

# 56. 推奨実装順

## Phase 1: Existing Asset Audit

既存プロジェクト調査。

以下を短いメモにまとめる。

- 再利用可能ファイル
- legal move API / function
- card component
- composite component
- 57 implementation
- auth
- DB
- deploy

## Phase 2: Domain Core

YamanoPrime側で、

- canonical hand
- solution parser
- action sequence
- answer mode
- legal finish wrapper

を作る。

## Phase 3: Basic Play

通常素数問題のみでSessionを完成。

## Phase 4: 57 / Composite

既存ゲーム資産を接続。

## Phase 5: Claimed Dead

詰み宣言、-1、counterexample処理。

## Phase 6: Authoring

一括入力、検証、重複排除、5000問。

## Phase 7: Versions / Accounts

共通アカウントと公開機能。

## Phase 8: Stats / History / Likes

集計と履歴。

## Phase 9: Discovery

トップ・タグ・検索フィルタ。

## Phase 10: External Importer

「素数探索」形式を提示後に追加。

---

# 57. 必須テストケース

最低限以下を自動テストする。

### 通常問題

- 作者想定解で正解
- 別の合法解でも正解
- 不正解で0
- 誤答後に再回答不可
- 詰み宣言で0、その後再回答不可

### 57

- 57×1後に上がる
- 57×複数後に上がる
- 57のみで手札0
- 57 reset
- 57禁止セットで拒否

### Composite

- 合法合成数で正解
- 数学的には合成数だがゲーム上不正なら不正解
- PRIME_ONLYでComposite拒否
- COMPOSITE_ONLYでPrime拒否

### Claimed Dead

- 詰み宣言 → +1
- 不正上がり → -1
- 合法上がり → +1
- 合法上がりでdisputedになる
- counterexample保存

### One Attempt

- 同Problemへの二重submit拒否
- request retryで二重加点しない

### Session

- skipはattemptにならない
- 57途中操作だけではplay countが増えない
- 最初のFinal Attemptでplay count +1
- 同Sessionでplay countが2回増えない
- manual end後は再回答不可

### Version

- 新Version公開後も旧Sessionは旧Version
- metadata editではVersion増えない
- 問題変更ではVersion増える
- 過去Scoreが変わらない

### Security

- プレイ開始APIにexample solutionが入っていない
- problem kindが漏れていない
- 他人のQuizを編集できない

### Import

- duplicate hand検出
- invalid lineに正しい行番号
- 5001問を拒否

---

# 58. パフォーマンステスト

少なくとも以下を確認する。

### 937問

「4枚出し総数」を想定した現実的セット。

- Quiz詳細表示
- Session開始
- Sequential
- List
- Result

が実用的な速度で動作する。

### 5000問

上限テスト。

- browser freezeしない
- API payloadが極端に巨大化しない
- import validationが破綻しない
- Session保存が破綻しない

---

# 59. Acceptance Criteria

v1完成条件は以下。

1. 共通アカウントでQuizを投稿できる
2. 匿名でもQuizを遊べる
3. 通常問題を合法手の一例から作成できる
4. 別解も正解になる
5. 57を利用できる
6. 合成数出しを既存ルールで判定できる
7. 詰み問題を混ぜられる
8. 詰み問題の誤登録を合法手によって発見できる
9. 1問題1Final Attemptをサーバーで保証する
10. Sequential / Listを切替可能
11. Skip可能
12. Shuffle可能
13. 作者順 / 多重集合辞書順を設定可能
14. 最大5000問
15. 改行コピペ投稿可能
16. プレイ回数を記録
17. 問題別正答率を記録
18. 詰み選択率を記録
19. 高評価可能
20. Session履歴を保存
21. Draft / Unlisted / Publicが利用可能
22. Versioningが機能
23. 新着 / 高評価 / プレイ数から探せる
24. tagsと問題性質で絞り込める
25. GitHub Pages / Railwayで本番利用可能
26. プレイ中の通信から詰み問題や想定解が簡単に漏れない

---

# 60. 実装上の判断をCodexに任せる部分

以下は既存コードを実際に読んだCodexが決めてよい。

- frontend framework
- exact component structure
- DB tableの細かな型
- problem-level Session履歴の保存方法
- anonymous Sessionの保持期間
- exact API path
- CSS
- mobile layout
- standard answer notationの細部
- 「素数探索」converterの具体syntax
- common codeをpackage化するかどうか
- virtualization libraryの有無

ただし、この判断によって本書のゲームルールを変えてはならない。

---

# 61. 実装開始時にユーザーへ確認すべきもの

基本仕様について再度広範な質問をする必要はない。

不足している外部情報として、実装時に必要なのは主に：

1. 「素数探索」の素数出力例
2. 「素数探索」の合成数出力例
3. 読み取り可能な既存プロジェクトの場所

である。

ただし3についてはCodex環境から既に判別可能なら質問しない。

外部フォーマットconverter以外の主要機能は先に実装を進めてよい。

---

# 62. 最終的な設計原則

YamanoPrimeの中心は、

> **答えを覚えて入力するサイトではなく、提示された手札に対して素数大富豪の合法な一手を発見するサイト**

である。

そのため最も重要なのは、

- 既存素数大富豪と同じ感覚で操作できること
- 作者の想定解に縛られないこと
- 一発回答の緊張感があること
- 詰みを混ぜられること
- 数百〜千問規模でも気持ちよく遊べること
- 投稿者が大量問題を簡単に登録できること

である。

実装上の都合で、これらを単なる「文字列クイズ」に退化させないこと。
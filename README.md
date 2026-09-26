# FE万紫千紅 データベース

ファイアーエムブレム 万紫千紅のゲームデータを管理・閲覧するための静的サイト（GitHub Pages 用）。
ビルド不要で、HTML + CSS + JavaScript + JSON だけで動きます。

## ページ

公開URLは <https://mu-game1467.github.io/FE/> です。末尾に `.html` を付けない
ディレクトリ形式（`/FE/characters/` など）でアクセスできます。

| ページ | 内容 | データ |
|--------|------|--------|
| `index.html` → `/FE/` | ダッシュボード | - |
| `characters/index.html` → `/FE/characters/` | 64名のキャラクター。成長率・ルート別の加入条件（支援Lv／名声Lv）、カード表示／早見表表示の切替 | `data/characters.json` |
| `classes/index.html` → `/FE/classes/` | 60兵種。階級・成長ボーナス・移動力・使用可能技能・解放条件 | `data/classes.json` |
| `skills/index.html` → `/FE/skills/` | 個人スキル・血印・ルーツ・ブレイズアーツ／スキル／タイプ・兵種＆マスタースキル | `data/skills.json` |
| `items/index.html` → `/FE/items/` | 消費アイテム・指南書など（手入力データ） | `data/items.json` |

各ページは1ディレクトリ下に置いてあり（`characters/index.html`）、
GitHub Pages が `…/characters/` を `characters/index.html` に解決します。
ルート直下の `characters.html` などは、旧的リンクが壊れないように
`characters/` へ（meta refresh で）転送するだけのページに留めています。

## 構成

- `index.html` — ダッシュボード
- `characters/` `classes/` `skills/` `items/` — 各ページ（`index.html` を内包）
- `styles.css` - スタイルシート
- `app.js` - データ読み込み・検索・並び替え・表示ロジック
- `data/` - JSONデータファイル
- `tools/build-from-game8.ps1` - データを再生成するスクリプト
- `tools/serve.ps1` - ローカル確認用の簡易HTTPサーバー
- `tools/MAPPINGS.md` - 元JSONの列（`col_1`…）と出力キーの対応表

`app.js` はページがルート直下（`index.html`）でも1階層下（`characters/index.html`）でも
動くよう、`data/` のJSONを `data/…` → `../data/…` の順に試行して読み込みます。

## データの再生成

キャラクター・クラス・スキル（血印など）は、ゲームエイト「FE 万紫千紅」の育成シミュレーターが
内部で使う静的JSONから生成しています。列名は `col_1` のように不透明なので、
**対応表はページ表示と突き合わせて特定**しています（`tools/MAPPINGS.md` 参照）。

```powershell
# キャッシュ済みソースを使う
powershell -ExecutionPolicy Bypass -File tools\build-from-game8.ps1

# 最新を取り直す
powershell -ExecutionPolicy Bypass -File tools\build-from-game8.ps1 -Download
```

スクリプトは次のことを行います。

1. `data/characters.json`（64件）、`data/classes.json`（60件）、`data/skills.json`（247件）を書き出す
2. 成長率の合計（`col_29`）と9能力の和が一致するか検証する
3. キャラクターが参照する個人スキル・血印・ブレイズ値がすべて `23030` に存在するか検証する
4. キャラクターの登場兵種がすべて兵種テーブルに存在するか検証する

検証に失敗すると警告が出ます。成長ボーナスなどの `+10` という表記は数値に変換されます。

## ローカル確認

`file://` で開くと `fetch()` がCORSで弾かれるため、簡易HTTPサーバー経由で確認します。

```powershell
# PowerShell 5.1 なら
powershell -ExecutionPolicy Bypass -File tools\serve.ps1   # → http://127.0.0.1:8099/

# Python 3 / Node.js があれば
python -m http.server 8000
npx serve
```

## GitHub Pages での公開

1. リポジトリの Settings → Pages
2. Source: "Deploy from a branch"
3. Branch: `main` / `/ (root)`
4. Save

`.nojekyll` を置いてあるため、Jekyll の処理は介在しません。

## データ出典・クレジット

- 数値データ（成長率・ステータス・加入条件・スキル効果・兵種データ）は
  [ゲームエイト「ファイアーエムブレム 万紫千紅」](https://game8.jp/fe-banshisenko) が公開しているデータを加工したものです。
- キャラクター名・声優名・効果文など短い事実情報のみを保持し、出典の解説文・記事本文・画像は含めていません。
- `data/items.json` は手入力データです。

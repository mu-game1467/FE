# FE万紫千紅 データベース

ファイアーエムブレム 万紫千紅のゲームデータを管理・閲覧するための静的サイト（GitHub Pages 用）。
ビルド不要で、HTML + CSS + JavaScript + JSON だけで動きます。

## ページ

| ページ | 内容 | データ |
|--------|------|--------|
| `index.html` | ダッシュボード | - |
| `characters.html` | 64名のキャラクター。成長率・登場時ステータス・ルート別の加入条件（支援Lv／名声Lv）、カード表示／早見表表示の切替 | `data/characters.json` |
| `classes.html` | 60兵種。階級・成長ボーナス・移動力・使用可能技能・解放条件 | `data/classes.json` |
| `skills.html` | 個人スキル・血印・ルーツ・ブレイズアーツ／スキル／タイプ・兵種＆マスタースキル | `data/skills.json` |
| `items.html` | 消費アイテム・指南書など（手入力データ） | `data/items.json` |

## 構成

- `index.html` `characters.html` `classes.html` `skills.html` `items.html`
- `styles.css` - スタイルシート
- `app.js` - データ読み込み・検索・並び替え・表示ロジック
- `data/` - JSONデータファイル
- `tools/build-from-game8.ps1` - データを再生成するスクリプト
- `tools/MAPPINGS.md` - 元JSONの列（`col_1`…）と出力キーの対応表

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

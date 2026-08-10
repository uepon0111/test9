# Sekai Talk Extractor

GitHub Pages で `.asset` を静的閲覧するためのテンプレートです。

## 何をするか

- GitHub Actions が指定URLの `.asset` を取得
- `TalkData` だけを JSON に抽出
- GitHub Pages 上の HTML からその JSON を表示

## 使い方

1. このリポジトリを GitHub に push する
2. Settings → Pages で **GitHub Actions** を公開元にする
3. Workflow を実行するか、main ブランチへ push する
4. `docs/data/event_39_01.talk.json` が生成され、ページに反映される

## URL を変える

`.github/workflows/deploy.yml` の `asset_url` を変更してください。

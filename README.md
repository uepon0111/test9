# Project SEKAI Event Story Viewer (GitHub Pages)

`storage.sekai.best` の `.asset` を GitHub Actions で取得・解析し、GitHub Pages の静的 HTML からイベントストーリーの全トークを閲覧するための小さなビューアです。

## 特徴

- ブラウザから `storage.sekai.best` の `.asset` を直接取得しない（CORS/Content-Type の影響を回避）。
- GitHub Actions が `event_story/event_ashiato_2021/scenario/` 以下の `.asset` を列挙してダウンロード。
- `TalkData` の順序を保ったまま、話者名・台詞・ボイスID・Character2dId を JSON 化。
- GitHub Pages 側は静的 HTML + JavaScript のみ。サーバー不要。
- 台詞検索、話者フィルター、エピソード切り替え、全文表示、コピー用リンクに対応。

## セットアップ

1. このフォルダを GitHub リポジトリのルートへ置く。
2. GitHub の **Settings → Pages → Source** を **GitHub Actions** にする。
3. **Actions → Update story data and deploy → Run workflow** を実行する。
4. 初回実行時に `event_story/event_ashiato_2021/scenario/` 以下を取得して Pages を公開する。

ワークフローは手動実行に加えて、毎週日曜日にも更新します。`event_prefix` を変えれば別イベントにも流用できます。

## 注意

本リポジトリは、元データを恒久的に Git 管理するのではなく、Actions の実行時に外部配布元から取得して `site/data/` を生成する方式です。したがって、リポジトリには大量の `.asset` 本体をコミットする必要がありません。

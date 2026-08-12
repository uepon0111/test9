# Project SEKAI Event Story Viewer

GitHub Pages向けの静的ビューアです。GitHub Actionsが起動時に対象の `.asset` を `storage.sekai.best` からダウンロードし、`TalkData` / `AppearCharacters` を解析してHTMLを生成します。

## Features

- ストーリーの台詞を順番どおり表示
- 話者名・Character2dId・CostumeTypeを表示
- 話者フィルター / 全文検索
- voice / motion メタデータ表示
- ダークモード
- GitHub Pagesへ自動デプロイ

## GitHub Pagesで公開

1. このフォルダをGitHubリポジトリのルートに置いて `main` へpush。
2. Repository Settings → Pages → Source を **GitHub Actions** に設定。
3. `Build and deploy GitHub Pages` が成功すると Pages URL が発行されます。

## ローカル確認

```bash
python3 scripts/build.py
cd dist
python3 -m http.server 8000
```

その後 `http://localhost:8000/` を開いてください。

## データ元

このサンプルは以下のシナリオアセットを対象にしています。

`https://storage.sekai.best/sekai-en-assets/event_story/event_ashiato_2021/scenario/event_39_01.asset`

キャラクター画像・背景画像・音声そのものは別アセットのため、この構成ではメタデータとトーク内容を中心に表示します。

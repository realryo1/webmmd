# webmmd カスタム拡張 — プロジェクト概要

## 概要

[Handystage](https://Handystage.pages.dev/) のローカルオフライン版に「assets フォルダ管理機能・PWA化」を追加したもの。
元の Handystage はファイルを手動で毎回選択する必要があるが、本拡張により assets フォルダを一度設定するだけで PMX/VMD 一覧が自動表示・ワンクリックロードできる。

---

## ファイル構成

```
mmd/
├── index.html                    # メイン HTML（bundled app の土台）
├── sw.js                         # Service Worker（PWA）
├── manifest.webmanifest          # PWA マニフェスト
├── icons/
│   └── icon-192.svg
└── webmmd_files/
    ├── logic.js                  # メインアプリバンドル（Three.js/MMD 本体）
    ├── handler.js                # UI ハンドラー・初期化コード（logic.js から外部化）
    ├── ui.js                     # assets 管理拡張 UI
    ├── style.css                 # アプリスタイル
    ├── ammo.js                   # Bullet 物理演算（Emscripten WebAssembly）
    ├── jszip.min-oqqPI3B3.js     # JSZip ライブラリ
    ├── zip-loader.js    # ZIP 展開モジュール（Vite __vitePreload スタブを内包）
    └── handler/                  # ビルドツール（実行時不要）
        ├── copyhandler.js        # 元コード（参照・再ビルド用）
        ├── format_js.py          # 圧縮 JS フォーマッター
        ├── build_handler.py      # handler.js 再生成スクリプト
        └── fix_handler.py        # 演算子修正スクリプト（build 後に実行）
```

---

## アーキテクチャ

### 起動フロー

```
ページロード
  ├─ webmmd_files/logic.js（module）を読み込み
  │   ├─ ビューア本体（Three.js/MMD）を初期化
  │   └─ jd, mu, Il, Wl, zu, gu, pu, wd … など内部クラス・関数を export
  ├─ webmmd_files/handler.js（module）を読み込み
  │   ├─ logic.js から必要なクラス・関数を import
  │   ├─ of クラス（UI ハンドラー）を定義
  │   └─ 初期化コードを実行（State Store / Viewer / イベント接続）
  └─ webmmd_files/ui.js を読み込み
    ├─ Service Worker を登録（./sw.js）
    └─ MutationObserver が検知 → setupIfReady() を呼ぶ
        └─ UI注入・イベント設定
            ├─ loadAssetsFilesFromCache()  → IndexedDB から blob 復元
            └─ loadDirectoryHandle()       → Directory Picker handle 復元 → scan()
```

### データ永続化レイヤー

| ストレージ | キー | 内容 |
|---|---|---|
| IndexedDB `settings` | `assetsDirectoryHandle` | FileSystemDirectoryHandle（Desktop/Chrome等） |
| IndexedDB `assetsCache` | `assetsFiles` | ファイル blob 配列（Android 向け fallback） |
| localStorage | `webmmd.assets.pathLabel` | 現在の assets フォルダ表示名 |

DB 名: `webmmd-assets-db` / version: `2`

---

## レンダリング設定（handler.js 独自追加）

ビューア起動時に `handler.js` 内で以下の設定を追加している。`logic.js` は変更していない。

### トーンマッピング

| プロパティ | 値 | 効果 |
|---|---|---|
| `renderer.toneMapping` | `4`（ACESFilmicToneMapping） | 水色など高彩度の色を正確に表示、ハイライト白飛びを抑制 |
| `renderer.toneMappingExposure` | `0.8` | 全体露出を下げてバランス調整 |

Three.js デフォルト（`NoToneMapping=0`）では、リニア→sRGB 変換でシャドウ部が過度に暗くなり、ハイライトが白飛びする問題があった。`ACESFilmicToneMapping` に変更することで両方を解消。

### 影（Shadow Map）

| 設定 | 値 |
|---|---|
| `renderer.shadowMap.enabled` | `true` |
| `renderer.shadowMap.type` | `2`（PCFSoftShadowMap） |
| 影マップ解像度 | 1024×1024 |
| シャドウカメラ範囲 | left/right/top/bottom = ±50、near=0.5、far=500 |

**UI トグル**: 設定パネル「表示」欄の「影」チェックボックスで制御。

- ON: メイン DirectionalLight の `castShadow = true` ＋ モデル全メッシュの `castShadow` / `receiveShadow = true`
- OFF: `castShadow = false`（Shadow Map レンダリングが完全にスキップされるため負荷ゼロ）
- モデルロード後に現在の設定を自動適用
- 設定は localStorage に永続化（キー: `isShadowEnabled`）

---

## webmmd_files/ui.js 機能詳細

### 状態変数

```js
cachedAssetsFiles          // File[] — 現在の assets フォルダ内ファイル全件
indexedModelFiles          // File[] — PMX/ZIP のみ抽出
indexedMotionFiles         // File[] — VMD のみ抽出
sectionState               // { usePathSections: bool }
hasScannedAssets           // bool — scan() が一度でも呼ばれたか
currentAssetsDirectoryHandle // FileSystemDirectoryHandle | null
assetsPathDisplayNode      // DOM node — "現在の assets: xxx" 表示用
customPathMap              // WeakMap<File, string> — 合成 relativePath
```

### 主要関数

#### パスヘルパー

| 関数 | 概要 |
|---|---|
| `getRelativePath(file)` | WeakMap にカスタムパスがあればそれを、なければ `webkitRelativePath` を返す |
| `setRelativePath(file, path)` | WeakMap にカスタムパスを記録（IndexedDB 復元 blob 用） |
| `isUnderSection(file, name)` | パス中に `name/` セクションが存在し、その配下のファイルか確認 |
| `detectSectionState(files)` | `model` or `motion` という名のフォルダがパスに含まれるか検出 |
| `isModelEntry(file)` | `.pmx` または `.zip`（セクションあり時は model/ 配下のみ） |
| `isMotionEntry(file)` | `.vmd`（セクションあり時は motion/ 配下のみ） |
| `isModelCompanionAsset(file, selectedLower)` | PMX に付随するテクスチャ等（.pmx/.zip/.vmd は除外） |

#### IndexedDB

| 関数 | 概要 |
|---|---|
| `openHandleDb()` | DB を開く（バージョン管理・マイグレーション込み） |
| `saveDirectoryHandle(handle)` | Directory handle を保存 |
| `loadDirectoryHandle()` | Directory handle を復元 |
| `saveAssetsFilesToCache(files)` | ファイル blob 配列を保存 |
| `loadAssetsFilesFromCache()` | blob から File オブジェクトを復元 |
| `clearPersistedAssetsData()` | localStorage + IDB 両方を削除 |

#### ディレクトリ操作

| 関数 | 概要 |
|---|---|
| `isDirectoryPickerSupported()` | `showDirectoryPicker` が使えるか確認 |
| `ensureDirectoryPermission(handle, allowPrompt)` | パーミッション確認／要求 |
| `collectDirectoryFiles(handle, parentPath)` | ディレクトリを再帰探索して File[] を返す |
| `chooseAssetsDirectory()` | Directory Picker を開く（非対応時は `<input webkitdirectory>` fallback） |
| `scanFromDirectoryHandle(allowPrompt, notifyPopup)` | handle 経由でスキャン実行 |

#### UI/状態管理

| 関数 | 概要 |
|---|---|
| `scan()` | `cachedAssetsFiles` を indexing → `renderIndexed()` → status 更新 |
| `resetAssetsState()` | インメモリ + 永続化データを全消去・UI リセット |
| `setupIfReady()` | ボタン/リスト/パス表示を DOM に注入（初回のみ `assetsEnhanced` ガード） |
| `enforcePanelOrder()` | カメラ VMD パネルの直後に 透明マテリアル制御パネルを移動 |
| `renderIndexed()` | model/motion リストを再描画 |
| `showPopup(message, isError)` | `window.alert` でユーザー通知 |

#### ロード実行

| 関数 | 概要 |
|---|---|
| `loadModelByPath(path, modelInput)` | ZIP: 単体渡し / PMX: + 同フォルダのテクスチャを一緒に渡す |
| `loadMotionByPath(path, motionInput)` | VMD を単体で渡す |
| `setFileInputAndDispatch(input, files)` | `DataTransfer` で `<input>` に File を注入して `change` イベント発火 |

---

## assets フォルダの想定構成

```
assets/
├── model/
│   ├── ミクさん/
│   │   ├── miku.pmx
│   │   └── tex/
│   │       └── miku.png
│   └── ミクさんv2.zip          ← ZIP もそのまま置ける
└── motion/
    ├── dance.vmd
    └── camera.vmd
```

- `model/` と `motion/` というフォルダ名があれば「セクション mode」で分類。なければ拡張子のみで判別。
- ZIP は内部展開不要。そのまま渡せばバンドル側が JSZip で展開する。

---

## ブラウザ互換性

| 機能 | Chrome/Edge Desktop | Android Chrome | Safari/Firefox |
|---|---|---|---|
| Directory Picker API | ✅ | ❌ → input fallback | ❌ → input fallback |
| IndexedDB blob cache | ✅ | ✅ | ✅ |
| webkitdirectory input | ✅ | ✅ | △（ブラウザ依存） |

---

## 注意事項

- `webmmd_files/logic.js` はページロード時に `#app` を書き換えるため、`setupIfReady()` は何度呼ばれても冪等になっている（`data-assetsEnhanced="1"` ガード）
- `MutationObserver` で `#app` の変化を監視して `setupIfReady()` と `enforcePanelOrder()` を再適用している
- Service Worker は HTTPS または localhost でのみ有効。`file://` では登録できない
- キャッシュ定義は `sw.js` の `webmmd-cache-v12` / `APP_SHELL` を参照（`logic.js` / `handler.js` / `ui.js` / `style.css` / `zip-loader.js` 等を事前キャッシュ）
- `handler.js` は直接編集して機能追加している。`handler/build_handler.py` → `handler/fix_handler.py` は元々の抽出フロー用であり、現在は再抽出せず `handler.js` を直接保守する

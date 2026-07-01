# ローカルテストおよび GitHub Pages 公開手順書

本プロジェクト（WebMMD）は Vite 開発環境および GitHub Actions によるデプロイ機構を導入しています。
ローカル環境でのテスト方法と、本番環境（GitHub Pages）への公開手順について以下にまとめます。

---

## 1. 事前準備（共通）

最初に、必要なランタイムとパッケージを準備します。

1. **Node.js のインストール**
   - パソコンに Node.js (推奨: v18 または v20 以上の Lts版) がインストールされていることを確認してください。
   - インストールされていない場合は、[Node.js 公式サイト](https://nodejs.org/) からダウンロードしてインストールしてください。

2. **依存関係のインストール**
   - VSCode 等のターミナル（PowerShell / bash）でプロジェクトのルートディレクトリを開き、以下のコマンドを実行します。
     ```
     npm install
     ```
     ※これにより `package.json` に定義された Babylon.js や Havok 物理エンジンなどの必要なライブラリが自動的にローカルへダウンロードされます。

---

## 2. ローカルテストの手順

### パソコン（PC）のブラウザでテストする場合

1. **開発サーバーの起動**
   - ターミナルで以下のコマンドを実行します。
     ```bash
     npm run dev
     ```
   - 実行すると、ローカル開発サーバーが起動し、以下のようなログが出力されます。
     ```
       VITE v5.2.0  ready in 300 ms

       ➜  Local:   http://localhost:5173/
       ➜  Network: use --host to expose
     ```

2. **ブラウザでのアクセス**
   - `http://localhost:5173/` にブラウザでアクセスして動作を確認します。
   - PMX モデルや VMD モーションをドラッグ＆ドロップ、または UI から読み込ませてテストしてください。

---

### スマホや Meta Quest 等の外部デバイスからローカルテストする場合 [WebXR対応]

> [!WARNING]
> **WebXR (VRモード) のセキュリティ制限について**
> ブラウザのセキュリティ仕様により、WebXR 機能（VRモード起動など）は **`localhost` または `https`（暗号化された接続）の環境でしか動作しません。**
> パソコン以外のデバイス（Questなど）からパソコンのローカルサーバーに接続してVRテストを行う場合は、以下のいずれかの方法で制限を回避する必要があります。

#### 対策案 A：Chrome / Questブラウザのデバッグフラグを利用する（推奨・手軽）
1. 開発サーバー起動時に `--host` オプションをつけて、同じ Wi-Fi ネットワーク内の他のデバイスからアクセスできるようにします。
   ```bash
   npm run dev -- --host
   ```
   出力ログに表示される **`Network`** の IP アドレス（例: `http://192.168.1.50:5173/`）を確認します。
2. テストするデバイス（Questなど）のブラウザを開き、アドレスバーに以下を入力して設定画面を開きます。
   ```
   chrome://flags/#unsafely-treat-insecure-origin-as-secure
   ```
3. 設定項目の中の **`Insecure origins treated as secure`** を **Enabled** に変更します。
4. その下のテキストボックスに、先ほど確認したパソコンの IP アドレスとポート番号（例: `http://192.168.1.50:5173`）を入力します。
5. ブラウザを再起動し、入力した IP アドレスにアクセスすると、セキュリティ制限が解除されてローカルのまま VR モードが起動できるようになります。


---

#### 対策案 B：Tailscale の HTTPS 機能を利用する（最もおすすめ・安全）

Tailscale の `tailscale serve` 機能を利用すると、ローカルの開発サーバー（`http://localhost:5173`）に対し、同一の Tailscale ネットワーク内のデバイスから HTTPS 経由でアクセスできるようになります。Quest側のデバッグフラグ（`chrome://flags`）を変更する必要がなく、本番に近い HTTPS 環境で WebXR (VRモード) のテストが行えます。

1. **開発サーバーの起動**
   通常通り、Vite 開発サーバーを起動します（`--host` オプションは不要です）。
   ```bash
   npm run dev
   ```

2. **Tailscale Serve の設定実行**
   別のターミナル（PowerShell 等）を開き、以下のコマンドを実行します。これにより、ローカルの `http://localhost:5173` を Tailscale の HTTPS ドメインのポート `443`（標準HTTPS）へ転送します。
   ```powershell
   tailscale serve https:443 / http://localhost:5173
   ```
   *(※事前に Tailscale の管理画面で MagicDNS および HTTPS Certificates が有効化されている必要があります)*

3. **HTTPS リンクでのアクセス**
   設定完了後、割り当てられた Tailscale の HTTPS ドメイン（例: `https://[PC名].[テイルネット名].ts.net/`）に、同一の Tailscale に接続した Quest などのデバイスから直接アクセスします。SSL の制限をクリアしているため、そのまま VR モードを起動できます。

---

## 3. GitHub Pages での本公開手順

### 初回のみ必要な設定（GitHub側）

Vite ビルド後のアセットを GitHub Actions 経由でデプロイするため、公開元（Source）を切り替えます。

1. GitHub 上で本プロジェクトのリポジトリページを開きます。
2. 上部タブの **`Settings`** をクリックします。
3. 左サイドバーメニューから **`Pages`** をクリックします。
4. 画面中央の `Build and deployment` 内にある **`Source`** ドロップダウンメニューを開きます。
5. デフォルトの `Deploy from a branch` から **`GitHub Actions`** に変更します。

---

### デプロイ（公開）の実行手順

1. **修正ファイルを Git にコミット＆プッシュする**
   - 変更したすべてのファイルを Git でコミットし、GitHub の main ブランチ（デフォルトブランチ）に Push します。
     ```bash
     git add .
     git commit -m "feat: migrate to Babylon.js and Havok"
     git push origin main
     ```

2. **手動でデプロイワークフローを実行する**
   - GitHub 上のリポジトリページを開き、上部タブの **`Actions`** をクリックします。
   - 左側のワークフロー一覧から **`Deploy to GitHub Pages`** を選択します。
   - 画面右側に表示される **`Run workflow`** ドロップダウンボタンをクリックします。
   - ブランチが `main` であることを確認し、緑色の **`Run workflow`** ボタンをクリックして実行します。
     *(※これにより、GitHub のサーバー上でビルド `npm run build` が実行され、結果が直接 GitHub Pages に公開されます。無駄なビルド枠消費を防ぐため、この手動起動時のみビルドが走る設定にしています)*

3. **公開完了の確認**
   - 実行されたジョブが緑色のチェックマーク（Success）になればデプロイ成功です。
   - GitHub Pages の URL にブラウザ（および Quest等）でアクセスし、最新の Babylon.js 構成で正しく表示・動作することを確認してください。

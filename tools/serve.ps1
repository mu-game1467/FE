<#
    serve.ps1 - ローカル確認用の簡易HTTPサーバー

    fetch() でJSONを読むため file:// では開けないので、これを使って確認します。
      powershell -ExecutionPolicy Bypass -File tools\serve.ps1
      → http://127.0.0.1:8099/

    -Port でポート変更、-Root で配信ディレクトリ変更ができます。
#>
[CmdletBinding()]
param(
    [int]$Port = 8099,
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "Serving $Root at http://127.0.0.1:$Port/  (Ctrl+C to stop)"

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $path = [System.Net.WebUtility]::UrlDecode($ctx.Request.Url.AbsolutePath).TrimStart('/')
        if ($path -eq '') { $path = 'index.html' }
        $file = Join-Path $Root ($path -replace '/', '\')
        if (Test-Path -LiteralPath $file -PathType Leaf) {
            $mime = switch ([System.IO.Path]::GetExtension($file).ToLower()) {
                '.html' { 'text/html; charset=utf-8' }
                '.js'   { 'text/javascript; charset=utf-8' }
                '.css'  { 'text/css; charset=utf-8' }
                '.json' { 'application/json; charset=utf-8' }
                '.md'   { 'text/markdown; charset=utf-8' }
                default { 'application/octet-stream' }
            }
            $bytes = [System.IO.File]::ReadAllBytes($file)
            $ctx.Response.ContentType = $mime
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $ctx.Response.StatusCode = 404
        }
        $ctx.Response.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
}

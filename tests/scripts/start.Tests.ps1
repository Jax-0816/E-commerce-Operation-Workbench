BeforeAll {
  $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
  $module = Join-Path $repo 'scripts\windows\Workbench.psm1'
  $startScript = Join-Path $repo 'scripts\start.ps1'
  Import-Module $module -Force

  function Get-AvailableLoopbackPort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try {
      return ([Net.IPEndPoint] $listener.LocalEndpoint).Port
    }
    finally {
      $listener.Stop()
    }
  }

  function Read-SharedTextFile {
    param(
      [Parameter(Mandatory)]
      [string] $Path
    )

    $stream = [IO.FileStream]::new(
      $Path,
      [IO.FileMode]::Open,
      [IO.FileAccess]::Read,
      [IO.FileShare]::ReadWrite
    )
    try {
      $reader = [IO.StreamReader]::new($stream)
      try {
        return $reader.ReadToEnd()
      }
      finally {
        $reader.Dispose()
      }
    }
    finally {
      $stream.Dispose()
    }
  }

  $readProductCountScript = @'
import { DatabaseSync } from 'node:sqlite';
const database = new DatabaseSync(process.argv[1], { readOnly: true });
const row = database.prepare('SELECT COUNT(*) AS count FROM products WHERE name = ?').get('启动路径商品');
database.close();
process.stdout.write(String(row.count));
'@

  $workspace = Join-Path $TestDrive '启动 工作区'
  $occupiedWorkspace = Join-Path $TestDrive '端口 冲突工作区'
  & node 'apps/server/dist/bootstrap.js' '--workspace' $workspace
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to prepare the start-test workspace.'
  }
  & node 'apps/server/dist/bootstrap.js' '--workspace' $occupiedWorkspace
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to prepare the occupied-port workspace.'
  }

  $script:startedProcessId = $null
  $script:startTestSecret = 'start-test-secret-must-not-be-logged'
  $script:hadStartTestSecret = Test-Path -LiteralPath 'Env:EAW_START_TEST_SECRET'
  $script:previousStartTestSecret = if ($script:hadStartTestSecret) {
    $env:EAW_START_TEST_SECRET
  }
  else {
    $null
  }
  $env:EAW_START_TEST_SECRET = $script:startTestSecret
}

AfterAll {
  if ($script:startedProcessId) {
    $startedProcess = Get-Process -Id $script:startedProcessId -ErrorAction SilentlyContinue
    if ($startedProcess) {
      Stop-Process -Id $startedProcess.Id -Force
      $startedProcess.WaitForExit(5000) | Out-Null
      $startedProcess.HasExited | Should -BeTrue
    }
  }
  if ($script:hadStartTestSecret) {
    $env:EAW_START_TEST_SECRET = $script:previousStartTestSecret
  }
  else {
    Remove-Item -LiteralPath 'Env:EAW_START_TEST_SECRET' -ErrorAction SilentlyContinue
  }
}

Describe 'Workbench Windows production start' {
  It 'starts on loopback, uses the requested workspace, and reuses a healthy marker' {
    Test-Path -LiteralPath $startScript | Should -BeTrue
    $port = Get-AvailableLoopbackPort
    $environmentBefore = @{}
    foreach ($name in @('HOST', 'PORT', 'EAW_WORKSPACE_PATH')) {
      $environmentPath = "Env:$name"
      $environmentBefore[$name] = [pscustomobject]@{
        Exists = Test-Path -LiteralPath $environmentPath
        Value = if (Test-Path -LiteralPath $environmentPath) {
          (Get-Item -LiteralPath $environmentPath).Value
        }
        else {
          $null
        }
      }
    }

    Push-Location -LiteralPath $TestDrive
    try {
      $first = Start-WorkbenchServer `
        -RepositoryRoot $repo `
        -WorkspacePath $workspace `
        -Port $port `
        -HealthTimeoutSeconds 20 `
        -NoBrowser
    }
    finally {
      Pop-Location
    }
    $script:startedProcessId = $first.ProcessId

    $first.Url | Should -Be "http://127.0.0.1:$port"
    $first.Reused | Should -BeFalse
    (Get-Process -Id $first.ProcessId -ErrorAction Stop).HasExited | Should -BeFalse

    $health = Invoke-RestMethod -Uri "$($first.Url)/api/v1/health" -Method Get
    $health.status | Should -Be 'ok'
    $health.appVersion | Should -Be '0.1.0'

    Invoke-RestMethod `
      -Uri "$($first.Url)/api/v1/products" `
      -Method Post `
      -ContentType 'application/json; charset=utf-8' `
      -Body (@{ name = '启动路径商品' } | ConvertTo-Json) | Out-Null

    $databasePath = Join-Path $workspace 'database\workbench.sqlite'
    $productCount = & node --input-type=module -e $readProductCountScript $databasePath
    if ($LASTEXITCODE -ne 0) {
      throw 'Failed to inspect the requested start workspace.'
    }
    $productCount | Should -Be '1'

    Push-Location -LiteralPath $TestDrive
    try {
      $second = Start-WorkbenchServer `
        -RepositoryRoot $repo `
        -WorkspacePath $workspace `
        -Port $port `
        -HealthTimeoutSeconds 5 `
        -NoBrowser
    }
    finally {
      Pop-Location
    }

    $second.ProcessId | Should -Be $first.ProcessId
    $second.Url | Should -Be $first.Url
    $second.Reused | Should -BeTrue

    $markerPath = Join-Path $workspace 'logs\workbench-server.json'
    $marker = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
    $marker.processId | Should -Be $first.ProcessId
    $marker.port | Should -Be $port
    $marker.url | Should -Be $first.Url
    $marker.appVersion | Should -Be '0.1.0'
    $logText = Read-SharedTextFile (
      Join-Path $workspace 'logs\workbench-server.out.log'
    )
    $logText += Read-SharedTextFile (
      Join-Path $workspace 'logs\workbench-server.err.log'
    )
    $logText | Should -Not -Match $script:startTestSecret

    foreach ($name in @('HOST', 'PORT', 'EAW_WORKSPACE_PATH')) {
      $environmentPath = "Env:$name"
      (Test-Path -LiteralPath $environmentPath) |
        Should -Be $environmentBefore[$name].Exists
      if ($environmentBefore[$name].Exists) {
        (Get-Item -LiteralPath $environmentPath).Value |
          Should -Be $environmentBefore[$name].Value
      }
    }
  }

  It 'cleans an immediately failing child and releases its requested port' {
    $markerPath = Join-Path $workspace 'logs\workbench-server.json'
    Remove-Item -LiteralPath $markerPath -Force
    $failedPort = Get-AvailableLoopbackPort
    $healthTimeoutSeconds = 2
    $cleanupBudgetSeconds = 5
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()

    {
      Start-WorkbenchServer `
        -RepositoryRoot $repo `
        -WorkspacePath $workspace `
        -Port $failedPort `
        -HealthTimeoutSeconds $healthTimeoutSeconds `
        -NoBrowser
    } | Should -Throw '*failed to become healthy*'

    # Windows can spend part of the explicit five-second process cleanup budget
    # releasing redirected log handles even after the health deadline expires.
    $stopwatch.Elapsed.TotalSeconds |
      Should -BeLessThan ($healthTimeoutSeconds + $cleanupBudgetSeconds + 1)
    Test-Path -LiteralPath $markerPath | Should -BeFalse

    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $failedPort)
    try {
      $probe.Start()
    }
    finally {
      $probe.Stop()
    }
  }

  It 'rejects an unrelated occupied port within a bounded deadline without a marker' {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $occupiedPort = ([Net.IPEndPoint] $listener.LocalEndpoint).Port
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()

    try {
      {
        Start-WorkbenchServer `
          -RepositoryRoot $repo `
          -WorkspacePath $occupiedWorkspace `
          -Port $occupiedPort `
          -HealthTimeoutSeconds 2 `
          -NoBrowser
      } | Should -Throw '*already in use*'
    }
    finally {
      $listener.Stop()
    }

    $stopwatch.Elapsed.TotalSeconds | Should -BeLessThan 3
    Test-Path -LiteralPath (
      Join-Path $occupiedWorkspace 'logs\workbench-server.json'
    ) | Should -BeFalse
  }
}

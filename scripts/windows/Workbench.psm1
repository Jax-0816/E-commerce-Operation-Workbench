$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-WorkbenchNative {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string] $FilePath,

    [string[]] $ArgumentList = @(),

    [Parameter(Mandatory)]
    [string] $WorkingDirectory
  )

  Push-Location -LiteralPath $WorkingDirectory
  try {
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
      throw "Workbench command failed with exit code $LASTEXITCODE`: $FilePath"
    }
  }
  finally {
    Pop-Location
  }
}

function Assert-WorkbenchRuntime {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string] $RepositoryRoot,

    [string] $NodeVersionOverride,

    [string] $PnpmVersionOverride
  )

  $arguments = @('scripts/check-versions.mjs')
  if ($NodeVersionOverride) {
    $arguments += @('--node', $NodeVersionOverride)
  }
  if ($PnpmVersionOverride) {
    $arguments += @('--pnpm', $PnpmVersionOverride)
  }

  Push-Location -LiteralPath $RepositoryRoot
  try {
    $output = & node @arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
      $message = ($output | Out-String).Trim()
      throw $(if ($message) { $message } else { 'Runtime version validation failed.' })
    }
    $output | Write-Output
  }
  finally {
    Pop-Location
  }
}

function Resolve-WorkbenchWorkspacePath {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string] $RepositoryRoot,

    [string] $WorkspacePath,

    [string] $LocalAppData = $env:LOCALAPPDATA
  )

  if ($WorkspacePath) {
    $candidate = $WorkspacePath
  }
  else {
    if (-not $LocalAppData) {
      throw 'LOCALAPPDATA is unavailable; provide -WorkspacePath explicitly.'
    }
    $candidate = Join-Path (Join-Path $LocalAppData 'EcommerceWorkbench') 'workspace'
  }

  $resolvedRepository = [IO.Path]::GetFullPath($RepositoryRoot)
  $resolvedWorkspace = [IO.Path]::GetFullPath($candidate)
  $separator = [IO.Path]::DirectorySeparatorChar
  $repositoryPrefix = $resolvedRepository.TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  ) + $separator

  if (
    $resolvedWorkspace.Equals($resolvedRepository, [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedWorkspace.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)
  ) {
    throw 'Workspace path must remain outside the source repository.'
  }

  return $resolvedWorkspace
}

function Test-WorkbenchHealth {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [uri] $Uri,

    [Parameter(Mandatory)]
    [string] $ExpectedVersion,

    [Parameter(Mandatory)]
    [ValidateRange(1, [int]::MaxValue)]
    [int] $TimeoutSeconds,

    [scriptblock] $Request = {
      param($RequestUri, $RequestTimeoutSeconds)
      Invoke-RestMethod -Uri $RequestUri -Method Get -TimeoutSec $RequestTimeoutSeconds
    },

    [scriptblock] $Sleep = {
      param($Milliseconds)
      Start-Sleep -Milliseconds $Milliseconds
    }
  )

  $stopwatch = [Diagnostics.Stopwatch]::StartNew()
  while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    try {
      $remaining = [Math]::Max(
        1,
        [Math]::Ceiling($TimeoutSeconds - $stopwatch.Elapsed.TotalSeconds)
      )
      $health = & $Request $Uri ([int] $remaining)
      if ($health.status -eq 'ok' -and $health.appVersion -eq $ExpectedVersion) {
        return $health
      }
    }
    catch {
      # Startup commonly refuses connections until the HTTP listener is ready.
    }

    if ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
      & $Sleep 100
    }
  }

  throw "Workbench did not become healthy within $TimeoutSeconds seconds."
}

function Invoke-WorkbenchSetup {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string] $RepositoryRoot,

    [string] $WorkspacePath
  )

  $resolvedWorkspace = Resolve-WorkbenchWorkspacePath `
    -RepositoryRoot $RepositoryRoot `
    -WorkspacePath $WorkspacePath

  Assert-WorkbenchRuntime -RepositoryRoot $RepositoryRoot | Out-Null

  $hadCiEnvironment = Test-Path -LiteralPath 'Env:CI'
  $previousCiEnvironment = if ($hadCiEnvironment) { $env:CI } else { $null }
  try {
    $env:CI = 'true'
    Invoke-WorkbenchNative `
      -FilePath 'pnpm' `
      -ArgumentList @('install', '--frozen-lockfile') `
      -WorkingDirectory $RepositoryRoot *> $null
    Invoke-WorkbenchNative `
      -FilePath 'pnpm' `
      -ArgumentList @('build') `
      -WorkingDirectory $RepositoryRoot *> $null
  }
  finally {
    if ($hadCiEnvironment) {
      $env:CI = $previousCiEnvironment
    }
    else {
      Remove-Item -LiteralPath 'Env:CI' -ErrorAction SilentlyContinue
    }
  }

  Invoke-WorkbenchNative `
    -FilePath 'node' `
    -ArgumentList @(
      'apps/server/dist/bootstrap.js',
      '--workspace',
      $resolvedWorkspace
    ) `
    -WorkingDirectory $RepositoryRoot *> $null

  return $resolvedWorkspace
}

function Test-WorkbenchPortInUse {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [ValidateRange(1, 65535)]
    [int] $Port
  )

  $client = [Net.Sockets.TcpClient]::new()
  try {
    $connection = $client.ConnectAsync('127.0.0.1', $Port)
    return $connection.Wait(500) -and $client.Connected
  }
  catch {
    return $false
  }
  finally {
    $client.Dispose()
  }
}

function Start-WorkbenchServer {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string] $RepositoryRoot,

    [string] $WorkspacePath,

    [ValidateRange(1, 65535)]
    [int] $Port = 3210,

    [ValidateRange(1, [int]::MaxValue)]
    [int] $HealthTimeoutSeconds = 30,

    [switch] $NoBrowser
  )

  $resolvedRepository = [IO.Path]::GetFullPath($RepositoryRoot)
  $resolvedWorkspace = Resolve-WorkbenchWorkspacePath `
    -RepositoryRoot $resolvedRepository `
    -WorkspacePath $WorkspacePath
  Assert-WorkbenchRuntime -RepositoryRoot $resolvedRepository | Out-Null

  $serverEntry = Join-Path $resolvedRepository 'apps\server\dist\index.js'
  if (-not (Test-Path -LiteralPath $serverEntry -PathType Leaf)) {
    throw 'Production build is missing. Run scripts/setup.ps1 first.'
  }

  $manifest = Get-Content -Raw -LiteralPath (
    Join-Path $resolvedRepository 'package.json'
  ) | ConvertFrom-Json
  $appVersion = [string] $manifest.version
  $url = "http://127.0.0.1:$Port"
  $healthUri = [uri] "$url/api/v1/health"
  $logsPath = Join-Path $resolvedWorkspace 'logs'
  $markerPath = Join-Path $logsPath 'workbench-server.json'

  if (Test-Path -LiteralPath $markerPath -PathType Leaf) {
    $marker = $null
    try {
      $marker = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
      $markerProcess = Get-Process -Id ([int] $marker.processId) -ErrorAction Stop
      $markerPort = [int] $marker.port
      if ($markerPort -lt 1 -or $markerPort -gt 65535) {
        throw 'Invalid workbench process marker port.'
      }
      $validatedMarkerUrl = "http://127.0.0.1:$markerPort"
      if (
        [string] $marker.url -ne $validatedMarkerUrl -or
        [string] $marker.appVersion -ne $appVersion
      ) {
        throw 'Invalid workbench process marker metadata.'
      }
      $markerHealth = Test-WorkbenchHealth `
        -Uri ([uri] "$validatedMarkerUrl/api/v1/health") `
        -ExpectedVersion $appVersion `
        -TimeoutSeconds ([Math]::Min(2, $HealthTimeoutSeconds))

      if ($markerPort -eq $Port) {
        if (-not $NoBrowser) {
          Start-Process -FilePath $url | Out-Null
        }
        return [pscustomobject]@{
          Url = $url
          ProcessId = $markerProcess.Id
          Reused = $true
        }
      }

      throw "Workbench is already running at $validatedMarkerUrl."
    }
    catch {
      if ($_.Exception.Message -like 'Workbench is already running at *') {
        throw
      }
      Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
    }
  }

  if (Test-WorkbenchPortInUse -Port $Port) {
    throw "Port $Port on 127.0.0.1 is already in use."
  }

  New-Item -ItemType Directory -Path $logsPath -Force | Out-Null
  $stdoutPath = Join-Path $logsPath 'workbench-server.out.log'
  $stderrPath = Join-Path $logsPath 'workbench-server.err.log'
  $temporaryMarkerPath = Join-Path $logsPath (
    ".workbench-server.$([guid]::NewGuid().ToString('N')).tmp"
  )
  $process = $null

  $environmentNames = @('HOST', 'PORT', 'EAW_WORKSPACE_PATH')
  $previousEnvironment = @{}
  foreach ($name in $environmentNames) {
    $environmentPath = "Env:$name"
    $previousEnvironment[$name] = [pscustomobject]@{
      Exists = Test-Path -LiteralPath $environmentPath
      Value = if (Test-Path -LiteralPath $environmentPath) {
        (Get-Item -LiteralPath $environmentPath).Value
      }
      else {
        $null
      }
    }
  }

  try {
    $env:HOST = '127.0.0.1'
    $env:PORT = [string] $Port
    $env:EAW_WORKSPACE_PATH = $resolvedWorkspace
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $process = Start-Process `
      -FilePath $nodePath `
      -ArgumentList @('apps/server/dist/index.js') `
      -WorkingDirectory $resolvedRepository `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath `
      -PassThru
  }
  finally {
    foreach ($name in $environmentNames) {
      $environmentPath = "Env:$name"
      if ($previousEnvironment[$name].Exists) {
        Set-Item -LiteralPath $environmentPath -Value $previousEnvironment[$name].Value
      }
      else {
        Remove-Item -LiteralPath $environmentPath -ErrorAction SilentlyContinue
      }
    }
  }

  try {
    $health = Test-WorkbenchHealth `
      -Uri $healthUri `
      -ExpectedVersion $appVersion `
      -TimeoutSeconds $HealthTimeoutSeconds
    if ($health.status -ne 'ok') {
      throw 'Workbench returned an invalid health response.'
    }

    $markerJson = [ordered]@{
      processId = $process.Id
      port = $Port
      url = $url
      appVersion = $appVersion
    } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText(
      $temporaryMarkerPath,
      $markerJson,
      [Text.UTF8Encoding]::new($false)
    )
    [IO.File]::Move($temporaryMarkerPath, $markerPath, $true)

    if (-not $NoBrowser) {
      Start-Process -FilePath $url | Out-Null
    }

    return [pscustomobject]@{
      Url = $url
      ProcessId = $process.Id
      Reused = $false
    }
  }
  catch {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      $process.WaitForExit(5000) | Out-Null
    }
    Remove-Item -LiteralPath $temporaryMarkerPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
    throw "Workbench server failed to become healthy at $url. $($_.Exception.Message)"
  }
}

Export-ModuleMember -Function @(
  'Invoke-WorkbenchNative',
  'Assert-WorkbenchRuntime',
  'Resolve-WorkbenchWorkspacePath',
  'Test-WorkbenchHealth',
  'Invoke-WorkbenchSetup',
  'Start-WorkbenchServer'
)

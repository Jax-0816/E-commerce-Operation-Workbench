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

Export-ModuleMember -Function @(
  'Invoke-WorkbenchNative',
  'Assert-WorkbenchRuntime',
  'Resolve-WorkbenchWorkspacePath',
  'Test-WorkbenchHealth',
  'Invoke-WorkbenchSetup'
)

BeforeAll {
  $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
  $module = Join-Path $repo 'scripts\windows\Workbench.psm1'
  Import-Module $module -Force
}

Describe 'Workbench Windows command safety' {
  It 'turns a nonzero native exit code into a terminating error' {
    {
      Invoke-WorkbenchNative `
        -FilePath (Get-Command pwsh).Source `
        -ArgumentList @('-NoProfile', '-Command', 'exit 7') `
        -WorkingDirectory $repo
    } | Should -Throw '*exit code 7*'
  }

  It 'rejects unsupported runtime versions through the project checker' {
    {
      Assert-WorkbenchRuntime `
        -RepositoryRoot $repo `
        -NodeVersionOverride '26.0.0' `
        -PnpmVersionOverride '11.22.0'
    } | Should -Throw '*does not satisfy*'
  }

  It 'resolves the documented default below LOCALAPPDATA' {
    $localAppData = Join-Path ([IO.Path]::GetTempPath()) 'Local App Data'

    $resolved = Resolve-WorkbenchWorkspacePath `
      -RepositoryRoot $repo `
      -LocalAppData $localAppData

    $expected = Join-Path (Join-Path $localAppData 'EcommerceWorkbench') 'workspace'
    $resolved | Should -Be ([IO.Path]::GetFullPath($expected))
  }

  It 'preserves an explicit Chinese path with spaces as one path' {
    $target = Join-Path ([IO.Path]::GetTempPath()) '电商 工作台'

    $resolved = Resolve-WorkbenchWorkspacePath `
      -RepositoryRoot $repo `
      -WorkspacePath $target

    $resolved | Should -Be ([IO.Path]::GetFullPath($target))
  }

  It 'rejects workspace data inside the source repository' {
    $target = Join-Path $repo 'workspace data'

    {
      Resolve-WorkbenchWorkspacePath -RepositoryRoot $repo -WorkspacePath $target
    } | Should -Throw '*outside the source repository*'
  }
}

Describe 'Workbench health wait' {
  It 'retries transient failures and returns only a matching workbench payload' {
    $script:attempts = 0
    $request = {
      param($Uri, $TimeoutSec)
      $script:attempts += 1
      if ($script:attempts -lt 3) {
        throw 'not ready'
      }
      [pscustomobject]@{ status = 'ok'; appVersion = '0.1.0' }
    }

    $health = Test-WorkbenchHealth `
      -Uri 'http://127.0.0.1:3210/api/v1/health' `
      -ExpectedVersion '0.1.0' `
      -TimeoutSeconds 2 `
      -Request $request `
      -Sleep { param($Milliseconds) }

    $health.status | Should -Be 'ok'
    $health.appVersion | Should -Be '0.1.0'
    $script:attempts | Should -Be 3
  }

  It 'fails within the deadline when a listener is not this workbench version' {
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()

    {
      Test-WorkbenchHealth `
        -Uri 'http://127.0.0.1:3210/api/v1/health' `
        -ExpectedVersion '0.1.0' `
        -TimeoutSeconds 1 `
        -Request { param($Uri, $TimeoutSec) [pscustomobject]@{ status = 'ok'; appVersion = '9.9.9' } } `
        -Sleep { param($Milliseconds) Start-Sleep -Milliseconds $Milliseconds }
    } | Should -Throw '*did not become healthy within 1 seconds*'

    $stopwatch.Elapsed.TotalSeconds | Should -BeLessThan 2.5
  }
}

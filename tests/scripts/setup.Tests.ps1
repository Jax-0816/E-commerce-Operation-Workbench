BeforeAll {
  $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
  $setup = Join-Path $repo 'scripts\setup.ps1'
  $repositoryProbe = Join-Path $repo '.setup-rejection-probe'

  $writeSentinelScript = @'
import { DatabaseSync } from 'node:sqlite';
const database = new DatabaseSync(process.argv[1]);
database.exec("CREATE TABLE setup_sentinel (value TEXT NOT NULL)");
database.prepare("INSERT INTO setup_sentinel (value) VALUES (?)").run('preserve-me');
database.close();
'@

  $readStateScript = @'
import { DatabaseSync } from 'node:sqlite';
const database = new DatabaseSync(process.argv[1], { readOnly: true });
const scalar = (sql) => Number(database.prepare(sql).get().count);
const state = {
  prompts: scalar('SELECT COUNT(*) AS count FROM prompt_templates'),
  activations: scalar('SELECT COUNT(*) AS count FROM prompt_activations'),
  rulePacks: scalar('SELECT COUNT(*) AS count FROM rule_packs'),
  activeRules: scalar('SELECT COUNT(*) AS count FROM rule_packs WHERE active = 1'),
  sentinel: database.prepare('SELECT value FROM setup_sentinel').get().value,
};
database.close();
process.stdout.write(JSON.stringify(state));
'@
}

AfterAll {
  if (Test-Path -LiteralPath $repositoryProbe) {
    Remove-Item -LiteralPath $repositoryProbe -Recurse -Force
  }
}

Describe 'Workbench Windows setup' {
  It 'is idempotent from another current directory and preserves workspace data' {
    $workspace = Join-Path $TestDrive '工作台 安装'
    $ciBefore = if (Test-Path -LiteralPath 'Env:CI') { $env:CI } else { $null }

    Push-Location -LiteralPath $TestDrive
    try {
      $firstOutput = @(& $setup -WorkspacePath $workspace *>&1)

      $databasePath = Join-Path $workspace 'database\workbench.sqlite'
      & node --input-type=module -e $writeSentinelScript $databasePath
      if ($LASTEXITCODE -ne 0) {
        throw 'Failed to write the setup sentinel.'
      }
      Set-Content -LiteralPath (Join-Path $workspace 'keep.txt') -Value 'keep'

      $secondOutput = @(& $setup -WorkspacePath $workspace *>&1)
    }
    finally {
      Pop-Location
    }

    Test-Path -LiteralPath (Join-Path $workspace 'workspace.json') | Should -BeTrue
    Test-Path -LiteralPath $databasePath | Should -BeTrue
    $firstOutput.Count | Should -Be 2
    $firstOutput[0] | Should -Be "Workspace: $([IO.Path]::GetFullPath($workspace))"
    $firstOutput[1] | Should -Be 'Setup completed successfully.'
    $secondOutput.Count | Should -Be 2
    $secondOutput[0] | Should -Be "Workspace: $([IO.Path]::GetFullPath($workspace))"
    $secondOutput[1] | Should -Be 'Setup completed successfully.'
    (Get-Content -Raw -LiteralPath (Join-Path $workspace 'keep.txt')).Trim() |
      Should -Be 'keep'

    $stateJson = & node --input-type=module -e $readStateScript $databasePath
    if ($LASTEXITCODE -ne 0) {
      throw 'Failed to read the bootstrapped workspace state.'
    }
    $state = $stateJson | ConvertFrom-Json

    $state.prompts | Should -Be 7
    $state.activations | Should -Be 7
    $state.rulePacks | Should -Be 1
    $state.activeRules | Should -Be 0
    $state.sentinel | Should -Be 'preserve-me'
    $ciAfter = if (Test-Path -LiteralPath 'Env:CI') { $env:CI } else { $null }
    $ciAfter | Should -Be $ciBefore
  }

  It 'rejects a workspace below the repository before creating it' {
    Test-Path -LiteralPath $repositoryProbe | Should -BeFalse

    {
      & $setup -WorkspacePath $repositoryProbe
    } | Should -Throw '*outside the source repository*'

    Test-Path -LiteralPath $repositoryProbe | Should -BeFalse
  }
}

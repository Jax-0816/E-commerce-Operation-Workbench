$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Import-Module Pester -MinimumVersion 5.0 -ErrorAction Stop

$configuration = New-PesterConfiguration
$configuration.Run.Path = $PSScriptRoot
$configuration.Run.Exit = $true
$configuration.Output.Verbosity = 'Detailed'
Invoke-Pester -Configuration $configuration

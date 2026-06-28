# action-bump-version

`action-bump-version` is the release automation action used by Kungfu repositories.
It validates release pull requests, bumps package versions, moves channel branches,
updates release tags, and publishes packages or build artifacts through the shared
`kungfu-systems/workflows` reusable workflows.

The action is intentionally driven by GitHub pull requests. Maintainers should be
able to create, review, merge, and release from the GitHub UI without running local
release scripts or repairing release Git history by hand.

## Release Model

Kungfu release branches are organized by channel and minor line:

```text
dev/v<major>/v<major>.<minor>
alpha/v<major>/v<major>.<minor>
release/v<major>/v<major>.<minor>
release/v<major>/lts
main
```

A minor line such as `v4.0` is promoted through these channels:

```text
dev/v4/v4.0 -> alpha/v4/v4.0 -> release/v4/v4.0 -> main
```

The branch channel determines the version operation:

| Pull request | Version operation | Result |
| --- | --- | --- |
| `dev -> alpha` | `prerelease` | Creates the next `x.y.z-alpha.n` prerelease. |
| `alpha -> release` | `patch` | Creates the final `x.y.z` release from the prerelease line. |
| `release -> main` | `preminor` | Starts the next minor line. |
| `release -> release/lts` | `preminor` | Starts the next minor line for an older major line. |
| `main -> main` workflow dispatch | `premajor` | Starts the next major line. |

Version state is read from `lerna.json` when present, otherwise from the root
`package.json`. Repositories using this action must keep one of those files at
the repository root.

## Pull Request Lifecycle

The normal prerelease path is:

1. Work lands on `dev/v<major>/v<major>.<minor>`.
2. A maintainer opens a PR from `dev/...` to `alpha/...`.
3. The `Release - Verify` workflow validates the branch pair and optional build
   matrix.
4. A maintainer review is required for protected release channels.
5. The PR is merged.
6. The `Release - New Version` workflow runs `prebuild`, publishes configured
   artifacts, then runs `postbuild`.
7. The action moves tags and channel branches, then leaves the development line
   at the next unpublished alpha version.

The release path from `alpha/...` to `release/...` is the same shape, but it
produces a final release version instead of an alpha prerelease.

## Action Modes

`action-bump-version` has four modes. The shared workflows usually call them for
you, but direct workflow usage can still call the action explicitly.

| Mode | Purpose |
| --- | --- |
| `verify` | Validate the PR head/base branch pair and update the PR title. |
| `prebuild` | Prepare the release version before external build or publish steps. |
| `postbuild` | Publish package metadata, move tags/branches, and prepare the next version. |
| `auto` | Run `prebuild` and `postbuild` in one step. |

For release PRs, `auto` and `postbuild` require the PR to already be merged.
`verify` runs on open PRs and can close invalid PRs with an explanatory comment.

## Branch Protection

By default the action manages GitHub branch protection for these patterns:

```text
main
release/*/*
alpha/*/*
dev/*/*
```

Protected release channels require review, strict status checks, conversation
resolution, admin enforcement, and no force pushes or deletions. `dev/*/*` keeps
status-check protection but does not require review or push restriction unless
`protect-dev-branches` is enabled.

Before creating a version tag, `prebuild` deletes only the matching local tag if
it already exists. This keeps persistent self-hosted runner workspaces from
failing on stale local tags while leaving remote tags untouched until `postbuild`
publishes the intended refs.

Inputs that control protection:

| Input | Default | Meaning |
| --- | --- | --- |
| `no-protection` | `false` | Set to `true` to skip branch protection changes. |
| `protect-dev-branches` | `false` | Set to `true` to restrict direct pushes to `dev/*/*`. |
| `reset-default-branch` | `true` | Set to `false` when a reusable workflow must not rewrite the repository default branch. |
| `skip-base-branch-push` | `false` | Set to `true` when a protected release branch is already updated by PR merge and must not be force-pushed during `postbuild`. |

`reset-default-branch=false` is used by the shared release workflow when it runs
inside a caller repository. It prevents a reusable workflow from changing the
repository default branch while still allowing the release branch and tags to be
updated.

## Tokens and Permissions

Prefer the narrowest token that can perform the current step.

| Use case | Recommended token |
| --- | --- |
| Verify PR branch shape and update PR title | `github.token` with `pull-requests: write`. |
| Release package metadata and push tags/branches | `github.token` with `contents: write`, `packages: write`, `issues: write`, and `pull-requests: write`. |
| GitHub Packages publish | `github.token` as `NODE_AUTH_TOKEN` when publishing to the same owner. |
| npmjs publish | `NPM_PUSH_TOKEN`, only when `publish-npmjs=true`. |
| Legacy collaborator automation | Optional `NODE_AUTH_TOKEN`; omit it when collaborator updates are not needed. |

The reusable workflows no longer require a broad `GITHUB_PUSH_TOKEN` for the
standard in-repository release path. Keep PATs out of caller workflows unless a
specific cross-repository or administrative operation still requires one.

## Shared Workflow Integration

Most Kungfu repositories should not call this action directly. They should call
`kungfu-systems/workflows` reusable workflows and let those workflows check out
and execute this action.

### Verify Workflow

```yaml
name: Release - Verify

on:
  pull_request:
    types: [opened, synchronize]
    branches:
      - alpha/*/*
      - release/*/*
      - main

jobs:
  try:
    uses: kungfu-systems/workflows/.github/workflows/.release-verify.yml@v2
    with:
      enable-macos: false
      enable-windows: false
      prebuild: true
      publish-versioning: false
      publish-aws-ci: false
      publish-aws-user: false

  verify:
    needs: try
    runs-on: ubuntu-24.04
    steps:
      - run: echo verified
```

### Release Workflow

```yaml
name: Release - New Version

on:
  pull_request:
    types: [closed]
    branches:
      - alpha/v*/v*
      - release/v*/v*

jobs:
  release:
    uses: kungfu-systems/workflows/.github/workflows/.release-new-version.yml@v2
    with:
      publish-aws-ci: false
      publish-aws-user: false
```

## Testing Workflow or Action Changes

During workflow development, callers can pin both the reusable workflow ref and
the action implementation ref. This lets maintainers test workflow changes and
action changes before publishing a stable workflow tag.

Caller workflow example:

```yaml
jobs:
  try:
    uses: kungfu-systems/workflows/.github/workflows/.release-verify.yml@dev/v2/v2.0
    with:
      action-bump-version-repository: kungfu-systems/action-bump-version
      action-bump-version-ref: dev/v4/v4.0
      enable-macos: false
      enable-windows: false
      publish-versioning: false
      publish-aws-ci: false
      publish-aws-user: false
```

The reusable workflows check out the configured action into
`node_modules/.github-actions/action-bump-version` and run:

```bash
node node_modules/.github-actions/action-bump-version/dist/index.js
```

They also set:

```text
KUNGFU_ACTION_BUMP_VERSION_ALLOW_LOCAL=true
```

That environment variable is a guard for reusable-workflow execution. The action
normally checks `GITHUB_ACTION_REPOSITORY` to ensure it is running as the expected
GitHub Action. When a reusable workflow checks out the action as source and runs
`dist/index.js` directly, this local-execution guard must be explicitly enabled.

## Runner Selection

Heavy build jobs can run on GitHub-hosted runners or on Kungfu self-hosted
runners. This is controlled by reusable workflow inputs, not by the action
itself.

Default behavior uses GitHub-hosted runners:

```yaml
with:
  build-runner-linux: ubuntu-24.04
  build-runner-macos: macos-13
  build-runner-windows: windows-2022
```

To target self-hosted runners, pass JSON label arrays as strings:

```yaml
with:
  build-runner-linux-labels: '["self-hosted","Linux","X64","agent-120","kungfu-build","linux-x64"]'
  build-runner-macos-labels: '["self-hosted","macOS","ARM64","mac","kungfu-build","macos-arm64"]'
  build-runner-windows-labels: '["self-hosted","Windows","X64","darkhero","kungfu-build","windows-x64"]'
```

If a labels input is empty, the workflow falls back to the corresponding
GitHub-hosted runner input. This keeps forks and external contributors usable:
forks without Kungfu self-hosted runners can still build on GitHub-hosted
runners, while organization-maintained release workflows can opt into
self-hosted capacity for heavy matrix builds.

The shared verify workflow also gates heavy builds so they only run for PRs whose
head repository is the same as the base repository. External fork PRs can still
run lightweight verification without receiving self-hosted runner access.

## Direct Action Usage

Direct usage is still supported for repositories that do not use the shared
workflow layer. For v4, `package.json` names the package
`@kungfu-systems/action-bump-version`, so direct GitHub Action execution matches
the `kungfu-systems/action-bump-version` repository identity guard.

```yaml
- uses: kungfu-systems/action-bump-version@v4
  with:
    token: ${{ github.token }}
    action: verify
```

Custom build flow:

```yaml
- uses: kungfu-systems/action-bump-version@v4
  with:
    token: ${{ github.token }}
    action: prebuild

- run: yarn build

- uses: kungfu-systems/action-bump-version@v4
  with:
    token: ${{ github.token }}
    action: postbuild
    reset-default-branch: "false"
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `token` | Yes | | GitHub token used for GitHub API and Git operations. |
| `action` | No | `auto` | One of `auto`, `prebuild`, `postbuild`, or `verify`. |
| `no-publish` | No | `false` | Set to `true` to skip `npm publish`. |
| `no-protection` | No | `false` | Set to `true` to skip branch protection changes. |
| `protect-dev-branches` | No | `false` | Set to `true` to restrict direct pushes to `dev/*/*`. |
| `reset-default-branch` | No | `true` | Set to `false` to skip default-branch reset during merge finalization. |
| `skip-base-branch-push` | No | `false` | Set to `true` to skip direct `postbuild` pushes to the merged PR base branch. |

## Outputs

| Output | Description |
| --- | --- |
| `keyword` | The semver keyword selected for this run. |
| `version` | The release or prerelease version produced by `prebuild`. |
| `prebuild-version` | The version at the start of `prebuild`. |
| `postbuild-version` | The version after `postbuild` prepares the next development state. |

## Maintainer Checklist

For a normal Kungfu release PR:

1. Confirm the PR direction matches the channel path.
2. Confirm `Release - Verify` passed.
3. Confirm the PR has the required maintainer review.
4. Merge the PR.
5. Confirm `Release - New Version` completed.
6. Confirm tags and channel branches point to the expected commits.

For workflow or action development:

1. Pin `kungfu-systems/workflows` to the workflow branch or SHA under test.
2. Pass `action-bump-version-ref` to the action branch or SHA under test.
3. Use self-hosted runner labels only for trusted in-organization PRs.
4. Keep `publish-aws-*` and external publish inputs disabled unless the test is
   intentionally exercising those publish paths.
5. After validation, publish or merge the workflow/action refs and move callers
   back to stable tags.

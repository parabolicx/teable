# Parabolic's Teable interface

This fork starts at the public Community source revision recorded in
`upstream.json`. The installed release and source both report Teable 1.10.0,
Next 16.1.6 and React 18.3.1. `Dockerfile` builds the frontend and Nest backend
from source and layers their outputs over the exact installed Community image.
Its runtime dependencies, workspace package builds, migrations, entrypoint,
plugins and storage layout stay pinned to that matching baseline. This fork
does not change the database schema or dependency contracts.

## Native interface

Build with `NEXT_PUBLIC_PARABOLIC_ENABLED=true` to enable these additions:

- `features/parabolic/ParabolicShell` owns the workspace layout. Its header
  appears only after `/4dx/api/navigation` confirms the existing owner session.
  GPU polling runs independently so a slow collector cannot delay navigation.
- `WorkspaceHeader` uses Teable's UI library and semantic theme tokens. Table
  links use native Next routing; local service links remain same-origin URLs.
- `AssistantPanel` is a floating, resizable window inside the content area.
  Closing or minimizing keeps its iframe and conversation mounted. Native
  route and record events synchronize context; origin and window identity
  validate messages. Teable colors, radius and font cross the theme bridge.
- The SDK's primary record editor offers Modal/Drawer presentation. A wide
  desktop drawer is a native nonmodal Dialog. Mobile, shared, nested and linked
  records retain native modal protection and native field editing.
- The attachment viewer supplies a themed video player with seeking, playback
  speed, volume, fullscreen and load/error feedback. Its focused shortcuts do
  not trigger attachment navigation. Other attachment types retain their
  existing preview paths.
- The source backend supports HTTP byte ranges for local attachment reads,
  allowing existing video attachments to seek without replacing their files.

Teable's name, logo and native branding remain in place. New controls inherit
`@teable/ui-lib`, `background`, `foreground`, `border`, `primary`, `muted` and
the existing theme. There is no separate React root or injected workspace CSS.

The default build flag is off, preserving the upstream interface. The document
marker `<meta name="parabolic-native" content="v1">` tells the 4DX gateway to
skip its legacy topbar, record adapter and chat-sidebar injection. Older pinned
images keep the guarded legacy fallback for rollback.

## Local services

The 4DX workspace continues to own gateway authentication, bounded local GPU
collection, chat/voice connectors, workflow execution, Shoot hardware and
private configuration. They remain at `/4dx/api/*`, `/chat/`, `/workflows/`,
`/shoot/` and `/jonesos/`. These services are intentionally not copied into the
database application. The companion gateway marker and chat theme changes
must be present when deploying this image; see the 4DX `teable/network` and
`teable/chat` sources. The agent PAT is never used by the browser interface.

`4dx-native-ui.patch` records those companion changes in this fork so they are
reviewable alongside the native frontend. From the 4DX workspace root, apply
it to the existing gateway and chat sources before deployment:

```sh
git apply --check teable/source/parabolic/4dx-native-ui.patch
git apply teable/source/parabolic/4dx-native-ui.patch
```

If the changes are already installed, `git apply --reverse --check` verifies
that state. The patch contains no private configuration or credentials.

## Build and review

From this repository root with Docker BuildKit enabled:

```sh
docker build -f parabolic/Dockerfile \
  --build-arg PARABOLIC_REVISION="$(git rev-parse HEAD)" \
  -t fourdx-teable-native:1.10.0 .
```

Use the frozen pnpm lockfile and Node 22.22.3. Native component tests live in
`apps/nextjs-app/src/features/parabolic`, record tests in the SDK, and video
tests alongside the shared viewer. Backend attachment tests live alongside
the attachment storage code. Run the app and backend typechecks, focused tests
and production builds before deploying. Back up the database and assets before
replacing the app container. Keep the old image digest for rollback; these
changes do not require a schema migration.

The `deps` stage installs both app and backend dependency graphs and generates
the main/data Prisma types without connecting to a database. It can also be
used for isolated backend checks:

```sh
docker build --target deps -f parabolic/Dockerfile \
  -t fourdx-teable-native-deps:1.10.0 .
docker run --rm --workdir /app --entrypoint pnpm \
  fourdx-teable-native-deps:1.10.0 --filter @teable/backend exec \
  tsc --project tsconfig.build.json --noEmit
docker run --rm --workdir /app/apps/nestjs-backend --entrypoint pnpm \
  fourdx-teable-native-deps:1.10.0 exec vitest run \
  src/features/attachments/local-file-response.spec.ts \
  src/features/attachments/attachments-read.spec.ts
```

The unit tests use temporary local files; they do not need deployment
credentials or a running database. Database integration tests require a
separate disposable database and must never target the installed instance.
The production TypeScript configuration checks all backend source. The broader
upstream `typecheck` script also includes unit/E2E fixtures with existing type
errors; those need a separate cleanup before becoming a required check.
The `builder` stage uses Teable's normal `nest build`, including its worker
entries and mail templates. No compiled JavaScript is patched in the image.

## Upstream updates

`origin` is `parabolicx/teable`; `upstream` is `teableio/teable`. Work on narrow
branches and review upstream fixes before adopting them. Freezing the baseline
does not prevent a later merge or selective backport. Resolve conflicts in
source and repeat the native interaction checks.

This Dockerfile supports source changes in the app and Nest backend against
the recorded baseline. Nest leaves npm and workspace packages external, so
their pinned runtime builds must remain compatible with the source. For an
upstream change affecting workspace package behavior, schema, dependency
versions or plugins, update the baseline and build the complete application
using `dockers/teable/Dockerfile`. Review its migrations before deployment.
Do not pair arbitrary newer source or lockfiles with this old runtime image.

# 0024. Material UI as the single UI library

- Status: Accepted
- Date: 2026-10-16

## Context
Up to 0.3.0 the web app was styled by hand (ADR 0011): `global.css` tokens plus one CSS module per component, about 500 lines across 15 files. More modules are coming to the same web app as their own tabs (the AI tutor, later a wealth tracker). Each one would mean more hand-written CSS, and the screens would drift apart. ADR 0011 rejected a component library because the app had one screen; that is no longer true.

## Decision
- **Material UI (`@mui/material`) is the only source of UI components and styling** in `apps/web`, with Emotion as its styling engine and `@mui/icons-material` for icons.
- **One theme** (`src/theme.ts`) with CSS variables and light and dark colour schemes. Repeated styling goes in theme `components` overrides; one-off layout goes in `sx`. No new `.css` files or CSS modules.
- **`@mui/x-tree-view` (free tier)** provides the folder picker's tree (`SimpleTreeView`).
- **MDXEditor is the one exception** (ADR 0019): it keeps its own stylesheet, and `NoteEditor` keeps its CSS module until the editor is revisited in v0.3.2.
- The migration is behaviour-neutral: existing tests are the regression net and pass unchanged, except `FolderPicker.test.tsx`, which is rewritten for the tree roles.

## Consequences
- New screens are built from ready-made, accessible components with no CSS to write, and they look consistent.
- The app looks like a Material app. That is accepted.
- Bundle size grows (MUI, Emotion, icons). Import components and icons by path or named import so unused ones are tree-shaken.
- jsdom needs a `matchMedia` stub for `useMediaQuery` and the system colour scheme.
- Supersedes ADR 0011's "plain CSS modules, no UI library" point.

## Alternatives considered
- **Keep hand-written CSS:** no new dependencies, but every new module means more CSS and slow drift between screens.
- **Tailwind (+ shadcn/ui):** flexible, but it means owning the component code and a second styling vocabulary. Naresh wants a ready-made library.
- **Mantine / Chakra:** good libraries, but MUI has the broadest component set (tree view included) and Naresh is happy with the Material look.

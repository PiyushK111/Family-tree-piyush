# Family-tree-piyush

An interactive family tree where **you sit at the centre**. Parents and grandparents grow upward,
siblings and cousins sit beside you, children and grandchildren below — and **the branch that
reaches each person is labelled with how they are related to you**.

Live: <https://piyushk111.github.io/Family-tree-piyush/>

## The idea worth knowing

You never type a relationship word. You record only raw facts — *X is a parent of Y*, *X is married
to Y* — and the app walks the graph outward from you to work out the label itself:

```
You record:                      The app computes:
  Ramesh is father of Me           Ramesh -> Father
  Suresh is son of Ramesh's dad    Suresh -> Paternal Uncle
  Amit   is son of Suresh          Amit   -> First Cousin (paternal)
  Amit   has a son                 his son -> First Cousin Once Removed (paternal)
```

It handles both sides (paternal vs maternal), in-laws, step / half / adopted / foster links, and
cousins at any degree and remove. If you would rather use a family term — *Kaka*, *Mama*, *Bhai* —
put it in the **Relation label override** field on that person and it wins.

## Using it

Hover any card to reveal four buttons:

| Button | Adds |
|---|---|
| ↑ | a parent, above |
| ⇔ | a spouse or partner, beside |
| ⇄ | a sibling, beside (needs a parent to attach to) |
| ↓ | a child, below |

Click a card to edit that person: photo, name, gender, birth/death dates, native place, city,
phone, email, notes. The same panel lists their existing connections so you can unlink a wrong one
or link two people who are already in the tree.

Other controls: **Relations on** switches the labels between branches, cards, or both;
**Centre on me** pans back to you; the search box jumps to anyone by name; **View relations from
here** temporarily recomputes every label from someone else's point of view without changing the
tree.

## Running it locally

Needs **Node 20 or newer**.

```bash
npm install
npm run dev      # http://localhost:5173/Family-tree-piyush/
npm test         # the kinship engine's test suite
npm run build    # production build into dist/
```

Configuration lives in two files: **`.env.production`** is committed and used by `npm run build`,
and **`.env`** is gitignored and overrides it locally. There is no `.env.example` — a template
holding the same values as the real config only invites editing the wrong one.

With no Firebase configuration present the app runs in **local mode**: everything lives in your
browser's `localStorage`, seeded with a small starter family, and the toolbar shows a
*Local only* badge. Use **Export** / **Import** to move that data into a real tree once signed in.

## Setting up Firebase

Data and photos live in Firestore. **Cloud Storage is deliberately not used** — new Firebase
projects generally require the paid Blaze plan to enable it — so photos are cropped square,
shrunk to 256px, and stored as ~30 KB base64 thumbnails in Firestore documents. That keeps the
whole thing on the free Spark plan; a 300-person tree uses roughly 10 MB of the 1 GiB quota.

1. Create a project at <https://console.firebase.google.com>.
2. **Build → Firestore Database → Create database** (production mode).
3. **Build → Authentication → Sign-in method → Google → Enable.**
4. **Authentication → Settings → Authorized domains → Add domain** → `piyushk111.github.io`
   (`localhost` is already trusted for development).
5. **Firestore → Rules** → paste [firestore.rules](firestore.rules) → **Publish**.
6. **Firestore → Data** → create one document by hand:

   - Collection `trees`, Document ID `main`
   - `name` (string) — e.g. `Kushwah Family`
   - `rootPersonId` (string) — leave empty for now
   - `ownerEmail` (string) — your Google account address
   - `editors` (array of strings) — every email allowed to edit, yours included

   Creating this by hand is intentional: the rules leave `create` closed, so nobody can claim your
   tree id before you do. Adding a relative later is just another entry in `editors`.

7. **Project settings → General → Your apps → Web app** → copy the config values into
   [.env.production](.env.production), which is committed and read by `npm run build`, so deploys
   need no secret configuration. Copy them into `.env` too for local development (gitignored, and it overrides the file above).

   Those six values are **not secrets**. A Firebase web config is a set of public identifiers
   compiled into the JavaScript bundle and served to every visitor, so anyone opening the site can
   read them regardless. Access is controlled by [firestore.rules](firestore.rules) and the
   Authentication authorized-domains list, not by hiding the config. Repository secrets of the same
   names still override the file if you prefer that; an empty secret is ignored rather than
   blanking out a working config.

The first person you add becomes the tree's centre — open them and press **Make this "me"** to set
`rootPersonId`.

### Where the data lives

Everything sits under one tree document. Open it at
**Firebase console → Firestore Database → Data**:

```
trees/main                        the tree itself
    name              "Piyush(Rishi)"
    rootPersonId      id of the person at the centre ("me")
    ownerEmail        your address
    editors           [ "you@example.com", ... ]   who may write

trees/main/people/<auto-id>       one document per person
    name, gender, deceased, hasPhoto
    birthDate, deathDate          optional, ISO yyyy-mm-dd
    birthPlace, currentCity, phone, email, notes
    relationOverride              set only if you typed a custom label

trees/main/links/<auto-id>        one document per relationship
    type    "parent" | "spouse"
    from    the parent, or one spouse
    to      the child, or the other spouse
    kind    "biological" | "adopted" | "step" | "foster"   (parent links)
    status  "married" | "divorced" | "partner"             (spouse links)

trees/main/photos/<person-id>     one document per photo
    dataUrl  "data:image/jpeg;base64,..."   ~30 KB square thumbnail
```

Note what is *not* stored: no relationship words. "Paternal Uncle" appears nowhere in the database —
only the `links` documents that let the engine derive it. That is why re-centring the tree on
someone else instantly relabels everyone, and why a wrong label is always a wrong link.

Nothing is written until the app is running with a Firebase config **and** you are signed in as an
address listed in `editors`. If the toolbar shows a *Local only* badge, the build has no Firebase
config and everything you enter is going to that browser's `localStorage` instead — use **Export**
there and **Import** once signed in to carry it over.

### Who can do what

Anyone with the link can view. Editing requires a Google sign-in whose verified email appears in
that tree's `editors` array. Editors can add, change and delete people, and rename or re-centre the
tree, but cannot change `editors` or `ownerEmail` — those are console-only, so no editor can widen
access.

## Deploying

Push to `main`. [The workflow](.github/workflows/deploy.yml) runs the tests, builds using
`.env.production`, checks the Firebase config actually landed in the bundle, then publishes to
GitHub Pages. Enable it once under **Settings → Pages → Source: GitHub Actions**.

That config check exists because the failure it catches is so misleading: a build with no Firebase
values produces a working site that quietly runs in browser-only mode with no sign-in button, which
reads as a bug in the app rather than a build problem. It now fails the deploy instead.

`vite.config.ts` sets `base: '/Family-tree-piyush/'`. It must match the repository name exactly,
**including capitals** — a mismatch serves a blank page with 404s for every asset.

## Installing it on a phone

The site is a **PWA**, so it installs to a home screen and runs like a native app — its own icon,
full screen, no browser address bar, and it opens offline.

- **Android (Chrome/Edge):** open the site and tap **Install app** in the toolbar, or use the
  browser menu's *Install app* / *Add to Home screen*.
- **iPhone/iPad (Safari):** Share button, then **Add to Home Screen**. iOS has no install API, so
  the toolbar button explains this route rather than pretending to do it.
- **Desktop (Chrome/Edge):** the same **Install app** button gives it a standalone window.

Two things make it usable by finger rather than mouse: the `+` add-relative buttons on a card are
permanently visible under `(hover: none)` — on a touch screen they could otherwise never be
revealed, since a tap opens the person dialog — and Firestore keeps an IndexedDB cache, so a cold
launch with no signal still shows the last-known tree and syncs when the network returns.

Updates arrive on their own: the service worker re-fetches in the background after a push, so the
installed app is never pinned to an old build.

### If you want a real app-store app

A PWA cannot be listed in the Play Store or App Store. Wrapping this same build in
[Capacitor](https://capacitorjs.com) produces a native shell around it and needs no rewrite:

```bash
npm i -D @capacitor/cli && npm i @capacitor/core @capacitor/android
npx cap init "Family Tree" com.piyush.familytree --web-dir=dist
npm run build && npx cap add android && npx cap open android
```

The costs are outside the code: Android Studio (and Xcode plus a Mac for iOS), a one-off $25 Play
Store fee or $99/year Apple developer account, store review, and Google sign-in then needs the
native Firebase SDK rather than the web popup flow — the popup does not work inside a WebView. For
a family tree shared by link, the PWA route avoids all of that.

## How it is built

| Concern | Choice |
|---|---|
| App | Vite + React 18 + TypeScript |
| Canvas | [React Flow](https://reactflow.dev) — pan/zoom, custom photo nodes, labels on edges |
| Layout | [dagre](https://github.com/dagrejs/dagre), one rank per generation |
| Data | Firestore + Firebase Auth (Google), with a localStorage fallback |
| Tests | Vitest |

### Source map

```
src/
  kinship/          the engine: raw links in, relationship words out
    graph.ts          adjacency lists
    relations.ts      walks outward from you -> (up, down, side) coordinates
    labels.en.ts      coordinates -> English words
    kinship.test.ts   a fixture family asserting every label
  layout/
    buildFlowGraph.ts people + links -> React Flow nodes/edges, then dagre
  data/
    store.ts          the storage interface both backends implement
    firestoreStore.ts live Firestore backend
    localStore.ts     browser-only backend and starter family
    mutations.ts      add/connect/remove, with cycle and duplicate guards
    TreeProvider.tsx  subscriptions, auth, derived graph and labels
  components/       toolbar, canvas, person card, person dialog
```

Two design notes that are easy to trip over later:

- **Couples are joined through an invisible "union" node** and children hang off that union rather
  than off one parent. That is what gives a family-tree shape instead of an org chart, and it hands
  dagre a clean DAG so spouses land on the same row by themselves. Each couple is additionally a
  dagre *cluster*, because with no edge crossings at stake dagre would otherwise happily leave
  spouses at opposite ends of their generation. The clusters inflate spacing about threefold, which
  is why `ranksep`/`nodesep` look unusually small.
- **Node dimensions are stated explicitly** rather than measured from the DOM. Without them the
  MiniMap renders nothing at all.

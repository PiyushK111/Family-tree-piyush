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

With no Firebase configuration present the app runs in **local mode**: everything lives in your
browser's `localStorage`, seeded with a small starter family, and the toolbar shows a
*Local only* badge. Use **Export** / **Import** to move that data around. Nothing is shared between
devices until Firebase is set up.

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

7. **Project settings → General → Your apps → Web app** → copy the config values into a local
   `.env` (see [.env.example](.env.example)), and add the same values as repository secrets under
   **Settings → Secrets and variables → Actions**.

The first person you add becomes the tree's centre — open them and press **Make this "me"** to set
`rootPersonId`.

### Who can do what

Anyone with the link can view. Editing requires a Google sign-in whose verified email appears in
that tree's `editors` array. Editors can add, change and delete people, and rename or re-centre the
tree, but cannot change `editors` or `ownerEmail` — those are console-only, so no editor can widen
access.

## Deploying

Push to `main`. [The workflow](.github/workflows/deploy.yml) runs the tests, builds with the
secrets above, and publishes to GitHub Pages. Enable it once under **Settings → Pages → Source:
GitHub Actions**.

`vite.config.ts` sets `base: '/Family-tree-piyush/'`. It must match the repository name exactly,
**including capitals** — a mismatch serves a blank page with 404s for every asset.

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

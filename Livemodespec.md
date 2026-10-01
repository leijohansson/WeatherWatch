# Live mode — implementation spec

Handoff for building the Live (hands-on lightning monitoring) mode into this repo. The design was agreed in a design canvas ("WeatherWatch Live mode") and a design system ("WeatherWatch") synced from this repo at commit `5a5bfcf`. Both are private claude.ai pages, so everything needed is written out here.

**Working rules**
- Vue 3 + Vite + TypeScript, pnpm. Keep the existing patterns: pure logic in `src/lib/*.ts` with `*.test.ts` beside it, state in `src/composables/use*.ts`, styles in `src/styles.css`.
- After each step run `pnpm test`, `pnpm typecheck` and `pnpm lint` (zero warnings).
- Don't add a UI framework or map library. The map is hand-drawn SVG, like the existing `RadarMap.vue`.
- Don't push or open PRs unless asked.

---

## 1. Product structure

Two modes in one page, switched by tabs in the top bar.

| Mode | Purpose |
| --- | --- |
| **Watch** (existing page) | Hands-off. Draw areas, set alert rules, walk away. Gains observed lightning as an alert trigger. |
| **Live monitoring** (new) | Hands-on, while it's already storming. One map, with locations, alert rings, strikes, radar, nowcast sectors and all-clear countdowns. |

**Deep link:** a Watch alert opens Live centred on the location or area that triggered it.
- Hash route: `#/live?focus=<locationId|areaId>&from=alert`. `#/` or `#/watch` is Watch.
- When `from=alert` is set, show a dismissible chip at the map's top left: "FROM WATCH ALERT · 14:31", then "Ground strike 2.2 km from Home".
- Notification click: `window.focus()` and set `location.hash`.

Use a tiny hash router composable (`useRoute`). No vue-router needed.

Remove the hero block ("Watch the weather where it matters." plus the intro paragraph) from Watch. The workspace starts right under the top bar.

---

## 2. Top bar: mode tabs

Replace the centre of the top bar with two large tabs. They must be obvious.

- Each tab: an 18px stroke icon, a bold label (Manrope 600, 15px) and a 10px sub-line.
  - Watch: icon is concentric circles with a sweep line. Sub-line: "Hands-off · alerts for your areas".
  - Live monitoring: icon is a bolt. Sub-line: "Hands-on · storm in progress".
- Tab: min-width 250px, min-height 52px, 2px radius. Container: 1px `--line` border, 4px padding.
- **Selected tab** (either mode): background `--mint` `#68e0c9`, text `#062025`, sub-line `#0f3b3b`.
- Unselected: text `#93aaaa`, sub-line `#617b7c`. Hover adds a `rgba(104,224,201,.45)` border.
- **Live dot:** while any location ring is active, the Live tab shows an 8px red dot (`#ff748c`, halo `0 0 0 3px rgba(255,116,140,.25)`; `#b3123f` with no halo when the tab is selected). No text badge. Give it `aria-label="Strikes inside a ring"`.
- Mobile (≤680px): full-width two-tab switch beside the brand mark. Tabs 44px tall, icon and label only.

---

## 3. Live map

### 3.1 Base map (vector)
- Draw the coastline from the user's **shapefile**. Convert it once to GeoJSON (WGS84), for example with mapshaper: `mapshaper coast.shp -proj wgs84 -simplify 10% -o format=geojson public/geo/coast.geojson`.
- Project with a local equirectangular projection around Singapore. Accurate enough at this scale.
  - `x_km = (lon - lon0) * cos(lat0) * 111.32`
  - `y_km = (lat0 - lat) * 110.57`
  - Use `lat0 = 1.35`, `lon0 = 103.82`.
  - Screen position = map centre + km × px-per-km.
- Colours:
  - sea (map background) `#d9dedd`
  - land fill `#fbfbf9`
  - coast stroke `#5b7385`, 1px, round joins
- Default zoom about 12 px/km on desktop and 6.5 px/km on mobile.
- Default centre: the deep-linked location, otherwise the centroid of the user's locations.

### 3.2 Layers, bottom to top
1. Base map
2. Radar underlay: the existing weather.gov.sg radar image, cropped and positioned with the same projection. Opacity slider, default **0.35**.
3. Sectors: Townships **or** Army Cat1, never both
4. Radar clusters (always above sectors)
5. Alert rings
6. Location pins: 4.5px radius, fill `#071a1e`, 2px white stroke
7. Strikes: cloud-to-cloud first, then cloud-to-ground; oldest first so the newest sit on top

### 3.3 Layers panel
A floating card at the map's bottom right: 228px wide, background `rgba(7,26,30,.94)`, `--line` border, popover shadow.
- **Sectors:** segmented choice of Townships / Army Cat1 / Off.
- **Recommended forecast:** checkbox (fill sectors by forecast) with a "Forecast settings →" link under it.
  - When Sectors = Off, the checkbox shows unchecked, is disabled, and its hint reads "Pick a sector set to use". The link is disabled too (opacity .4, not focusable).
  - Choosing a sector set again restores the previous checkbox value.
- **Radar clusters:** checkbox.
- **Lightning:** separate checkboxes for Cloud-to-ground and Cloud-to-cloud.
- **Alert rings:** checkbox.
- **Radar:** opacity slider.
- Persist layer choices per device (extend `usePersistence`).
- Mobile: a "Layers" button (44px, mint) at the map's top left. Beside it, a chip summarising the active layers. The panel opens as a bottom sheet.

### 3.4 Sectors and forecast
- Plain (forecast off): outline only, `#47666d` at 1px, 75% opacity, no fill. Army Cat1 sectors get small bold labels (S1…S6) in the same colour.
- Forecast on: hatched fill (45° stripes 2.4px wide on a 7px pitch, at 42% opacity) and a 1.2px outline at 70%. Colour by class:

| Class | Colour |
| --- | --- |
| **Discrepancy** | `#b3123f` |
| **Thunderstorm** | `#b25e00` |
| **Clear** | `#1f6f69` |

- Legend order: Discrepancy, Thunderstorm, Clear.
- Geometry comes from the nowcast data source as GeoJSON in `public/geo/townships.geojson` and `public/geo/army-cat1.geojson`. The canvas used placeholder shapes.

### 3.5 Radar clusters
Dashed outline (`#071a1e`, 1.6px, dash 6 4, no fill) with a small bold label, for example "CLUSTER C3".

### 3.6 Strikes
- Shapes:
  - **Cloud-to-ground:** a plus sign. Arms 6.5 / 2.1 px when under 5 min old, otherwise 5.5 / 1.8.
  - **Cloud-to-cloud:** a diamond. Radius 4.4 when under 5 min old, otherwise 3.8.
- Every strike gets a `#071a1e` outline at 0.9px so it reads on both land and radar.
- **Colour by age, a new step every 2.5 minutes, 30-minute window (12 steps):**

```ts
export const STRIKE_AGE_STEP_MIN = 2.5
export const STRIKE_WINDOW_MIN = 30
export const STRIKE_AGE_COLORS = [
  '#d7191c', '#e8401e', '#f46d20', '#f99a25', '#fdc22e', '#f2e235',
  '#bfe04a', '#7fcc5c', '#3fb36e', '#1f9a96', '#2b7bba', '#2c55a8',
] // 0–2.5 min … 27.5–30 min (red → orange → yellow → green → blue)
```

- Drop strikes older than 30 minutes.
- **Legend:** one stepped colour bar labelled 0 · 10 · 20 · 30 min, plus the two shape keys ("Ground", "Cloud") drawn in neutral `#c9d8d7`. No separate age chips.

### 3.7 Alert rings
- **One ring per location**, its radius set by the user in km. There is no outer "approaching" ring.
- **No fill and no glow in any state.** Status is shown by colour and line weight only. No text labels on the map.

| State | Stroke |
| --- | --- |
| Clear | `#1f6f69`, 1.5px |
| Active (a counted strike inside the ring within the all-clear window) | `#b3123f`, 3.5px |

- Legend: "Clear" (teal ring), "Strike inside" (red ring).

### 3.8 Map chrome
- Toolbar above the map:
  - left: "LIVE · LIGHTNING + RADAR" (mint, 9px, bold), with the timestamp under it ("14:32 · newest strike 1 min ago")
  - right: "STRIKES UPDATE EVERY MINUTE"
- Attribution chip at the bottom right.

---

## 4. Side panel (desktop) and bottom sheet (mobile)

**Live status** section, "Your locations":
- **All-clear countdown** toggle row at the top: "15 min without a strike inside a ring". When off, hide all countdowns.
- One card per location:
  - name with a status-coloured ring dot
  - status badge: **ACTIVE** (bg `#ff748c`, text `#2a0710`) or **CLEAR** (mint text on a 10% mint tint with an inset border)
  - meta line, for example "Ground strike 2.2 km away, inside the 8 km ring · 1 min ago"
  - when active and the countdown is on: a large countdown (Manrope 30px, `mm:ss`, tabular numbers), "to all-clear / restarts on each strike inside 8 km", and a 3px progress bar
- **Strikes, last 30 min:** a small table with rows Ground / Cloud and columns `<5 min`, `5–15`, `15–30`.
- **Setup:** "3 locations · alerts for strikes in ring, all-clear" with an "Edit setup" button.

Mobile: a bottom sheet over the map (8px top radius, handle). The active location sits first with its countdown, then a compact row per other location. When everything is clear the sheet shows "All clear" and a Setup button.

### Location setup (side panel on desktop, sheet on mobile)
Fields per location:
- name
- position (lat/lon; drag the pin on the map to move it)
- **Alert ring radius (km)**
- Count cloud-to-cloud strikes (toggle, default on; when off, only cloud-to-ground strikes change ring status)
- All-clear countdown (toggle)
- Notify: strike in ring
- Notify: all-clear
- Cancel / Save location, plus Delete location

---

## 5. Forecast settings screen

Reached from the layers panel link. Two cards, plus Reset to defaults / Save buttons and a one-line preview of the resulting sector counts.

| Radar | Default |
| --- | --- |
| Minimum cluster size | 20 km² |
| Distance to sector | 10 km |
| Minimum intensity | Moderate (reuse `Intensity` from `types.ts`) |

| Lightning | Default |
| --- | --- |
| Distance to sector | 15 km |
| Strike types | Cloud-to-ground only / Ground + cloud (default: CG only) |

These defaults are placeholders; confirm the real values with the user. Persist the settings with `usePersistence`.

---

## 6. Watch mode: lightning trigger

Extend `AlertArea`:

```ts
lightningEnabled: boolean        // "Alert on observed lightning"
lightningBufferKm: number        // 0–20, default 5; drawn as a dashed ring around the area
lightningTypes: 'cg' | 'cg+cc'   // "Strike types" select
openLiveOnAlert: boolean         // notification deep-links into Live
```

- Add `'lightning'` to `AlertReason`.
- Check lightning every minute, separately from the 15-minute radar check.
- History row: "Lightning nearby · Home · 3 ground + 5 cloud within 5 km · nearest 2.2 km", with an "Open in Live →" link.
- Show a reading summary in the editor with the act colour: "3 ground + 5 cloud inside buffer · Nearest 2.2 km · 14:31".

---

## 7. Data model (add to `src/types.ts`)

```ts
export type StrikeType = 'cg' | 'cc'
export interface Strike { id: string; time: number /* epoch ms */; lat: number; lon: number; type: StrikeType }

export interface LiveLocation {
  id: string; name: string; lat: number; lon: number
  radiusKm: number
  countCloudToCloud: boolean
  notifyStrike: boolean; notifyAllClear: boolean
}

export interface LiveSettings {
  allClearEnabled: boolean      // default true
  allClearMinutes: number       // 15
  layers: {
    sectors: 'town' | 'army' | 'off'; forecast: boolean; clusters: boolean
    cg: boolean; cc: boolean; rings: boolean; radarOpacity: number
  }
  forecast: {
    radar: { minClusterKm2: number; distanceKm: number; minIntensity: Intensity }
    lightning: { distanceKm: number; types: 'cg' | 'cg+cc' }
  }
}

export type RingState = 'clear' | 'active'
```

- Bump `PersistedState.version` to 2.
- Write a migration from v1 that adds the defaults and the new `AlertArea` fields. Test the migration.

---

## 8. Core logic (pure, tested): `src/lib/lightning.ts` and `src/lib/geo.ts`

- `distanceKm(a, b)`: haversine.
- `project(lat, lon)` → `{x, y}` in km (the projection from §3.1).
- `strikeAgeColor(ageMin)` → one of `STRIKE_AGE_COLORS`; `null` past 30 min.
- `countedStrikes(strikes, location)`: filters by type using `countCloudToCloud`.
- `ringState(location, strikes, now, allClearMinutes)` → `'active'` if any counted strike inside `radiusKm` is younger than `allClearMinutes`.
- `allClearRemaining(location, strikes, now, minutes)` → ms left until all-clear, or `null` when clear. The countdown restarts on each counted strike inside the ring.
- `strikeCounts(strikes, now)` → per-type counts for <5, 5–15 and 15–30 min.
- Forecast scoring (`src/lib/forecast.ts`): **open question**, see §11.

Tests to cover:
- a strike exactly on the radius counts as inside
- type filtering
- a strike at 14:59 old vs 15:00
- the countdown restarts when a newer strike arrives
- colour step boundaries at 2.5-minute multiples
- strikes older than 30 min are dropped

---

## 9. Lightning feed: `src/composables/useLightningFeed.ts`

- Interface: `interface LightningSource { fetchSince(since: number): Promise<Strike[]> }`.
- `HttpLightningSource`: maps the real feed's response to `Strike`. Fill in the endpoint, auth and field mapping from the user's sample response.
- `FixtureLightningSource`: replays `src/test/fixtures/lightning-sample.json` relative to now, so the UI can be built without a live storm. Make it usable from the existing "Test your alerts" card.
- Poll every 60 s. Keep a rolling 30-minute buffer and de-duplicate by `id`.
- Surface offline / error / blocked states the way `useRadarMonitor` does.
- If the feed blocks browser requests (CORS), add a minimal proxy. That is the first reason to introduce a backend.

---

## 10. Build order

1. **Core logic + types + migration**, with tests (§7, §8).
2. **Feed composable** with the fixture source (§9).
3. **Routing + mode tabs**, and move the existing page into `WatchView.vue`. Remove the hero (§1, §2).
4. **LiveMap.vue**: coastline, radar underlay, rings, strikes, colour-bar legend (§3.1, §3.2, §3.6, §3.7).
5. **LayersPanel.vue + sectors/clusters** (§3.3–3.5).
6. **Location status panel / bottom sheet**, then location setup (§4).
7. **Forecast settings screen** (§5).
8. **Watch lightning trigger + deep link** (§6, §1).
9. Swap the fixture for the real feed.

Suggested components: `ModeTabs.vue`, `WatchView.vue`, `LiveView.vue`, `LiveMap.vue`, `LayersPanel.vue`, `StrikeColorBar.vue`, `LocationStatus.vue`, `LocationEditor.vue`, `ForecastSettings.vue`.

---

## 11. Open questions for the user

1. **Lightning feed:** endpoint, auth, update rate, and the response format (time, lat/lon, CG/CC field).
API details are in LightningObservation.json
2. **Nowcast source:** where the township and Army Cat1 geometry comes from. Is the Discrepancy / Thunderstorm / Clear class supplied by the feed, or computed here from the forecast settings? If computed, what is the exact rule?
Thunderstorm/Clear come from the radar and lightning observation data. If there are no strikes/rainfall over a certain threshold within X distance of the township or sector, it is clear. If not it is Thunderstorm. Discrepancy is shown if the current published forecast shows non thunderstorm forecast when the radar and lightning criteria are met. Current implementation is at https://github.com/dlimtx/lightning-risk-nowcast. It is only based on radar. Lightning observation not yet implemented.
3. **All-clear switched off:** should rings still go back to clear after 15 min (current assumption), or stay active until manually reset? Go back to clear after 15min.
4. **Cloud-to-cloud in rings:** the default is on (counts towards ring status). Confirm. Yes
5. **Alerts with the tab closed:** if lightning alerts must arrive when the browser is closed, this needs a server and Web Push. Today's notifications only work while the page is open. That is fine for now.
6. **Brand name:** the UI wordmark says "RAINWATCH" while the repo is "WeatherWatch". Which should it be? 
It should be weatherwatch. 
---

## Appendix: existing design tokens (from `src/styles.css`)

- Colours:
  - ground `#071a1e`; panel `#0b2428` (panels use `rgba(11,36,40,.84)`); line `rgba(151,190,188,.18)`
  - ink `#d9e8e7`; cream `#f1e8d2`; muted `#829c9e`
  - mint `#68e0c9` (text on mint `#062025`); orange `#ffb454`; danger `#e78888`
- Live additions:
  - act (dark UI) `#ff748c`, text on act `#2a0710`
  - map ring and forecast strokes: `#1f6f69` / `#b25e00` / `#b3123f`
- Type: DM Sans (UI) and Manrope (headings and numbers), from Google Fonts.
- Shape: radius 2px for controls, 3px for panels; the notification button is the only pill.
- Text on dark surfaces should keep at least 4.5:1 contrast. `#617b7c` and below are for non-essential captions only.
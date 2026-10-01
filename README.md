```bash
pnpm run dev
uv run fastapi dev
```

## Environment

| Variable | Used for |
| --- | --- |
| `DATA_GOV_API_KEY` | Optional. Higher data.gov.sg rate limits for lightning and the 2-hour forecast. |
| `SAFEGUARDIAN_BEARER_TOKEN` | Optional. Army Cat1 Discrepancy. Without it, Army sectors show Thunderstorm/Clear only. |

## Map layers

Live mode's coastline and sectors are GeoJSON in `public/geo/`, built with `scripts/build_geo.py`
(standard library only):

```bash
python3 scripts/build_geo.py coast --land ne_10m_land.shp   # current placeholder
python3 scripts/build_geo.py coast --sea goas_v01.shp       # Marine Regions sea polygons
python3 scripts/build_geo.py townships "Nowcast Sectors2.shp"
python3 scripts/build_geo.py army MFOSectors.txt
```

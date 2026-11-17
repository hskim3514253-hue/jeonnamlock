# keynews.co.kr inventory (2026-11-17)

Source: public category pages 디지탈주키(873), 디지탈보조키(872), 강화유리용(874), 샷시용/락카용/개폐기용(875) of https://www.keynews.co.kr, read on 2026-11-17. 249 unique listings.

| Group | Listings | Action |
|---|---|---|
| On sale, model not in catalog | 76 | Added as 69 models (colour-only variants merged; the dial gate opener MLH19AD left out as not a digital door lock) |
| On sale, model already in catalog | 79 | Not duplicated |
| Sold out | 59 | Not added |
| Accessories (receivers, transmitters, holders, remote sets, strikers) | 35 | Not added |

Product facts are limited to what the listing title states: brand, model, product form and access methods. Dimensions, power, door thickness and app features are not claimed. Where a title gives no access method the catalog says it is confirmed during consultation. Listings titled 삼성 are filed under 직방 (the listing's own brand field), with 삼성 as a search alias. keynews spells the brand 경동나비안; the catalog uses 경동나비엔. Wholesale prices are member-only on keynews and were not read or used.

Each product's `source` is its keynews product page, because `validateCatalog` requires a source link. That page is a wholesale supplier's page; replace it with the manufacturer's page where one is preferred for customers.

The collection scripts were one-off and are not part of the build.

## Catalog limited to keynews models (2026-11-17)

After the additions the owner clarified: **"키뉴스에서 판매하는 도어락만 올려달라니까 아카라 브랜드 빼고"** (show only door locks keynews sells, Aqara excepted). `src/catalog.mjs` now keeps a product only if it is Aqara, one of the 69 added keynews models, or one of the 69 earlier catalog models that matched an on-sale keynews listing (`keynewsListedIds`). Result: 140 products. 293 earlier models are hidden, including every earlier Kocom and Gateman model, because keynews had no on-sale listing for them; 7 of those matched sold-out keynews listings only. Matching compared model codes within the same brand and may have missed a model keynews lists under a different name. The hidden products' data and photos remain in the repository; removing the filter restores them.

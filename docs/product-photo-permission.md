# Product photos

## user-confirmation-2026-10-22

The website owner requested publication of the prepared Aqara, Bestin, and Kocom product images and background-extracted cutouts. After being told that commercial use and editing permission was needed for these manufacturer-sourced images, the owner replied in this chat: **“허락받음”** (“Permission obtained”). Publication relies on that user confirmation.

This is a record of the owner's report, not an independently inspected contract, a claim that the assistant obtained manufacturer approval, or a legal determination. The rights holder's name, written license, term, and any additional conditions were not provided. Do not label these files as photographed by the owner, public domain, or freely reusable by other visitors.

The scope here is the 12-model preview already presented to the owner: Aqara K100/L100; Bestin IDL-312R/400M/400R/300FWNH/300FWKH; Kocom KDL-IP730/IM410/S70/S50/S30. No general permission is inferred for additional models or third-party customer photos.

`src/catalog-photos.mjs` records every published asset's original URL and editing type. The `licensed` enum means the owner has reported permission, with this document as its `rightsSource`.

## Image handling

- Aqara 2 images: existing transparent original PNGs, unmodified.
- Kocom 5 images: original white-background product images, unmodified; shown on white cards to preserve their pixels.
- Bestin 5 images: previously prepared background-extraction edits using the built-in image tool. Product logos are retained. These are AI edits rather than pixel-exact original photographs; a customer-facing credit states the background editing and links to the original product page for exact appearance.
- Kocom IM400 is not assigned the IM410 image. IP700 and S9900 are not covered by this 12-model selection. Other catalog products remain available through their descriptions and official-photo links.
- The top showcase contains the 12 photo-equipped products. The full searchable catalog retains all 23 products. Generic door-lock drawings have been removed in favor of model information on products whose photos are not included.

Prior research notes in `catalog-sources.md` describe the earlier permission-unconfirmed state. This initial confirmation superseded that state for the 12 images above. The earlier private preview remains a historical artifact, not the current production source.

## expanded-confirmation-2026-10-22

For the subsequent request to complete all remaining product photographs and add the Lockpro lineup, the owner was asked whether the permission also covered Lockpro and the remaining Solity, Unicor, and Gateman photographs. The owner answered **“새 브랜드와 나머지 제품도 허락받았어요”** (“Permission obtained for the new brand and remaining products too”). The request and answer also cover the remaining three Kocom models.

Publication of the additional manufacturer photographs relies on this explicit owner report. This is not an independently inspected license. No claim is made that these are owner-shot photos or public-domain images.

All 23 existing models now have model-matched images. Kocom IM400 uses the number-only IM400 image from its official gallery, not the similar IM410. IP700 and S9900 use original manufacturer photographs, with side views. New Solity, Unicor, Gateman, and Lockpro images use the official model-page photographs without generative editing. The attempted new S9900 AI extraction is not published: its original photograph better preserves exact product details. Previously published Bestin background edits retain their visible editing credit.

Images are encoded as WebP for delivery with the original dimensions and framing preserved. The source URLs, editing status, and permission record remain in `src/catalog-photos.mjs`. The Lockpro inventory and source evidence are documented in `catalog-sources.md`.

## full-brand-catalogs-2026-10-22

The owner subsequently requested: **“솔리티 유니코 게이트맨도 전체 제품 다 넣어줘 사진이랑 상세설명까지”**. This explicitly expands the catalog coverage to the current official product ranges of the same three manufacturers. It relies on the owner's preceding express permission report for these brands, quoted above; no new manufacturer permission or owner photography is claimed.

New images are downloaded from the official model pages and their linked manufacturer asset hosts. Product photos preserve their full framing and proportions, and are fitted within 1000 × 1000 pixels without upscaling and encoded as WebP for web delivery. No product details are generated or retouched. Shared manufacturer series photos are identified as representative images where applicable. Color variants and duplicate listing entries are consolidated in the inventory when they refer to the same model. Public listings do not establish local stock or availability of building-project-only models.

Model-level sources, counts, and inventory scope are recorded in `full-brand-inventory.md` and `catalog-sources.md`.

## bestin-kocom-catalogs-2026-10-22

The owner requested **“베스틴이랑 코콤도 전체 제품 사진이랑 상세설명까지 다 넣어줘”**, extending the same authorized catalog and photo work to these two existing brands. Publication relies on the owner's earlier express report of permission for the remaining products, quoted above. This is not a new claim of independently verified licensing.

Current manufacturer listings and the owner's originally specified supplier, Keynet, are cross-checked. Supplier-only listings identify their source. Original product photographs are kept in their original framing and proportions, fitted within 1000 pixels without upscaling and encoded as WebP. Newly supplied photographs are not generated or retouched. Color-only variants are grouped where the evidence establishes equivalent functions; model differences remain in the descriptions and searchable aliases. Model-level provenance and scope are recorded in `bestin-kocom-inventory.md` and the photo metadata.

## keynews-confirmation-2026-11-17

The owner asked to add the digital door locks listed on the wholesale supplier site keynews.co.kr (키뉴스쇼핑몰, 유한회사 키담시스템): **"여기 디지털 도어락들만 우리 사이트에 올리자"**. Before any photo was copied, the owner was told that keynews and manufacturer photos belong to them and need permission, and was offered publishing without photos. The owner chose **"허락받았음, 사진도 올려"** ("Permission obtained, publish the photos too") and the scope **"판매중 전부"** (all models currently on sale).

Publication of these listing photos relies on that owner report. It is not an independently inspected license; the rights holder's written terms were not provided, and no claim is made that these are owner-shot or freely reusable images. The scope is the 69 models in `src/catalog-keynews.mjs` (116 photos), taken from the public keynews product pages on 2026-11-17. Each image records its original URL and product page. Photos are fitted within 460 pixels, flattened on white where the original was transparent, and saved as JPEG quality 82 (`edit: resized`); nothing is generated or retouched. Sold-out listings, accessories (receivers, holders, remote sets) and models already in the catalog were not added. See `keynews-inventory.md`.

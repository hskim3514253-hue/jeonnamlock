# Product-linked consultation
Customer selects one catalog product and sends the usual consultation. Show its image, brand and model in the form and owner inbox, rather than burying its name in notes. Selection can be removed/replaced; optional notes and ordinary inquiries remain supported.

Approaches: retain only free text (poor owner recognition); structured catalog snapshot plus visible cards (chosen implementation); redesign push encryption to carry product payloads (unnecessary scope). Keep the existing generic push and its inbox link unchanged. No production test inquiries or notifications.

Use existing details TEXT storage with a versioned JSON envelope for new product inquiries and backward-compatible decoding. Server resolves selected ID against compact generated catalog metadata, never trusts supplied image/name. No schema migration. Snapshot preserves selected identity if catalog names change. Render DOM text and same-origin allowlisted images only. Existing photos remain independent/private.
